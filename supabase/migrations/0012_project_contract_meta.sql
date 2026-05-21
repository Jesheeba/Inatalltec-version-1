-- ============================================================
-- 0012 — Main Contractor Job: contract metadata + job type
--
-- Step B of the 3-job-types restructure. Adds three columns to
-- projects so the creation form can capture installation-specific
-- detail:
--
--   - scope_description : free-text one-liner ("47-camera CCTV …")
--   - job_category      : domain bucket (cctv, access_control, …)
--   - contract_meta     : JSONB grab-bag for boolean flags + numeric
--                         knobs (BOQ, design/T&C phases, retention,
--                         payment terms). JSONB so additions don't
--                         force another migration; promote to real
--                         columns only when we filter/query on them.
--
-- All three are optional. Existing rows get scope_description = NULL,
-- job_category = NULL, contract_meta = '{}'::jsonb — fully backward
-- compatible.
--
-- A CHECK constraint on job_category catches typos at INSERT time;
-- the eight values mirror the dropdown options in the creation form
-- (CreateModals.tsx ProjectForm).
--
-- Single transaction — no enum mutation, safe to wrap in BEGIN/COMMIT.
-- ============================================================

begin;

-- ============================================================
-- 1) New columns. JSONB default '{}' means the field is always a
--    valid object — the frontend doesn't need a defensive `?? {}`.
-- ============================================================
alter table projects add column if not exists contract_meta     jsonb default '{}'::jsonb;
alter table projects add column if not exists job_category      text;
alter table projects add column if not exists scope_description text;

-- ============================================================
-- 2) Lookup index on job_category. Will be used by the future
--    "filter by category" tab in the jobs list; cheap to add now.
-- ============================================================
create index if not exists idx_projects_job_category on projects(job_category);

-- ============================================================
-- 3) Enum-like CHECK constraint. Drop first so the migration is
--    idempotent — re-running with a new value list is safe.
-- ============================================================
alter table projects drop constraint if exists chk_job_category;
alter table projects add  constraint chk_job_category check (
  job_category is null or job_category in (
    'cctv',
    'access_control',
    'intercom',
    'fire_alarm',
    'public_address',
    'structured_cabling',
    'bms',
    'other'
  )
);

-- ============================================================
-- 4) Inline smoke test — fails the migration if any column / index
--    / constraint failed to materialise.
-- ============================================================
do $$
declare
  v_col_count bigint;
  v_idx_count bigint;
  v_chk_count bigint;
begin
  select count(*) from information_schema.columns
   where table_name = 'projects'
     and column_name in ('contract_meta','job_category','scope_description')
   into v_col_count;
  select count(*) from pg_indexes
   where tablename = 'projects' and indexname = 'idx_projects_job_category'
   into v_idx_count;
  select count(*) from pg_constraint
   where conname = 'chk_job_category' and conrelid = 'public.projects'::regclass
   into v_chk_count;
  raise notice '─── 0012 smoke test ───';
  raise notice '  new columns                = % (expect 3)', v_col_count;
  raise notice '  idx_projects_job_category  = % (expect 1)', v_idx_count;
  raise notice '  chk_job_category           = % (expect 1)', v_chk_count;
  raise notice '─── 0012 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm the columns are there with correct types:
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'projects'
--    and column_name in ('contract_meta','job_category','scope_description');
--   -- Expect 3 rows: jsonb / text / text. contract_meta default = '{}'::jsonb.
--
-- -- 2. Confirm the CHECK constraint rejects typos:
-- -- update projects set job_category = 'not_a_real_category' where id = '...';
-- --   → ERROR 23514: new row for relation "projects" violates check constraint
--
-- -- 3. Confirm backward compatibility: an existing row, untouched, still works:
-- select id, code, scope_description, job_category, contract_meta
--   from projects limit 5;
--   -- Expect contract_meta = {}, the two text columns = NULL.
--
-- ============================================================
