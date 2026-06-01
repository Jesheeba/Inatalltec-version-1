-- ============================================================
-- 0027 — AMC engine flow correction
--
-- BUSINESS LOGIC (locked with client, this migration encodes it):
--
--   T+0 (sign):
--     • amc_contracts row inserted with signed_at = today (column
--       default added below)
--     • amc_contracts.first_payment_due_at = signed_at + payment_grace_days
--       (already auto-populated by fn_set_first_payment_due_at from 0021,
--       now extended to fire on UPDATE-of-signed_at too)
--     • One row created in amc_service_schedule: service_number = 1,
--       scheduled_date = signed_at, status = 'scheduled'
--     • Services 2..N are NOT created yet
--
--   T+0 to T+grace:
--     • Customer can have service 1 performed any time (independent of payment)
--     • Customer expected to pay within grace window
--
--   Payment overdue (no payment by signed_at + grace):
--     • autoPauseExpiredAmcs() (already wired) sweeps unpaid contracts
--       past first_payment_due_at into contract_status = 'suspended'
--       (the enum value behind the "Paused" label) with suspended_reason =
--       'Payment overdue'.
--     • fn_recalc_amc_status(uuid) helper added below for per-contract
--       on-read checks from the AMC detail page.
--
--   Payment received (recordAmcPayment → INSERT amc_payments):
--     • The existing AFTER-INSERT trigger fn_amc_payment_received runs.
--       0027 REWRITES that function to:
--         - flip contract_status to 'active' if it was 'pending_payment'
--           or 'suspended' (existing behaviour preserved)
--         - populate resumed_at = received_at if was 'suspended' (NEW)
--         - clear suspended_at / suspended_reason (existing)
--         - SCHEDULE SERVICES 2..N anchored on signed_at — NOT on
--           activation_date as 0011 did (DECISION LOCKED: see Q1 in
--           Phase 9.x consolidated round; signed_at gives a predictable
--           contract calendar regardless of when payment arrives; late
--           payments correctly produce immediately-due Q2 visits)
--         - ON CONFLICT DO NOTHING so re-running the trigger never
--           duplicates rows; idempotent across reactivations and
--           multiple payment instalments.
--
--   Anchor for Q2..QN (services 2..N):
--     scheduled_date = signed_at + ((i - 1) * (12 / services_per_year)) months
--     for i in 2..services_per_year.
--     For services_per_year = 4: i=2 → signed_at + 3mo,
--                                i=3 → signed_at + 6mo,
--                                i=4 → signed_at + 9mo.
--
-- DATA BACKFILL POLICY (Q2 in Phase 9.x round, locked):
--   For existing contracts where payment_received_at IS NULL:
--     • If any service_number > 1 row has a non-null work_order_id →
--       SKIP THE ENTIRE CONTRACT. Don't orphan a real WO. We log each
--       skipped contract via RAISE NOTICE so post-migration analysis
--       can find them.
--     • Otherwise → DELETE all rows where service_number > 1.
--       Service 1 (if present) is preserved.
--
--   For contracts that ARE signed but have no service-1 row yet
--   (drafts that never paid, signed contracts that pre-date 0011, etc.):
--     • INSERT service 1 with scheduled_date = signed_at.
--     • Idempotent via the unique constraint on (amc_contract_id,
--       service_number) from 0009b.
--
--   For contracts where payment_received_at IS NOT NULL:
--     • LEAVE ALONE. Their schedule was created under the old engine
--       and is already a valid representation of services-per-year
--       distribution. No backfill, no deletion.
--
-- ENUM POLICY:
--   The "Paused" state continues to use the existing
--   amc_status::'suspended' enum value. No new enum label introduced.
--   The frontend label mapping in lib/create.ts already renders
--   'suspended' as "Paused" for UI; the engine keeps the historical
--   value so audit trails and existing triggers (auto-resume on
--   payment) keep working.
--
-- IDEMPOTENCY:
--   Every CREATE OR REPLACE FUNCTION, every CREATE TRIGGER, every
--   ALTER COLUMN ... SET DEFAULT, every backfill is guarded so that
--   re-running this migration produces no diff. The smoke test at the
--   bottom verifies the final invariants regardless of how many times
--   the file has been applied.
--
-- BACKWARDS COMPATIBILITY:
--   activation_date column stays on amc_contracts. fn_amc_payment_received
--   continues to set it (= received_at + grace) to avoid breaking any
--   reader that consults it. The column is no longer used for scheduling
--   under the new flow.
--
-- Single BEGIN/COMMIT, no enum mutation.
-- ============================================================

