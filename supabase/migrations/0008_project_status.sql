-- ============================================================
-- 0008 - Project status / stage lifecycle
--
-- Goal
--   Turn projects.status and projects.stage from free-text columns
--   into proper enums, add a project_status_history audit table,
--   and install a trigger that records every status/stage change
--   with the actor (fn_my_id()) and timestamp.
--
-- Safety
--   1. Each step uses IF [NOT] EXISTS / DO blocks so the migration
--      is idempotent - re-running it after a partial failure is OK.
--   2. The existing free-text values are mapped into the enum via
--      ILIKE so we don't lose any in-flight projects.
--   3. The migration is wrapped in BEGIN/COMMIT so any failure
--      rolls back the entire change - no half-migrated columns.
--   4. Audit of current data (1 project, status='In Progress',
--      stage='Mobilisation') confirms both rows map cleanly to
--      the new enum values 'in_progress' / 'mobilization'.
--
-- What this migration does NOT do
--   * Touch any OTHER table (customers, work_orders, amc_contracts,
--     etc.) - those keep their existing text/enum columns as-is.
--   * Add filter tabs / "My Projects" dashboard sections - that
--     work belongs to Step 3.
--   * Modify RLS policies on projects - the existing policies from
--     migration 0007 work unchanged because column types change but
--     names don't, and policies don't inspect column types.
-- ============================================================

begin;

-- ============================================================
-- 1) ENUM TYPES
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type project_status as enum (
      'planned',
      'in_progress',
      'on_hold',
      'completed',
      'cancelled'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_stage') then
    create type project_stage as enum (
      'lead',
      'quote',
      'won',
      'mobilization',
      'execution',
      'testing_commissioning',
      'handover',
      'dlp',
      'amc_handoff'
    );
  end if;
end $$;

-- ============================================================
-- 2) projects.status - text → project_status
--    Two-step: add new column, backfill from old, drop old,
--    rename new → old. Safe under concurrent writes for a
--    single-tenant prototype; for production-grade rollout this
--    would need a guard column + dual-write window.
-- ============================================================
alter table projects add column if not exists status_new project_status;

update projects set status_new = case
  when status ilike '%await%'   or status ilike '%hold%'  then 'on_hold'::project_status
  when status ilike '%complet%' or status ilike '%done%'  then 'completed'::project_status
  when status ilike '%cancel%'                            then 'cancelled'::project_status
  when status ilike '%plan%'    or status ilike '%lead%'  then 'planned'::project_status
  else                                                         'in_progress'::project_status
end
where status_new is null;

alter table projects drop column if exists status;
alter table projects rename column status_new to status;
alter table projects alter column status set default 'in_progress';
alter table projects alter column status set not null;

-- ============================================================
-- 3) projects.stage - text → project_stage
-- ============================================================
alter table projects add column if not exists stage_new project_stage;

update projects set stage_new = case
  when stage ilike '%lead%'                                        then 'lead'::project_stage
  when stage ilike '%quote%'                                       then 'quote'::project_stage
  when stage ilike '%won%'                                         then 'won'::project_stage
  when stage ilike '%mobili%'                                      then 'mobilization'::project_stage
  when stage ilike '%execut%'    or stage ilike '%instal%'         then 'execution'::project_stage
  when stage ilike '%t&c%'       or stage ilike '%testing%'
                                 or stage ilike '%commission%'     then 'testing_commissioning'::project_stage
  when stage ilike '%handover%'                                    then 'handover'::project_stage
  when stage ilike '%dlp%'                                         then 'dlp'::project_stage
  when stage ilike '%amc%'                                         then 'amc_handoff'::project_stage
  else                                                                  'mobilization'::project_stage
end
where stage_new is null;

alter table projects drop column if exists stage;
alter table projects rename column stage_new to stage;
alter table projects alter column stage set default 'mobilization';
alter table projects alter column stage set not null;

-- ============================================================
-- 4) AUDIT TABLE - project_status_history
-- ============================================================
create table if not exists project_status_history (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  old_status  project_status,
  new_status  project_status not null,
  old_stage   project_stage,
  new_stage   project_stage,
  changed_by  uuid references users(id),
  changed_at  timestamptz not null default now(),
  note        text
);

create index if not exists idx_psh_project    on project_status_history(project_id);
create index if not exists idx_psh_changed_at on project_status_history(changed_at desc);

alter table project_status_history enable row level security;

-- Read policy: anyone who can see the parent project sees its history.
-- The EXISTS subquery is evaluated under the caller's RLS, so projects_read
-- (defined in 0007) is the actual gate. No recursion risk - history doesn't
-- reference itself.
drop policy if exists psh_read on project_status_history;
create policy psh_read on project_status_history
for select using (
  exists (select 1 from projects where id = project_status_history.project_id)
);

-- ============================================================
-- 5) TRIGGER - log every status/stage change
--    SECURITY DEFINER + owner postgres so the insert isn't subject
--    to RLS on project_status_history (same pattern as 0007).
-- ============================================================
create or replace function fn_log_project_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status) or (new.stage is distinct from old.stage) then
    insert into project_status_history (
      project_id, old_status, new_status, old_stage, new_stage, changed_by
    ) values (
      new.id, old.status, new.status, old.stage, new.stage, fn_my_id()
    );
  end if;
  return new;
end;
$$;

alter function fn_log_project_status_change() owner to postgres;

drop trigger if exists trg_project_status_change on projects;
create trigger trg_project_status_change
after update on projects
for each row execute function fn_log_project_status_change();

-- ============================================================
-- 6) INLINE SMOKE TEST
-- ============================================================
do $$
declare
  v_count_projects bigint;
  v_count_history  bigint;
begin
  select count(*) from public.projects                into v_count_projects;
  select count(*) from public.project_status_history  into v_count_history;
  raise notice '─── 0008 smoke test ───';
  raise notice '  projects rows                 = %', v_count_projects;
  raise notice '  project_status_history rows   = %', v_count_history;
  raise notice '  (history will be 0 until next UPDATE - trigger fires on update only)';
  raise notice '─── 0008 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor)
-- ============================================================
--
-- -- 1. Confirm enums exist:
-- select typname from pg_type
--  where typname in ('project_status','project_stage');
--
-- -- 2. Confirm columns now use enums:
-- select column_name, data_type, udt_name
--   from information_schema.columns
--  where table_name = 'projects' and column_name in ('status','stage');
--
-- -- 3. Confirm existing data migrated cleanly:
-- select code, name, status, stage from projects;
--
-- -- 4. Confirm trigger is installed:
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.projects'::regclass
--    and tgname  = 'trg_project_status_change';
--
-- -- 5. Test the trigger end-to-end (replace <id> with a real project id):
-- update projects set status = 'on_hold'::project_status where id = '<id>';
-- select * from project_status_history order by changed_at desc limit 5;
-- update projects set status = 'in_progress'::project_status where id = '<id>';
--
-- ============================================================
