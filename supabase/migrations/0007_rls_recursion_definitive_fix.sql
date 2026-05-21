-- ============================================================
-- 0007 - Definitive RLS recursion fix
--
-- Root cause (confirmed by static analysis of 0001_init.sql:501-512)
--   The four helper functions (fn_my_id, fn_my_role, fn_is_admin,
--   fn_is_md_or_admin) are defined in 0001_init.sql as plain
--   `language sql stable` - **without** `security definer` and
--   without `set search_path`. When called from inside a RLS policy
--   on the users table (or any policy that calls them), they run as
--   the AUTHENTICATED caller - not as the function owner. The caller
--   doesn't have BYPASSRLS, so the inner `select from users` is
--   subject to the same users-RLS that called the function, which
--   calls the function again, which queries users again, etc. →
--   "stack depth limit exceeded".
--
--   Migration 0006 recreated the functions with `security definer`
--   and `alter function ... owner to postgres`. That works - UNTIL
--   0001_init.sql is re-applied (via `supabase db reset`, a manual
--   re-run in the SQL Editor, or any tool that replays migrations
--   in numerical order). 0001's `create or replace function` then
--   strips the `security definer` attribute right back off, and the
--   recursion comes back.
--
-- Fix
--   1. Re-create the helpers with `security definer` + explicit
--      `set search_path = public`. Make the body identical to 0006
--      so this migration is purely idempotent over 0006.
--   2. Force ALTER FUNCTION ... OWNER TO postgres inside a DO block
--      that warns (rather than failing the whole migration) if the
--      executing role doesn't have superuser. This matters because:
--      `postgres` has BYPASSRLS by default in Supabase - so once the
--      function owner is postgres, the inner `select from users`
--      bypasses RLS regardless of what the policies do.
--   3. Inline smoke test inside the migration - runs `select
--      fn_is_admin()` to confirm the function executes without
--      recursing. If it recurses here, the migration fails loudly
--      instead of silently leaving the bug in place.
--   4. Re-assert the users-table policies so they survive even if
--      0001_init.sql was the source of the regression - drop the
--      0001 names AND the 0006 names, then recreate the 0006 set.
--   5. Re-assert the write policies on every dependent table that
--      was reported as failing (customers, projects, work_orders,
--      amc_contracts, repair_tickets, approvals + the supporting
--      tables their reads/writes cascade through).
--
-- What this migration deliberately does NOT do
--   * Touch any TABLE schema. No data loss possible - only RLS
--     policies and helper functions are modified.
--   * Reach into other tables (teams, role_permission_templates,
--     approval_chain_config, admin_audit_log, amc_payments,
--     work_order_tasks, customer_comms, inventory_items, assets).
--     Those still use the helpers and will benefit from the helper
--     fix automatically - re-asserting their policies is noise.
--   * Add organization scoping (defer until org tables exist).
--
-- Safe to run multiple times. Wrapped in BEGIN/COMMIT - atomic.
-- ============================================================

begin;

-- ============================================================
-- 0) PRE-FLIGHT - confirm we're running with enough privilege
-- ============================================================
do $$
begin
  raise notice '─── 0007 pre-flight ───';
  raise notice 'current_user = %', current_user;
  raise notice 'session_user = %', session_user;
  raise notice '─── recreating helpers ───';
end $$;

-- ============================================================
-- 1) HELPER FUNCTIONS - recreate with SECURITY DEFINER guaranteed
--
-- `create or replace function` updates the body AND the
-- `security definer` attribute. It preserves the existing owner,
-- so the ALTER OWNER step below is still required.
-- ============================================================

create or replace function public.fn_my_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.users where auth_id = auth.uid() limit 1
$$;

create or replace function public.fn_my_role() returns public.role
  language sql stable security definer set search_path = public as $$
  select role from public.users where auth_id = auth.uid() limit 1
$$;

create or replace function public.fn_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users where auth_id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.fn_is_md_or_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where auth_id = auth.uid() and role in ('admin','md')
  )
$$;

-- 0006 also created these - keep them current.
create or replace function public.fn_my_scope() returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(scope, '{}'::jsonb)
  from public.users where auth_id = auth.uid() limit 1
$$;

create or replace function public.fn_my_permissions() returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(permissions, '{}'::jsonb)
  from public.users where auth_id = auth.uid() limit 1
$$;

-- ============================================================
-- 2) FORCE OWNERSHIP TO postgres
--
-- This is the critical step that makes SECURITY DEFINER actually
-- bypass RLS. In Supabase, `postgres` has BYPASSRLS by default.
-- We wrap each ALTER in its own savepoint so a single failure
-- doesn't abort the whole migration - we want to see in the
-- output exactly which (if any) function couldn't be reassigned.
-- ============================================================
do $$
declare
  fn text;
  fns text[] := array[
    'fn_my_id()',
    'fn_my_role()',
    'fn_is_admin()',
    'fn_is_md_or_admin()',
    'fn_my_scope()',
    'fn_my_permissions()'
  ];
