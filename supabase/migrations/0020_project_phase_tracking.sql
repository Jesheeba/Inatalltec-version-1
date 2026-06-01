-- ============================================================
-- 0020 — Project Phase Tracking (Main Contractor projects only)
--
-- Adds a phase-tracking lifecycle on top of the existing project
-- status/stage model. Phases are the operational milestones a Main
-- Contractor job moves through after it kicks off — manually advanced
-- by the Operations Manager via a "Move to Next Phase" action.
--
--   Design          → Engineering team draws plans (drawings, BOQ,
--                     methodology)
--   Material Supply → Procure and deliver equipment to site
--   Installation    → Physical work (mount equipment, run cables,
--                     configure)
--   T&C             → Test, train customer, sign handover
--   DLP             → 12-month warranty period after handover
--   Closed          → Final payment released, project archived
--
-- Pre-flight audit (vs. live schema in 0001/0008/0012/0018):
--   • No `project_phase` enum exists anywhere.
--   • No `current_phase` column on projects (only status + stage from
--     0008, which keep their existing meanings — status = lifecycle
--     state, stage = pre-execution funnel, phase = execution milestone.
--     The three are orthogonal and coexist).
--   • No `project_phase_history` table.
--   • Existing `trg_project_status_change` trigger on projects only
--     fires on status/stage changes — won't interfere with the new
--     phase trigger.
--   • AMC contracts and repair tickets live in separate tables, so
--     "only Main Contractor" is enforced by virtue of the column
--     living on `projects`.
--
-- Permission model:
--   • UPDATE projects.current_phase is gated by the existing
--     `projects_write` policy (md/admin/manager) — no new policy
--     needed. Workers / lead techs / sales etc. cannot change phases.
--   • READ project_phase_history uses the same scope as projects_read
--     (anyone who can see the project sees its phase history).
--   • INSERT project_phase_history is restricted to md/admin/manager
--     so the app can attach a `note` to a phase change if it wants
--     (the auto-trigger records without a note).
--
-- Trigger behaviour:
--   • SECURITY DEFINER + owner postgres so the audit insert isn't
--     subject to RLS on project_phase_history. Same pattern as
--     fn_log_project_status_change in 0008.
--   • Fires AFTER UPDATE, only when current_phase changed.
--   • Records changed_by = fn_my_id() (NULL for service-role writes,
--     which is the same convention 0008 uses).
--   • Leaves `note` NULL — frontend can write a follow-up
--     project_phase_history row with note via its own INSERT if the
--     "Move to Next Phase" dialog captures one.
--
-- Defaults:
--   • Column added without DEFAULT in step 2a, so EXISTING rows stay
--     NULL (Operations Manager backfills each project manually).
--   • DEFAULT 'design' applied separately in step 2b so NEW rows
--     auto-start at Design. This split prevents a one-shot data
--     migration that would lie about where existing projects are.
--
-- Single BEGIN/COMMIT — no enum mutation that needs autocommit split.
-- ============================================================

begin;

-- ============================================================
-- 1) project_phase enum (brand new — no ADD VALUE conflict)
--    Lowercase, snake_case for SQL conformance. Display labels live
--    in the frontend (lib/phases.ts) so renaming doesn't need DDL.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_phase') then
    create type project_phase as enum (
      'design',
      'material_supply',
      'installation',
      'tc',
      'dlp',
      'closed'
    );
  end if;
end $$;

-- ============================================================
-- 2a) projects.current_phase — NULL for existing rows
-- ============================================================
alter table public.projects
  add column if not exists current_phase project_phase;

-- ============================================================
-- 2b) DEFAULT for NEW inserts. Applied in a separate statement so
--     pre-existing rows keep current_phase = NULL.
-- ============================================================
alter table public.projects
  alter column current_phase set default 'design';

-- ============================================================
-- 3) Index on current_phase. Partial — most existing rows are NULL
--    until backfilled, and the dashboard "filter by phase" widget
--    only queries non-null values.
-- ============================================================
create index if not exists idx_projects_current_phase
  on public.projects(current_phase)
  where current_phase is not null;

-- ============================================================
-- 4) project_phase_history audit table
--    Modelled after project_status_history (0008:117) with
--    from_phase / to_phase + a free-text note.
-- ============================================================
create table if not exists public.project_phase_history (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  from_phase  project_phase,
  to_phase    project_phase not null,
  changed_by  uuid references public.users(id),
  changed_at  timestamptz not null default now(),
  note        text
);

create index if not exists idx_pph_project    on public.project_phase_history(project_id);
create index if not exists idx_pph_changed_at on public.project_phase_history(changed_at desc);

alter table public.project_phase_history enable row level security;

-- ============================================================
-- 5) RLS — read mirrors projects_read scope; write gated to ops
--    leadership so the app can attach notes via direct INSERT.
-- ============================================================
drop policy if exists pph_read on public.project_phase_history;
create policy pph_read on public.project_phase_history
for select using (
  exists (select 1 from public.projects where id = project_phase_history.project_id)
);

