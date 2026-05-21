-- ============================================================
-- 0010 — AMC payment metadata + permissive write policy
--
-- amc_payments was created in 0001_init.sql with only the bare-bones
-- columns (id, amc_id, amount_aed, received_at, reference). The new
-- payment-recording UI in Step B of the AMC engine needs:
--   - method  : how the money arrived (bank transfer, cash, etc.)
--   - notes   : optional free-text from the recorder
-- ADD COLUMN IF NOT EXISTS so the migration is idempotent and safe
-- to re-run.
--
-- The existing write policy in 0001_init.sql limits inserts to
--   admin / md / accounts
-- but in practice managers also record customer payments — the spec
-- explicitly says "accounts/admin/manager" should be able to INSERT.
-- We extend the policy to include 'manager'. (super_admin is covered
-- via the email-allowlist promotion to DB role 'admin'.)
--
-- This file is wrapped in a single BEGIN/COMMIT — atomic, no enum
-- mutations means no autocommit-split is needed.
-- ============================================================

begin;

-- ============================================================
-- 1) New nullable columns. No defaults so existing rows stay as-is.
-- ============================================================
alter table amc_payments add column if not exists method text;
alter table amc_payments add column if not exists notes  text;

-- ============================================================
-- 2) Widen the write policy to include 'manager'.
--    Read policy from 0001 already covers admin/md/manager/accounts.
-- ============================================================
drop policy if exists amc_pay_write on amc_payments;
create policy amc_pay_write on amc_payments
for all
using      (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts'))
with check (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts'));

-- ============================================================
-- 3) Inline smoke test — confirms columns landed and policy is wired.
-- ============================================================
do $$
declare
  v_method_col  bigint;
  v_notes_col   bigint;
  v_write_pol   bigint;
begin
  select count(*) from information_schema.columns
   where table_name = 'amc_payments' and column_name = 'method'
   into v_method_col;
  select count(*) from information_schema.columns
   where table_name = 'amc_payments' and column_name = 'notes'
   into v_notes_col;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'amc_payments' and policyname = 'amc_pay_write'
   into v_write_pol;
  raise notice '─── 0010 smoke test ───';
  raise notice '  amc_payments.method column = %', v_method_col;
  raise notice '  amc_payments.notes  column = %', v_notes_col;
  raise notice '  amc_pay_write policy rows  = %', v_write_pol;
  raise notice '─── 0010 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm new columns:
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'amc_payments'
--    and column_name in ('method', 'notes');
--
-- -- 2. Confirm write policy widened:
-- select polname, polcmd,
--        pg_get_expr(polqual, polrelid) as using_expr
--   from pg_policy
--  where polrelid = 'public.amc_payments'::regclass;
--   -- Expect amc_pay_write USING expression to include 'manager'.
--
-- ============================================================
