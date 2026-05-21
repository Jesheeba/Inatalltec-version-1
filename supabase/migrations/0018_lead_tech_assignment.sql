-- ============================================================
-- 0018 — Lead Technician assignment on Projects / AMC / Repair
--
-- Closes a workflow gap discovered during Sub-Step 2 verification:
-- Lead Technicians currently see no parent jobs until they already
-- have a Work Order assignment, which is a chicken-and-egg blocker
-- (they need WOs to see projects, and projects to create WOs).
--
-- Fix: let the Operations Manager nominate a Lead Tech at parent
-- creation time. The Lead then sees the job immediately and can
-- create Work Orders / assign Workers against it.
--
-- Scope:
--   projects        → add lead_tech_id (uuid, fk users)
--   amc_contracts   → add lead_tech_id (uuid, fk users)
--   repair_tickets  → add lead_tech_id (uuid, fk users)
--   + one b-tree index per column for the "jobs assigned to me" filter
--
-- Read RLS is NOT touched. projects_read / amc_read / repair_read
-- already allow `lead_worker` globally; the per-Lead narrowing
-- ("only show me jobs where I'm the assigned Lead or have an active
-- WO") happens in the UI list filters (Fix 2 in the spec). Tightening
-- DB reads would break list pages for other roles.
--
-- Role validation (assigned user must actually have role='lead_worker')
-- is also UI-side: the dropdown is filtered to lead_workers, and the
-- role column on `users` is mutable, so a DB CHECK would either need
-- a trigger or would lock down legitimate reassignments after a role
-- change. Keep it simple — FK to users(id) + ON DELETE SET NULL so a
-- Lead's removal doesn't cascade-delete their parent jobs.
--
-- Pre-flight (audited against 0001 + 0008 + 0009/a/b + 0012):
--   projects.lead_tech_id        → does not exist (safe to ADD)
--   amc_contracts.lead_tech_id   → does not exist (safe to ADD)
--   repair_tickets.lead_tech_id  → does not exist (safe to ADD)
--
-- Single BEGIN/COMMIT — pure ALTER TABLE + CREATE INDEX, no enum work.
-- ============================================================

begin;

-- ============================================================
-- 1) projects.lead_tech_id
-- ============================================================
alter table public.projects
  add column if not exists lead_tech_id uuid
  references public.users(id) on delete set null;

create index if not exists idx_projects_lead_tech
  on public.projects(lead_tech_id);

-- ============================================================
-- 2) amc_contracts.lead_tech_id
-- ============================================================
alter table public.amc_contracts
  add column if not exists lead_tech_id uuid
  references public.users(id) on delete set null;

create index if not exists idx_amc_lead_tech
  on public.amc_contracts(lead_tech_id);

-- ============================================================
-- 3) repair_tickets.lead_tech_id
-- ============================================================
alter table public.repair_tickets
  add column if not exists lead_tech_id uuid
  references public.users(id) on delete set null;

create index if not exists idx_repair_lead_tech
  on public.repair_tickets(lead_tech_id);

-- ============================================================
-- 4) Inline smoke test — fails the migration if anything missed.
-- ============================================================
do $$
declare
  v_projects_col   boolean;
  v_amc_col        boolean;
  v_repair_col     boolean;
  v_projects_idx   boolean;
  v_amc_idx        boolean;
  v_repair_idx     boolean;
  v_projects_fk    int;
  v_amc_fk         int;
  v_repair_fk      int;
