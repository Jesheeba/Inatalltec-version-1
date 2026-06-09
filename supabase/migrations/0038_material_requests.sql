-- ============================================================
-- 0038 — Material Requests: on-site material/parts procurement flow
--
-- A technician on a Work Order requests materials they need to finish
-- the job. The request is timestamped with the requester, notifies the
-- supervising Lead Tech + the parent project/AMC manager, rolls up onto
-- the project / AMC detail pages, and runs an approve / reject / fulfil
-- status machine — every transition audited with actor + timestamp.
--
-- Lifecycle (material_request_status enum):
--   pending → approved → fulfilled
--        ↓
--     rejected   (terminal, requires a reason)
--
-- This mirrors replacement_requests (0017) for the table + RLS + code/
-- touch triggers, and reuses fn_notify() / fn_actor_name() (0036) for
-- the in-app notification triggers.
--
-- Idempotent. fn_notify / fn_actor_name are assumed present (0036).
-- Status-enum CREATE TYPE cannot share a txn with later ALTERs of it,
-- but we never ALTER it here, so a single begin/commit is fine.
-- ============================================================

begin;

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'material_request_status') then
    create type material_request_status as enum (
      'pending',
      'approved',
      'rejected',
      'fulfilled'
    );
  end if;
end $$;

-- ── 2) Main table ───────────────────────────────────────────
-- work_order_id is the origin; project_id / amc_contract_id /
-- repair_ticket_id are denormalised from the WO's source at insert time
-- so the project & AMC detail pages can roll requests up with a plain
-- indexed filter. customer_id always set; site optional.
create table if not exists material_requests (
  id   uuid primary key default gen_random_uuid(),
  code text unique,                          -- MR-YYYY-NNNN, set by trigger

  work_order_id    uuid references work_orders(id) on delete cascade,
  project_id       uuid references projects(id),
  amc_contract_id  uuid references amc_contracts(id),
  repair_ticket_id uuid references repair_tickets(id),
  customer_id      uuid not null references customers(id),
  site_id          uuid references sites(id),

  -- Request details
  item_name text not null,                   -- material name / description
  quantity  int  not null default 1 check (quantity > 0),
  urgency   text not null default 'normal'
            check (urgency in ('low', 'normal', 'high')),
  notes     text,

  -- Lifecycle — who / what / when at each stage
  status material_request_status not null default 'pending',

  requested_by uuid references users(id),
  requested_at timestamptz not null default now(),

  approved_by   uuid references users(id),
  approved_at   timestamptz,
  approval_note text,

  rejected_by      uuid references users(id),
  rejected_at      timestamptz,
  rejection_reason text,

  fulfilled_by     uuid references users(id),
  fulfilled_at     timestamptz,
  fulfillment_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 3) Indexes for the common access paths ──────────────────
create index if not exists idx_mr_status        on material_requests(status);
create index if not exists idx_mr_customer      on material_requests(customer_id);
create index if not exists idx_mr_wo            on material_requests(work_order_id);
create index if not exists idx_mr_project       on material_requests(project_id);
create index if not exists idx_mr_amc           on material_requests(amc_contract_id);
create index if not exists idx_mr_repair        on material_requests(repair_ticket_id);
create index if not exists idx_mr_requested_by  on material_requests(requested_by);

-- ── 4) Row Level Security ───────────────────────────────────
--   read:   requester / approver / rejecter / fulfiller + managers /
--           accounts (budgeting) + any crew assigned to the linked WO
--   insert: field-execution staff (manager / lead / worker / sub)
--   update: requester while still pending (cancel-ish edits); manager+
--           always (approve / reject / fulfil). accounts is read-only.
alter table material_requests enable row level security;

drop policy if exists mr_read on material_requests;
create policy mr_read on material_requests
for select using (
  requested_by = public.fn_my_id()
  or approved_by   = public.fn_my_id()
  or rejected_by   = public.fn_my_id()
  or fulfilled_by  = public.fn_my_id()
  or public.fn_my_role() in ('admin','md','manager','lead_worker','accounts')
  or exists (
    select 1 from work_order_assignments wa
    where wa.work_order_id = material_requests.work_order_id
      and wa.user_id = public.fn_my_id()
  )
);

drop policy if exists mr_insert on material_requests;
create policy mr_insert on material_requests
for insert with check (
  public.fn_my_role() in ('admin','md','manager','lead_worker','worker','subcontractor')
);

drop policy if exists mr_update on material_requests;
create policy mr_update on material_requests
for update using (
  (requested_by = public.fn_my_id() and status = 'pending')
  or public.fn_my_role() in ('admin','md','manager')
);

