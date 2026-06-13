-- ============================================================
-- 0053 — Accountant module · Phase 4 (Slice 4C-1): Monthly Payroll Runs
--
-- Builds the monthly payroll cycle on top of the Employee Salary Master
-- (0052). A "run" is one month's payroll: seed a line per currently-employed
-- employee (snapshotting their salary structure), let the accountant adjust
-- overtime / bonuses / deductions, approve, generate the WPS file, mark paid.
--
-- CONFIDENTIALITY — same as 0052: salaries are sensitive, so EVERY table
-- here is admin / md / accounts only. Manager is NOT granted read. (The
-- Payroll tab is already hidden from Manager in the UI.)
--
-- ─────────────────────────────────────────────────────────────
-- ⚠️  UAE-LEGAL ASSUMPTIONS — READ BEFORE USING IN PRODUCTION ⚠️
-- This slice deliberately stores ENTERED amounts and does the minimum
-- arithmetic. It does NOT bake in any statutory calculation. Specifically:
--
--   1. NO STATUTORY DEDUCTIONS are auto-applied. The UAE has no personal
--      income tax, but GPSSA / pension contributions apply to UAE & GCC
--      nationals (employee ~5%, employer ~12.5–15%). These are NOT computed
--      here — `deductions` is a single manual figure the accountant enters.
--   2. OVERTIME is stored as a final AMOUNT (`overtime_amount`), NOT derived
--      from hours. UAE Labour Law overtime multipliers (1.25× normal, 1.5×
--      night / rest-day, etc.) are the accountant's to apply before entry.
--   3. GROSS = basic + housing + transport + other, taken verbatim from the
--      employee master. NO mid-month proration for joiners/leavers is applied
--      automatically; `days_in_period` / `leave_days` are captured for the WPS
--      file but never used to auto-prorate pay. Adjust via deductions.
--   4. NET = gross + overtime + bonus + other_additions − deductions. Pure
--      arithmetic; no withholding of any kind.
--   5. END-OF-SERVICE / GRATUITY is NOT part of a payroll run — it belongs to
--      separation handling (Slice 4E) and is out of scope here.
--   6. CURRENCY is assumed AED throughout (UAE WPS is AED-only).
-- These are surfaced in the slice report and (for WPS) again in wps.ts.
-- ─────────────────────────────────────────────────────────────
--
-- Net-new objects:
--   • payroll_run_status enum (draft / approved / paid / cancelled)
--   • payroll_runs        — one per month (period + denormalized totals)
--   • payroll_lines       — one per employee per run (salary SNAPSHOT +
--                           accountant adjustments; gross/net GENERATED)
--   • salary_payments     — actual disbursement records (written when a run
--                           is marked paid)
--   • payroll_run_history — append-only audit (trigger-written, immutable)
--
-- Strictly additive. Reuses fn_my_role()/fn_my_id() (0007) + fn_acct_touch()
-- (0045). Idempotent; single txn. Touches NOTHING in 0045–0052 or elsewhere.
-- ============================================================

begin;

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payroll_run_status') then
    create type payroll_run_status as enum ('draft', 'approved', 'paid', 'cancelled');
  end if;
end $$;