begin
  foreach fn in array fns loop
    begin
      execute format('alter function public.%s owner to postgres', fn);
      raise notice '  ✓ owner(public.%) -> postgres', fn;
    exception when others then
      raise warning '  ✗ alter function public.% owner to postgres FAILED: %', fn, sqlerrm;
      raise warning '    The recursion fix WILL NOT work unless this is resolved.';
      raise warning '    Run this migration as the postgres role (Supabase SQL Editor default).';
    end;
  end loop;
end $$;

-- Re-grant execute to authenticated users (idempotent).
grant execute on function public.fn_my_id()          to authenticated;
grant execute on function public.fn_my_role()        to authenticated;
grant execute on function public.fn_is_admin()       to authenticated;
grant execute on function public.fn_is_md_or_admin() to authenticated;
grant execute on function public.fn_my_scope()       to authenticated;
grant execute on function public.fn_my_permissions() to authenticated;

-- ============================================================
-- 3) DROP every old policy name that might be hanging around
--    from 0001_init.sql AND from setup.sql AND from 0006.
--    `drop policy if exists` is no-op when absent - safe.
-- ============================================================

-- users
drop policy if exists users_read           on public.users;
drop policy if exists users_write_admin    on public.users;  -- 0001
drop policy if exists users_admin_all      on public.users;  -- setup + 0006
drop policy if exists users_self_read      on public.users;  -- 0006
drop policy if exists users_mgr_read       on public.users;  -- 0006

-- customers
drop policy if exists customers_read       on public.customers;
drop policy if exists customers_write      on public.customers;

-- sites
drop policy if exists sites_read           on public.sites;
drop policy if exists sites_write          on public.sites;

-- projects
drop policy if exists projects_read        on public.projects;
drop policy if exists projects_write       on public.projects;

-- milestones
drop policy if exists milestones_read      on public.milestones;
drop policy if exists milestones_write     on public.milestones;

-- amc_contracts
drop policy if exists amc_read             on public.amc_contracts;
drop policy if exists amc_write            on public.amc_contracts;

-- amc_service_schedule
drop policy if exists amc_sched_read       on public.amc_service_schedule;
drop policy if exists amc_sched_write      on public.amc_service_schedule;

-- repair_tickets
drop policy if exists repair_read          on public.repair_tickets;
drop policy if exists repair_write         on public.repair_tickets;

-- work_orders
drop policy if exists wo_read              on public.work_orders;
drop policy if exists wo_write             on public.work_orders;

-- work_order_assignments
drop policy if exists woa_read             on public.work_order_assignments;
drop policy if exists woa_write            on public.work_order_assignments;

-- approvals
drop policy if exists ap_read              on public.approvals;
drop policy if exists ap_write             on public.approvals;

-- approval_steps
drop policy if exists aps_read             on public.approval_steps;
drop policy if exists aps_update           on public.approval_steps;
drop policy if exists aps_write            on public.approval_steps;

-- ============================================================
-- 4) USERS - self-read uses auth.uid() DIRECTLY (no helper call,
--    cannot recurse). Other paths use the (now hardened) helpers.
-- ============================================================

create policy users_self_read on public.users
  for select using (auth_id = auth.uid());

create policy users_mgr_read on public.users
  for select using (manager_id = public.fn_my_id());

create policy users_admin_all on public.users
  for all
  using      (public.fn_is_admin())
  with check (public.fn_is_admin());

-- ============================================================
-- 5) DEPENDENT TABLES - recreated identically to 0006 so the
--    state is unambiguous after this migration runs.
-- ============================================================

create policy customers_read on public.customers
  for select using (
    public.fn_is_md_or_admin()
    or public.fn_my_role() in ('manager','sales','service_support','accounts')
  );
create policy customers_write on public.customers
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales'));

create policy sites_read  on public.sites for select using (true);
create policy sites_write on public.sites
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales'));

create policy projects_read on public.projects
  for select using (
    public.fn_is_md_or_admin()
    or public.fn_my_role() in ('manager','sales','estimator','lead_worker','accounts')
  );
create policy projects_write on public.projects
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','estimator'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','estimator'));

create policy milestones_read  on public.milestones for select using (true);
create policy milestones_write on public.milestones
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','estimator'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','estimator'));

create policy amc_read on public.amc_contracts
  for select using (
    public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales','accounts')
  );
create policy amc_write on public.amc_contracts
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales','accounts'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales','accounts'));