begin
  -- columns exist?
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'projects'
       and column_name = 'lead_tech_id'
  ) into v_projects_col;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'amc_contracts'
       and column_name = 'lead_tech_id'
  ) into v_amc_col;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'repair_tickets'
       and column_name = 'lead_tech_id'
  ) into v_repair_col;

  -- indexes exist?
  select exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'projects'
       and indexname = 'idx_projects_lead_tech'
  ) into v_projects_idx;

  select exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'amc_contracts'
       and indexname = 'idx_amc_lead_tech'
  ) into v_amc_idx;

  select exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'repair_tickets'
       and indexname = 'idx_repair_lead_tech'
  ) into v_repair_idx;

  -- FKs to users(id) exist on the new columns?
  select count(*) from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu
      on rc.constraint_name = kcu.constraint_name
   where kcu.table_schema = 'public'
     and kcu.table_name = 'projects'
     and kcu.column_name = 'lead_tech_id'
   into v_projects_fk;

  select count(*) from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu
      on rc.constraint_name = kcu.constraint_name
   where kcu.table_schema = 'public'
     and kcu.table_name = 'amc_contracts'
     and kcu.column_name = 'lead_tech_id'
   into v_amc_fk;

  select count(*) from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu
      on rc.constraint_name = kcu.constraint_name
   where kcu.table_schema = 'public'
     and kcu.table_name = 'repair_tickets'
     and kcu.column_name = 'lead_tech_id'
   into v_repair_fk;

  -- assertions — raise exception (rollback) if anything missed
  if not v_projects_col   then raise exception '0018: projects.lead_tech_id is missing';       end if;
  if not v_amc_col        then raise exception '0018: amc_contracts.lead_tech_id is missing';  end if;
  if not v_repair_col     then raise exception '0018: repair_tickets.lead_tech_id is missing'; end if;
  if not v_projects_idx   then raise exception '0018: idx_projects_lead_tech is missing';      end if;
  if not v_amc_idx        then raise exception '0018: idx_amc_lead_tech is missing';           end if;
  if not v_repair_idx     then raise exception '0018: idx_repair_lead_tech is missing';        end if;
  if v_projects_fk < 1    then raise exception '0018: projects.lead_tech_id FK missing';       end if;
  if v_amc_fk      < 1    then raise exception '0018: amc_contracts.lead_tech_id FK missing';  end if;
  if v_repair_fk   < 1    then raise exception '0018: repair_tickets.lead_tech_id FK missing'; end if;

  raise notice '─── 0018 smoke test ───';
  raise notice '  projects.lead_tech_id        = % (idx %, fks %)', v_projects_col, v_projects_idx, v_projects_fk;
  raise notice '  amc_contracts.lead_tech_id   = % (idx %, fks %)', v_amc_col,      v_amc_idx,      v_amc_fk;
  raise notice '  repair_tickets.lead_tech_id  = % (idx %, fks %)', v_repair_col,   v_repair_idx,   v_repair_fk;
  raise notice '─── 0018 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm columns landed with correct type + FK target:
-- select
--   c.table_name, c.column_name, c.data_type, c.is_nullable,
--   ccu.table_name  as references_table,
--   ccu.column_name as references_column
-- from information_schema.columns c
-- left join information_schema.key_column_usage kcu
--   on  kcu.table_schema = c.table_schema
--   and kcu.table_name   = c.table_name
--   and kcu.column_name  = c.column_name
-- left join information_schema.referential_constraints rc
--   on rc.constraint_name = kcu.constraint_name
-- left join information_schema.constraint_column_usage ccu
--   on ccu.constraint_name = rc.unique_constraint_name
-- where c.table_schema = 'public'
--   and c.column_name = 'lead_tech_id'
--   and c.table_name in ('projects','amc_contracts','repair_tickets')
-- order by c.table_name;
--   -- Expect 3 rows, all uuid / YES nullable, all references users(id).
--
-- -- 2. Confirm indexes:
-- select schemaname, tablename, indexname
-- from pg_indexes
-- where schemaname = 'public'
--   and indexname in ('idx_projects_lead_tech','idx_amc_lead_tech','idx_repair_lead_tech')
-- order by indexname;
--   -- Expect 3 rows.
--
-- -- 3. End-to-end smoke (paste with a real project_id + lead_worker user id):
-- /*
-- update projects
--    set lead_tech_id = '<user_id_with_role_lead_worker>'
--  where id = '<project_id>'
--  returning id, code, name, lead_tech_id;
--   -- Expect: 1 row, lead_tech_id populated.
--
-- select p.code, p.name, u.full_name as lead_tech, u.role
--   from projects p
--   left join users u on u.id = p.lead_tech_id
--  where p.id = '<project_id>';
--   -- Expect: lead_tech_id resolves to the Lead Tech's name and role='lead_worker'.
-- */
--
-- ============================================================
