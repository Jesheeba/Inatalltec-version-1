-- ============================================================
-- 0033 — AMC two-step activation (book first visit date)
--
-- BUSINESS FLOW (post-0033, locked with client):
--
--   T0 (Operations Manager creates contract):
--     • amc_contracts row inserted with contract_status='pending_payment',
--       signed_at = NULL, first_visit_date = NULL.
--     • UI labels this state "Draft — first visit not booked".
--     • No row in amc_service_schedule. first_payment_due_at = NULL.
--
--   T1 (OM clicks "Book first visit date" and picks a date):
--     • UPDATE amc_contracts SET first_visit_date = <picked_date>.
--     • BEFORE trigger fn_set_first_payment_due_at fires →
--       first_payment_due_at = first_visit_date + payment_grace_days.
--     • AFTER trigger fn_amc_seed_first_service fires →
--       inserts service 1 at first_visit_date.
--     • Status stays 'pending_payment' (UI label = "Pending Payment").
--     • Service 1 is now on the main calendar (user spec: tech can work
--       on service 1 during grace window even before payment).
--     • Q2/Q3/Q4 stay client-side preview (not in amc_service_schedule).
--
--   T2 (customer pays before grace expires):
--     • amc_payments insert → trg_amc_payment → fn_amc_payment_received.
--     • status flips to 'active'.
--     • Services 1..N seeded into amc_service_schedule (idempotent via
--       ON CONFLICT — service 1 already exists from T1, services 2..N
--       are newly committed and appear on the main calendar).
--
--   T2-alt (grace expires unpaid):
--     • Existing autoPauseExpiredAmcs() sweep (lib/create.ts:1143) calls
--       fn_check_amc_pause_eligibility() which keys off first_payment_due_at.
--     • Status flips to 'suspended' (UI label = "Paused" / "Blocked").
--
-- ANCHOR CHANGE vs 0027:
--   • signed_at default current_date → DROPPED. createAmc no longer
--     auto-anchors. signed_at becomes a manually-set "contract was signed
--     on this date" record (kept for backward compatibility; no engine
--     logic depends on it after 0033).
--   • fn_set_first_payment_due_at: signed_at → first_visit_date.
--   • Seed trigger: AFTER INSERT/UPDATE OF signed_at → AFTER UPDATE OF
--     first_visit_date.
--   • fn_amc_payment_received: schedule anchor signed_at → first_visit_date
--     with signed_at as legacy fallback for pre-0033 contracts.
--   • fn_recalc_amc_status: grace check signed_at → first_visit_date.
--
-- BACKFILL POLICY:
--   For every existing amc_contracts row where signed_at IS NOT NULL
--   and first_visit_date IS NULL → set first_visit_date = signed_at.
--   This is a sideways move: signed_at was driving first_payment_due_at
--   before, and now first_visit_date drives it. Same calendar dates,
--   same due dates — no observable change for in-flight contracts.
--   Contracts already on the calendar stay where they are (service-1
--   rows aren't touched).
--
-- BACKWARDS COMPAT:
--   `signed_at` column stays on amc_contracts. Renewals (lib/create.ts:
--   renewAmc, line ~1234) still write it as today's date. The seed
--   trigger no longer fires from signed_at — renewals will need to call
--   bookAmcFirstVisitDate() separately. Acceptable: a renewed contract
--   is a fresh contract with its own booking flow.
--
-- IDEMPOTENCY: drop+recreate triggers, CREATE OR REPLACE functions,
-- guarded UPDATEs. Smoke test verifies invariants regardless of how
-- many times this file has been applied.
-- ============================================================

begin;

-- ─── 1) Add first_visit_date column ────────────────────────
alter table public.amc_contracts
  add column if not exists first_visit_date date;

comment on column public.amc_contracts.first_visit_date is
  'OM-selected anchor date for service 1 (the first PPM visit). '
  'Drives first_payment_due_at, the 30-day customer grace window, and '
  'all four quarterly visit dates. NULL until the OM books it via the '
  '"Book First Date" button on the AMC detail page.';

-- ─── 2) Drop signed_at default (no more auto-anchor on insert) ──
alter table public.amc_contracts
  alter column signed_at drop default;

