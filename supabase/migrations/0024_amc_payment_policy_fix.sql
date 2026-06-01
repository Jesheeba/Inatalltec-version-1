-- ============================================================
-- 0024 — Re-assert amc_pay_write RLS to include 'manager'
--
-- Yusuf (role='manager') hit "new row violates row-level security
-- policy for table 'amc_payments'" when clicking Record Payment on an
-- AMC detail page (screenshot evidence in chat).
--
-- Root cause:
--   • 0001:608-610 created the original policy:
--       using/check (fn_is_md_or_admin() or fn_my_role() = 'accounts')
--   • 0010:35-39 widened it to include 'manager':
--       using/check (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts'))
--   • setup.sql:427 still carries the ORIGINAL narrow version — so any
--     DB bootstrapped from setup.sql AFTER 0010 was applied (or any DB
--     where 0010 didn't actually land) ends up with the wrong policy.
--
-- Fix: re-run the 0010 drop + create here so the deployed policy
-- definitively matches the intended state regardless of how the DB was
-- bootstrapped. Idempotent — safe to re-apply.
--
-- No new policies created. No schema changes. No data writes.
-- The 'service_support' role is intentionally NOT added — payment
-- intake is owned by Accounts + Operations Manager per current spec.
-- If service_support needs payment write access later, add it in its
-- own migration with an explicit reason.
--
-- Existing infrastructure DELIBERATELY REUSED:
--   amc_payments table                       (0001)
--   fn_is_md_or_admin() / fn_my_role()      (0001:500-509)
--   trg_amc_payment / fn_amc_payment_received (0009b — auto-resume
--     trigger fires AFTER INSERT and runs as postgres so it's NOT
--     affected by amc_pay_write; this migration doesn't touch it).
-- ============================================================

begin;

drop policy if exists amc_pay_write on public.amc_payments;
create policy amc_pay_write on public.amc_payments
  for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts'));

-- Also re-assert amc_pay_read so a partially-applied 0001 leaves the
-- read path correct too (the original 0001 already had 'manager' in
-- the read policy, but cheap to re-state).
drop policy if exists amc_pay_read on public.amc_payments;
create policy amc_pay_read on public.amc_payments
  for select
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts'));

-- ============================================================
-- Smoke test — assert the policies exist and contain 'manager' in
-- their definition text. Uses pg_policies (the view, which exposes
-- qual + with_check as already-formatted text) rather than pg_policy
-- (the catalog, whose columns are polqual/polwithcheck and need
-- pg_get_expr to be read as text).
-- ============================================================
do $$
declare
  v_read_qual       text;
  v_write_qual      text;
  v_write_check     text;
  v_rls_on          boolean;
  v_trg_intact      boolean;
begin
  -- Read policy text (USING clause).
  select qual into v_read_qual
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'amc_payments'
     and policyname = 'amc_pay_read';

  -- Write policy text — both USING and WITH CHECK.
  select qual, with_check
    into v_write_qual, v_write_check
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'amc_payments'
     and policyname = 'amc_pay_write';

  -- RLS must still be enabled on the table.
  select relrowsecurity from pg_class
   where oid = 'public.amc_payments'::regclass
   into v_rls_on;

  -- Confirm the existing auto-resume trigger wasn't disturbed —
  -- 0009b's trg_amc_payment runs the SECURITY DEFINER function that
  -- flips a paused contract to active on payment. Critical, must stay.
  select exists (
    select 1 from pg_trigger
     where tgrelid = 'public.amc_payments'::regclass
       and tgname  = 'trg_amc_payment'
  ) into v_trg_intact;

  raise notice '─── 0024 smoke test ───';
  raise notice '  amc_pay_read.qual         = %', v_read_qual;
  raise notice '  amc_pay_write.qual        = %', v_write_qual;
  raise notice '  amc_pay_write.with_check  = %', v_write_check;
  raise notice '  RLS on amc_payments       = %', v_rls_on;
  raise notice '  trg_amc_payment intact    = %', v_trg_intact;

  if v_read_qual is null then
    raise exception '0024: amc_pay_read policy not created';
  end if;
  if v_write_qual is null or v_write_check is null then
    raise exception '0024: amc_pay_write policy not created';
  end if;
  if position('manager' in v_write_qual) = 0
     or position('manager' in v_write_check) = 0 then
    raise exception '0024: amc_pay_write does not include the manager role — fix did not land';
  end if;
  if not v_rls_on then
    raise exception '0024: RLS got disabled on amc_payments';
  end if;
  if not v_trg_intact then
    raise exception '0024: trg_amc_payment trigger missing — payment auto-resume is broken';
  end if;

  raise notice '─── 0024 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor)
-- ============================================================
--
-- -- 1. See the deployed policy text:
-- select policyname, qual as using_clause, with_check as with_check_clause
--   from pg_policies
--  where schemaname = 'public' and tablename = 'amc_payments'
--  order by policyname;
-- -- Expect: amc_pay_read + amc_pay_write, both mentioning 'manager'.
--
-- -- 2. Confirm your actual role (the source of the original bug):
-- select u.full_name, u.email, u.role, u.auth_id, u.is_active
--   from public.users u
--  where u.email = 'yusuf@installtec.com';   -- replace with your email
-- -- role should be 'manager'; auth_id should be non-null and match
-- -- auth.users.id for the same email.
--
-- -- 3. As Yusuf (signed in via the app), retry Record Payment.
-- --    No "new row violates RLS" error should appear.
--
-- ============================================================