begin;

-- ============================================================
-- 1) Column default: signed_at = current_date on insert
--
--    Pre-0027 the column was NULLABLE with no default. createAmc()
--    in lib/create.ts never set it, so first_payment_due_at also
--    stayed NULL (the 0021 BEFORE INSERT trigger short-circuits when
--    signed_at is NULL). After this default lands, new contracts
--    that omit signed_at get today's date and the trigger chain fires
--    correctly.
--
--    We do NOT make the column NOT NULL because:
--      • Existing rows may genuinely have NULL signed_at and we don't
--        want to fail on backfill.
--      • A future "import historical contract" workflow may want to
--        leave signed_at NULL transiently.
-- ============================================================
alter table public.amc_contracts
  alter column signed_at set default current_date;

-- ============================================================
-- 2) Extend the first_payment_due_at trigger to UPDATE OF signed_at
--
--    Today (0021) it only fires BEFORE INSERT. If a draft is created
--    without signed_at and someone later UPDATEs signed_at = today, the
--    column first_payment_due_at would stay NULL. We re-bind to INSERT
--    OR UPDATE OF signed_at so the draft → signed transition picks
--    up the correct due date.
--
--    The function body itself (0021 line 112-125) is already idempotent
--    (no-op when first_payment_due_at is already set). No function
--    rewrite needed — just re-bind the trigger.
-- ============================================================
drop trigger if exists trg_amc_set_first_payment_due_at on public.amc_contracts;
create trigger trg_amc_set_first_payment_due_at
before insert or update of signed_at on public.amc_contracts
for each row execute function public.fn_set_first_payment_due_at();

-- ============================================================
-- 3) Seed service 1 on contract creation (or on signed_at being set)
--
--    AFTER INSERT OR UPDATE OF signed_at trigger that inserts the
--    first service row anchored at signed_at. Idempotent via the
--    UNIQUE(amc_contract_id, service_number) constraint from 0009b.
--
--    SECURITY DEFINER so it can write to amc_service_schedule even
--    when the inserting role doesn't have amc_schedule_write directly
--    (e.g. a manager creates the AMC; they have amc_write but the
--    schedule policy gates by (admin/manager/accounts) — the
--    SECURITY DEFINER lets the trigger sidestep the role check
--    legitimately, the same pattern 0011's payment trigger uses).
-- ============================================================
create or replace function public.fn_amc_seed_first_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.signed_at is null then
    return new;
  end if;

  insert into public.amc_service_schedule
    (amc_contract_id, service_number, scheduled_date, status)
  values
    (new.id, 1, new.signed_at, 'scheduled')
  on conflict (amc_contract_id, service_number) do nothing;

  return new;
end;
$$;
alter function public.fn_amc_seed_first_service() owner to postgres;

drop trigger if exists trg_amc_seed_first_service on public.amc_contracts;
create trigger trg_amc_seed_first_service
after insert or update of signed_at on public.amc_contracts
for each row execute function public.fn_amc_seed_first_service();

-- ============================================================
-- 4) Rewrite fn_amc_payment_received
--
--    Behaviour delta vs 0011:
--      • Schedule loop now runs 2..N instead of 1..N.
--      • Loop anchor is signed_at (with fallback to received_at::date
--        for contracts that somehow lost signed_at — defensive only).
--      • ON CONFLICT DO NOTHING — idempotent across reactivations and
--        multiple payment instalments.
--      • resumed_at = received_at when the contract was previously
--        'suspended' (Phase 9.x Q3 locked).
--
--    Trigger binding (trg_amc_payment on amc_payments AFTER INSERT)
--    is preserved — CREATE OR REPLACE FUNCTION keeps the binding.
-- ============================================================
create or replace function public.fn_amc_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace            int;
  v_status           amc_status;
  v_services_per_yr  int;
  v_signed_at        date;
  v_activation_date  date;
  v_anchor           date;
  v_month_step       int;
  v_was_suspended    boolean;
  i                  int;