-- ─── 3) Rewrite fn_set_first_payment_due_at ────────────────
--
-- Old (0021): anchor on signed_at. New: anchor on first_visit_date.
-- Fires from a rebinding below.
create or replace function public.fn_set_first_payment_due_at()
returns trigger
language plpgsql
as $$
declare
  v_grace int := coalesce(new.payment_grace_days, 30);
begin
  if new.first_visit_date is not null then
    new.first_payment_due_at :=
      (new.first_visit_date::timestamp + (v_grace || ' days')::interval)
        at time zone 'UTC';
  else
    new.first_payment_due_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_amc_set_first_payment_due_at on public.amc_contracts;
create trigger trg_amc_set_first_payment_due_at
before insert or update of first_visit_date on public.amc_contracts
for each row execute function public.fn_set_first_payment_due_at();

-- ─── 4) Rebind fn_amc_seed_first_service to first_visit_date ──
--
-- 0027 made this AFTER INSERT/UPDATE OF signed_at. Now: AFTER UPDATE
-- OF first_visit_date (no INSERT — the column is NULL at creation;
-- the trigger fires the moment OM books the date via UPDATE).
create or replace function public.fn_amc_seed_first_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.first_visit_date is null then
    return new;
  end if;

  insert into public.amc_service_schedule
    (amc_contract_id, service_number, scheduled_date, status)
  values
    (new.id, 1, new.first_visit_date, 'scheduled')
  on conflict (amc_contract_id, service_number) do nothing;

  return new;
end;
$$;
alter function public.fn_amc_seed_first_service() owner to postgres;

drop trigger if exists trg_amc_seed_first_service on public.amc_contracts;
create trigger trg_amc_seed_first_service
after insert or update of first_visit_date on public.amc_contracts
for each row execute function public.fn_amc_seed_first_service();

-- ─── 5) Rewrite fn_amc_payment_received ────────────────────
--
-- Behaviour delta vs 0027:
--   • Anchor priority: first_visit_date → signed_at → received_at::date.
--     (signed_at fallback covers legacy contracts that pre-date 0033
--     and were grandfathered.)
--   • Schedule loop now runs 1..N instead of 2..N. Service 1 was
--     already inserted by the seed trigger at booking time, but the
--     ON CONFLICT DO NOTHING keeps this idempotent and serves as a
--     belt-and-braces safety net if the seed trigger was skipped
--     (e.g. an admin set first_visit_date directly via SQL).
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
  v_first_visit      date;
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
         first_visit_date,
         signed_at
    into v_status, v_grace, v_services_per_yr, v_first_visit, v_signed_at
    from public.amc_contracts where id = new.amc_id;

  v_was_suspended := (v_status = 'suspended');

  -- Backwards-compat: activation_date keeps its 0011 meaning so any
  -- reader of that column doesn't break. No longer used for scheduling.
  v_activation_date :=
    (new.received_at::date + (v_grace || ' days')::interval)::date;

  -- Anchor for all quarterly visits.
  v_anchor := coalesce(v_first_visit, v_signed_at, new.received_at::date);

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

  -- Schedule services 1..N. Service 1 will already exist (seeded at
  -- booking time); ON CONFLICT DO NOTHING keeps re-runs safe.
  v_month_step := greatest(1, 12 / greatest(v_services_per_yr, 1));
  for i in 1..greatest(v_services_per_yr, 1) loop
    insert into public.amc_service_schedule
      (amc_contract_id, service_number, scheduled_date, status)
    values
      (new.amc_id, i,
       (v_anchor + ((i - 1) * v_month_step || ' months')::interval)::date,
       'scheduled')
    on conflict (amc_contract_id, service_number) do nothing;
  end loop;

  return new;
end;
$$;
alter function public.fn_amc_payment_received() owner to postgres;

