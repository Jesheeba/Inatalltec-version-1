-- ============================================================
-- 0206 — Phase 7 Closed: schema + data layer
--
-- The terminal phase. A project reaches current_phase = 'closed' once
-- the DLP gate (0205) passes (period elapsed + all DLP tickets closed).
-- Closing freezes the project: a closure checklist (10 standard items)
-- is auto-seeded, a closure_summary snapshot is created, and every
-- earlier phase page is already read-only (each page locks itself once
-- current_phase has moved past it — no extra wiring needed).
--
-- Admin / MD can REOPEN a closed project, which simply moves
-- current_phase back to 'dlp' (a backward phase move — gateless; the
-- forward gates only act on their specific forward transition). The
-- checklist / summary rows persist, and re-closing reuses them (the
-- seed is idempotent).
--
-- Tables:
--   closure_checklist  — final close-out checklist (auto-seeded)
--   closure_summary    — one snapshot row per project (final figures)
--   closure_history    — append-only audit
--
-- FINANCIAL FIGURES (flagged in the report): closure_summary stores
-- final_total_cost / total_invoiced / total_received / total_paid_out as
-- a SNAPSHOT. They default to projects.value (cost) and 0 and are filled
-- in by the closer — auto-pulling them from the PROTECTED Accountant
-- module's invoices/payments is a future enhancement, intentionally NOT
-- wired here to avoid coupling to that module.
--
-- Triggers:
--   trg_closure_chk_touch / _before_write / _audit
--   trg_closure_summary_touch / _audit
--   trg_closure_seed_on_closed — AFTER UPDATE OF current_phase: seeds the
--                                checklist + closure_summary on entry to
--                                'closed'
--   + one-time backfill for projects already 'closed'.
--
-- RLS: read incl. accounts/sales; write = admin/md/manager (MANAGE_CLOSED).
--
-- Strictly additive. Reuses fn_ms_touch (0040). Idempotent. Single txn.
-- ============================================================

begin;

-- ── 1) Tables ───────────────────────────────────────────────
create table if not exists public.closure_checklist (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  item           text not null,
  is_completed   boolean not null default false,
  completed_at   timestamptz,
  completed_by   uuid references public.users(id),
  sort_order     int not null default 0,
  last_action_by uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.closure_summary (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  final_total_cost numeric(14,2) not null default 0,
  total_invoiced   numeric(14,2) not null default 0,
  total_received   numeric(14,2) not null default 0,
  total_paid_out   numeric(14,2) not null default 0,
  notes            text,
  closed_by        uuid references public.users(id),
  closed_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id)
);

create table if not exists public.closure_history (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  entity_kind text not null,                    -- 'checklist' | 'summary' | 'project'
  entity_id   uuid,
  action      text not null,                    -- 'created' | 'completed' | 'reopened' | 'closed' | 'summary_updated'
  detail      text,
  changed_by  uuid references public.users(id),
  changed_at  timestamptz not null default now()
);

create index if not exists idx_closure_chk_project on public.closure_checklist(project_id);
create index if not exists idx_closure_sum_project on public.closure_summary(project_id);
create index if not exists idx_closure_hist_project on public.closure_history(project_id, changed_at desc);

-- ── 2) RLS ──────────────────────────────────────────────────
alter table public.closure_checklist enable row level security;
alter table public.closure_summary   enable row level security;
alter table public.closure_history   enable row level security;

do $$
declare
  t text;
  read_roles  text := 'public.fn_my_role() in (''admin'',''md'',''manager'',''lead_worker'',''accounts'',''sales'')';
  write_roles text := 'public.fn_my_role() in (''admin'',''md'',''manager'')';
begin
  foreach t in array array['closure_checklist','closure_summary'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (%s)', t || '_read', t, read_roles);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (%s) with check (%s)', t || '_write', t, write_roles, write_roles);
  end loop;
end $$;

drop policy if exists closure_history_read on public.closure_history;
create policy closure_history_read on public.closure_history for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','accounts','sales')
);

-- ── 3) updated_at touch ─────────────────────────────────────
drop trigger if exists trg_closure_chk_touch on public.closure_checklist;
create trigger trg_closure_chk_touch before update on public.closure_checklist
  for each row execute function public.fn_ms_touch();
drop trigger if exists trg_closure_summary_touch on public.closure_summary;
create trigger trg_closure_summary_touch before update on public.closure_summary
  for each row execute function public.fn_ms_touch();

-- ── 4) Checklist before-write + audit ───────────────────────
create or replace function public.fn_closure_chk_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.last_action_by := coalesce(new.last_action_by, new.completed_by);
  if tg_op = 'INSERT' then
    if new.is_completed and new.completed_at is null then new.completed_at := now(); end if;
  elsif tg_op = 'UPDATE' then
    if new.is_completed and not old.is_completed then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, new.last_action_by);
    elsif not new.is_completed and old.is_completed then
      new.completed_at := null; new.completed_by := null;
    end if;
  end if;
  return new;
end $$;
alter function public.fn_closure_chk_before_write() owner to postgres;

drop trigger if exists trg_closure_chk_before_write on public.closure_checklist;
create trigger trg_closure_chk_before_write before insert or update on public.closure_checklist
  for each row execute function public.fn_closure_chk_before_write();