begin
  select contract_status,
         coalesce(payment_grace_days, 30),
         coalesce(services_per_year, 4),
         signed_at
    into v_status, v_grace, v_services_per_yr, v_signed_at
    from public.amc_contracts where id = new.amc_id;

  v_was_suspended := (v_status = 'suspended');

  -- Backwards-compat: activation_date keeps its 0011 meaning so any
  -- reader of that column doesn't break. It is no longer used for
  -- scheduling under the new flow.
  v_activation_date := (new.received_at::date + (v_grace || ' days')::interval)::date;

  -- Scheduling anchor: signed_at when set, otherwise fall back to
  -- received_at as a last resort.
  v_anchor := coalesce(v_signed_at, new.received_at::date);

  update public.amc_contracts
     set payment_received_at = new.received_at,
         activation_date     = v_activation_date,
         contract_status     = case
                                 when v_status in ('pending_payment','suspended') then 'active'::amc_status
                                 else v_status
                               end,
         suspended_at        = null,
         suspended_reason    = null,
         resumed_at          = case
                                 when v_was_suspended then new.received_at
                                 else resumed_at
                               end,
         overdue_days        = 0
   where id = new.amc_id;

  -- Schedule services 2..N. Service 1 was created on contract INSERT
  -- by fn_amc_seed_first_service (or backfilled below for legacy rows).
  if v_services_per_yr > 1 then
    v_month_step := greatest(1, 12 / v_services_per_yr);
    for i in 2..v_services_per_yr loop
      insert into public.amc_service_schedule
        (amc_contract_id, service_number, scheduled_date, status)
      values
        (new.amc_id, i,
         (v_anchor + ((i - 1) * v_month_step || ' months')::interval)::date,
         'scheduled')
      on conflict (amc_contract_id, service_number) do nothing;
    end loop;
  end if;

  return new;
end;
$$;
alter function public.fn_amc_payment_received() owner to postgres;

-- ============================================================
-- 5) fn_recalc_amc_status(uuid) — single-contract on-read consistency
--
--    Per Phase 9.x Part 1A spec. Two transitions:
--      A. Unpaid + past due → 'suspended' with reason 'Payment overdue'
--      B. Paid + still 'suspended' with reason 'Payment overdue' →
--         'active' with resumed_at = now()
--
--    Idempotent: calling twice on the same row is a no-op the second
--    time. Returns void; UI fetches the AMC row separately after
--    calling. SECURITY DEFINER so any signed-in session can trigger
--    it (the actual UPDATE bypasses amc_write per the same pattern
--    fn_check_amc_pause_eligibility uses).
-- ============================================================
create or replace function public.fn_recalc_amc_status(p_amc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status         amc_status;
  v_paid_at        timestamptz;
  v_grace          int;
  v_signed         date;
  v_due            timestamptz;
  v_susp_reason    text;
begin
  select contract_status, payment_received_at, coalesce(payment_grace_days, 30),
         signed_at, suspended_reason
    into v_status, v_paid_at, v_grace, v_signed, v_susp_reason
    from public.amc_contracts where id = p_amc_id;
  if not found then return; end if;

  if v_signed is not null then
    v_due := (v_signed::timestamp + (v_grace || ' days')::interval) at time zone 'UTC';
  end if;

  -- Branch A: auto-pause overdue unpaid contracts.
  if v_paid_at is null
     and v_due is not null
     and v_due < now()
     and v_status not in ('suspended','cancelled','expired','renewed') then
    update public.amc_contracts
       set contract_status   = 'suspended'::amc_status,
           suspended_at      = coalesce(suspended_at, now()),
           suspended_reason  = coalesce(suspended_reason, 'Payment overdue')
     where id = p_amc_id;
    return;
  end if;

  -- Branch B: auto-resume previously-suspended contracts that have
  -- now been paid. Note: the payment trigger already handles this
  -- on the payment-arrival path. This branch covers the case where
  -- a payment was recorded out-of-band (direct SQL, import, etc.).
  if v_paid_at is not null
     and v_status = 'suspended'
     and v_susp_reason = 'Payment overdue' then
    update public.amc_contracts
       set contract_status  = 'active'::amc_status,
           resumed_at       = coalesce(resumed_at, now()),
           suspended_at     = null,
           suspended_reason = null
     where id = p_amc_id;
    return;
  end if;
end;
$$;
alter function public.fn_recalc_amc_status(uuid) owner to postgres;

-- ============================================================
-- 6) DATA BACKFILL — log + delete excess service rows
--
--    PHASE A: log any unpaid contracts that have service-2..N rows
--    with a non-null work_order_id. We will NOT touch those — they
--    have real work tied to them.
--
--    PHASE B: delete service-2..N rows for unpaid contracts that
--    have NO work_order_id links. Service 1 (if present) is preserved.
--
--    The two phases use exactly the same predicate so PHASE A's
--    audit log lists every contract that PHASE B is going to skip.
--    Cross-check the smoke-test assertion at the bottom against the
--    NOTICE output to confirm what was protected vs cleaned.
-- ============================================================
do $$
declare
  r record;
  v_skipped int := 0;