drop policy if exists pph_write on public.project_phase_history;
create policy pph_write on public.project_phase_history
for all
using      (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager')
with check (public.fn_is_md_or_admin() or public.fn_my_role() = 'manager');

-- ============================================================
-- 6) Trigger function — auto-log phase transitions
-- ============================================================
create or replace function public.fn_log_project_phase_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.current_phase is distinct from old.current_phase) then
    insert into project_phase_history (project_id, from_phase, to_phase, changed_by)
    values (new.id, old.current_phase, new.current_phase, fn_my_id());
  end if;
  return new;
end;
$$;

alter function public.fn_log_project_phase_change() owner to postgres;

drop trigger if exists trg_project_phase_change on public.projects;
create trigger trg_project_phase_change
after update on public.projects
for each row execute function public.fn_log_project_phase_change();

-- ============================================================
-- 7) Smoke test — fails the migration on any missing artifact
-- ============================================================
do $$
declare
  v_enum_exists   boolean;
  v_enum_count    int;
  v_col_exists    boolean;
  v_col_default   text;
  v_idx_count     int;
  v_table_exists  boolean;
  v_hist_idx_count int;
  v_policy_count  int;
  v_fn_exists     boolean;
  v_trigger_count int;
begin
  -- enum
  select exists (select 1 from pg_type where typname = 'project_phase') into v_enum_exists;
  select count(*) from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'project_phase' into v_enum_count;

  -- column + default
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'projects'
       and column_name = 'current_phase'
  ) into v_col_exists;
  select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'projects'
     and column_name = 'current_phase'
   into v_col_default;

  -- indexes on projects
  select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'idx_projects_current_phase'
   into v_idx_count;

  -- history table + its indexes
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'project_phase_history'
  ) into v_table_exists;
  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in ('idx_pph_project','idx_pph_changed_at')
   into v_hist_idx_count;

  -- policies
  select count(*) from pg_policies
   where schemaname = 'public'
     and tablename = 'project_phase_history'
     and policyname in ('pph_read','pph_write')
   into v_policy_count;

  -- trigger function + trigger
  select exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_log_project_phase_change'
  ) into v_fn_exists;
  select count(*) from pg_trigger
   where tgrelid = 'public.projects'::regclass
     and tgname  = 'trg_project_phase_change'
   into v_trigger_count;

  raise notice '─── 0020 smoke test ───';
  raise notice '  project_phase enum exists   = %', v_enum_exists;
  raise notice '  project_phase enum values   = % (expect 6)', v_enum_count;
  raise notice '  current_phase column        = %', v_col_exists;
  raise notice '  current_phase default       = % (expect ''design''::project_phase)', v_col_default;
  raise notice '  idx_projects_current_phase  = % (expect 1)', v_idx_count;
  raise notice '  project_phase_history table = %', v_table_exists;
  raise notice '  history indexes             = % (expect 2)', v_hist_idx_count;
  raise notice '  pph policies                = % (expect 2)', v_policy_count;
  raise notice '  fn_log_project_phase_change = %', v_fn_exists;
  raise notice '  trg_project_phase_change    = % (expect 1)', v_trigger_count;

  if not v_enum_exists                        then raise exception '0020: project_phase enum missing';                       end if;
  if v_enum_count <> 6                        then raise exception '0020: project_phase has % values (expect 6)', v_enum_count; end if;
  if not v_col_exists                         then raise exception '0020: projects.current_phase column missing';             end if;
  if v_col_default is null
     or position('design' in v_col_default) = 0 then raise exception '0020: current_phase default is %, expected ''design''', v_col_default; end if;
  if v_idx_count <> 1                         then raise exception '0020: idx_projects_current_phase missing';                end if;
  if not v_table_exists                       then raise exception '0020: project_phase_history table missing';               end if;
  if v_hist_idx_count <> 2                    then raise exception '0020: history indexes incomplete (% of 2)', v_hist_idx_count; end if;
  if v_policy_count <> 2                      then raise exception '0020: project_phase_history policies incomplete (% of 2)', v_policy_count; end if;
  if not v_fn_exists                          then raise exception '0020: fn_log_project_phase_change missing';               end if;
  if v_trigger_count <> 1                     then raise exception '0020: trg_project_phase_change missing';                  end if;

  raise notice '─── 0020 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm enum + column shape:
-- select column_name, data_type, udt_name, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'projects'
--    and column_name = 'current_phase';
--   -- Expect data_type = 'USER-DEFINED', udt_name = 'project_phase',
--   -- column_default ≈ "'design'::project_phase".
--
-- -- 2. Confirm enum values:
-- select unnest(enum_range(null::project_phase));
--   -- Expect 6 rows: design, material_supply, installation, tc, dlp, closed.
--
-- -- 3. Confirm trigger logs a transition end-to-end (replace <id>):
-- update public.projects set current_phase = 'material_supply'
--  where id = '<existing-project-id>';
-- select project_id, from_phase, to_phase, changed_by, changed_at
--   from public.project_phase_history
--  order by changed_at desc limit 5;
--
-- -- 4. Confirm existing rows are NULL (not auto-defaulted):
-- select id, code, current_phase from public.projects
--  where current_phase is null limit 5;
--
-- ============================================================
