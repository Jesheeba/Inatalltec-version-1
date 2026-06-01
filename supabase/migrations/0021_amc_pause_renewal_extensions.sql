-- ============================================================
-- 0021 — AMC pause extensions + renewal chain
--
-- Adds the missing pieces on top of the existing AMC engine
-- (0009a/0009b). The previously-built infrastructure that we are
-- DELIBERATELY REUSING rather than duplicating:
--
--   amc_status enum value 'suspended'        → frontend renders as "Paused"
--   amc_contracts.suspended_at              → set on pause
--   amc_contracts.suspended_reason          → set on pause
--   amc_contracts.payment_grace_days (=30)  → grace window before pause
--   fn_amc_payment_received trigger         → already auto-resumes on payment
--                                              (moves 'suspended' → 'active' and
--                                              clears suspended_at/_reason)
--   trg_amc_status_change                   → already audits every status flip
--
-- What this migration ADDS (net new — no overlap with the above):
--   • paused_by uuid → users(id)            — who triggered the pause
--   • resumed_at timestamptz                — most-recent resume timestamp
--   • first_payment_due_at timestamptz      — materialised signed_at + grace
--                                              days. Cheap to query for the
--                                              dashboard "about to pause" alert.
--   • renewed_from_id uuid → amc_contracts  — renewal chain pointer (A → B → C)
--   • fn_set_first_payment_due_at()         — BEFORE INSERT trigger that
--                                              auto-populates first_payment_due_at
--                                              when signed_at is set. Defensive:
--                                              renewals and future bulk inserts
--                                              can't forget the calculation.
--   • idx_amc_first_payment_due_at          — partial index for the alert query.
--   • idx_amc_renewed_from                  — chain navigation.
--   • fn_check_amc_pause_eligibility()      — returns AMCs that have crossed
--                                              first_payment_due_at without a
--                                              payment. Called from the client
--                                              autoPauseExpiredAmcs() helper.
--
-- Permission model — no new policies needed:
--   • UPDATE amc_contracts is already gated by amc_write (0016:73-76 = md /
--     admin / manager). pauseAmc / resumeAmc / renewAmc all go through that.
--   • INSERT amc_contracts (renewal) same policy.
--   • fn_check_amc_pause_eligibility is a stable SECURITY DEFINER function
--     so the autoPauseExpiredAmcs check works for any signed-in user even
--     though only md/admin/manager can actually do the UPDATE.
--
-- Single BEGIN/COMMIT — no enum mutation (the 'suspended' value already
-- exists from 0009a:41). Idempotent: every CREATE / ALTER uses
-- IF NOT EXISTS, every CREATE OR REPLACE FUNCTION is safe to re-run.
-- ============================================================

begin;

-- ============================================================
-- 1) New columns on amc_contracts
-- ============================================================
alter table public.amc_contracts
  add column if not exists paused_by uuid references public.users(id) on delete set null;

alter table public.amc_contracts
  add column if not exists resumed_at timestamptz;

alter table public.amc_contracts
  add column if not exists first_payment_due_at timestamptz;

-- Renewal chain — points at the PREVIOUS contract that this one renews.
-- ON DELETE SET NULL keeps the renewal usable as a standalone contract
-- if the original is ever purged; UI shows "Renewed from: (deleted)".
alter table public.amc_contracts
  add column if not exists renewed_from_id uuid references public.amc_contracts(id) on delete set null;

-- ============================================================
-- 2) Backfill first_payment_due_at for existing rows.
--    For any contract that has a signed_at, set the due date to
--    signed_at + payment_grace_days days (default 30, but the column
--    has been per-contract since 0009b so we read the actual value).
--    Existing rows with first_payment_due_at already set (none expected
--    yet, but the guard makes the migration re-runnable) are skipped.
-- ============================================================
update public.amc_contracts
   set first_payment_due_at =
       (signed_at::timestamp + (coalesce(payment_grace_days, 30) || ' days')::interval) at time zone 'UTC'
 where signed_at is not null
   and first_payment_due_at is null;