begin
  for r in
    select c.id, c.code,
           array_agg(
             s.service_number::text || ' (WO ' || coalesce(s.work_order_id::text, 'null') || ')'
             order by s.service_number
           ) as wo_linked_rows
      from public.amc_contracts c
      join public.amc_service_schedule s on s.amc_contract_id = c.id
     where c.payment_received_at is null
       and s.service_number > 1
       and s.work_order_id is not null
     group by c.id, c.code
  loop
    v_skipped := v_skipped + 1;
    raise notice '0027 SKIP unpaid contract % (%) — WO-linked services: %',
      r.code, r.id, r.wo_linked_rows;
  end loop;
  raise notice '0027: % unpaid contract(s) skipped due to existing WO links', v_skipped;
end $$;

delete from public.amc_service_schedule s
 using public.amc_contracts c
 where s.amc_contract_id = c.id
   and c.payment_received_at is null
   and s.service_number > 1
   and not exists (
     select 1 from public.amc_service_schedule s2
      where s2.amc_contract_id = c.id
        and s2.service_number > 1
        and s2.work_order_id is not null
   );

-- ============================================================
-- 7) DATA BACKFILL — seed service 1 for signed contracts missing it
--
--    Any contract with signed_at set but no row at service_number = 1.
--    Covers:
--      • Contracts created under 0011 that paid → 1..N schedule built
--        from activation_date, not signed_at. We DO NOT re-anchor those
--        (per backfill policy); they're already valid. They'll already
--        have a service 1, so this insert is a no-op for them.
--      • Drafts created without payment, signed but no schedule yet.
--      • Pre-0011 contracts that pre-date the auto-schedule trigger.
-- ============================================================
insert into public.amc_service_schedule
  (amc_contract_id, service_number, scheduled_date, status)
select c.id, 1, c.signed_at, 'scheduled'
  from public.amc_contracts c
 where c.signed_at is not null
   and not exists (
     select 1 from public.amc_service_schedule s
      where s.amc_contract_id = c.id and s.service_number = 1
   )
on conflict (amc_contract_id, service_number) do nothing;

-- ============================================================
-- 8) Smoke test — invariants after migration
-- ============================================================
do $$
declare
  v_default_signed       text;
  v_trg_due_binding      text;
  v_trg_seed_binding     text;
  v_fn_payment_count     int;
  v_fn_recalc_count      int;
  v_unpaid_excess        int;
  v_unsigned_with_svc1   int;
  v_signed_without_svc1  int;
