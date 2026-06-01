-- ============================================================
-- 0023 — Sub-contractor directory + WO assignment + time tracking
--
-- Boss's #1 missing feature (second half): tracking sub-contractor
-- details and the hours they worked. 0022 covered employee time
-- tracking; this migration covers external sub-contractors who don't
-- have user accounts (no login, no auth.users row, no public.users row)
-- but still need their hours and assignments captured.
--
-- Naming distinction (important — these are two different concepts):
--
--   role enum value 'subcontractor'         (0001:16)
--     ─ a SINGULAR external user who DOES have a login and shows up
--       in public.users. Rare. Used when a subcontractor is part of
--       the day-to-day crew and signs in to the app.
--
--   sub_contractors TABLE (this migration)
--     ─ a directory of external contractor profiles (typically
--       individuals from a third-party company) with NO login. Stored
--       so we can: (a) list them in a "+ Add sub-contractor" picker
--       on the WO form, (b) track who actually worked, (c) sum hours
--       for reports, (d) keep the Emirates ID / phone for HR / labour
--       compliance audits.
--
--   They are intentionally separate: the row in this directory does
--   not need to match a users row, and the same physical person could
--   be in both (rare). The frontend will show them as "Sub-contractor"
--   on the WO assignment list alongside regular workers.
--
-- Existing infrastructure DELIBERATELY REUSED (not duplicated):
--   work_orders                            (0001:235) — FK target
--   fn_my_id / fn_my_role / fn_is_md_or_admin (0001:500-512)
--   GENERATED duration_minutes pattern     (0022 → mirrored here)
--   public.users(id)                       (0001:30) — for created_by
--                                                      audit pointer
--
-- What this migration ADDS (net new):
--   • sub_contractors table                 — directory of profiles
--   • work_order_sub_contractors table      — many-to-many WO ↔ sub
--                                             with own time-tracking
--                                             columns (sub-contractors
--                                             don't write to
--                                             work_order_time_entries
--                                             from 0022 — that table
--                                             keys on user_id which
--                                             they don't have).
--   • indexes for the common lookups
--   • RLS policies (read: all operational roles; write: md/admin/
--     manager; lead_worker can write the join row for WOs they lead)
--
-- Edge cases covered at the DB level:
--   • UNIQUE partial index on emirates_id WHERE emirates_id IS NOT NULL
--       — multiple sub-contractors without an ID don't collide; one
--         with an ID can't be duplicated.
--   • is_active boolean default true
--       — soft delete. Existing assignments stay visible; the app
--         hides inactive profiles from the "add to WO" picker.
--   • CHECK (completed_at IS NULL OR started_at IS NOT NULL)
--       — can't complete a session that was never started.
--   • CHECK (completed_at IS NULL OR completed_at >= started_at)
--       — protects against clock skew.
--   • duration_minutes is a GENERATED column clamped to >= 0
--       — mirrors the work_order_time_entries pattern from 0022.
--
-- NOT enforced at the DB (left to the UI):
--   • Emirates ID format ("784-YYYY-XXXXXXX-X" or 15 raw digits) —
--     spec says soft validation only.
--   • Phone format (+971…) — same reason.
--   • Name+company duplicates — spec says "warn but allow".
--   • Blocking new assignments to inactive sub-contractors — UI gates
--     the picker; the join row INSERT remains possible for any sub
--     so backfills/imports work.
--
-- Single BEGIN/COMMIT. Idempotent. No enum mutations.
-- ============================================================

begin;

-- ============================================================
-- 1) sub_contractors directory
-- ============================================================
create table if not exists public.sub_contractors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text,
  emirates_id   text,
  company       text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id) on delete set null
);

-- Partial unique on emirates_id — multiple NULLs allowed, real IDs unique.
create unique index if not exists sub_uniq_emirates_id
  on public.sub_contractors(emirates_id)
  where emirates_id is not null;

create index if not exists idx_sub_company   on public.sub_contractors(company)
  where company is not null;
create index if not exists idx_sub_active    on public.sub_contractors(is_active)
  where is_active = true;
create index if not exists idx_sub_name_lower on public.sub_contractors(lower(name));

