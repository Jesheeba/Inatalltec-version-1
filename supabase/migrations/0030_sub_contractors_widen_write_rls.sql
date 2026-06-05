-- ============================================================
-- 0030 — Widen sub_write RLS so Lead Technicians can manage the
-- sub-contractor directory.
--
-- The Lead Technician is the role that assigns work orders, and
-- a WO frequently goes to an external sub-contractor. 0023's
-- wos_write policy already lets a lead_worker attach a sub to a
-- WO they lead, but sub_write (the directory profiles) was
-- md / admin / manager only — so a lead could assign an EXISTING
-- sub but could not onboard a NEW one. In practice the sub they
-- need often isn't in the directory yet, which dead-ends the
-- assignment.
--
-- Final write allow-list (after this migration):
--   admin · md · manager · lead_worker
--
-- Excluded (stay read-only — sub_read from 0023 is unchanged and
-- already grants them SELECT):
--   accounts · service_support · sales · estimator · worker ·
--   driver · subcontractor · super_admin
--
-- Idempotent — wraps drop/create in a transaction and uses
-- `if exists` so re-running on a fresh DB is safe.
-- ============================================================

begin;

drop policy if exists sub_write on public.sub_contractors;

create policy sub_write on public.sub_contractors for all
  using (
    fn_is_md_or_admin()
    or fn_my_role() in ('manager','lead_worker')
  )
  with check (
    fn_is_md_or_admin()
    or fn_my_role() in ('manager','lead_worker')
  );

-- Smoke test — confirm the policy exists with the new role list.
do $$
declare
  qual_text text;
begin
  select qual into qual_text
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'sub_contractors'
     and policyname = 'sub_write';
  if qual_text is null then
    raise exception '0030 failed: sub_write policy missing after replace';
  end if;
  if qual_text not like '%lead_worker%' then
    raise exception '0030 failed: sub_write policy missing lead_worker role';
  end if;
  raise notice '─── 0030 applied ───';
end $$;

commit;