-- ── 5) Touch trigger — keep updated_at honest ───────────────
create or replace function fn_mr_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
alter function fn_mr_touch() owner to postgres;

drop trigger if exists trg_mr_touch on material_requests;
create trigger trg_mr_touch
before update on material_requests
for each row execute function fn_mr_touch();

-- ── 6) Code-generation trigger — MR-YYYY-NNNN ───────────────
-- SECURITY DEFINER + owner postgres so the COUNT bypasses RLS (same
-- reasoning as fn_rr_assign_code in 0017). Caller may pre-supply a code.
create or replace function fn_mr_assign_code()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_year text;
  v_count int;
begin
  if new.code is not null then
    return new;
  end if;
  v_year := to_char(now(), 'YYYY');
  select count(*) + 1 into v_count
    from material_requests
   where code like 'MR-' || v_year || '-%';
  new.code := 'MR-' || v_year || '-' || lpad(v_count::text, 4, '0');
  return new;
end;
$$;
alter function fn_mr_assign_code() owner to postgres;

drop trigger if exists trg_mr_code on material_requests;
create trigger trg_mr_code
before insert on material_requests
for each row execute function fn_mr_assign_code();

-- ── 7) Notification triggers (reuse fn_notify / fn_actor_name) ─
-- On submission: notify the WO's lead + the parent project/AMC manager.
-- fn_notify() already skips the actor + null recipients, so the
-- requester never notifies themselves.
create or replace function public.fn_notify_mr_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  v_code text;
  v_mgr  uuid;
  v_site text;
  v_body text;
begin
  begin
    select assigned_lead, code into v_lead, v_code
      from work_orders where id = new.work_order_id;
    if new.project_id is not null then
      select manager_id into v_mgr from projects where id = new.project_id;
    elsif new.amc_contract_id is not null then
      select manager_id into v_mgr from amc_contracts where id = new.amc_contract_id;
    end if;
    if new.site_id is not null then
      select name into v_site from sites where id = new.site_id;
    end if;

    v_body := fn_actor_name() || ' requested ' || new.quantity || ' × ' || new.item_name
              || ' for ' || coalesce(v_code, 'a work order')
              || coalesce(' at ' || v_site, '');

    perform fn_notify(v_lead, 'material',
      'Material requested · ' || coalesce(v_code, ''), v_body,
      'wo', coalesce(new.work_order_id, new.id));
    perform fn_notify(v_mgr, 'material',
      'Material requested · ' || coalesce(v_code, ''), v_body,
      'wo', coalesce(new.work_order_id, new.id));
  exception when others then null;   -- never block the request insert
  end;
  return new;
end $$;

drop trigger if exists trg_mr_insert_notify on material_requests;
create trigger trg_mr_insert_notify after insert on material_requests
  for each row execute function fn_notify_mr_insert();

-- On status change: notify the original requester of the decision.
create or replace function public.fn_notify_mr_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason text;
begin
  begin
    if new.status is distinct from old.status then
      v_reason := case new.status
        when 'rejected'  then new.rejection_reason
        when 'approved'  then new.approval_note
        when 'fulfilled' then new.fulfillment_note
        else null end;
      perform fn_notify(new.requested_by, 'material',
        coalesce(new.code, 'Material request') || ' ' || new.status::text,
        fn_actor_name() || ' marked your request for "' || new.item_name
          || '" as ' || new.status::text || coalesce(' — ' || v_reason, ''),
        'wo', coalesce(new.work_order_id, new.id));
    end if;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists trg_mr_update_notify on material_requests;
create trigger trg_mr_update_notify after update on material_requests
  for each row execute function fn_notify_mr_update();

-- ── 8) Smoke test ───────────────────────────────────────────
do $$
declare
  v_status_count int;
  v_table_exists boolean;
  v_policy_count int;
  v_trigger_count int;
begin
  select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'material_request_status' into v_status_count;
  select exists (select 1 from information_schema.tables
   where table_name = 'material_requests') into v_table_exists;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'material_requests' into v_policy_count;
  select count(*) from pg_trigger
   where tgrelid = 'public.material_requests'::regclass and not tgisinternal into v_trigger_count;

  raise notice '─── 0038 smoke test ───';
  raise notice '  material_request_status values = % (expect 4)', v_status_count;
  raise notice '  material_requests table        = %', v_table_exists;
  raise notice '  RLS policies                   = % (expect 3)', v_policy_count;
  raise notice '  triggers                       = % (expect 4)', v_trigger_count;
  if not v_table_exists or v_policy_count < 3 or v_trigger_count < 4 then
    raise exception '0038 failed: table/policies/triggers incomplete';
  end if;
  raise notice '─── 0038 applied ───';
end $$;

commit;
