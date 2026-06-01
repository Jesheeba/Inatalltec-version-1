-- ============================================================
-- 0019 — Calendar / Growth Plan: date-range indexes
--
-- Adds performance indexes for the Growth Plan calendar module, which
-- aggregates projects, AMC service visits, and work orders into a single
-- planning view (month / week / list). Calendar queries hit each of these
-- tables with a date-range predicate (rows that overlap a given window).
--
-- Pre-flight audit (vs. live schema in 0001/0009b/0014):
--   • spec proposed columns scheduled_at/start_at/end_at — these do NOT
--     exist. Real columns are scheduled_date (date), scheduled_start
--     (timestamptz), scheduled_end (timestamptz). This file uses the real
--     names. amc_service_schedule.completed_at and projects.started_at /
--     due_at exist as spec'd.
--   • two of the eight proposed indexes already exist under different
--     names:
--        idx_amc_schedule_date   on amc_service_schedule(scheduled_date)
--                                — created in 0009b:110
--        wo_scheduled_idx        on work_orders(scheduled_start)
--                                — created in 0001:259
--     This migration does NOT create duplicates for those. Postgres picks
--     indexes by column, not by name, so calendar queries already get the
--     speedup from the existing indexes. The smoke test asserts they're
--     still present so a future migration that drops them surfaces here.
--
-- Net effect: 6 new indexes + 2 pre-existing asserted = 8 date-range
-- index coverage points across projects / amc_service_schedule /
-- work_orders.
--
-- All operations are CREATE INDEX IF NOT EXISTS — idempotent and safe
-- to re-run. Single BEGIN/COMMIT.
-- ============================================================

begin;

-- ── projects: date-range coverage ─────────────────────────
-- Calendar reads projects where started_at <= rangeEnd AND
-- (due_at IS NULL OR due_at >= rangeStart). The composite index serves
-- the overlap query directly; the single-column ones speed up "starts
-- on day X" and "due on day X" filters used by the dashboard widgets.
create index if not exists idx_projects_started_at
  on public.projects(started_at);

create index if not exists idx_projects_due_at
  on public.projects(due_at);

create index if not exists idx_projects_dates_range
  on public.projects(started_at, due_at);

-- ── amc_service_schedule: completed_at coverage ───────────
-- scheduled_date is already covered by idx_amc_schedule_date (0009b:110)
-- — not duplicated here. completed_at is new: calendar greys out
-- completed visits and shows a "completed in last N days" filter.
create index if not exists idx_amc_service_completed_at
  on public.amc_service_schedule(completed_at);

-- ── work_orders: scheduled_end + range coverage ───────────
-- scheduled_start is already covered by wo_scheduled_idx (0001:259) — not
-- duplicated here. scheduled_end and the composite are net new.
create index if not exists idx_wo_scheduled_end
  on public.work_orders(scheduled_end);

create index if not exists idx_wo_dates_range
  on public.work_orders(scheduled_start, scheduled_end);

-- ============================================================
-- Smoke test
--   • asserts 6 net-new indexes were created (fails the migration if not)
--   • asserts 2 pre-existing indexes are still present
--   • prints a one-line summary either way
-- ============================================================
do $$
declare
  v_new_count       int;
  v_existing_count  int;
begin
  -- net-new indexes from this migration
  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'idx_projects_started_at',
       'idx_projects_due_at',
       'idx_projects_dates_range',
       'idx_amc_service_completed_at',
       'idx_wo_scheduled_end',
       'idx_wo_dates_range'
     )
   into v_new_count;

  -- pre-existing indexes the calendar relies on
  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'idx_amc_schedule_date',
       'wo_scheduled_idx'
     )
   into v_existing_count;

  raise notice '─── 0019 smoke test ───';
  raise notice '  new calendar indexes        = % (expect 6)', v_new_count;
  raise notice '  pre-existing date indexes   = % (expect 2)', v_existing_count;
  raise notice '  total date-range coverage   = % (expect 8)', v_new_count + v_existing_count;

  if v_new_count <> 6 then
    raise exception
      '0019: expected 6 new calendar indexes, found %. Check projects/amc_service_schedule/work_orders for column-name drift.',
      v_new_count;
  end if;

  if v_existing_count <> 2 then
    raise exception
      '0019: expected pre-existing indexes idx_amc_schedule_date and wo_scheduled_idx, found % of 2. A prior migration may have dropped one — calendar queries will degrade.',
      v_existing_count;
  end if;

  raise notice '─── 0019 applied ───';
end $$;

commit;
