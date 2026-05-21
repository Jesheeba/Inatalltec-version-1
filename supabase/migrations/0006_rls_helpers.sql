-- ============================================================
-- 0006 - RLS helper hardening + non-recursive policy rewrite
--
-- Problem
--   Writes to customers / projects / work_orders / amc_contracts /
--   repair_tickets / approvals were failing with:
--       "stack depth limit exceeded"
--   Root cause: the helper functions (fn_my_id, fn_my_role,
--   fn_is_admin, fn_is_md_or_admin) query public.users. They were
--   declared SECURITY DEFINER in setup.sql, which SHOULD bypass RLS
--   on the inner query - but only if the function is owned by a role
--   that bypasses RLS (i.e. postgres / supabase_admin). In some
--   environments the functions got created under a non-bypassing
--   role, so the inner SELECT re-triggered the users-table policies,
--   which called the helpers again, ad infinitum.
--
-- Fix (three parts)
--   1. Recreate the helpers with SECURITY DEFINER and explicitly
--      ALTER ... OWNER TO postgres so the inner query bypasses RLS.
--   2. Rewrite the users-table policies so the self-read path uses
--      auth.uid() DIRECTLY (no function call, no subquery on users).
--      The admin path still uses fn_is_admin(), but now that helper
--      is guaranteed to bypass RLS.
--   3. Drop and recreate the policies on every dependent table
--      (customers / sites / projects / milestones / amc_contracts /
--      repair_tickets / work_orders / work_order_assignments /
--      approvals / approval_steps) so they are unambiguously the
--      latest version pointing at the hardened helpers.
--
-- NOT included (call out in PR description)
--   * organization-scoped policies (`organization_id = fn_my_org()`).
--     The customers / projects / work_orders / etc. tables don't have
--     an organization_id column in the current schema. Adding those
--     policies now would reference non-existent columns and break the
--     migration. Defer until the organizations table + org_id columns
--     are added.
--   * Switching reads in app/(app)/layout.tsx off supabaseAdmin() and
--     back onto the authenticated client. Optional, and orthogonal to
--     unblocking writes. Tracked separately.
--
-- Idempotent: safe to re-run.
-- ============================================================

begin;

-- ============================================================
-- 1) HELPER FUNCTIONS - recreated with guaranteed bypass-RLS
-- ============================================================

create or replace function fn_my_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.users where auth_id = auth.uid() limit 1
$$;

create or replace function fn_my_role() returns role
  language sql stable security definer set search_path = public as $$
  select role from public.users where auth_id = auth.uid() limit 1
$$;

create or replace function fn_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users where auth_id = auth.uid() and role = 'admin'
  )
$$;

create or replace function fn_is_md_or_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where auth_id = auth.uid() and role in ('admin','md')
  )
$$;

-- Bonus helpers - useful for app code that wants to check JSONB scope
-- without round-tripping. Safe to add even though policies don't use
-- them yet.
create or replace function fn_my_scope() returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(scope, '{}'::jsonb) from public.users where auth_id = auth.uid() limit 1
$$;

create or replace function fn_my_permissions() returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(permissions, '{}'::jsonb) from public.users where auth_id = auth.uid() limit 1
$$;

-- THE CRITICAL STEP: ensure these are owned by a bypass-RLS role.
-- In Supabase, `postgres` has BYPASSRLS by default. SECURITY DEFINER
-- runs as the owner, so this is what actually breaks the recursion.
alter function fn_my_id()          owner to postgres;
alter function fn_my_role()        owner to postgres;
alter function fn_is_admin()       owner to postgres;
alter function fn_is_md_or_admin() owner to postgres;
alter function fn_my_scope()       owner to postgres;
alter function fn_my_permissions() owner to postgres;

-- And callable by signed-in users.
grant execute on function fn_my_id()          to authenticated;
grant execute on function fn_my_role()        to authenticated;
grant execute on function fn_is_admin()       to authenticated;
grant execute on function fn_is_md_or_admin() to authenticated;
grant execute on function fn_my_scope()       to authenticated;
grant execute on function fn_my_permissions() to authenticated;

-- ============================================================
-- 2) USERS-TABLE POLICIES - self-read uses auth.uid() directly,
--    admin paths use the (now-hardened) helpers.
-- ============================================================

drop policy if exists users_read      on public.users;
drop policy if exists users_admin_all on public.users;
drop policy if exists users_self_read on public.users;
drop policy if exists users_mgr_read  on public.users;

-- Read your own row - no helper call at all.
create policy users_self_read on public.users
  for select using (auth_id = auth.uid());

-- Read your direct reports - uses fn_my_id() which is now guaranteed
-- to bypass RLS, so no recursion.
create policy users_mgr_read on public.users
  for select using (manager_id = fn_my_id());