begin
  -- Column default landed.
  select column_default into v_default_signed
    from information_schema.columns
   where table_schema = 'public' and table_name = 'amc_contracts'
     and column_name = 'signed_at';

  -- Trigger bindings (event scope is comma-joined on pg_trigger.tgtype
  -- bitmask; check via pg_get_triggerdef text).
  select pg_get_triggerdef(t.oid) into v_trg_due_binding
    from pg_trigger t where t.tgname = 'trg_amc_set_first_payment_due_at'
      and not t.tgisinternal;
  select pg_get_triggerdef(t.oid) into v_trg_seed_binding
    from pg_trigger t where t.tgname = 'trg_amc_seed_first_service'
      and not t.tgisinternal;

  -- Functions exist.
  select count(*) into v_fn_payment_count
    from pg_proc where proname = 'fn_amc_payment_received';
  select count(*) into v_fn_recalc_count
    from pg_proc where proname = 'fn_recalc_amc_status';

  -- Critical invariant 1: no unpaid contract has service_number > 1
  -- rows UNLESS it has at least one WO-linked one (in which case we
  -- skipped it). Phrased as: contracts that have any cleanable excess
  -- left over after the backfill should be ZERO.
  select count(distinct c.id) into v_unpaid_excess
    from public.amc_contracts c
    join public.amc_service_schedule s on s.amc_contract_id = c.id
   where c.payment_received_at is null
     and s.service_number > 1
     and not exists (
       select 1 from public.amc_service_schedule s2
        where s2.amc_contract_id = c.id
          and s2.service_number > 1
          and s2.work_order_id is not null
     );

  -- Critical invariant 2: every signed contract has a service-1 row.
  select count(*) into v_signed_without_svc1
    from public.amc_contracts c
   where c.signed_at is not null
     and not exists (
       select 1 from public.amc_service_schedule s
        where s.amc_contract_id = c.id and s.service_number = 1
     );

  -- Sanity: unsigned contracts should NOT have a service 1 row
  -- (information only, not enforced — historical data may violate).
  select count(*) into v_unsigned_with_svc1
    from public.amc_contracts c
    join public.amc_service_schedule s on s.amc_contract_id = c.id
   where c.signed_at is null and s.service_number = 1;

  raise notice '─── 0027 smoke test ───';
  raise notice '  amc_contracts.signed_at default              = %',  v_default_signed;
  raise notice '  trg_amc_set_first_payment_due_at definition  = %',  v_trg_due_binding;
  raise notice '  trg_amc_seed_first_service definition        = %',  v_trg_seed_binding;
  raise notice '  fn_amc_payment_received rows                 = % (expect 1)', v_fn_payment_count;
  raise notice '  fn_recalc_amc_status rows                    = % (expect 1)', v_fn_recalc_count;
  raise notice '  unpaid contracts with cleanable excess left  = % (expect 0)', v_unpaid_excess;
  raise notice '  signed contracts missing service 1           = % (expect 0)', v_signed_without_svc1;
  raise notice '  unsigned contracts holding a service 1       = % (informational)', v_unsigned_with_svc1;

  if v_default_signed is null or v_default_signed not ilike '%current_date%' then
    raise exception '0027: amc_contracts.signed_at default not set to current_date (found %)', v_default_signed;
  end if;
  if v_trg_due_binding is null then
    raise exception '0027: trg_amc_set_first_payment_due_at missing';
  end if;
  if v_trg_due_binding not ilike '%insert%' or v_trg_due_binding not ilike '%update of signed_at%' then
    raise exception '0027: trg_amc_set_first_payment_due_at not bound to INSERT OR UPDATE OF signed_at (def: %)', v_trg_due_binding;
  end if;
  if v_trg_seed_binding is null then
    raise exception '0027: trg_amc_seed_first_service missing';
  end if;
  if v_fn_payment_count <> 1 then
    raise exception '0027: fn_amc_payment_received not present (count %)', v_fn_payment_count;
  end if;
  if v_fn_recalc_count <> 1 then
    raise exception '0027: fn_recalc_amc_status not present (count %)', v_fn_recalc_count;
  end if;
  if v_unpaid_excess > 0 then
    raise exception '0027: % unpaid contract(s) still hold cleanable service-2..N rows', v_unpaid_excess;
  end if;
  if v_signed_without_svc1 > 0 then
    raise exception '0027: % signed contract(s) still missing service 1', v_signed_without_svc1;
  end if;

  raise notice '─── 0027 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. End-to-end happy path: create a new contract today and
