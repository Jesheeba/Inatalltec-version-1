-- ============================================================
-- 0026 — Sub-contractor hours log
--
-- Phase 5D.1: per-day hours logging for sub-contractors.
--
-- Why a new table (not a column on work_order_sub_contractors):
--   0023 modelled the join as a strict 1-row-per-(WO, sub) assignment
--   with a UNIQUE on (work_order_id, sub_contractor_id) and a GENERATED
--   STORED duration_minutes column derived from started_at/completed_at.
--   That fits a single shift but does not fit reality: Lead Tech needs
--   to log multiple sessions per day, often after the fact, sometimes
--   with notes per session. Repurposing the assignment row would mean
--   dropping the UNIQUE + the GENERATED column and forcing a single
--   "day" interpretation onto two timestamptz fields — all destructive.
--
-- Cleaner: keep the assignment row as the canonical "this sub is on
-- this WO" record, and layer an event log on top.
--
-- Relationship to existing infrastructure:
--   • Composite FK to work_order_sub_contractors(work_order_id,
--     sub_contractor_id) — guarantees you can't log hours for a sub
--     who isn't on the WO. The UNIQUE that backs this FK already
--     exists from 0023 as wos_uniq_wo_sub.
--   • ON DELETE CASCADE on both the assignment FK and the direct WO/
--     sub FKs — unassigning a sub or deleting a WO cleans up the log.
--   • RLS mirrors wos_read for SELECT (everyone who can see the WO
--     can see its hours log). Write policy mirrors wos_write with the
--     extra rule that lead_workers can only edit/delete entries they
--     personally logged.
--
-- NOT enforced at the DB (left to the UI per spec):
--   • entry_date >= sub's assigned_at date — checked in the modal.
--     A DB CHECK would need a subquery (not allowed in CHECK).
--   • Future-dated entries — checked in the modal.
--   • Cumulative hours per sub per day cap — there's no cap; spec
--     allows multiple sessions per day.
--
-- Single BEGIN/COMMIT. Idempotent. No enum mutations.
-- ============================================================

begin;

-- ============================================================
-- 1) Table
-- ============================================================
create table if not exists public.work_order_sub_contractor_hours (
  id                 uuid primary key default gen_random_uuid(),
  work_order_id      uuid not null references public.work_orders(id) on delete cascade,
  sub_contractor_id  uuid not null references public.sub_contractors(id) on delete cascade,
  entry_date         date not null,
  hours              numeric(5,2) not null,
  notes              text,
  logged_by          uuid references public.users(id) on delete set null,
  logged_at          timestamptz not null default now(),

  constraint wosh_chk_hours_range
    check (hours > 0 and hours <= 24),

  -- The (WO, sub) pair must already exist in the assignment table.
  -- Backed by wos_uniq_wo_sub (UNIQUE on the same column pair, 0023:132).
  constraint wosh_assignment_exists
    foreign key (work_order_id, sub_contractor_id)
    references public.work_order_sub_contractors(work_order_id, sub_contractor_id)
    on delete cascade
);

-- ============================================================
-- 2) Indexes
-- ============================================================
create index if not exists idx_wosh_wo
  on public.work_order_sub_contractor_hours(work_order_id);

create index if not exists idx_wosh_sub
  on public.work_order_sub_contractor_hours(sub_contractor_id);

create index if not exists idx_wosh_date
  on public.work_order_sub_contractor_hours(entry_date);

-- ============================================================
-- 3) RLS
--
-- wosh_read: anyone who can see the parent WO can see its hours log.
--            Allowlist mirrors wos_read from 0023.
--
-- wosh_write: md / admin / manager always. lead_worker can INSERT for
--             WOs they lead (the app sets logged_by = me on insert);
--             for UPDATE/DELETE lead_worker is additionally restricted
--             to rows where logged_by = me (so one Lead Tech can't
--             rewrite another's history on the same WO).
--
-- How the 2-policy single-WITH-CHECK shape achieves the UPDATE/DELETE
-- vs INSERT split for lead_worker:
--   • USING applies to SELECT/UPDATE/DELETE.
--     We add `logged_by = fn_my_id()` for lead_worker so they can only
--     touch rows they logged.
--   • WITH CHECK applies to INSERT/UPDATE (the post-write state).
--     We OMIT `logged_by = fn_my_id()` so lead_worker can INSERT
--     (logged_by is set on insert) and can also keep editing their
--     own rows without re-asserting the same condition twice.
--   • SELECT visibility comes from wosh_read which has the broad
--     allowlist, so lead_worker still sees everyone's entries on
--     their WO even though wosh_write's USING is narrower for them.
-- ============================================================
alter table public.work_order_sub_contractor_hours enable row level security;

drop policy if exists wosh_read on public.work_order_sub_contractor_hours;
create policy wosh_read on public.work_order_sub_contractor_hours for select using (
  fn_is_md_or_admin()
  or fn_my_role() in ('manager','service_support','accounts','sales','lead_worker','estimator')
  or exists (
        select 1 from public.work_orders w
         where w.id = work_order_sub_contractor_hours.work_order_id
           and (
                 w.assigned_lead = fn_my_id()
                 or exists (
                       select 1 from public.work_order_assignments a
                        where a.work_order_id = w.id and a.user_id = fn_my_id()
                     )
               )
     )
);

drop policy if exists wosh_write on public.work_order_sub_contractor_hours;
create policy wosh_write on public.work_order_sub_contractor_hours for all
  using (
    fn_is_md_or_admin()
    or fn_my_role() = 'manager'
    or (
         fn_my_role() = 'lead_worker'
         and logged_by = fn_my_id()
         and exists (
               select 1 from public.work_orders w
                where w.id = work_order_sub_contractor_hours.work_order_id
                  and w.assigned_lead = fn_my_id()
             )
       )
  )
  with check (
    fn_is_md_or_admin()
    or fn_my_role() = 'manager'
    or (
         fn_my_role() = 'lead_worker'
         and exists (
               select 1 from public.work_orders w
                where w.id = work_order_sub_contractor_hours.work_order_id
                  and w.assigned_lead = fn_my_id()
             )
       )
  );

-- ============================================================
-- 4) Smoke test
-- ============================================================
do $$
declare
  v_table        boolean;
  v_fk_composite int;
  v_idx_count    int;
  v_pol_count    int;
  v_check_hours  int;
  v_rls_enabled  boolean;