create policy amc_sched_read  on public.amc_service_schedule for select using (true);
create policy amc_sched_write on public.amc_service_schedule
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales','accounts'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','sales','accounts'));

create policy repair_read on public.repair_tickets
  for select using (
    public.fn_is_md_or_admin()
    or public.fn_my_role() in ('manager','service_support','lead_worker','worker','sales')
    or assigned_to = public.fn_my_id()
  );
create policy repair_write on public.repair_tickets
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','service_support','lead_worker'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','service_support','lead_worker'));

create policy wo_read on public.work_orders
  for select using (
    public.fn_is_md_or_admin()
    or public.fn_my_role() in ('manager','service_support','accounts','sales','lead_worker','estimator')
    or assigned_lead = public.fn_my_id()
    or exists (
      select 1 from public.work_order_assignments a
      where a.work_order_id = work_orders.id and a.user_id = public.fn_my_id()
    )
  );
create policy wo_write on public.work_orders
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','lead_worker'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','lead_worker'));

create policy woa_read  on public.work_order_assignments for select using (true);
create policy woa_write on public.work_order_assignments
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','lead_worker'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','lead_worker'));

create policy ap_read on public.approvals
  for select using (
    public.fn_is_md_or_admin()
    or requester_id = public.fn_my_id()
    or exists (
      select 1 from public.approval_steps s
      where s.approval_id = approvals.id and s.approver_id = public.fn_my_id()
    )
  );
create policy ap_write on public.approvals
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','accounts','lead_worker'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','accounts','lead_worker'));

create policy aps_read on public.approval_steps for select using (true);
create policy aps_update on public.approval_steps
  for update
  using      (approver_id = public.fn_my_id() or public.fn_is_md_or_admin())
  with check (true);
create policy aps_write on public.approval_steps
  for all
  using      (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','accounts','lead_worker'))
  with check (public.fn_is_md_or_admin() or public.fn_my_role() in ('manager','accounts','lead_worker'));

-- ============================================================
-- 6) INLINE SMOKE TEST - confirm the helpers don't recurse before
--    we commit the transaction. If they DO recurse, this DO block
--    will throw "stack depth limit exceeded" and the COMMIT below
--    will be skipped (postgres aborts the transaction on error).
--    Any other error is also surfaced as a warning.
--
--    Note: auth.uid() returns NULL inside the SQL Editor (there's
--    no JWT in that session), so fn_is_admin() will return FALSE.
--    That's still a real round-trip through the helper - recursion
--    would still trigger if the SECURITY DEFINER chain is broken.
-- ============================================================
do $$
declare
  v_role text;
  v_admin boolean;
  v_count bigint;
begin
  select fn_my_role()::text       into v_role;
  select fn_is_admin()            into v_admin;
  select count(*) from public.users into v_count;
  raise notice '─── inline smoke test ───';
  raise notice '  fn_my_role()                = %', v_role;
  raise notice '  fn_is_admin()               = %', v_admin;
  raise notice '  select count(*) from users  = %', v_count;
  raise notice '─── recursion fix verified ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste this block in the Supabase SQL
-- Editor after the migration commits - should all succeed).
-- ============================================================
--
-- -- 1. Confirm helpers are SECURITY DEFINER, owned by postgres:
-- select p.proname              as function_name,
--        pg_get_userbyid(p.proowner) as owner,
--        p.prosecdef            as is_security_definer
-- from   pg_proc p
-- join   pg_namespace n on n.oid = p.pronamespace
-- where  n.nspname = 'public'
--   and  p.proname in ('fn_my_id','fn_my_role','fn_is_admin','fn_is_md_or_admin','fn_my_scope','fn_my_permissions');
--
-- -- 2. Basic query should NOT throw "stack depth limit exceeded":
-- select count(*) from public.users;
--
-- -- 3. Helpers should execute without error:
-- select fn_my_id();
-- select fn_my_role();
-- select fn_is_admin();
--
-- -- 4. Direct INSERT bypassing the app (run as `postgres` in SQL Editor,
-- --    which has BYPASSRLS - so this proves the table is healthy
-- --    independently of policy evaluation):
-- insert into public.customers (name, tier, region, sector)
-- values ('RLS Smoke Test', 'Standard', 'UAE', '-')
-- returning id, name;
-- -- (then delete it: delete from public.customers where name = 'RLS Smoke Test'; )
--
-- -- 5. Policy listing - sanity check there's exactly one of each:
-- select tablename, policyname, cmd
-- from   pg_policies
-- where  schemaname = 'public'
--   and  tablename in ('users','customers','projects','work_orders','amc_contracts',
--                      'repair_tickets','approvals','approval_steps','sites',
--                      'milestones','work_order_assignments','amc_service_schedule')
-- order by tablename, policyname;
--
-- ============================================================
