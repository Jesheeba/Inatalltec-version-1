-- ============================================================
-- 0029 — Widen wot_write RLS so the new persisted Tasks tab
-- can be edited by every role that touches WOs in day-to-day
-- flow. The v1.1.0 build added inline add / tick / delete
-- against the work_order_tasks table from 0001, but 0001's
-- wot_write policy only permitted manager / lead_worker /
-- worker (+ md/admin). Field testing turned up Accounts and
-- Service Support people who legitimately need to flag follow
-- ups on a WO — they used to do it in WhatsApp.
--
-- Final write allow-list (after this migration):
--   admin · md · manager · lead_worker · worker · driver ·
--   accounts · service_support
--
-- Excluded (stay read-only):
--   sales · estimator · subcontractor · super_admin
--
-- Read policy (wot_read) stays `using (true)` from 0001.
-- Idempotent — wraps drop/create in a transaction and uses
-- `if exists` so re-running on a fresh DB is safe.
-- ============================================================

begin;

drop policy if exists wot_write on public.work_order_tasks;

create policy wot_write on public.work_order_tasks for all
  using (
    fn_is_md_or_admin()
    or fn_my_role() in (
      'manager','lead_worker','worker','driver','accounts','service_support'
    )
  )
  with check (
    fn_is_md_or_admin()
    or fn_my_role() in (
      'manager','lead_worker','worker','driver','accounts','service_support'
    )
  );

-- Smoke test — confirm the policy exists with the new role list.
do $$
declare
  qual_text text;
begin
  select qual into qual_text
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'work_order_tasks'
     and policyname = 'wot_write';
  if qual_text is null then
    raise exception '0029 failed: wot_write policy missing after replace';
  end if;
  if qual_text not like '%accounts%' or qual_text not like '%service_support%' then
    raise exception '0029 failed: wot_write policy missing accounts/service_support roles';
  end if;
  raise notice '─── 0029 applied ───';
end $$;

commit;