-- ============================================================
-- 3) Indexes
--    • first_payment_due_at: partial index on rows that have a value.
--      The dashboard "AMCs about to pause" query scans by date range
--      WHERE contract_status = 'active' AND payment_received_at IS NULL
--      — Postgres can use this index for the date range; the additional
--      predicates filter at the table.
--    • renewed_from_id: navigation index for the chain lookups
--      ("show me what THIS contract renewed").
-- ============================================================
create index if not exists idx_amc_first_payment_due_at
  on public.amc_contracts(first_payment_due_at)
  where first_payment_due_at is not null;

create index if not exists idx_amc_renewed_from
  on public.amc_contracts(renewed_from_id)
  where renewed_from_id is not null;

-- ============================================================
-- 4) BEFORE INSERT trigger — defensively populate first_payment_due_at
--    Fires on INSERT only when (a) signed_at is set and (b)
--    first_payment_due_at wasn't supplied by the caller. Keeps the
--    column in sync for renewals, bulk imports, and any future code
--    path that forgets to compute it on the app side.
--
--    Does NOT replace any existing trigger — purely auxiliary. The
--    existing fn_amc_payment_received (AFTER INSERT on amc_payments)
--    is untouched.
-- ============================================================
create or replace function public.fn_set_first_payment_due_at()
returns trigger
language plpgsql
as $$
begin
  if new.signed_at is not null and new.first_payment_due_at is null then
    new.first_payment_due_at :=
      (new.signed_at::timestamp
         + (coalesce(new.payment_grace_days, 30) || ' days')::interval)
      at time zone 'UTC';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_amc_set_first_payment_due_at on public.amc_contracts;
create trigger trg_amc_set_first_payment_due_at
before insert on public.amc_contracts
for each row execute function public.fn_set_first_payment_due_at();

-- ============================================================
-- 5) Eligibility helper — used by the client autoPauseExpiredAmcs()
--    sweep that runs when a manager loads the dashboard.
--
--    Returns one row per AMC that:
--      • is currently 'active'
--      • has crossed its first_payment_due_at
--      • has never recorded a payment (payment_received_at is NULL)
--
--    The CALLER does the UPDATE — this function is read-only so it
--    can be invoked from any signed-in session. The UPDATE itself is
--    gated by amc_write (md/admin/manager) per 0016.
--
--    STABLE: same input → same output within one statement. Allows
--    Postgres to inline / cache the call.
-- ============================================================
create or replace function public.fn_check_amc_pause_eligibility()
returns table (
  id                   uuid,
  code                 text,
  customer_id          uuid,
  first_payment_due_at timestamptz,
  days_overdue         int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.code,
    a.customer_id,
    a.first_payment_due_at,
    greatest(0, extract(day from (now() - a.first_payment_due_at))::int)
      as days_overdue
  from public.amc_contracts a
  where a.contract_status = 'active'::amc_status
    and a.first_payment_due_at is not null
    and a.first_payment_due_at <= now()
    and a.payment_received_at is null
$$;

alter function public.fn_check_amc_pause_eligibility() owner to postgres;

-- ============================================================
-- 6) Smoke test — fails the migration if anything is missing,
--    AND asserts the existing suspend infrastructure is still intact.
-- ============================================================
do $$
declare
  v_cols_new      int;
  v_idx_new       int;
  v_trigger       int;
  v_helper_fn     boolean;
  v_existing_cols int;
  v_existing_enum boolean;
  v_existing_pay  boolean;
  v_backfilled    int;
  v_orphan_signed int;