-- ── 2) payroll_runs ─────────────────────────────────────────
create table if not exists public.payroll_runs (
  id                uuid primary key default gen_random_uuid(),
  org_key           text not null default 'org_installtec',
  run_code          text,                            -- PR-YYYY-MM, set by trigger
  period_year       int  not null check (period_year between 2000 and 2100),
  period_month      int  not null check (period_month between 1 and 12),
  -- Pay period bounds. Default to the calendar month in the trigger; the
  -- accountant may override (e.g. 26th–25th cycles).
  period_start      date,
  period_end        date,
  status            payroll_run_status not null default 'draft',

  -- Denormalized totals, maintained by fn_payroll_line_recalc. Never
  -- caller-set; always reflect the sum of payroll_lines.
  total_gross       numeric(14,2) not null default 0,
  total_additions   numeric(14,2) not null default 0,   -- overtime + bonus + other_additions
  total_deductions  numeric(14,2) not null default 0,
  total_net         numeric(14,2) not null default 0,
  employee_count    int           not null default 0,

  notes             text,

  approved_by       uuid references public.users(id),
  approved_at       timestamptz,
  paid_by           uuid references public.users(id),
  paid_at           timestamptz,
  payment_date      date,                              -- value date of the transfer

  created_by        uuid references public.users(id),
  last_action_by    uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- At most one LIVE run per month (a cancelled run can be superseded).
create unique index if not exists uq_payroll_run_period
  on public.payroll_runs(org_key, period_year, period_month)
  where status <> 'cancelled';

create index if not exists idx_payroll_runs_status on public.payroll_runs(status);

-- ── 3) payroll_lines ────────────────────────────────────────
-- The salary structure is SNAPSHOT at seed time so later edits to the
-- employee master never rewrite historical payroll. gross/additions/net are
-- GENERATED from base columns only (Postgres forbids a generated column
-- referencing another generated column).
create table if not exists public.payroll_lines (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id         uuid not null references public.employees(id),

  -- Snapshot identity (so a deleted/renamed employee still prints correctly).
  employee_code       text,
  employee_name       text not null,

  -- Snapshot salary structure (AED).
  basic_salary        numeric(14,2) not null default 0 check (basic_salary >= 0),
  housing_allowance   numeric(14,2) not null default 0 check (housing_allowance >= 0),
  transport_allowance numeric(14,2) not null default 0 check (transport_allowance >= 0),
  other_allowances    numeric(14,2) not null default 0 check (other_allowances >= 0),

  -- Accountant adjustments (all manual; see UAE-legal note 1 & 2 at top).
  overtime_amount     numeric(14,2) not null default 0 check (overtime_amount >= 0),
  bonus_amount        numeric(14,2) not null default 0 check (bonus_amount >= 0),
  other_additions     numeric(14,2) not null default 0 check (other_additions >= 0),
  deductions          numeric(14,2) not null default 0 check (deductions >= 0),

  gross_salary    numeric(14,2) generated always as
                    (basic_salary + housing_allowance + transport_allowance + other_allowances) stored,
  additions_total numeric(14,2) generated always as
                    (overtime_amount + bonus_amount + other_additions) stored,
  net_pay         numeric(14,2) generated always as
                    (basic_salary + housing_allowance + transport_allowance + other_allowances
                     + overtime_amount + bonus_amount + other_additions - deductions) stored,

  -- WPS-relevant snapshot. emirates_id stands in for the MOL labour-card /
  -- person number (see wps.ts flag); bank routing/Agent ID is NOT captured
  -- by the employee master and is intentionally absent here.
  emirates_id         text,
  iban                text,
  bank_account        text,

  -- WPS reporting fields (captured, never used to auto-prorate — note 3).
  days_in_period      int,
  leave_days          int not null default 0 check (leave_days >= 0),

  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (run_id, employee_id)
);

create index if not exists idx_payroll_lines_run on public.payroll_lines(run_id);
create index if not exists idx_payroll_lines_emp on public.payroll_lines(employee_id);

-- ── 4) salary_payments — actual disbursement records ────────
-- One row per employee line when a run is marked paid. Keeps a per-employee
-- payment trail ("when/how was X last paid").
create table if not exists public.salary_payments (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.payroll_runs(id) on delete cascade,
  line_id       uuid references public.payroll_lines(id) on delete set null,
  employee_id   uuid references public.employees(id),
  amount        numeric(14,2) not null check (amount >= 0),
  payment_date  date not null default current_date,
  method        text,                                -- payment_method lookup code (e.g. 'bank_transfer')
  reference     text,                                -- transfer / WPS batch reference
  paid_by       uuid references public.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_salary_payments_run on public.salary_payments(run_id);
create index if not exists idx_salary_payments_emp on public.salary_payments(employee_id);

-- ── 5) payroll_run_history — append-only audit ──────────────
create table if not exists public.payroll_run_history (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.payroll_runs(id) on delete cascade,
  action        text not null,                       -- 'created' | 'lines_seeded' | <new status> | 'reopened'
  detail        text,
  changed_by    uuid references public.users(id),
  changed_at    timestamptz not null default now()
);