create or replace function public.fn_closure_chk_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.is_completed is distinct from new.is_completed then
    insert into closure_history (project_id, entity_kind, entity_id, action, detail, changed_by)
      values (new.project_id, 'checklist', new.id,
              case when new.is_completed then 'completed' else 'reopened' end,
              (case when new.is_completed then 'Completed: ' else 'Reopened: ' end) || new.item,
              new.last_action_by);
  end if;
  return null;
end $$;
alter function public.fn_closure_chk_audit() owner to postgres;

drop trigger if exists trg_closure_chk_audit on public.closure_checklist;
create trigger trg_closure_chk_audit after update on public.closure_checklist
  for each row execute function public.fn_closure_chk_audit();

create or replace function public.fn_closure_summary_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into closure_history (project_id, entity_kind, entity_id, action, detail, changed_by)
    values (new.project_id, 'summary', new.id,
            case when tg_op = 'INSERT' then 'created' else 'summary_updated' end,
            'Closure figures ' || (case when tg_op = 'INSERT' then 'recorded' else 'updated' end),
            coalesce(new.closed_by, fn_my_id()));
  return null;
end $$;
alter function public.fn_closure_summary_audit() owner to postgres;

drop trigger if exists trg_closure_summary_audit on public.closure_summary;
create trigger trg_closure_summary_audit after insert or update on public.closure_summary
  for each row execute function public.fn_closure_summary_audit();

-- ── 5) Seed on advance to 'closed' ──────────────────────────
create or replace function public.fn_closure_seed_for_project(p_project uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_value numeric;
begin
  if not exists (select 1 from closure_checklist where project_id = p_project) then
    insert into closure_checklist (project_id, item, sort_order) values
      (p_project, 'Final invoice issued to the client',            1),
      (p_project, 'Final payment received from the client',        2),
      (p_project, 'All sub-contractor payments settled',           3),
      (p_project, 'As-built drawings archived',                    4),
      (p_project, 'Handover documents delivered and signed',       5),
      (p_project, 'All DLP / warranty tickets resolved',           6),
      (p_project, 'Warranty documentation handed to the client',   7),
      (p_project, 'Project files & records archived',              8),
      (p_project, 'Project review / lessons-learned completed',    9),
      (p_project, 'Client satisfaction / feedback recorded',      10);
  end if;

  if not exists (select 1 from closure_summary where project_id = p_project) then
    select value_aed into v_value from projects where id = p_project;
    insert into closure_summary (project_id, final_total_cost, closed_by)
      values (p_project, coalesce(v_value, 0), p_actor);
  end if;
end $$;
alter function public.fn_closure_seed_for_project(uuid, uuid) owner to postgres;

create or replace function public.fn_closure_seed_on_closed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.current_phase is distinct from 'closed' and new.current_phase = 'closed' then
    perform fn_closure_seed_for_project(new.id, fn_my_id());
    insert into closure_history (project_id, entity_kind, entity_id, action, detail, changed_by)
      values (new.id, 'project', new.id, 'closed', 'Project moved to Closed', fn_my_id());
  end if;
  return new;
end $$;
alter function public.fn_closure_seed_on_closed() owner to postgres;

drop trigger if exists trg_closure_seed_on_closed on public.projects;
create trigger trg_closure_seed_on_closed
  after update of current_phase on public.projects
  for each row execute function public.fn_closure_seed_on_closed();

-- One-time backfill for projects already 'closed'.
do $$
declare r record; v_seeded int := 0;
begin
  for r in select id from projects where current_phase = 'closed' loop
    perform fn_closure_seed_for_project(r.id, null);
    v_seeded := v_seeded + 1;
  end loop;
  raise notice '0206 backfill: ensured closure rows for % closed project(s)', v_seeded;
end $$;

-- ── 6) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_trgs int; v_fns int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('closure_checklist','closure_summary','closure_history');
  if v_tabs <> 3 then raise exception '0206 failed: expected 3 tables, found %', v_tabs; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('closure_checklist','closure_summary','closure_history');
  if v_pols < 5 then raise exception '0206 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_closure_chk_touch','trg_closure_summary_touch','trg_closure_chk_before_write',
    'trg_closure_chk_audit','trg_closure_summary_audit','trg_closure_seed_on_closed'
  ) and not tgisinternal;
  if v_trgs <> 6 then raise exception '0206 failed: expected 6 triggers, found %', v_trgs; end if;

  select count(*) into v_fns from pg_proc where proname in (
    'fn_closure_chk_before_write','fn_closure_chk_audit','fn_closure_summary_audit',
    'fn_closure_seed_for_project','fn_closure_seed_on_closed'
  );
  if v_fns < 5 then raise exception '0206 failed: expected 5 functions, found %', v_fns; end if;

  raise notice '─── 0206 applied: closure checklist + summary + history, % policies, % triggers, % functions ───',
    v_pols, v_trgs, v_fns;
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION
-- ============================================================
-- /*
-- -- After a project advances to 'closed', it should have 10 checklist
-- -- items and 1 summary row:
-- select project_id, count(*) from closure_checklist group by project_id;
-- select project_id, final_total_cost, closed_at from closure_summary;
--
-- -- Reopen (admin/md): just move the phase back; gateless.
-- update projects set current_phase='dlp' where id='<closed_project>';
-- -- */
-- ============================================================
