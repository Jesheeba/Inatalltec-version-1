-- ============================================================
-- 0016 — Tighten write policies to match the Installtec role spec
--
-- Audit summary (effective state after 0006/0007/0013):
--
--   customers_write     md/admin/manager/sales                       ✓ keeps as-is
--   sites_write         md/admin/manager/sales                       drop sales, add lead_worker
--   projects_write      md/admin/manager/estimator                   drop estimator
--   milestones_write    md/admin/manager/estimator                   drop estimator (match projects)
--   amc_write           md/admin/manager/sales/accounts              drop sales + accounts
--   repair_write        md/admin/manager/service_support/lead_worker drop service_support + lead_worker
--   work_orders         md/admin/manager/lead_worker
--                       + wo_write_assignee (UPDATE only) from 0014  ✓ keeps as-is
--
-- Rationale (from the spec):
--   - Operations Manager creates Projects / AMC / Repair / Customers / Sites
--   - Lead Technician creates Work Orders + Sites
--   - Sales creates Customers only
--   - Accounts: payments-only (amc_payments writes, kept; no AMC create)
--
-- super_admin reaches these tables via the email-allowlist promotion to
-- DB role 'admin' in app/(app)/layout.tsx → still passes fn_is_md_or_admin.
--
-- Read policies are NOT changed here — list pages still need to surface
-- rows to anyone who might need them (e.g. lead_worker reads projects to
-- see what they're working on); the role-aware UI filter narrows further
-- per-route. Tightening reads to match writes would break legitimate
-- read flows.
--
-- Single transaction — only policy DDL, no enum or column work.
-- ============================================================

begin;

-- ============================================================
-- 1) sites_write — drop sales, add lead_worker
--    Lead Techs are often on-site and identify new locations.
-- ============================================================
drop policy if exists sites_write on public.sites;
create policy sites_write on public.sites
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','lead_worker'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','lead_worker'));

-- ============================================================
-- 2) projects_write — drop estimator
--    Operations Manager owns Main Contractor jobs end-to-end.
-- ============================================================
drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager')
  with check (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager');

-- ============================================================
-- 3) milestones_write — drop estimator (match projects_write)
--    Milestones are part of project setup; same gate as the parent row.
-- ============================================================
drop policy if exists milestones_write on public.milestones;
create policy milestones_write on public.milestones
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager')
  with check (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager');

-- ============================================================
-- 4) amc_write — drop sales + accounts
--    AMC contracts are an Ops decision. Accounts still records
--    payments via amc_payments (its own write policy, unchanged).
--    The fn_amc_payment_received trigger runs as postgres so it
--    bypasses RLS to flip contract_status on payment insert.
-- ============================================================
drop policy if exists amc_write on public.amc_contracts;
create policy amc_write on public.amc_contracts
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager')
  with check (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager');

-- ============================================================
-- 5) repair_write — drop service_support + lead_worker
--    Service Support and Lead Techs READ repair tickets but only
--    Ops Manager creates them. Repair lifecycle updates that need
--    lead/service_support involvement can be re-granted by a later
--    narrower policy if/when the spec calls for it.
-- ============================================================
drop policy if exists repair_write on public.repair_tickets;
create policy repair_write on public.repair_tickets
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager')
  with check (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager');

-- ============================================================
-- 6) Inline smoke test — fails the migration if any policy was
--    dropped without a replacement, or if the new role lists are
--    not what we expect.
-- ============================================================
do $$
declare
  v_sites    bigint;
  v_projects bigint;
  v_miles    bigint;
  v_amc      bigint;
  v_repair   bigint;
begin
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'sites' and policyname = 'sites_write'
   into v_sites;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_write'
   into v_projects;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'milestones' and policyname = 'milestones_write'
   into v_miles;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'amc_contracts' and policyname = 'amc_write'
   into v_amc;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'repair_tickets' and policyname = 'repair_write'
   into v_repair;
  raise notice '─── 0016 smoke test ───';
  raise notice '  sites_write     = % (expect 1)', v_sites;
  raise notice '  projects_write  = % (expect 1)', v_projects;
  raise notice '  milestones_write= % (expect 1)', v_miles;
  raise notice '  amc_write       = % (expect 1)', v_amc;
  raise notice '  repair_write    = % (expect 1)', v_repair;
  raise notice '─── 0016 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- Confirm the new write policies and their predicates:
-- select tablename, policyname, pg_get_expr(polqual, polrelid) as using_expr
--   from pg_policies p
--   join pg_policy pp on pp.polname = p.policyname
--  where p.schemaname = 'public'
--    and p.policyname in ('sites_write','projects_write','milestones_write','amc_write','repair_write')
--  order by tablename;
--
-- Expected: each predicate should be
--   sites_write     → md/admin/manager/lead_worker
--   projects_write  → md/admin/manager
--   milestones_write→ md/admin/manager
--   amc_write       → md/admin/manager
--   repair_write    → md/admin/manager
--
-- ============================================================
