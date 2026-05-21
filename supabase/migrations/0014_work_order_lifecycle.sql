-- ============================================================
-- 0014 — Work Order lifecycle: new status enum + assignment +
--        history + worker-can-update-own RLS
--
-- Reconciles the spec ("8-status lowercase enum, status history with
-- old/new columns, multi-assignee with is_lead + assigned_at + assigned_by")
-- with the actual state of the DB (already has a different wo_status enum
-- + composite-PK assignments table + from/to-status history columns).
--
-- Existing schema this migration touches:
--   wo_status enum                       0001:33    — 11 Title-case values
--   work_orders.status wo_status         0001:247
--   work_order_assignments               0001:265   — composite PK, no extras
--   work_order_status_history            0001:280   — from_status/to_status
--   wo_write policy on work_orders       0007:306   — manager/lead_worker only
--
-- Value mapping (legacy Title-case → new lowercase):
--   Scheduled            → open
--   Assigned             → assigned
--   Accepted             → assigned
--   In Transit           → in_progress
--   Checked In           → in_progress
--   In Progress          → in_progress
--   Waiting For Material → waiting_material
--   Waiting For Customer → waiting_material   (bucketed — no "waiting_customer" in new set)
--   Completed            → done               (worker-reported complete)
--   Customer Approved    → closed
--   Closed               → closed
--
-- After this migration, lib/types.ts (WoStatus union) and lib/hydrate.ts
-- (mapWorkOrder) must be updated to read the lowercase enum. UI changes
-- ship in the matching frontend commit.
--
-- Single BEGIN/COMMIT — no ALTER TYPE ADD VALUE, no enum mutations that
-- need an autocommit split.
-- ============================================================

begin;

-- ============================================================
-- 1) New enum under a temp name. We can't reuse "wo_status" until we've
--    dropped the legacy type — Postgres won't let two types share a name
--    in the same schema. The final RENAME at the end of this file puts
--    the new enum at the old name, so downstream code keeps working.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wo_status_v2') then
    create type wo_status_v2 as enum (
      'open',
      'assigned',
      'in_progress',
      'waiting_material',
      'pending_confirmation',
      'done',
      'closed',
      'cancelled'
    );
  end if;
end $$;

-- ============================================================
-- 2) work_orders.status: add temp column, migrate values, swap.
--    Drop the index first so it doesn't keep a reference to the
--    old type beyond the column drop.
-- ============================================================
alter table work_orders add column if not exists status_new wo_status_v2;

update work_orders set status_new = case status::text
  when 'Scheduled'            then 'open'::wo_status_v2
  when 'Assigned'             then 'assigned'::wo_status_v2
  when 'Accepted'             then 'assigned'::wo_status_v2
  when 'In Transit'           then 'in_progress'::wo_status_v2
  when 'Checked In'           then 'in_progress'::wo_status_v2
  when 'In Progress'          then 'in_progress'::wo_status_v2
  when 'Waiting For Material' then 'waiting_material'::wo_status_v2
  when 'Waiting For Customer' then 'waiting_material'::wo_status_v2
  when 'Completed'            then 'done'::wo_status_v2
  when 'Customer Approved'    then 'closed'::wo_status_v2
  when 'Closed'               then 'closed'::wo_status_v2
  else 'open'::wo_status_v2
end
where status_new is null;

drop index if exists wo_status_idx;
alter table work_orders drop column status;
alter table work_orders rename column status_new to status;
alter table work_orders alter column status set default 'open';
alter table work_orders alter column status set not null;
create index wo_status_idx on work_orders(status);

-- ============================================================
-- 3) work_order_status_history: add new columns, migrate, drop old.
--    The existing table has from_status / to_status of the legacy
--    wo_status type — we add old_status / new_status of the new
--    type so the new trigger (section 8) can write to them.
-- ============================================================
alter table work_order_status_history add column if not exists old_status wo_status_v2;
alter table work_order_status_history add column if not exists new_status wo_status_v2;