-- ============================================================
-- 2) work_order_sub_contractors — assignment + time tracking
--    One row per (work_order, sub_contractor) pair. Same sub on
--    two WOs → two rows, tracked independently (edge case 8).
--    Assignment of the same sub to the same WO twice is blocked
--    by the (work_order_id, sub_contractor_id) UNIQUE below.
-- ============================================================
create table if not exists public.work_order_sub_contractors (
  id                 uuid primary key default gen_random_uuid(),
  work_order_id      uuid not null references public.work_orders(id) on delete cascade,
  sub_contractor_id  uuid not null references public.sub_contractors(id) on delete cascade,
  assigned_at        timestamptz not null default now(),
  assigned_by        uuid references public.users(id) on delete set null,
  started_at         timestamptz,
  completed_at       timestamptz,
  duration_minutes   int generated always as (
                       case
                         when completed_at is not null and started_at is not null
                         then greatest(0, (extract(epoch from (completed_at - started_at))::int) / 60)
                         else 0
                       end
                     ) stored,
  note               text,
  constraint wos_chk_completed_needs_started
    check (completed_at is null or started_at is not null),
  constraint wos_chk_completed_after_started
    check (completed_at is null or completed_at >= started_at),
  constraint wos_uniq_wo_sub unique (work_order_id, sub_contractor_id)
);

create index if not exists idx_wos_wo  on public.work_order_sub_contractors(work_order_id);
create index if not exists idx_wos_sub on public.work_order_sub_contractors(sub_contractor_id);
-- Active sessions for the "currently working" widget.
create index if not exists idx_wos_open
  on public.work_order_sub_contractors(work_order_id)
  where started_at is not null and completed_at is null;

-- ============================================================
-- 3) RLS — sub_contractors directory
--    READ: every operational role can see the directory (so the
--          WO picker is usable, and so Reports can name them).
--          super_admin / customer roles are NOT listed — super_admin
--          shouldn't have operational write access by design; customer
--          users shouldn't see internal HR data.
--    WRITE: md / admin / manager only (matches who currently writes
--           work_orders).
-- ============================================================
alter table public.sub_contractors enable row level security;

drop policy if exists sub_read on public.sub_contractors;
create policy sub_read on public.sub_contractors for select using (
  fn_is_md_or_admin()
  or fn_my_role() in (
       'manager','accounts','service_support','sales','estimator',
       'lead_worker','worker','driver','subcontractor'
     )
);

drop policy if exists sub_write on public.sub_contractors;
create policy sub_write on public.sub_contractors for all
  using (fn_is_md_or_admin() or fn_my_role() = 'manager')
  with check (fn_is_md_or_admin() or fn_my_role() = 'manager');

-- ============================================================
-- 4) RLS — work_order_sub_contractors join
--    READ: anyone who can read the parent WO can read its sub
--          assignments. Mirrors wo_read (0001:625-630).
--    WRITE: md / admin / manager always. Lead Tech can assign /
--           track time for subs on a WO they lead (mirrors how
--           wo_write lets lead_worker manage their own jobs).
-- ============================================================
alter table public.work_order_sub_contractors enable row level security;

drop policy if exists wos_read on public.work_order_sub_contractors;
create policy wos_read on public.work_order_sub_contractors for select using (
  fn_is_md_or_admin()
  or fn_my_role() in ('manager','service_support','accounts','sales','lead_worker','estimator')
  or exists (
        select 1 from public.work_orders w
         where w.id = work_order_sub_contractors.work_order_id
           and (
                 w.assigned_lead = fn_my_id()
                 or exists (
                       select 1 from public.work_order_assignments a
                        where a.work_order_id = w.id and a.user_id = fn_my_id()
                     )
               )
     )
);

drop policy if exists wos_write on public.work_order_sub_contractors;
create policy wos_write on public.work_order_sub_contractors for all
  using (
    fn_is_md_or_admin()
    or fn_my_role() = 'manager'
    or (
         fn_my_role() = 'lead_worker'
         and exists (
               select 1 from public.work_orders w
                where w.id = work_order_sub_contractors.work_order_id
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
                where w.id = work_order_sub_contractors.work_order_id
                  and w.assigned_lead = fn_my_id()
             )
       )
  );

-- ============================================================
-- 5) Smoke test
-- ============================================================
do $$
declare
  v_sub_table     boolean;
  v_wos_table     boolean;
  v_sub_cols      int;
  v_wos_cols      int;
  v_sub_idx       int;
  v_wos_idx       int;
  v_sub_uniq      int;
  v_wos_uniq      int;
  v_sub_checks    int;
  v_wos_checks    int;
  v_pol_sub_read  boolean;
  v_pol_sub_write boolean;
  v_pol_wos_read  boolean;
  v_pol_wos_write boolean;
  v_rls_sub       boolean;
  v_rls_wos       boolean;
  v_sub_role      boolean;
  v_wo_fk         int;
