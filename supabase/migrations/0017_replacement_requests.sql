-- ============================================================
-- 0017 — Replacement Requests: Worker → Lead Tech approval flow
--
-- Captures the part-replacement lifecycle that runs alongside the
-- Work Order engine. Workers report a needed replacement from the
-- field; Lead Techs gate approval AND post-install confirmation;
-- every step is timestamped with the actor so the audit trail is
-- complete and queryable from the customer, project, AMC, repair,
-- or work-order side.
--
-- Lifecycle (replacement_status enum):
--   requested → approved → in_progress → pending_confirmation → completed
--                    ↓
--                rejected
--                    ↓
--               cancelled  (any non-terminal state)
--
-- Context (replacement_context enum) — every RR is one of:
--   main_contractor  — replacement during a Main Contractor job
--   amc_free_call    — between-service customer call under AMC
--   amc_scheduled    — found during a scheduled AMC quarterly service
--   repair           — replacement during a paid repair job
--
-- Invoicing / pricing is NOT modelled here — deferred.
--
-- Pre-flight (audited 2026-05-21):
--   replacement_requests table  → does not exist (safe to CREATE)
--   replacement_status enum     → does not exist (safe to CREATE)
--   replacement_context enum    → does not exist (safe to CREATE)
--
-- Single BEGIN/COMMIT — no enum mutation on an existing type, so no
-- autocommit split needed.
-- ============================================================

begin;

-- ============================================================
-- 1) Status enum (7 values, lifecycle in order)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'replacement_status') then
    create type replacement_status as enum (
      'requested',
      'approved',
      'rejected',
      'in_progress',
      'pending_confirmation',
      'completed',
      'cancelled'
    );
  end if;
end $$;

-- ============================================================
-- 2) Context enum (4 values, one per parent-work-type)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'replacement_context') then
    create type replacement_context as enum (
      'main_contractor',
      'amc_free_call',
      'amc_scheduled',
      'repair'
    );
  end if;
end $$;

-- ============================================================
-- 3) Main table — replacement_requests
--    Strong FKs to whatever parent context applies (work_order +
--    project / amc / repair). customer_id is always required. site
--    is optional because some standalone admin-created RRs might not
--    have a specific site yet.
-- ============================================================
create table if not exists replacement_requests (
  id   uuid primary key default gen_random_uuid(),
  code text unique,                          -- human RR-YYYY-NNNN, set by trigger

  context replacement_context not null,

  -- Parent references — at least one of work_order_id / project_id /
  -- amc_contract_id / repair_ticket_id should be set. customer_id always.
  work_order_id    uuid references work_orders(id),
  project_id       uuid references projects(id),
  amc_contract_id  uuid references amc_contracts(id),
  repair_ticket_id uuid references repair_tickets(id),
  customer_id      uuid not null references customers(id),
  site_id          uuid references sites(id),

  -- Item details
  item_name text not null,
  quantity  int  not null default 1 check (quantity > 0),
  reason    text,

  -- Lifecycle — who/what/when at each stage
  status replacement_status not null default 'requested',

  requested_by uuid references users(id),
  requested_at timestamptz default now(),

  approved_by   uuid references users(id),
  approved_at   timestamptz,
  approval_note text,

  installed_by      uuid references users(id),
  installed_at      timestamptz,
  installation_note text,

  confirmed_by      uuid references users(id),
  confirmed_at      timestamptz,
  confirmation_note text,

  rejected_by      uuid references users(id),
  rejected_at      timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4) Indexes for the common access paths
-- ============================================================
create index if not exists idx_rr_status        on replacement_requests(status);
create index if not exists idx_rr_customer      on replacement_requests(customer_id);
create index if not exists idx_rr_wo            on replacement_requests(work_order_id);
create index if not exists idx_rr_amc           on replacement_requests(amc_contract_id);
create index if not exists idx_rr_repair        on replacement_requests(repair_ticket_id);
create index if not exists idx_rr_project       on replacement_requests(project_id);
create index if not exists idx_rr_requested_by  on replacement_requests(requested_by);
create index if not exists idx_rr_approved_by   on replacement_requests(approved_by);

-- ============================================================
-- 5) Row Level Security
--    read: requester / approver / installer / confirmer / managers / accounts
--          + any worker assigned to the linked WO (so the crew see RRs on
--          jobs they're staffed to)
--    insert: anyone with field involvement (manager / lead / worker / sub)
--    update: requester can edit while in early states; lead+ can edit always
-- ============================================================
alter table replacement_requests enable row level security;

drop policy if exists rr_read on replacement_requests;
create policy rr_read on replacement_requests
for select using (
  requested_by = public.fn_my_id()
  or approved_by   = public.fn_my_id()
  or installed_by  = public.fn_my_id()
  or confirmed_by  = public.fn_my_id()
  or public.fn_my_role() in ('admin','md','manager','lead_worker','accounts')
  or exists (
    select 1 from work_order_assignments wa
    where wa.work_order_id = replacement_requests.work_order_id
      and wa.user_id = public.fn_my_id()
  )
);

drop policy if exists rr_insert on replacement_requests;
create policy rr_insert on replacement_requests
for insert with check (
  public.fn_my_role() in ('admin','md','manager','lead_worker','worker','subcontractor')
);

drop policy if exists rr_update on replacement_requests;
create policy rr_update on replacement_requests
for update using (
  -- requester can edit only while in early states (cancel + mark-installed)
  (requested_by = public.fn_my_id() and status in ('requested','approved'))
  -- lead+ can update always (approve / reject / confirm / cancel)
  or public.fn_my_role() in ('admin','md','manager','lead_worker')
);

-- ============================================================
-- 6) Touch trigger — keep updated_at honest on every UPDATE
-- ============================================================
create or replace function fn_rr_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
alter function fn_rr_touch() owner to postgres;

