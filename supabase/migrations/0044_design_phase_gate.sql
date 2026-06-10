-- ============================================================
-- 0044 — Design phase advancement gate (Slice D)
--
-- Enforces server-side that a project cannot advance from
-- current_phase = 'design' to 'material_supply' until all three
-- Design activities are complete:
--
--   1. Material Submittal   — material_submittals row has
--                             approved_revision IS NOT NULL
--   2. Shop Drawing         — shop_drawings row has
--                             approved_revision IS NOT NULL
--   3. Job Cost Analysis    — project_jca row exists for the project
--
-- The UI (components/PhaseTracker.tsx AdvancePhaseButton + DesignGateHint)
-- mirrors this rule via db.designReadiness(projectId). This trigger is
-- the defense-in-depth: even if a caller bypasses the UI (direct SQL,
-- service-role import, future RPC), the DB rejects the invalid phase
-- transition with a clear error message.
--
-- TRIGGER CHARACTERISTICS:
--   • BEFORE UPDATE OF current_phase on public.projects
--   • Only acts when OLD.current_phase = 'design' AND
--     NEW.current_phase = 'material_supply'. Every other transition
--     passes through untouched (forward and backward, gateless).
--   • SECURITY DEFINER + owner postgres so it can read material_submittals
--     / shop_drawings / project_jca regardless of the caller's RLS
--     scope. Sales might not have read access to JCA, but they're not
--     the role advancing phases — only md/admin/manager can do that
--     (canChangeProjectPhase). Still, SECURITY DEFINER keeps the
--     trigger's check deterministic across all callers.
--   • Raises with SQLSTATE 'P0001' and an error message that lists
--     every missing activity so the UI can surface it as a toast.
--
-- IDEMPOTENCY: CREATE OR REPLACE FUNCTION + drop/recreate trigger.
-- Re-running this file is a no-op once applied.
-- ============================================================

begin;

-- ─── 1) Gate function ───────────────────────────────────────
create or replace function public.fn_check_design_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_submittal_ok boolean;
  v_drawing_ok   boolean;
  v_jca_ok       boolean;
  v_missing      text := '';
begin
  -- Only enforce on the design → material_supply transition. Every
  -- other phase change (including reverse moves and any future direct
  -- jumps to closed for cancellation) is unaffected.
  if old.current_phase is distinct from 'design'
     or new.current_phase is distinct from 'material_supply' then
    return new;
  end if;

  -- 1) Material Submittal — needs an approved revision.
  select exists (
    select 1 from public.material_submittals
     where project_id = new.id
       and approved_revision is not null
  ) into v_submittal_ok;

  -- 2) Shop Drawing — needs an approved revision.
  select exists (
    select 1 from public.shop_drawings
     where project_id = new.id
       and approved_revision is not null
  ) into v_drawing_ok;

  -- 3) JCA — row simply has to exist.
  select exists (
    select 1 from public.project_jca where project_id = new.id
  ) into v_jca_ok;

  if v_submittal_ok and v_drawing_ok and v_jca_ok then
    return new;
  end if;

  -- Build a human-readable summary of what's missing so the UI toast
  -- can show it. Ordered M → S → J to match the UI hint pane.
  if not v_submittal_ok then
    v_missing := v_missing || 'Material Submittal not approved; ';
  end if;
  if not v_drawing_ok then
    v_missing := v_missing || 'Shop Drawing not approved; ';
  end if;
  if not v_jca_ok then
    v_missing := v_missing || 'JCA not created; ';
  end if;

  raise exception
    'Cannot advance past Design — incomplete activities: %',
    trim(trailing '; ' from v_missing)
    using errcode = 'P0001',
          hint = 'Approve Material Submittal + Shop Drawing and create the JCA, then retry.';
end $$;
alter function public.fn_check_design_gate() owner to postgres;

-- ─── 2) Trigger binding ─────────────────────────────────────
drop trigger if exists trg_check_design_gate on public.projects;
create trigger trg_check_design_gate
  before update of current_phase on public.projects
  for each row execute function public.fn_check_design_gate();

-- ─── 3) Smoke test ──────────────────────────────────────────
do $$
declare
  v_fn   int;
  v_trg  int;
  v_def  text;
begin
  select count(*) into v_fn from pg_proc where proname = 'fn_check_design_gate';
  if v_fn <> 1 then
    raise exception '0044 failed: fn_check_design_gate not present (count = %)', v_fn;
  end if;

  select count(*) into v_trg from pg_trigger
   where tgname = 'trg_check_design_gate' and not tgisinternal;
  if v_trg <> 1 then
    raise exception '0044 failed: trg_check_design_gate not present (count = %)', v_trg;
  end if;

  -- Verify it's bound to UPDATE OF current_phase.
  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgname = 'trg_check_design_gate' and not t.tgisinternal;
  if v_def is null or v_def not ilike '%update of current_phase%' then
    raise exception '0044 failed: trigger not bound to UPDATE OF current_phase (def: %)', v_def;
  end if;

  raise notice '─── 0044 applied ───';
  raise notice 'Design gate trigger active: design → material_supply requires';
  raise notice '  • Material Submittal approved revision';
  raise notice '  • Shop Drawing approved revision';
  raise notice '  • JCA row created';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- Pick a project that's at design with no Design activities done:
-- /*
-- update public.projects
--    set current_phase = 'material_supply'
--  where id = '<project_uuid>';
-- -- Expect: ERROR: Cannot advance past Design — incomplete activities: ...
-- */
--
-- -- After approving the Material Submittal, Shop Drawing, AND creating
-- -- a JCA row, the same UPDATE succeeds.
-- ============================================================