begin
  -- tables
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'sub_contractors'
  ) into v_sub_table;

  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'work_order_sub_contractors'
  ) into v_wos_table;

  -- column counts (only check the ones that must exist)
  select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'sub_contractors'
     and column_name in ('id','name','phone','emirates_id','company','notes',
                         'is_active','created_at','created_by')
   into v_sub_cols;

  select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'work_order_sub_contractors'
     and column_name in ('id','work_order_id','sub_contractor_id','assigned_at',
                         'assigned_by','started_at','completed_at',
                         'duration_minutes','note')
   into v_wos_cols;

  -- indexes
  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in ('idx_sub_company','idx_sub_active','idx_sub_name_lower')
   into v_sub_idx;

  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in ('idx_wos_wo','idx_wos_sub','idx_wos_open')
   into v_wos_idx;

  select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'sub_uniq_emirates_id'
   into v_sub_uniq;

  -- wos_uniq_wo_sub is a UNIQUE constraint — count the constraint, not the index.
  select count(*) from pg_constraint
   where conrelid = 'public.work_order_sub_contractors'::regclass
     and conname  = 'wos_uniq_wo_sub'
   into v_wos_uniq;

  -- CHECK constraints on the join table
  select count(*) from pg_constraint
   where conrelid = 'public.work_order_sub_contractors'::regclass
     and conname in ('wos_chk_completed_needs_started','wos_chk_completed_after_started')
   into v_wos_checks;

  -- (no CHECKs on sub_contractors today, but include the slot in case
  -- we add format checks later)
  v_sub_checks := 0;

  -- policies
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sub_contractors' and policyname = 'sub_read'
  ) into v_pol_sub_read;
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sub_contractors' and policyname = 'sub_write'
  ) into v_pol_sub_write;
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'work_order_sub_contractors' and policyname = 'wos_read'
  ) into v_pol_wos_read;
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'work_order_sub_contractors' and policyname = 'wos_write'
  ) into v_pol_wos_write;

  -- RLS actually enabled
  select relrowsecurity from pg_class
   where oid = 'public.sub_contractors'::regclass
   into v_rls_sub;
  select relrowsecurity from pg_class
   where oid = 'public.work_order_sub_contractors'::regclass
   into v_rls_wos;

  -- The 'subcontractor' role enum value must still exist — we reference
  -- it in sub_read (the auth-able-subcontractor variant). If it's been
  -- renamed/dropped, the policy compiles but fails at runtime.
  select exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'role' and e.enumlabel = 'subcontractor'
  ) into v_sub_role;

  -- FK from join table to work_orders must exist (delete-cascade so the
  -- assignment dies with the WO).
  select count(*) from pg_constraint
   where conrelid = 'public.work_order_sub_contractors'::regclass
     and contype  = 'f'
     and confrelid = 'public.work_orders'::regclass
   into v_wo_fk;

  raise notice '─── 0023 smoke test ───';
  raise notice '  sub_contractors table              = %', v_sub_table;
  raise notice '  work_order_sub_contractors table   = %', v_wos_table;
  raise notice '  sub_contractors columns            = % (expect 9)', v_sub_cols;
  raise notice '  work_order_sub_contractors columns = % (expect 9)', v_wos_cols;
  raise notice '  sub_contractors support indexes    = % (expect 3)', v_sub_idx;
  raise notice '  join table support indexes         = % (expect 3)', v_wos_idx;
  raise notice '  sub_uniq_emirates_id (partial)     = % (expect 1)', v_sub_uniq;
  raise notice '  wos_uniq_wo_sub UNIQUE constraint  = % (expect 1)', v_wos_uniq;
  raise notice '  join CHECK constraints             = % (expect 2)', v_wos_checks;
  raise notice '  sub_read policy                    = %', v_pol_sub_read;
  raise notice '  sub_write policy                   = %', v_pol_sub_write;
  raise notice '  wos_read policy                    = %', v_pol_wos_read;
  raise notice '  wos_write policy                   = %', v_pol_wos_write;
  raise notice '  RLS on sub_contractors             = %', v_rls_sub;
  raise notice '  RLS on join table                  = %', v_rls_wos;
  raise notice '  role enum ''subcontractor'' intact   = %', v_sub_role;
  raise notice '  FK join→work_orders                = % (expect 1)', v_wo_fk;

  if not v_sub_table then
    raise exception '0023: sub_contractors table missing';
  end if;
  if not v_wos_table then
    raise exception '0023: work_order_sub_contractors table missing';
  end if;
  if v_sub_cols <> 9 then
    raise exception '0023: expected 9 columns on sub_contractors, found %', v_sub_cols;
  end if;
  if v_wos_cols <> 9 then
    raise exception '0023: expected 9 columns on work_order_sub_contractors, found %', v_wos_cols;
  end if;
  if v_sub_idx <> 3 then
    raise exception '0023: expected 3 support indexes on sub_contractors, found %', v_sub_idx;
  end if;
  if v_wos_idx <> 3 then
    raise exception '0023: expected 3 support indexes on join table, found %', v_wos_idx;
  end if;
  if v_sub_uniq <> 1 then
    raise exception '0023: sub_uniq_emirates_id partial unique index missing';
  end if;
  if v_wos_uniq <> 1 then
    raise exception '0023: wos_uniq_wo_sub UNIQUE constraint missing';
  end if;
  if v_wos_checks <> 2 then
    raise exception '0023: expected 2 CHECK constraints on join table, found %', v_wos_checks;
  end if;
  if not v_pol_sub_read    then raise exception '0023: sub_read policy missing';    end if;
  if not v_pol_sub_write   then raise exception '0023: sub_write policy missing';   end if;
  if not v_pol_wos_read    then raise exception '0023: wos_read policy missing';    end if;
  if not v_pol_wos_write   then raise exception '0023: wos_write policy missing';   end if;
  if not v_rls_sub then
    raise exception '0023: RLS not enabled on sub_contractors';
  end if;
  if not v_rls_wos then
    raise exception '0023: RLS not enabled on work_order_sub_contractors';
  end if;
  if not v_sub_role then
    raise exception '0023: role enum value ''subcontractor'' missing — sub_read policy will fail at runtime';
  end if;
  if v_wo_fk < 1 then
    raise exception '0023: FK from work_order_sub_contractors to work_orders missing';
  end if;

  raise notice '─── 0023 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm both tables + their columns:
-- select table_name, column_name, data_type, is_nullable,
--        is_generated, generation_expression
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('sub_contractors','work_order_sub_contractors')
--  order by table_name, ordinal_position;
--
-- -- 2. Round-trip a directory entry:
-- insert into public.sub_contractors (name, phone, emirates_id, company)
-- values ('Test Sub', '+971501112233', '784-1990-1234567-1', 'Acme Subs LLC')
-- returning id, name, is_active;
--
-- -- 3. Assign to a real WO (replace <wo-id> with a real id):
-- insert into public.work_order_sub_contractors
--   (work_order_id, sub_contractor_id, started_at, completed_at)
-- select '<wo-id>', id, now() - interval '120 minutes', now()
--   from public.sub_contractors where name = 'Test Sub'
-- returning duration_minutes;
-- --    Expect duration_minutes ≈ 120.
--
-- -- 4. Confirm same-WO double-assign is blocked:
-- insert into public.work_order_sub_contractors (work_order_id, sub_contractor_id)
-- select '<wo-id>', id from public.sub_contractors where name = 'Test Sub';
-- --    Expect: duplicate key violates wos_uniq_wo_sub.
--
-- -- 5. Cleanup:
-- delete from public.work_order_sub_contractors
--  where sub_contractor_id in (select id from public.sub_contractors where name = 'Test Sub');
-- delete from public.sub_contractors where name = 'Test Sub';
--
-- -- 6. Confirm CHECK constraints reject bad data:
-- --    (a) completed before started — should fail:
-- insert into public.work_order_sub_contractors
--   (work_order_id, sub_contractor_id, started_at, completed_at)
-- values ('<wo-id>', '<sub-id>', now(), now() - interval '5 minutes');
-- --    (b) completed without started — should fail:
-- insert into public.work_order_sub_contractors
--   (work_order_id, sub_contractor_id, completed_at)
-- values ('<wo-id>', '<sub-id>', now());
--
-- ============================================================