create index if not exists idx_payroll_hist_run on public.payroll_run_history(run_id, changed_at desc);

-- ── 6) RLS — admin / md / accounts only (confidential) ──────
alter table public.payroll_runs        enable row level security;
alter table public.payroll_lines       enable row level security;
alter table public.salary_payments     enable row level security;
alter table public.payroll_run_history enable row level security;

drop policy if exists payroll_runs_read on public.payroll_runs;
create policy payroll_runs_read on public.payroll_runs for select using (
  public.fn_my_role() in ('admin','md','accounts')
);
drop policy if exists payroll_runs_write on public.payroll_runs;
create policy payroll_runs_write on public.payroll_runs for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists payroll_lines_read on public.payroll_lines;
create policy payroll_lines_read on public.payroll_lines for select using (
  public.fn_my_role() in ('admin','md','accounts')
);
drop policy if exists payroll_lines_write on public.payroll_lines;
create policy payroll_lines_write on public.payroll_lines for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists salary_payments_read on public.salary_payments;
create policy salary_payments_read on public.salary_payments for select using (
  public.fn_my_role() in ('admin','md','accounts')
);
drop policy if exists salary_payments_write on public.salary_payments;
create policy salary_payments_write on public.salary_payments for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- History is read-only; only the SECURITY DEFINER trigger writes it.
drop policy if exists payroll_hist_read on public.payroll_run_history;
create policy payroll_hist_read on public.payroll_run_history for select using (
  public.fn_my_role() in ('admin','md','accounts')
);

-- ── 7) updated_at touch (reuse fn_acct_touch from 0045) ─────
drop trigger if exists trg_payroll_runs_touch on public.payroll_runs;
create trigger trg_payroll_runs_touch before update on public.payroll_runs
  for each row execute function public.fn_acct_touch();

drop trigger if exists trg_payroll_lines_touch on public.payroll_lines;
create trigger trg_payroll_lines_touch before update on public.payroll_lines
  for each row execute function public.fn_acct_touch();

-- ── 8) Run code + period defaults + actor seed ──────────────
create or replace function public.fn_payroll_run_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.run_code is null then
    new.run_code := 'PR-' || new.period_year::text || '-' || lpad(new.period_month::text, 2, '0');
  end if;
  if new.period_start is null then
    new.period_start := make_date(new.period_year, new.period_month, 1);
  end if;
  if new.period_end is null then
    new.period_end := (make_date(new.period_year, new.period_month, 1) + interval '1 month - 1 day')::date;
  end if;
  new.last_action_by := coalesce(new.last_action_by, new.created_by);
  return new;
end $$;
alter function public.fn_payroll_run_before_insert() owner to postgres;

drop trigger if exists trg_payroll_run_before_insert on public.payroll_runs;
create trigger trg_payroll_run_before_insert before insert on public.payroll_runs
  for each row execute function public.fn_payroll_run_before_insert();

-- ── 9) Line changes → recompute run totals ──────────────────
create or replace function public.fn_payroll_line_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  v_run := coalesce(new.run_id, old.run_id);
  update payroll_runs r set
    total_gross      = coalesce((select sum(gross_salary)    from payroll_lines where run_id = v_run), 0),
    total_additions  = coalesce((select sum(additions_total) from payroll_lines where run_id = v_run), 0),
    total_deductions = coalesce((select sum(deductions)      from payroll_lines where run_id = v_run), 0),
    total_net        = coalesce((select sum(net_pay)         from payroll_lines where run_id = v_run), 0),
    employee_count   = (select count(*) from payroll_lines where run_id = v_run)
  where r.id = v_run;
  return null;
end $$;
alter function public.fn_payroll_line_recalc() owner to postgres;

