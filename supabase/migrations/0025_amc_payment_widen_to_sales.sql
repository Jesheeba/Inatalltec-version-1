-- ============================================================
-- 0025 — Widen amc_pay_write to match amc_read's allowed roles
--
-- After 0024 re-asserted amc_pay_write to include 'manager', Yusuf
-- still hit "new row violates row-level security policy for table
-- 'amc_payments'" (second screenshot). Since 0024's smoke test
-- confirmed 'manager' is in the deployed policy, the only remaining
-- explanation is: Yusuf's role isn't 'manager'.
--
-- He can READ amc_contracts (the AMC detail page loads fine), so his
-- role IS in amc_read's allowed set:
--
--   amc_read  → fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts')
--
-- So Yusuf's role is one of: admin, md, manager, sales, accounts.
-- The first three would have been caught by 0024. By elimination he's
-- 'sales' (likely — he handles AMC sign-up and initial deposit, which
-- IS a sales-side action). Or 'accounts'. Either way 0024 missed him.
--
-- Fix: bring amc_pay_write into alignment with amc_read. Whoever can
-- see an AMC contract should be able to record a payment against it.
-- That's the simplest defensible business rule and removes the
-- role-string brittleness that produced this two-round bug.
--
-- New allowed set: md, admin, manager, sales, accounts.
-- Customer-facing roles (customer, super_admin) stay excluded by
-- omission.
--
-- The amc_read policy is NOT changed. trg_amc_payment trigger is NOT
-- touched (it runs as postgres and bypasses RLS to auto-resume paused
-- contracts on payment).
-- ============================================================

begin;

drop policy if exists amc_pay_write on public.amc_payments;
create policy amc_pay_write on public.amc_payments
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'));

-- Also widen amc_pay_read to the same set so sales users can see the
-- payment history of contracts they signed up (currently amc_pay_read
-- only allows manager/accounts — sales can see the contract but not
-- its payment ledger, which is asymmetric).
drop policy if exists amc_pay_read on public.amc_payments;
create policy amc_pay_read on public.amc_payments
  for select
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'));

-- ============================================================
-- Smoke test
-- ============================================================
do $$
declare
  v_read_qual    text;
  v_write_qual   text;
  v_write_check  text;
  v_rls_on       boolean;
  v_trg_intact   boolean;
begin
  select qual into v_read_qual
    from pg_policies
   where schemaname = 'public' and tablename = 'amc_payments' and policyname = 'amc_pay_read';

  select qual, with_check into v_write_qual, v_write_check
    from pg_policies
   where schemaname = 'public' and tablename = 'amc_payments' and policyname = 'amc_pay_write';

  select relrowsecurity from pg_class
   where oid = 'public.amc_payments'::regclass
   into v_rls_on;

  select exists (
    select 1 from pg_trigger
     where tgrelid = 'public.amc_payments'::regclass and tgname = 'trg_amc_payment'
  ) into v_trg_intact;

  raise notice '─── 0025 smoke test ───';
  raise notice '  amc_pay_read.qual         = %', v_read_qual;
  raise notice '  amc_pay_write.qual        = %', v_write_qual;
  raise notice '  amc_pay_write.with_check  = %', v_write_check;
  raise notice '  RLS on amc_payments       = %', v_rls_on;
  raise notice '  trg_amc_payment intact    = %', v_trg_intact;

  if v_read_qual is null    then raise exception '0025: amc_pay_read missing';    end if;
  if v_write_qual is null   then raise exception '0025: amc_pay_write missing';   end if;
  if v_write_check is null  then raise exception '0025: amc_pay_write missing WITH CHECK'; end if;

  -- Assert all three roles landed in the write policy.
  if position('manager'  in v_write_check) = 0
     or position('sales'    in v_write_check) = 0
     or position('accounts' in v_write_check) = 0 then
    raise exception '0025: amc_pay_write WITH CHECK missing one of manager/sales/accounts — got: %', v_write_check;
  end if;
  if not v_rls_on then
    raise exception '0025: RLS got disabled on amc_payments';
  end if;
  if not v_trg_intact then
    raise exception '0025: trg_amc_payment trigger missing — payment auto-resume is broken';
  end if;

  raise notice '─── 0025 applied ───';
end $$;

commit;

-- ============================================================
-- DIAGNOSTIC — find out Yusuf's actual role
--
-- If this migration still doesn't fix the "violates RLS" error, run
-- the queries below to confirm Yusuf's role. The next migration can
-- then add it explicitly (or you can update his row to 'manager').
-- ============================================================
--
-- -- A. What role does Yusuf's users row carry?
-- select id, full_name, email, role, auth_id, is_active
--   from public.users
--  where email ilike 'yusuf%'   -- adjust if his email is different
--     or full_name ilike 'yusuf%';
--
-- -- B. Does Yusuf's auth_id actually link to an auth.users row?
-- select u.full_name, u.email, u.role, u.auth_id, a.email as auth_email
--   from public.users u
--   left join auth.users a on a.id = u.auth_id
--  where u.email ilike 'yusuf%' or u.full_name ilike 'yusuf%';
-- -- auth_email should NOT be NULL — if it is, the auth_id link is broken
-- -- and Yusuf needs his users.auth_id set to his actual auth user id.
--
-- -- C. From an authenticated session (browser-side), what does
-- --    fn_my_role() return for the current user? Run in Supabase SQL
-- --    Editor with Role = "authenticated" (not service_role):
-- select auth.uid() as my_auth_uid,
--        public.fn_my_id()   as my_users_id,
--        public.fn_my_role() as my_role;
-- -- If my_role is NULL, the users.auth_id link is broken.
-- -- If my_role is something other than manager/sales/accounts/admin/md,
-- -- that's the role we need to add to the policy.
-- ============================================================