-- ─── 6) Rewrite fn_recalc_amc_status ───────────────────────
--
-- Grace check anchor: signed_at → first_visit_date. Contracts that
-- haven't booked a first visit yet have first_visit_date = NULL, so
-- v_due = NULL, so the auto-pause branch is skipped — correct: a
-- contract with no first visit date isn't yet in the payment window.
create or replace function public.fn_recalc_amc_status(p_amc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status       amc_status;
  v_paid_at      timestamptz;
  v_grace        int;
  v_first_visit  date;
  v_due          timestamptz;
  v_susp_reason  text;
begin
  select contract_status, payment_received_at, coalesce(payment_grace_days, 30),
         first_visit_date, suspended_reason
    into v_status, v_paid_at, v_grace, v_first_visit, v_susp_reason
    from public.amc_contracts where id = p_amc_id;
  if not found then return; end if;

  if v_first_visit is not null then
    v_due := (v_first_visit::timestamp + (v_grace || ' days')::interval)
               at time zone 'UTC';
  end if;

  -- Branch A: auto-pause overdue unpaid contracts that have booked
  -- their first visit but missed the grace window.
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
  -- now been paid (out-of-band payments).
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

-- ─── 7) Backfill: signed_at → first_visit_date for in-flight rows ──
--
-- For every contract with signed_at populated but first_visit_date
-- still NULL, copy signed_at across. Their first_payment_due_at was
-- already (signed_at + grace) and stays exactly the same after this
-- backfill (because the recomputed value is identical). No observable
-- change to their schedules or due dates.
update public.amc_contracts
   set first_visit_date = signed_at
 where first_visit_date is null
   and signed_at is not null;

-- ─── 8) Smoke test ─────────────────────────────────────────
do $$
declare
  v_col_count        int;
  v_signed_default   text;
  v_due_trg_def      text;
  v_seed_trg_def     text;
  v_paid_fn_count    int;
  v_recalc_fn_count  int;
  v_backfill_gap     int;
begin
  -- Column exists.
  select count(*) into v_col_count
    from information_schema.columns
   where table_schema='public' and table_name='amc_contracts'
     and column_name='first_visit_date';
  if v_col_count <> 1 then
    raise exception '0033 failed: first_visit_date column missing';
  end if;

  -- signed_at default dropped.
  select column_default into v_signed_default
    from information_schema.columns
   where table_schema='public' and table_name='amc_contracts'
     and column_name='signed_at';
  if v_signed_default is not null then
    raise exception '0033 failed: signed_at default not dropped (found %)',
      v_signed_default;
  end if;

  -- Triggers rebound to first_visit_date.
  select pg_get_triggerdef(t.oid) into v_due_trg_def
    from pg_trigger t
   where t.tgname='trg_amc_set_first_payment_due_at' and not t.tgisinternal;
  if v_due_trg_def is null
     or v_due_trg_def not ilike '%first_visit_date%' then
    raise exception '0033 failed: trg_amc_set_first_payment_due_at not bound to first_visit_date (def: %)', v_due_trg_def;
  end if;

  select pg_get_triggerdef(t.oid) into v_seed_trg_def
    from pg_trigger t
   where t.tgname='trg_amc_seed_first_service' and not t.tgisinternal;
  if v_seed_trg_def is null
     or v_seed_trg_def not ilike '%first_visit_date%' then
    raise exception '0033 failed: trg_amc_seed_first_service not bound to first_visit_date (def: %)', v_seed_trg_def;
  end if;

  -- Functions still present.
  select count(*) into v_paid_fn_count
    from pg_proc where proname='fn_amc_payment_received';
  select count(*) into v_recalc_fn_count
    from pg_proc where proname='fn_recalc_amc_status';
  if v_paid_fn_count <> 1 then
    raise exception '0033 failed: fn_amc_payment_received count = %', v_paid_fn_count;
  end if;
  if v_recalc_fn_count <> 1 then
    raise exception '0033 failed: fn_recalc_amc_status count = %', v_recalc_fn_count;
  end if;

  -- Backfill: no in-flight contract should have signed_at without
  -- first_visit_date after this migration.
  select count(*) into v_backfill_gap
    from public.amc_contracts
   where signed_at is not null and first_visit_date is null;
  if v_backfill_gap > 0 then
    raise exception '0033 failed: % contract(s) still missing first_visit_date despite having signed_at', v_backfill_gap;
  end if;

  raise notice '─── 0033 applied ───';
  raise notice 'first_visit_date column added; signed_at default dropped';
  raise notice 'trg_amc_set_first_payment_due_at → first_visit_date';
  raise notice 'trg_amc_seed_first_service → first_visit_date';
  raise notice 'Backfill complete: signed_at → first_visit_date for in-flight rows';
end $$;

commit;