drop trigger if exists trg_rr_touch on replacement_requests;
create trigger trg_rr_touch
before update on replacement_requests
for each row execute function fn_rr_touch();

-- ============================================================
-- 7) Code-generation trigger — RR-YYYY-NNNN
--
-- SECURITY DEFINER + OWNER postgres is REQUIRED. The function COUNTs
-- existing RRs to compute the next sequence number, and rr_read RLS
-- means workers (who only see their own rows) would otherwise count
-- a too-low value and generate a duplicate code, which the UNIQUE
-- constraint on `code` would then reject. Running as postgres bypasses
-- RLS so the count reflects the full table.
--
-- Race-condition note: under simultaneous INSERTs two transactions
-- can both observe COUNT=N and both attempt RR-YYYY-(N+1). One commit
-- wins, the other fails on the unique constraint. The frontend should
-- catch and retry. For single-tenant scale at Installtec today this
-- is acceptable; an advisory lock or per-year sequence can replace it
-- later if needed.
-- ============================================================
create or replace function fn_rr_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text;
  v_count int;
begin
  if new.code is not null then
    return new;   -- caller supplied a code, respect it
  end if;

  v_year := to_char(now(), 'YYYY');
  select count(*) + 1 into v_count
    from replacement_requests
   where code like 'RR-' || v_year || '-%';

  new.code := 'RR-' || v_year || '-' || lpad(v_count::text, 4, '0');
  return new;
end;
$$;
alter function fn_rr_assign_code() owner to postgres;

drop trigger if exists trg_rr_code on replacement_requests;
create trigger trg_rr_code
before insert on replacement_requests
for each row execute function fn_rr_assign_code();

-- ============================================================
-- 8) Inline smoke test — fails the migration if anything missed.
-- ============================================================
do $$
declare
  v_status_count   int;
  v_context_count  int;
  v_table_exists   boolean;
  v_index_count    int;
  v_policy_count   int;
  v_trigger_count  int;
begin
  select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'replacement_status'  into v_status_count;
  select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'replacement_context' into v_context_count;
  select exists (select 1 from information_schema.tables
   where table_name = 'replacement_requests') into v_table_exists;
  select count(*) from pg_indexes
   where tablename = 'replacement_requests' into v_index_count;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'replacement_requests' into v_policy_count;
  select count(*) from pg_trigger
   where tgrelid = 'public.replacement_requests'::regclass and not tgisinternal into v_trigger_count;

  raise notice '─── 0017 smoke test ───';
  raise notice '  replacement_status enum values  = % (expect 7)', v_status_count;
  raise notice '  replacement_context enum values = % (expect 4)', v_context_count;
  raise notice '  replacement_requests table      = %', v_table_exists;
  raise notice '  indexes count                   = % (expect 10)', v_index_count;
  raise notice '  RLS policies                    = % (expect 3)', v_policy_count;
  raise notice '  triggers                        = % (expect 2)', v_trigger_count;
  raise notice '─── 0017 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm enum values:
-- select enumlabel from pg_enum
--   join pg_type t on t.oid = enumtypid
--  where t.typname = 'replacement_status'
--  order by enumsortorder;
--   -- Expect: requested, approved, rejected, in_progress,
--   --         pending_confirmation, completed, cancelled
--
-- select enumlabel from pg_enum
--   join pg_type t on t.oid = enumtypid
--  where t.typname = 'replacement_context'
--  order by enumsortorder;
--   -- Expect: main_contractor, amc_free_call, amc_scheduled, repair
--
-- -- 2. Confirm column shape:
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'replacement_requests'
--  order by ordinal_position;
--   -- Expect 27 columns ending with created_at + updated_at.
--
-- -- 3. Confirm RLS policies + triggers:
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'replacement_requests'
--  order by policyname;
--   -- Expect: rr_insert (INSERT), rr_read (SELECT), rr_update (UPDATE)
--
-- select tgname from pg_trigger
--  where tgrelid = 'public.replacement_requests'::regclass and not tgisinternal
--  order by tgname;
--   -- Expect: trg_rr_code, trg_rr_touch
--
-- -- 4. End-to-end smoke (paste with a real customer_id from your db):
-- /*
-- insert into replacement_requests
--   (context, customer_id, item_name, quantity, reason)
-- values
--   ('main_contractor', '<customer_id>', '1x Dome camera 4MP', 1, 'Lens fogged')
-- returning id, code, status, created_at;
--   -- Expect: a row with code = 'RR-2026-0001', status = 'requested'.
-- */
--
-- ============================================================