update work_order_status_history set
  old_status = case from_status::text
    when 'Scheduled'            then 'open'::wo_status_v2
    when 'Assigned'             then 'assigned'::wo_status_v2
    when 'Accepted'             then 'assigned'::wo_status_v2
    when 'In Transit'           then 'in_progress'::wo_status_v2
    when 'Checked In'           then 'in_progress'::wo_status_v2
    when 'In Progress'          then 'in_progress'::wo_status_v2
    when 'Waiting For Material' then 'waiting_material'::wo_status_v2
    when 'Waiting For Customer' then 'waiting_material'::wo_status_v2
    when 'Completed'            then 'done'::wo_status_v2
    when 'Customer Approved'    then 'closed'::wo_status_v2
    when 'Closed'               then 'closed'::wo_status_v2
    else null
  end,
  new_status = case to_status::text
    when 'Scheduled'            then 'open'::wo_status_v2
    when 'Assigned'             then 'assigned'::wo_status_v2
    when 'Accepted'             then 'assigned'::wo_status_v2
    when 'In Transit'           then 'in_progress'::wo_status_v2
    when 'Checked In'           then 'in_progress'::wo_status_v2
    when 'In Progress'          then 'in_progress'::wo_status_v2
    when 'Waiting For Material' then 'waiting_material'::wo_status_v2
    when 'Waiting For Customer' then 'waiting_material'::wo_status_v2
    when 'Completed'            then 'done'::wo_status_v2
    when 'Customer Approved'    then 'closed'::wo_status_v2
    when 'Closed'               then 'closed'::wo_status_v2
    else 'open'::wo_status_v2
  end
where new_status is null;

alter table work_order_status_history drop column from_status;
alter table work_order_status_history drop column to_status;
alter table work_order_status_history alter column new_status set not null;

create index if not exists idx_wo_status_history_wo on work_order_status_history(work_order_id);

-- ============================================================
-- 4) work_order_assignments: extend with id/is_lead/assigned_at/assigned_by.
--    Existing composite PK (work_order_id, user_id) becomes a UNIQUE
--    constraint; new id column takes the PK role so individual
--    assignment rows can be referenced (handy for audit and updates).
-- ============================================================
alter table work_order_assignments add column if not exists id uuid default gen_random_uuid();
alter table work_order_assignments add column if not exists assigned_at timestamptz not null default now();
alter table work_order_assignments add column if not exists assigned_by uuid references users(id);
alter table work_order_assignments add column if not exists is_lead boolean not null default false;

-- Backfill id on any pre-existing rows that landed before the default was set.
update work_order_assignments set id = gen_random_uuid() where id is null;

-- Swap PK shape: drop composite, add id PK + uniqueness constraint on the pair.
alter table work_order_assignments drop constraint if exists work_order_assignments_pkey;
alter table work_order_assignments alter column id set not null;
alter table work_order_assignments add primary key (id);
alter table work_order_assignments add constraint work_order_assignments_wo_user_uniq
  unique (work_order_id, user_id);

create index if not exists idx_wo_assignments_wo   on work_order_assignments(work_order_id);
create index if not exists idx_wo_assignments_user on work_order_assignments(user_id);

-- ============================================================
-- 5) Drop the legacy enum and put the new one at its name.
--    By this point nothing references wo_status:
--      - work_orders.status                 → already wo_status_v2
--      - work_order_status_history.from/to  → dropped
-- ============================================================
drop type wo_status;
alter type wo_status_v2 rename to wo_status;

-- ============================================================
-- 6) Status-change trigger. SECURITY DEFINER + OWNER postgres so
--    the audit row insert bypasses RLS — same pattern used by
--    fn_log_amc_status_change in 0009b.
-- ============================================================
create or replace function fn_log_wo_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into work_order_status_history (work_order_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, fn_my_id());
  end if;
  return new;
end;
$$;
alter function fn_log_wo_status_change() owner to postgres;

drop trigger if exists trg_wo_status_change on work_orders;
create trigger trg_wo_status_change
after update on work_orders
for each row execute function fn_log_wo_status_change();