begin
  -- table exists
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public'
       and table_name   = 'work_order_sub_contractor_hours'
  ) into v_table;

  -- composite FK to work_order_sub_contractors (by name)
  select count(*) from pg_constraint
   where conrelid = 'public.work_order_sub_contractor_hours'::regclass
     and conname  = 'wosh_assignment_exists'
     and contype  = 'f'
   into v_fk_composite;

  -- indexes (by name)
  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in ('idx_wosh_wo','idx_wosh_sub','idx_wosh_date')
   into v_idx_count;

  -- RLS policies (by name)
  select count(*) from pg_policies
   where schemaname = 'public'
     and tablename  = 'work_order_sub_contractor_hours'
     and policyname in ('wosh_read','wosh_write')
   into v_pol_count;

  -- hours range CHECK constraint
  select count(*) from pg_constraint
   where conrelid = 'public.work_order_sub_contractor_hours'::regclass
     and conname  = 'wosh_chk_hours_range'
     and contype  = 'c'
   into v_check_hours;

  -- RLS actually enabled
  select relrowsecurity from pg_class
   where oid = 'public.work_order_sub_contractor_hours'::regclass
   into v_rls_enabled;

  raise notice '─── 0026 smoke test ───';
  raise notice '  table exists                 = % (expect t)', v_table;
  raise notice '  wosh_assignment_exists FK    = % (expect 1)', v_fk_composite;
  raise notice '  support indexes              = % (expect 3)', v_idx_count;
  raise notice '  RLS policies                 = % (expect 2)', v_pol_count;
  raise notice '  wosh_chk_hours_range CHECK   = % (expect 1)', v_check_hours;
  raise notice '  RLS enabled                  = % (expect t)', v_rls_enabled;

  if not v_table then
    raise exception '0026: work_order_sub_contractor_hours table missing';
  end if;
  if v_fk_composite <> 1 then
    raise exception '0026: composite FK wosh_assignment_exists missing';
  end if;
  if v_idx_count <> 3 then
    raise exception '0026: expected 3 support indexes, found %', v_idx_count;
  end if;
  if v_pol_count <> 2 then
    raise exception '0026: expected 2 RLS policies, found %', v_pol_count;
  end if;
  if v_check_hours <> 1 then
    raise exception '0026: wosh_chk_hours_range CHECK constraint missing';
  end if;
  if not v_rls_enabled then
    raise exception '0026: RLS not enabled on work_order_sub_contractor_hours';
  end if;

  raise notice '─── 0026 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm composite FK rejects logging for an unassigned sub:
-- --    (Replace <wo-id> with a real WO and <sub-id> with a sub NOT on it.)
-- insert into public.work_order_sub_contractor_hours
--   (work_order_id, sub_contractor_id, entry_date, hours)
-- values ('<wo-id>', '<sub-id>', current_date, 4);
-- --    Expect: insert or update on table … violates foreign key
-- --            constraint "wosh_assignment_exists".
--
-- -- 2. After assigning the sub to the WO, the same insert should succeed:
-- insert into public.work_order_sub_contractors (work_order_id, sub_contractor_id)
-- values ('<wo-id>', '<sub-id>');
-- insert into public.work_order_sub_contractor_hours
--   (work_order_id, sub_contractor_id, entry_date, hours, notes)
-- values ('<wo-id>', '<sub-id>', current_date, 6.5, 'morning shift')
-- returning id, hours;
--
-- -- 3. Multiple entries on the same day for the same (WO, sub):
-- insert into public.work_order_sub_contractor_hours
--   (work_order_id, sub_contractor_id, entry_date, hours, notes)
-- values ('<wo-id>', '<sub-id>', current_date, 2.0, 'afternoon recall');
-- --    Expect: succeeds (no unique constraint blocks it).
--
-- -- 4. hours range CHECK:
-- insert into public.work_order_sub_contractor_hours
--   (work_order_id, sub_contractor_id, entry_date, hours)
-- values ('<wo-id>', '<sub-id>', current_date, 25);
-- --    Expect: violates wosh_chk_hours_range.
-- insert into public.work_order_sub_contractor_hours
--   (work_order_id, sub_contractor_id, entry_date, hours)
-- values ('<wo-id>', '<sub-id>', current_date, 0);
-- --    Expect: violates wosh_chk_hours_range.
--
-- -- 5. Cascade — removing the assignment row clears its hours:
-- delete from public.work_order_sub_contractors
--  where work_order_id = '<wo-id>' and sub_contractor_id = '<sub-id>';
-- --    Then verify:
-- select count(*) from public.work_order_sub_contractor_hours
--  where work_order_id = '<wo-id>' and sub_contractor_id = '<sub-id>';
-- --    Expect 0.
--
-- ============================================================
