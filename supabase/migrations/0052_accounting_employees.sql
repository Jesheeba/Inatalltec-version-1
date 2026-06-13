-- ============================================================
-- 0052 — Accountant module · Phase 4 (Slice 4A): Employee Salary Master
--
-- The HR/payroll directory of employees and their UAE salary structure.
-- This is the FOUNDATION for monthly payroll runs (Slice 4C), WPS export
-- and end-of-service calculation (Slice 4E).
--
-- It is a SEPARATE directory from public.users (app logins) — exactly as
-- sub_contractors (0023) is separate from users. An employee here need
-- not have a login; payroll is about people we pay, not people who sign in.
--
-- THIS SLICE STORES DATA ONLY — no gratuity / WPS / payroll-run maths, so
-- it carries NO UAE-legal calculation assumptions. Those land in 4C/4E and
-- will be flagged explicitly per the build rules.
--
-- Salary structure (UAE): basic + housing + transport + other allowances;
-- total_salary (gross) is GENERATED. Net pay is a payroll-run concept
-- (deductions per run), not stored on the master.
--
-- CONFIDENTIALITY: salaries are sensitive. Unlike the other accountant
-- tables (which Manager can read), this is restricted to admin / md /
-- accounts — Manager is NOT granted read here. (Flagged in the report.)
--
-- Net-new objects:
--   • employee_status enum
--   • employees table (+ EMP-NNNN code trigger, hardcoded prefix like
--     the VEN- vendor codes in 0047)
--
-- Strictly additive. Reuses fn_my_role() (0006) + fn_acct_touch() (0045).
-- Idempotent; single txn.
-- ============================================================

begin;

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'employee_status') then
    create type employee_status as enum ('active', 'on_leave', 'probation', 'resigned', 'terminated');
  end if;
end $$;

-- ── 2) Table ────────────────────────────────────────────────
create table if not exists public.employees (
  id                   uuid primary key default gen_random_uuid(),
  org_key              text not null default 'org_installtec',
  employee_code        text unique,             -- EMP-NNNN, set by trigger
  name                 text not null,
  position             text,
  department           text,
  date_of_joining      date,
  date_of_birth        date,
  nationality          text,
  passport_number      text,
  emirates_id          text,
  visa_status          text,
  -- UAE salary structure. total_salary (gross) is generated.
  basic_salary         numeric(14,2) not null default 0 check (basic_salary >= 0),
  housing_allowance    numeric(14,2) not null default 0 check (housing_allowance >= 0),
  transport_allowance  numeric(14,2) not null default 0 check (transport_allowance >= 0),
  other_allowances     numeric(14,2) not null default 0 check (other_allowances >= 0),
  total_salary         numeric(14,2) generated always as
                         (basic_salary + housing_allowance + transport_allowance + other_allowances) stored,
  bank_account         text,
  iban                 text,
  status               employee_status not null default 'active',
  -- Separation date when resigned/terminated — used by EOS calc in 4E.
  separation_date      date,
  notes                text,
  created_by           uuid references public.users(id),
  last_action_by       uuid references public.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Real Emirates IDs unique; multiple NULLs allowed (mirrors sub_contractors).
create unique index if not exists uq_employee_emirates_id
  on public.employees(emirates_id) where emirates_id is not null;

create index if not exists idx_employees_status     on public.employees(status);
create index if not exists idx_employees_department  on public.employees(department) where department is not null;
create index if not exists idx_employees_name_lower  on public.employees(lower(name));

-- ── 3) RLS — admin / md / accounts only (salaries are confidential) ──
alter table public.employees enable row level security;

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select using (
  public.fn_my_role() in ('admin','md','accounts')
);
drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- ── 4) updated_at touch (reuse fn_acct_touch from 0045) ─────
drop trigger if exists trg_employees_touch on public.employees;
create trigger trg_employees_touch before update on public.employees
  for each row execute function public.fn_acct_touch();

-- ── 5) Code assignment (EMP-NNNN) + actor seed ──────────────
create or replace function public.fn_employee_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if new.employee_code is null then
    select count(*) + 1 into v_count from employees
      where org_key = coalesce(new.org_key, 'org_installtec');
    new.employee_code := 'EMP-' || lpad(v_count::text, 4, '0');
  end if;
  new.last_action_by := coalesce(new.last_action_by, new.created_by);
  return new;
end $$;
alter function public.fn_employee_before_insert() owner to postgres;

drop trigger if exists trg_employee_before_insert on public.employees;
create trigger trg_employee_before_insert before insert on public.employees
  for each row execute function public.fn_employee_before_insert();

-- ── 6) Smoke test ───────────────────────────────────────────
do $$
declare v_tab int; v_enum int; v_pols int; v_trgs int; v_gen int;
begin
  select count(*) into v_tab from information_schema.tables
   where table_schema='public' and table_name='employees';
  if v_tab <> 1 then raise exception '0052 failed: employees table missing'; end if;

  select count(*) into v_enum from pg_type where typname='employee_status';
  if v_enum <> 1 then raise exception '0052 failed: employee_status enum missing'; end if;

  -- total_salary must be a generated column.
  select count(*) into v_gen from information_schema.columns
   where table_schema='public' and table_name='employees'
     and column_name='total_salary' and is_generated='ALWAYS';
  if v_gen <> 1 then raise exception '0052 failed: total_salary not generated'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename='employees';
  if v_pols < 2 then raise exception '0052 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_employee_before_insert','trg_employees_touch'
  );
  if v_trgs < 2 then raise exception '0052 failed: triggers missing (%)', v_trgs; end if;

  raise notice '─── 0052 applied: employees master, % policies, % triggers ───', v_pols, v_trgs;
end $$;

commit;
