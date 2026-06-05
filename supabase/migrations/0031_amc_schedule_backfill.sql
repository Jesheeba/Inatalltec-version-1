-- ============================================================
-- 0031 — Backfill missing AMC service_schedule rows.
--
-- Symptom: amc_service_schedule is empty (or near-empty) for
-- existing amc_contracts. The Growth Plan calendar shows zero
-- AMC visits; the AMC detail "Service schedule" card renders
-- empty even for active contracts.
--
-- Root causes covered:
--   1. Contracts created before 0027 with signed_at IS NULL —
--      the seed trigger never fired and the 0027 backfill
--      (which keys off signed_at IS NOT NULL) skipped them.
--   2. Contracts created after 0027 but during a window where
--      the DB default (signed_at default current_date) had not
--      yet taken effect — same end state.
--   3. Active contracts whose payment INSERT predates 0027 (so
--      services 2..N were never scheduled because the old
--      fn_amc_payment_received used activation_date instead of
--      signed_at and got skipped by the 0027 backfill safety net).
--
-- This is a DATA-ONLY migration. No schema changes. No policy
-- changes. No trigger changes. Re-running is safe — every
-- INSERT is guarded by NOT EXISTS / ON CONFLICT, and the
-- UPDATE only touches NULL signed_at rows.
-- ============================================================

begin;

-- ─── 1) Ensure every contract has signed_at populated ──────
--
-- We use created_at::date as a safe historical anchor. The seed
-- trigger trg_amc_seed_first_service is AFTER UPDATE OF signed_at,
-- so this UPDATE will also fire the trigger and seed service 1
-- in one shot for affected rows. (The next INSERT below is a
-- belt-and-braces safety net in case any trigger was disabled
-- during data import.)
update public.amc_contracts
   set signed_at = created_at::date
 where signed_at is null;

-- ─── 2) Backfill service 1 for any contract still missing it ──
--
-- Mirrors the 0027 step-7 backfill exactly. Idempotent.
insert into public.amc_service_schedule
  (amc_contract_id, service_number, scheduled_date, status)
select c.id, 1, c.signed_at, 'scheduled'
  from public.amc_contracts c
 where c.signed_at is not null
   and not exists (
     select 1
       from public.amc_service_schedule s
      where s.amc_contract_id = c.id
        and s.service_number  = 1
   )
on conflict (amc_contract_id, service_number) do nothing;

-- ─── 3) Backfill services 2..N for active contracts ───────
--
-- Active = payment received. The 0027 spec anchors services 2..N
-- on signed_at at intervals of (12 / services_per_year) months.
-- We don't overwrite rows that already exist — ON CONFLICT DO
-- NOTHING preserves any work_order links and any post-creation
-- date adjustments the manager may have made manually.
do $$
declare
  v_contract  record;
  v_per_year  int;
  v_step_mo   int;
  i           int;
begin
  for v_contract in
    select c.id,
           c.signed_at,
           coalesce(c.services_per_year, 4) as services_per_year
      from public.amc_contracts c
     where c.contract_status = 'active'
       and c.signed_at is not null
  loop
    v_per_year := v_contract.services_per_year;
    if v_per_year < 1 then v_per_year := 4; end if;
    v_step_mo := 12 / v_per_year;
    for i in 2..v_per_year loop
      insert into public.amc_service_schedule
        (amc_contract_id, service_number, scheduled_date, status)
      values
        (v_contract.id, i,
         (v_contract.signed_at + ((i - 1) * v_step_mo || ' months')::interval)::date,
         'scheduled')
      on conflict (amc_contract_id, service_number) do nothing;
    end loop;
  end loop;
end $$;

-- ─── 4) Smoke test — report counts so the user can sanity-check ──
do $$
declare
  v_total_contracts int;
  v_with_signed     int;
  v_active          int;
  v_total_services  int;
  v_contracts_with_svc1   int;
  v_active_with_full_set  int;
begin
  select count(*) into v_total_contracts from public.amc_contracts;
  select count(*) into v_with_signed
    from public.amc_contracts where signed_at is not null;
  select count(*) into v_active
    from public.amc_contracts where contract_status = 'active';
  select count(*) into v_total_services
    from public.amc_service_schedule;
  select count(distinct amc_contract_id) into v_contracts_with_svc1
    from public.amc_service_schedule where service_number = 1;
  select count(*) into v_active_with_full_set
    from public.amc_contracts c
    where c.contract_status = 'active'
      and c.signed_at is not null
      and (
        select count(*) from public.amc_service_schedule s
        where s.amc_contract_id = c.id
      ) >= coalesce(c.services_per_year, 4);

  raise notice '─── 0031 applied ───';
  raise notice 'AMC contracts: % total · % with signed_at · % active',
    v_total_contracts, v_with_signed, v_active;
  raise notice 'AMC services: % total rows',
    v_total_services;
  raise notice 'Coverage: % contracts have service 1 · % active have all services',
    v_contracts_with_svc1, v_active_with_full_set;

  if v_with_signed > 0 and v_contracts_with_svc1 = 0 then
    raise exception '0031 failed: signed contracts exist but none have service 1';
  end if;
end $$;

commit;
