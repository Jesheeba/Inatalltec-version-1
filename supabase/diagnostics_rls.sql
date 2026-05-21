-- ============================================================
-- Installtec - RLS recursion diagnostics
-- Run in Supabase Dashboard → SQL Editor → New query → Run.
-- Copy-paste the FULL output back to the assistant.
-- ============================================================
-- This file is a one-shot diagnostic - it does NOT modify the
-- database. It only reads catalogue tables and tries a write
-- that you can rollback at the end. Safe to run repeatedly.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- DIAG 1: helper function definitions + ownership
-- Expected: 4-6 rows, owner='postgres', is_security_definer=true
-- ────────────────────────────────────────────────────────────
select '─── DIAG 1: helpers ───' as section;
select p.proname                       as function_name,
       pg_get_userbyid(p.proowner)     as owner,
       p.prosecdef                     as is_security_definer,
       p.proconfig                     as function_config
from   pg_proc p
join   pg_namespace n on n.oid = p.pronamespace
where  n.nspname = 'public'
  and  p.proname in (
    'fn_my_id','fn_my_role','fn_is_admin','fn_is_md_or_admin',
    'fn_my_scope','fn_my_permissions'
  )
order by p.proname;

-- ────────────────────────────────────────────────────────────
-- DIAG 2: basic users-table read
-- Expected: a count number. If "stack depth limit exceeded",
-- the helper-recursion bug is still live.
-- ────────────────────────────────────────────────────────────
select '─── DIAG 2: users count ───' as section;
select count(*) as users_count from public.users;

-- ────────────────────────────────────────────────────────────
-- DIAG 3: helper smoke test (auth.uid() will be NULL in the SQL
-- Editor - that's fine, the helpers must still execute without
-- erroring).
-- ────────────────────────────────────────────────────────────
select '─── DIAG 3: helper smoke ───' as section;
select fn_my_id()          as my_id_value;
select fn_my_role()::text  as my_role_value;
select fn_is_admin()       as is_admin_value;

-- ────────────────────────────────────────────────────────────
-- DIAG 4: ALL policies on users - look for any policy that
-- contains `from users` in its USING/CHECK clauses (= recursive)
-- ────────────────────────────────────────────────────────────
select '─── DIAG 4: users policies ───' as section;
select policyname,
       cmd,
       qual::text       as using_clause,
       with_check::text as check_clause
from   pg_policies
where  schemaname = 'public' and tablename = 'users'
order by policyname;

-- ────────────────────────────────────────────────────────────
-- DIAG 5: ALL policies on customers
-- ────────────────────────────────────────────────────────────
select '─── DIAG 5: customers policies ───' as section;
select policyname,
       cmd,
       qual::text       as using_clause,
       with_check::text as check_clause
from   pg_policies
where  schemaname = 'public' and tablename = 'customers'
order by policyname;

-- ────────────────────────────────────────────────────────────
-- DIAG 6: policies on all the other tables that 0006/0007 touch
-- ────────────────────────────────────────────────────────────
select '─── DIAG 6: other policies ───' as section;
select tablename,
       policyname,
       cmd,
       qual::text       as using_clause,
       with_check::text as check_clause
from   pg_policies
where  schemaname = 'public'
  and  tablename in (
    'projects','work_orders','amc_contracts','repair_tickets',
    'approvals','milestones','sites','teams','approval_steps',
    'work_order_assignments','amc_service_schedule'
  )
order by tablename, policyname;

-- ────────────────────────────────────────────────────────────
-- DIAG 7: triggers on every write-failing table
-- Expected: probably 0 rows. If anything shows up, that's a
-- new recursion suspect.
-- ────────────────────────────────────────────────────────────
select '─── DIAG 7: triggers ───' as section;
select event_object_table  as table_name,
       trigger_name,
       event_manipulation  as event,
       action_statement
from   information_schema.triggers
where  event_object_schema = 'public'
  and  event_object_table in (
    'customers','projects','work_orders','amc_contracts',
    'repair_tickets','approvals','users'
  )
order by event_object_table, trigger_name;

-- ────────────────────────────────────────────────────────────
-- DIAG 8: direct INSERT bypassing the app
-- Wrapped in a savepoint so we don't leave a row behind.
-- If this throws "stack depth limit exceeded", policies are
-- still broken. If it succeeds, the bug is in the app's
-- authenticated-user context (different code path).
-- ────────────────────────────────────────────────────────────
select '─── DIAG 8: direct insert ───' as section;
begin;
savepoint diag8;
insert into public.customers (name, tier, region, sector)
values ('Diagnostic Test Customer', 'Standard', 'UAE', '-')
returning id, name, tier, region;
rollback to savepoint diag8;
commit;

-- ────────────────────────────────────────────────────────────
-- DIAG 9: applied migrations
-- Look for 0006_rls_helpers and 0007_rls_recursion_definitive_fix
-- ────────────────────────────────────────────────────────────
select '─── DIAG 9: migrations ───' as section;
select version, name, statements is not null as has_statements
from   supabase_migrations.schema_migrations
order by version desc
limit 20;

-- ────────────────────────────────────────────────────────────
-- END OF DIAGNOSTICS
-- Paste ALL of the above output back to the assistant.
-- ────────────────────────────────────────────────────────────
