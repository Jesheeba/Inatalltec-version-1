-- ============================================================
-- 0011 — AMC engine, Step C: auto-create the quarterly service
--        schedule on first activation
--
-- 0009b's fn_amc_payment_received already flips contract_status →
-- active and sets activation_date when a payment row lands. This
-- migration extends the same trigger so it ALSO inserts the
-- services_per_year service rows into amc_service_schedule the
-- first time a contract activates.
--
-- Idempotent guard: insert only when no schedule rows exist for the
-- contract yet. That keeps the trigger safe across:
--   - Reactivation (suspended → paid → active again)
--   - Multiple instalments against the same contract
--   - Manual seed rows added before the first payment ever arrives
--
-- Date math (for the default 4 services/year):
--   service 1 = activation_date            (= received_at + grace_days)
--   service 2 = activation_date + 3 months
--   service 3 = activation_date + 6 months
--   service 4 = activation_date + 9 months
-- Generalised to any services_per_year that divides 12 cleanly.
-- For values that don't divide 12 (5, 7, 8, ...) integer division
-- silently rounds the spacing down — fine for the demo, revisit if
-- a non-standard cadence is ever sold.
--
-- This file is wrapped in a single BEGIN/COMMIT — only function
-- replacement, no enum mutations, so autocommit-split isn't needed.
-- ============================================================

begin;

-- ============================================================
-- 1) Replace fn_amc_payment_received with schedule-seeding version.
--    Preserves all behaviour from 0009b §9 and adds the schedule loop.
-- ============================================================
create or replace function fn_amc_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace            int;
  v_status           amc_status;
  v_services_per_yr  int;
  v_activation_date  date;
  v_existing_rows    int;
  v_month_step       int;
  i                  int;
begin
  select contract_status,
         coalesce(payment_grace_days, 30),
         coalesce(services_per_year, 4)
    into v_status, v_grace, v_services_per_yr
    from amc_contracts where id = new.amc_id;

  v_activation_date := (new.received_at::date + (v_grace || ' days')::interval)::date;

  update amc_contracts
     set payment_received_at = new.received_at,
         activation_date     = v_activation_date,
         contract_status     = case
                                 when v_status in ('pending_payment','suspended') then 'active'::amc_status
                                 else v_status
                               end,
         suspended_at        = null,
         suspended_reason    = null,
         overdue_days        = 0
   where id = new.amc_id;

  -- Auto-create the service schedule on FIRST activation only.
  select count(*) into v_existing_rows
    from amc_service_schedule where amc_contract_id = new.amc_id;

  if v_existing_rows = 0 and v_services_per_yr > 0 then
    v_month_step := greatest(1, 12 / v_services_per_yr);
    for i in 1..v_services_per_yr loop
      insert into amc_service_schedule
        (amc_contract_id, service_number, scheduled_date, status)
      values
        (new.amc_id, i,
         (v_activation_date + ((i - 1) * v_month_step || ' months')::interval)::date,
         'scheduled');
    end loop;
  end if;

  return new;
end;
$$;
alter function fn_amc_payment_received() owner to postgres;

-- ============================================================
-- 2) Smoke test — confirms function rewrite landed.
--    Trigger binding from 0009b is preserved; we just CREATE OR
--    REPLACE the function body, so trg_amc_payment still points here.
-- ============================================================
do $$
declare
  v_proc_count  bigint;
  v_trig_count  bigint;
begin
  select count(*) from pg_proc
   where proname = 'fn_amc_payment_received'
   into v_proc_count;
  select count(*) from pg_trigger
   where tgname = 'trg_amc_payment' and not tgisinternal
   into v_trig_count;
  raise notice '─── 0011 smoke test ───';
  raise notice '  fn_amc_payment_received exists = %', v_proc_count;
  raise notice '  trg_amc_payment binding rows   = %', v_trig_count;
  raise notice '─── 0011 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm the function body now contains the schedule loop:
-- select pg_get_functiondef(oid)
--   from pg_proc where proname = 'fn_amc_payment_received';
--   -- Expect the source to include "insert into amc_service_schedule".
--
-- -- 2. End-to-end smoke: create a contract → pay it → confirm 4
-- --    schedule rows landed at the correct dates. Run as postgres.
-- --    Replace <customer_id> with a real customers.id from your db.
-- /*
-- with new_amc as (
--   insert into amc_contracts (code, customer_id, contract_status, value_aed, payment_grace_days, services_per_year)
--   values ('AMC-SCHED-' || floor(random()*1000)::text, '<customer_id>', 'pending_payment', 12000, 30, 4)
--   returning id, activation_date
-- ),
-- new_pay as (
--   insert into amc_payments (amc_id, amount_aed, received_at)
--   select id, 12000, now() from new_amc
--   returning amc_id
-- )
-- select c.code,
--        c.contract_status,
--        c.activation_date,
--        s.service_number,
--        s.scheduled_date,
--        s.status
--   from amc_contracts c
--   join new_pay p on p.amc_id = c.id
--   left join amc_service_schedule s on s.amc_contract_id = c.id
--  order by s.service_number;
-- -- Expected: 4 rows, scheduled_date stepping +3mo each, all 'scheduled'.
-- */
--
-- -- 3. Idempotency check: insert a second payment for the same contract.
-- --    The schedule should NOT duplicate (still 4 rows total).
-- /*
-- insert into amc_payments (amc_id, amount_aed, received_at)
-- values ('<amc_id_from_step_2>', 1000, now());
-- select count(*) from amc_service_schedule where amc_contract_id = '<amc_id>';
-- -- Expected: still 4.
-- */
--
-- ============================================================