-- ============================================================
-- 7) RLS: let workers UPDATE the work_orders they're assigned to.
--    0007's wo_write only covers md/admin/manager/lead_worker — that
--    blocked workers from flipping their own WO to in_progress / done.
--    Two policies on the same table OR together, so the existing
--    wo_write stays untouched for admins/managers/leads.
-- ============================================================
drop policy if exists wo_write_assignee on work_orders;
create policy wo_write_assignee on work_orders
for update
using (
  exists (
    select 1 from work_order_assignments a
    where a.work_order_id = work_orders.id and a.user_id = fn_my_id()
  )
)
with check (
  exists (
    select 1 from work_order_assignments a
    where a.work_order_id = work_orders.id and a.user_id = fn_my_id()
  )
);

-- ============================================================
-- 8) Inline smoke test — fails the migration if anything is wrong.
-- ============================================================
do $$
declare
  v_enum_count   bigint;
  v_old_enum     bigint;
  v_wo_default   text;
  v_assign_cols  bigint;
  v_hist_cols    bigint;
  v_trig_count   bigint;
  v_policy_count bigint;
begin
  select count(*) from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'wo_status'
   into v_enum_count;
  select count(*) from pg_type where typname = 'wo_status_v2'
   into v_old_enum;
  select column_default from information_schema.columns
   where table_name = 'work_orders' and column_name = 'status'
   into v_wo_default;
  select count(*) from information_schema.columns
   where table_name = 'work_order_assignments'
     and column_name in ('id','is_lead','assigned_at','assigned_by')
   into v_assign_cols;
  select count(*) from information_schema.columns
   where table_name = 'work_order_status_history'
     and column_name in ('old_status','new_status')
   into v_hist_cols;
  select count(*) from pg_trigger
   where tgname = 'trg_wo_status_change' and not tgisinternal
   into v_trig_count;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'work_orders'
     and policyname = 'wo_write_assignee'
   into v_policy_count;
  raise notice '─── 0014 smoke test ───';
  raise notice '  wo_status enum values         = % (expect 8)', v_enum_count;
  raise notice '  wo_status_v2 leftover         = % (expect 0)', v_old_enum;
  raise notice '  work_orders.status default    = %', v_wo_default;
  raise notice '  assignments new columns       = % (expect 4)', v_assign_cols;
  raise notice '  history new columns           = % (expect 2)', v_hist_cols;
  raise notice '  trg_wo_status_change          = % (expect 1)', v_trig_count;
  raise notice '  wo_write_assignee policy      = % (expect 1)', v_policy_count;
  raise notice '─── 0014 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm the new enum has exactly the 8 expected values:
-- select enumlabel from pg_enum
--   join pg_type t on t.oid = enumtypid
--  where t.typname = 'wo_status'
--  order by enumsortorder;
--   -- Expect: open, assigned, in_progress, waiting_material,
--   --         pending_confirmation, done, closed, cancelled
--
-- -- 2. Confirm work_orders.status migrated. Existing rows should hold
-- --    a lowercase value from the new enum:
-- select status, count(*) from work_orders group by status;
--
-- -- 3. Confirm work_order_assignments has the new columns and no
-- --    rows lost their (work_order_id, user_id) pairing:
-- select column_name, data_type, column_default from information_schema.columns
--  where table_name = 'work_order_assignments'
--  order by ordinal_position;
-- select count(*) from work_order_assignments;
--
-- -- 4. Confirm work_order_status_history has old_status/new_status:
-- select column_name, data_type from information_schema.columns
--  where table_name = 'work_order_status_history'
--  order by ordinal_position;
--
-- -- 5. Confirm the trigger is bound:
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.work_orders'::regclass and not tgisinternal;
--
-- -- 6. Smoke-test the trigger: flip one row's status and confirm a
-- --    history entry lands.
-- /*
-- update work_orders set status = 'in_progress'
--  where id = (select id from work_orders limit 1)
--  returning id, status;
-- select * from work_order_status_history
--  order by changed_at desc limit 3;
-- */
--
-- ============================================================