-- Admins do everything (and read everything via this same policy's USING).
create policy users_admin_all on public.users
  for all
  using      (fn_is_admin())
  with check (fn_is_admin());

-- ============================================================
-- 3) DEPENDENT TABLES - drop + recreate every write policy that
--    was failing under the old helper. The expressions match the
--    intent of setup.sql; this migration just makes them current.
-- ============================================================

-- customers ---------------------------------------------------
drop policy if exists customers_read  on public.customers;
drop policy if exists customers_write on public.customers;
create policy customers_read on public.customers
  for select using (
    fn_is_md_or_admin()
    or fn_my_role() in ('manager','sales','service_support','accounts')
  );
create policy customers_write on public.customers
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'));

-- sites -------------------------------------------------------
drop policy if exists sites_read  on public.sites;
drop policy if exists sites_write on public.sites;
create policy sites_read on public.sites for select using (true);
create policy sites_write on public.sites
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'));

-- projects ----------------------------------------------------
drop policy if exists projects_read  on public.projects;
drop policy if exists projects_write on public.projects;
create policy projects_read on public.projects
  for select using (
    fn_is_md_or_admin()
    or fn_my_role() in ('manager','sales','estimator','lead_worker','accounts')
  );
create policy projects_write on public.projects
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','estimator'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','estimator'));

-- milestones --------------------------------------------------
drop policy if exists milestones_read  on public.milestones;
drop policy if exists milestones_write on public.milestones;
create policy milestones_read on public.milestones for select using (true);
create policy milestones_write on public.milestones
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','estimator'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','estimator'));

-- amc_contracts -----------------------------------------------
drop policy if exists amc_read  on public.amc_contracts;
drop policy if exists amc_write on public.amc_contracts;
create policy amc_read on public.amc_contracts
  for select using (
    fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts')
  );
create policy amc_write on public.amc_contracts
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'));

-- amc_service_schedule ----------------------------------------
drop policy if exists amc_sched_read  on public.amc_service_schedule;
drop policy if exists amc_sched_write on public.amc_service_schedule;
create policy amc_sched_read on public.amc_service_schedule for select using (true);
create policy amc_sched_write on public.amc_service_schedule
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'));

-- repair_tickets ----------------------------------------------
drop policy if exists repair_read  on public.repair_tickets;
drop policy if exists repair_write on public.repair_tickets;
create policy repair_read on public.repair_tickets
  for select using (
    fn_is_md_or_admin()
    or fn_my_role() in ('manager','service_support','lead_worker','worker','sales')
    or assigned_to = fn_my_id()
  );
create policy repair_write on public.repair_tickets
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','service_support','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','service_support','lead_worker'));

-- work_orders -------------------------------------------------
drop policy if exists wo_read  on public.work_orders;
drop policy if exists wo_write on public.work_orders;
create policy wo_read on public.work_orders
  for select using (
    fn_is_md_or_admin()
    or fn_my_role() in ('manager','service_support','accounts','sales','lead_worker','estimator')
    or assigned_lead = fn_my_id()
    or exists (
      select 1 from public.work_order_assignments a
      where a.work_order_id = work_orders.id and a.user_id = fn_my_id()
    )
  );
create policy wo_write on public.work_orders
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'));

-- work_order_assignments --------------------------------------
drop policy if exists woa_read  on public.work_order_assignments;
drop policy if exists woa_write on public.work_order_assignments;
create policy woa_read on public.work_order_assignments for select using (true);
create policy woa_write on public.work_order_assignments
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'));

-- approvals ---------------------------------------------------
drop policy if exists ap_read  on public.approvals;
drop policy if exists ap_write on public.approvals;
create policy ap_read on public.approvals
  for select using (
    fn_is_md_or_admin()
    or requester_id = fn_my_id()
    or exists (
      select 1 from public.approval_steps s
      where s.approval_id = approvals.id and s.approver_id = fn_my_id()
    )
  );
create policy ap_write on public.approvals
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts','lead_worker'));

-- approval_steps ----------------------------------------------
drop policy if exists aps_read   on public.approval_steps;
drop policy if exists aps_update on public.approval_steps;
drop policy if exists aps_write  on public.approval_steps;
create policy aps_read on public.approval_steps for select using (true);
create policy aps_update on public.approval_steps
  for update
  using      (approver_id = fn_my_id() or fn_is_md_or_admin())
  with check (true);
-- approvals are inserted alongside their steps from the API route, so
-- writes (INSERT/DELETE) on approval_steps need to be permitted for the
-- same roles that can write approvals.
create policy aps_write on public.approval_steps
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts','lead_worker'));

-- ============================================================
-- 4) SMOKE-TEST QUERIES (run manually after applying)
--    -- as the signed-in user, in the SQL Editor's "Run as user" mode:
--    select fn_my_id();         -- expect uuid, no recursion
--    select fn_my_role();       -- expect a role enum value
--    select fn_is_admin();      -- expect true/false
--    select count(*) from public.users;       -- no stack-depth error
--    select count(*) from public.customers;
--    select count(*) from public.projects;
-- ============================================================

commit;