begin
  -- new columns
  select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'amc_contracts'
     and column_name in ('paused_by','resumed_at','first_payment_due_at','renewed_from_id')
   into v_cols_new;

  -- new indexes
  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in ('idx_amc_first_payment_due_at','idx_amc_renewed_from')
   into v_idx_new;

  -- new trigger
  select count(*) from pg_trigger
   where tgrelid = 'public.amc_contracts'::regclass
     and tgname  = 'trg_amc_set_first_payment_due_at'
   into v_trigger;

  -- new helper function
  select exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_check_amc_pause_eligibility'
  ) into v_helper_fn;

  -- existing pause infrastructure still present
  select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'amc_contracts'
     and column_name in ('suspended_at','suspended_reason','payment_grace_days')
   into v_existing_cols;

  select exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'amc_status' and e.enumlabel = 'suspended'
  ) into v_existing_enum;

  select exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_amc_payment_received'
  ) into v_existing_pay;

  -- backfill coverage: every signed contract should have first_payment_due_at
  select count(*) from public.amc_contracts
   where first_payment_due_at is not null
   into v_backfilled;
  select count(*) from public.amc_contracts
   where signed_at is not null and first_payment_due_at is null
   into v_orphan_signed;

  raise notice '─── 0021 smoke test ───';
  raise notice '  new amc_contracts columns        = % (expect 4)', v_cols_new;
  raise notice '  new indexes                       = % (expect 2)', v_idx_new;
  raise notice '  trg_amc_set_first_payment_due_at  = % (expect 1)', v_trigger;
  raise notice '  fn_check_amc_pause_eligibility    = %', v_helper_fn;
  raise notice '  existing pause cols intact        = % of 3', v_existing_cols;
  raise notice '  existing ''suspended'' enum intact  = %', v_existing_enum;
  raise notice '  existing payment trigger intact   = %', v_existing_pay;
  raise notice '  rows backfilled (signed)          = %', v_backfilled;
  raise notice '  signed rows still missing due_at  = % (expect 0)', v_orphan_signed;

  if v_cols_new <> 4 then
    raise exception '0021: expected 4 new columns on amc_contracts, found %', v_cols_new;
  end if;
  if v_idx_new <> 2 then
    raise exception '0021: expected 2 new indexes, found %', v_idx_new;
  end if;
  if v_trigger <> 1 then
    raise exception '0021: trg_amc_set_first_payment_due_at not installed';
  end if;
  if not v_helper_fn then
    raise exception '0021: fn_check_amc_pause_eligibility() missing';
  end if;
  if v_existing_cols <> 3 then
    raise exception
      '0021: existing pause columns missing (suspended_at/suspended_reason/payment_grace_days) — found % of 3', v_existing_cols;
  end if;
  if not v_existing_enum then
    raise exception '0021: amc_status enum no longer contains ''suspended''';
  end if;
  if not v_existing_pay then
    raise exception '0021: fn_amc_payment_received trigger function missing — pause auto-resume is broken';
  end if;
  if v_orphan_signed > 0 then
    raise exception
      '0021: % signed AMC row(s) still have NULL first_payment_due_at after backfill', v_orphan_signed;
  end if;

  raise notice '─── 0021 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm new columns + their types:
-- select column_name, data_type, udt_name, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'amc_contracts'
--    and column_name in ('paused_by','resumed_at','first_payment_due_at','renewed_from_id')
--  order by column_name;
--
-- -- 2. Confirm backfill worked — every signed contract has a due date:
-- select id, code, signed_at, payment_grace_days, first_payment_due_at
--   from public.amc_contracts
--  where signed_at is not null
--  order by signed_at desc limit 10;
--
-- -- 3. Confirm BEFORE INSERT trigger populates first_payment_due_at
-- --    on a fresh insert (replace customer_id with a real id):
-- insert into public.amc_contracts (code, customer_id, value_aed, signed_at)
-- values ('AMC-TEST-0021', '<customer-id>', 1000, current_date)
-- returning code, signed_at, payment_grace_days, first_payment_due_at;
-- -- Expect first_payment_due_at = signed_at + 30 days, NOT null.
-- -- Clean up: delete from public.amc_contracts where code = 'AMC-TEST-0021';
--
-- -- 4. Confirm helper finds eligible contracts (none expected on a fresh DB):
-- select * from public.fn_check_amc_pause_eligibility();
--
-- -- 5. Confirm existing payment auto-resume still wired:
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.amc_payments'::regclass
--    and tgname  = 'trg_amc_payment';
--
-- ============================================================
