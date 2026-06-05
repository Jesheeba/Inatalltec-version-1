-- ============================================================
-- 0032 — Fix amc_service_schedule read visibility for Lead Tech.
--
-- Symptom: Operations Manager sees the full Q1/Q2/Q3/Q4 schedule
-- on every AMC detail page; Lead Technician viewing the same AMC
-- sees "No services scheduled yet" — even when ranjan IS the
-- assigned Lead Tech on the contract.
--
-- Root cause: amc_service_schedule has accumulated two SELECT
-- policies across migrations:
--
--   • amc_sched_read    (0001 / 0006 / 0007)  → using (true)
--   • amc_schedule_read (0009b)               → using (EXISTS
--                                                 amc_contracts.id = ...)
--
-- Postgres OR's policies of the same command, so the permissive
-- one ought to win. But the second policy's EXISTS subquery
-- evaluates AGAINST the calling user's RLS context — and the
-- amc_read policy from 0007 (kept by 0016) only grants SELECT
-- on amc_contracts to:
--     admin · md · manager · sales · accounts
--
-- Lead Technicians and Workers are NOT in that list. So if
-- amc_sched_read ever got dropped manually (or never re-applied
-- in your DB), only amc_schedule_read remained — and its EXISTS
-- check returned FALSE for every lead_worker / worker session,
-- hiding every schedule row from them.
--
-- This migration:
--   1. Drops BOTH policies cleanly.
--   2. Re-creates a single, simple amc_sched_read with
--      using (true). The schedule is operational read-data; if
--      you can authenticate, you can see it. Writes stay locked
--      down (the existing amc_schedule_write / amc_sched_write
--      policies are untouched — see step 4 verification).
--
-- Schema, triggers, data — untouched. RLS-only. Idempotent.
-- ============================================================

begin;

-- ─── 1) Drop both potential SELECT policies on the schedule table ──
drop policy if exists amc_sched_read    on public.amc_service_schedule;
drop policy if exists amc_schedule_read on public.amc_service_schedule;

-- ─── 2) Re-create a single permissive SELECT policy ───────────────
create policy amc_sched_read
  on public.amc_service_schedule
  for select using (true);

-- ─── 3) Smoke test — confirm the new policy is the only SELECT one ──
do $$
declare
  v_select_policy_count int;
  v_using_clause        text;
begin
  select count(*) into v_select_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'amc_service_schedule'
     and cmd        = 'SELECT';

  if v_select_policy_count <> 1 then
    raise exception
      '0032 failed: expected exactly 1 SELECT policy on amc_service_schedule, found %',
      v_select_policy_count;
  end if;

  select qual into v_using_clause
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'amc_service_schedule'
     and policyname = 'amc_sched_read';

  if v_using_clause is null then
    raise exception '0032 failed: amc_sched_read policy missing after recreate';
  end if;

  raise notice '─── 0032 applied ───';
  raise notice 'SELECT policy on amc_service_schedule: amc_sched_read · using (%)',
    v_using_clause;
end $$;

-- ─── 4) Belt-and-braces — confirm write policy still exists, so
--      we haven't accidentally opened writes to everyone ─────────
do $$
declare
  v_write_policy_count int;
begin
  select count(*) into v_write_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'amc_service_schedule'
     and cmd in ('ALL','INSERT','UPDATE','DELETE');

  if v_write_policy_count = 0 then
    raise exception
      '0032 failed: no write policy on amc_service_schedule — writes are now wide open';
  end if;

  raise notice 'Write policies preserved: % row(s) on amc_service_schedule',
    v_write_policy_count;
end $$;

commit;