drop trigger if exists trg_payroll_line_recalc on public.payroll_lines;
create trigger trg_payroll_line_recalc after insert or update or delete on public.payroll_lines
  for each row execute function public.fn_payroll_line_recalc();

-- ── 10) Append-only audit on the run ────────────────────────
create or replace function public.fn_payroll_run_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into payroll_run_history (run_id, action, detail, changed_by)
      values (new.id, 'created',
              'Run ' || new.run_code || ' created for ' ||
              lpad(new.period_month::text, 2, '0') || '/' || new.period_year::text,
              new.last_action_by);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into payroll_run_history (run_id, action, detail, changed_by)
      values (new.id, new.status::text,
              'Status: ' || old.status::text || ' → ' || new.status::text,
              new.last_action_by);
  end if;
  return null;
end $$;
alter function public.fn_payroll_run_audit() owner to postgres;

drop trigger if exists trg_payroll_run_audit_ins on public.payroll_runs;
create trigger trg_payroll_run_audit_ins after insert on public.payroll_runs
  for each row execute function public.fn_payroll_run_audit();

drop trigger if exists trg_payroll_run_audit_upd on public.payroll_runs;
create trigger trg_payroll_run_audit_upd after update on public.payroll_runs
  for each row execute function public.fn_payroll_run_audit();

-- ── 11) Smoke test ──────────────────────────────────────────
do $$
declare v_tabs int; v_enum int; v_pols int; v_trgs int; v_gen int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public'
     and table_name in ('payroll_runs','payroll_lines','salary_payments','payroll_run_history');
  if v_tabs <> 4 then raise exception '0053 failed: expected 4 tables, found %', v_tabs; end if;

  select count(*) into v_enum from pg_type where typname='payroll_run_status';
  if v_enum <> 1 then raise exception '0053 failed: payroll_run_status enum missing'; end if;

  -- gross/additions/net must be generated columns.
  select count(*) into v_gen from information_schema.columns
   where table_schema='public' and table_name='payroll_lines'
     and column_name in ('gross_salary','additions_total','net_pay') and is_generated='ALWAYS';
  if v_gen <> 3 then raise exception '0053 failed: expected 3 generated columns, found %', v_gen; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public'
     and tablename in ('payroll_runs','payroll_lines','salary_payments','payroll_run_history');
  if v_pols < 7 then raise exception '0053 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_payroll_runs_touch','trg_payroll_lines_touch','trg_payroll_run_before_insert',
    'trg_payroll_line_recalc','trg_payroll_run_audit_ins','trg_payroll_run_audit_upd'
  ) and not tgisinternal;
  if v_trgs <> 6 then raise exception '0053 failed: expected 6 triggers, found %', v_trgs; end if;

  raise notice '─── 0053 applied: payroll runs/lines/payments/history, % policies, % triggers ───', v_pols, v_trgs;
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
-- /*
-- -- 1) Objects present:
-- select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('payroll_runs','payroll_lines','salary_payments','payroll_run_history');
-- select unnest(enum_range(null::payroll_run_status));
--
-- -- 2) Generated net_pay sanity (needs an employee from 0052):
-- insert into payroll_runs (period_year, period_month) values (2026, 6);
-- insert into payroll_lines (run_id, employee_id, employee_name,
--   basic_salary, housing_allowance, overtime_amount, deductions)
--   select r.id, e.id, e.name, 4000, 1500, 500, 200
--     from payroll_runs r, employees e
--    where r.period_year=2026 and r.period_month=6 limit 1;
-- -- Expect gross 5500, additions 500, net 5800; run totals updated:
-- select run_code, total_gross, total_additions, total_deductions, total_net, employee_count
--   from payroll_runs where period_year=2026 and period_month=6;
-- select employee_name, gross_salary, additions_total, net_pay from payroll_lines;
--
-- -- 3) Audit + month-uniqueness:
-- select action, detail from payroll_run_history order by changed_at;
-- -- A 2nd live run for 2026-06 should fail the partial unique:
-- -- insert into payroll_runs (period_year, period_month) values (2026, 6);  -- expect 23505
-- */
-- ============================================================
