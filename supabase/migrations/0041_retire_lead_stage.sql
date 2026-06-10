-- ============================================================
-- 0041 — Retire the 'lead' project stage
--
-- Spec change: a project enters the system at the 'quote' stage. The
-- 'lead' stage is no longer offered in the UI. This migration moves
-- any existing rows still on 'lead' to 'quote' so they continue to
-- render with a valid label (the TS PROJECT_STAGES tuple no longer
-- includes 'lead' as of the same release).
--
-- We do NOT drop the enum value. Postgres requires recreating the
-- enum to remove a label, which would cascade through every column
-- that references it. Leaving the dormant 'lead' value is cheap and
-- keeps the audit trail (projects_stage_history rows from migration
-- 0008) intact — old history entries referencing 'lead' stay readable.
--
-- IDEMPOTENT: re-running is a no-op once every row is on a valid
-- non-'lead' stage. Smoke test verifies the invariant.
-- ============================================================

begin;

-- ─── 1) Move any in-flight projects off 'lead' ─────────────
update public.projects
   set stage = 'quote'::project_stage
 where stage = 'lead'::project_stage;

-- ─── 2) Smoke test ─────────────────────────────────────────
do $$
declare
  v_remaining int;
begin
  select count(*) into v_remaining
    from public.projects
   where stage = 'lead'::project_stage;

  if v_remaining > 0 then
    raise exception
      '0041 failed: % project(s) still on stage = lead after backfill',
      v_remaining;
  end if;

  raise notice '─── 0041 applied ───';
  raise notice 'All projects migrated off the lead stage.';
  raise notice 'Enum label "lead" remains on project_stage type for history rows.';
end $$;

commit;