-- --    confirm it gets EXACTLY one schedule row, anchored on today,
-- --    plus first_payment_due_at = today + grace.
-- --    Replace <customer_id> with a real customers.id.
-- /*
-- insert into public.amc_contracts
--   (code, customer_id, value_aed, payment_grace_days, services_per_year)
-- values ('AMC-0027-TEST-' || floor(random()*1000)::text, '<customer_id>', 12000, 30, 4)
-- returning id, code, signed_at, first_payment_due_at;
--
-- select service_number, scheduled_date, status
--   from public.amc_service_schedule
--  where amc_contract_id = (
--    select id from public.amc_contracts
--     where code like 'AMC-0027-TEST-%'
--     order by created_at desc limit 1
--   );
-- -- Expect: exactly 1 row, service_number = 1, scheduled_date = today.
-- */
--
-- -- 2. Record a payment and confirm services 2,3,4 land at +3/+6/+9
-- --    months from signed_at (NOT from received_at).
-- /*
-- insert into public.amc_payments (amc_id, amount_aed, received_at)
-- select id, 12000, now()
--   from public.amc_contracts
--  where code like 'AMC-0027-TEST-%'
--  order by created_at desc limit 1;
--
-- select service_number, scheduled_date
--   from public.amc_service_schedule
--  where amc_contract_id = (
--    select id from public.amc_contracts
--     where code like 'AMC-0027-TEST-%'
--     order by created_at desc limit 1
--   )
--  order by service_number;
-- -- Expect: 4 rows. Service 1 = signed_at. Services 2,3,4 = signed_at +3/+6/+9mo.
-- */
--
-- -- 3. Idempotency: insert a SECOND payment for the same contract.
-- --    Schedule should NOT duplicate (still 4 rows).
-- /*
-- insert into public.amc_payments (amc_id, amount_aed, received_at)
-- select id, 1, now()
--   from public.amc_contracts where code like 'AMC-0027-TEST-%'
--   order by created_at desc limit 1;
--
-- select count(*) from public.amc_service_schedule
--  where amc_contract_id = (
--    select id from public.amc_contracts
--     where code like 'AMC-0027-TEST-%'
--     order by created_at desc limit 1
--   );
-- -- Expect: 4.
-- */
--
-- -- 4. fn_recalc_amc_status — auto-pause path. Backdate signed_at on
-- --    a TEST contract that has no payment, then call recalc.
-- /*
-- update public.amc_contracts
--    set signed_at = current_date - interval '35 days',
--        first_payment_due_at = (current_date - interval '5 days')
--  where code like 'AMC-0027-TEST-%'
--  order by created_at desc limit 1;
--
-- select public.fn_recalc_amc_status(id)
--   from public.amc_contracts where code like 'AMC-0027-TEST-%'
--   order by created_at desc limit 1;
--
-- select code, contract_status, suspended_at, suspended_reason
--   from public.amc_contracts where code like 'AMC-0027-TEST-%'
--   order by created_at desc limit 1;
-- -- Expect: contract_status = 'suspended', suspended_reason = 'Payment overdue'.
-- */
--
-- -- 5. fn_recalc_amc_status — auto-resume path. Record a payment for
-- --    the paused contract and call recalc.
-- /*
-- insert into public.amc_payments (amc_id, amount_aed, received_at)
-- select id, 12000, now()
--   from public.amc_contracts where code like 'AMC-0027-TEST-%'
--   order by created_at desc limit 1;
-- -- Note: the payment trigger already auto-resumes. fn_recalc_amc_status
-- -- is for the "payment recorded out-of-band" case.
--
-- select code, contract_status, payment_received_at, resumed_at
--   from public.amc_contracts where code like 'AMC-0027-TEST-%'
--   order by created_at desc limit 1;
-- -- Expect: contract_status = 'active', resumed_at = received_at.
-- */
--
-- -- 6. Cleanup: drop the test contract.
-- /*
-- delete from public.amc_payments
--  where amc_id in (select id from public.amc_contracts where code like 'AMC-0027-TEST-%');
-- delete from public.amc_service_schedule
--  where amc_contract_id in (select id from public.amc_contracts where code like 'AMC-0027-TEST-%');
-- delete from public.amc_contracts where code like 'AMC-0027-TEST-%';
-- */
--
-- ============================================================
