-- ============================================================
-- 0022 — Per-worker time tracking on Work Orders
--
-- Boss's #1 missing feature: "there is no time tracking, there is no
-- place for tracking the subcontractor details and how many hours they
-- worked". This migration covers the time-tracking half (the
-- sub-contractor side ships separately in 0023 so each step can be
-- verified independently).
--
-- Existing infrastructure DELIBERATELY REUSED (not duplicated):
--
--   work_orders.elapsed_min int default 0          (0001:251)
--     ─ legacy free-text/manual minutes from the original prototype.
--       Kept untouched. We add `duration_minutes` as a separate
--       trigger-computed field so the existing dashboard widgets that
--       read elapsed_min keep working.
--   work_orders.status wo_status                   (0014)
--     ─ 'in_progress' / 'done' / 'closed' transitions are still owned
--       by the app's existing updateWorkOrder helper. We don't trigger
--       status flips from this migration.
--   wo_write policy                                (0001:631-634)
--     ─ md/admin/manager/lead_worker can UPDATE work_orders. The new
--       columns are covered by that same policy; no policy change here.
--   fn_my_id / fn_my_role / fn_is_md_or_admin      (0001:500-512)
--     ─ standard helpers; reused unchanged.
--
-- What this migration ADDS (net new):
--   • work_orders.started_at         timestamptz  — first Start click
--   • work_orders.completed_at       timestamptz  — Mark WO Done click
--   • work_orders.duration_minutes   int default 0 — trigger-computed
--                                                   sum across entries
--   • work_orders.actual_workers_count int        — trigger-computed
--                                                   count of distinct
--                                                   workers who logged
--                                                   any time
--   • work_order_time_entries table              — one row per
--                                                   worker × session
--   • fn_recalc_work_order_duration(uuid)         — helper that
--                                                   recomputes the
--                                                   four WO-level
--                                                   roll-ups
--   • trg_woe_recalc trigger                      — fires on entries
--                                                   table to keep
--                                                   the roll-ups in
--                                                   sync
--   • RLS: woe_read / woe_write on the entries table
--
-- Edge cases covered at the DB level (so the app can't accidentally
-- create them):
--   • CHECK (ended_at IS NULL OR ended_at >= started_at)
--       — protects against clock-skew / negative durations.
--   • partial UNIQUE index on (work_order_id, user_id) WHERE
--     ended_at IS NULL
--       — at most ONE open session per worker per WO. Worker clicks
--         Start twice → second insert returns a unique-violation that
--         the UI catches and treats as a no-op.
--   • duration_minutes is a GENERATED column clamped to >= 0
--       — no app-side math, no negative roll-ups even if a session
--         was set to ended_at < started_at before the CHECK existed.
--
-- Single BEGIN/COMMIT. Fully idempotent — every CREATE / ALTER uses
-- IF NOT EXISTS, every CREATE OR REPLACE FUNCTION is safe to re-run.
-- ============================================================

begin;

-- ============================================================
-- 1) New columns on work_orders
-- ============================================================
alter table public.work_orders
  add column if not exists started_at timestamptz;

alter table public.work_orders
  add column if not exists completed_at timestamptz;

alter table public.work_orders
  add column if not exists duration_minutes int not null default 0;

alter table public.work_orders
  add column if not exists actual_workers_count int not null default 0;

-- ============================================================
-- 2) Per-worker time entries
--    One row per (worker, session). Designed for parallel timers:
--    two workers on the same WO each insert their own row when they
--    click Start; their durations sum into work_orders.duration_minutes
--    via the trigger below.
--
--    user_id ON DELETE SET NULL keeps the row visible for audit even
--    if the worker is later removed from the users table. The row
--    counts in duration but not in actual_workers_count (NULL excluded
--    from COUNT DISTINCT).
-- ============================================================
create table if not exists public.work_order_time_entries (
  id                uuid primary key default gen_random_uuid(),
  work_order_id     uuid not null references public.work_orders(id) on delete cascade,
  user_id           uuid references public.users(id) on delete set null,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  duration_minutes  int generated always as (
                      case
                        when ended_at is not null
                        then greatest(0, (extract(epoch from (ended_at - started_at))::int) / 60)
                        else 0
                      end
                    ) stored,
  note              text,
  created_at        timestamptz not null default now(),
  constraint woe_chk_end_after_start check (ended_at is null or ended_at >= started_at)
);

create index if not exists idx_woe_wo   on public.work_order_time_entries(work_order_id);
create index if not exists idx_woe_user on public.work_order_time_entries(user_id) where user_id is not null;
create index if not exists idx_woe_open on public.work_order_time_entries(work_order_id, user_id) where ended_at is null;

-- One open session per (work_order, user). Prevents double-Start.
create unique index if not exists woe_uniq_open
  on public.work_order_time_entries(work_order_id, user_id)
  where ended_at is null and user_id is not null;

-- ============================================================
-- 3) Recalculation helper
--    Reads completed entries (ended_at IS NOT NULL), sums their
--    durations, counts distinct workers, and back-fills the WO row.
--    Also lifts started_at on the WO from the earliest entry — that
--    way the timer banner on the detail page shows "started Xm ago"
--    even if the row was created hours earlier.
--    completed_at is intentionally NOT set here; it represents the
--    explicit "Mark WO Done" moment and is owned by the app's
--    completeWorkOrder helper.
-- ============================================================
create or replace function public.fn_recalc_work_order_duration(p_wo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sum   int;
  v_count int;
  v_first timestamptz;
begin
  select coalesce(sum(duration_minutes), 0),
         count(distinct user_id) filter (where user_id is not null),
         min(started_at)
    into v_sum, v_count, v_first
    from public.work_order_time_entries
   where work_order_id = p_wo_id;

  update public.work_orders
     set duration_minutes     = v_sum,
         actual_workers_count = v_count,
         started_at           = coalesce(started_at, v_first)
   where id = p_wo_id;
end;
$$;

alter function public.fn_recalc_work_order_duration(uuid) owner to postgres;

-- Trigger wrapper — translates row events into a single helper call.
-- AFTER means duration_minutes (generated column) is fresh when we
-- read it back.
create or replace function public.fn_trg_woe_recalc()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_recalc_work_order_duration(old.work_order_id);
    return old;
  else
    perform public.fn_recalc_work_order_duration(new.work_order_id);
    -- If both old and new exist and the row moved between WOs (shouldn't
    -- happen via the app, but defensive), refresh the old WO too.
    if tg_op = 'UPDATE' and new.work_order_id <> old.work_order_id then
      perform public.fn_recalc_work_order_duration(old.work_order_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_woe_recalc on public.work_order_time_entries;
create trigger trg_woe_recalc
after insert or update or delete on public.work_order_time_entries
for each row execute function public.fn_trg_woe_recalc();

-- ============================================================
-- 4) RLS — time entries
--    READ: md/admin/manager/accounts/service_support always.
--          A row owner (user_id = me) can always read their own.
--          A Lead Tech can read entries on a WO they lead OR are
--          assigned to (mirrors wo_read).
--    WRITE: md/admin/manager always.
--           A row owner can INSERT/UPDATE/DELETE their own row IFF
--           they're assigned to the WO (as lead or in
--           work_order_assignments). This is how a regular worker
--           can clock in/out without us widening wo_write.
-- ============================================================
alter table public.work_order_time_entries enable row level security;

drop policy if exists woe_read on public.work_order_time_entries;
create policy woe_read on public.work_order_time_entries for select using (
  fn_is_md_or_admin()
  or fn_my_role() in ('manager','accounts','service_support')
  or user_id = fn_my_id()
  or exists (
        select 1 from public.work_orders w
         where w.id = work_order_time_entries.work_order_id
           and (
                 w.assigned_lead = fn_my_id()
                 or exists (
                       select 1 from public.work_order_assignments a
                        where a.work_order_id = w.id and a.user_id = fn_my_id()
                     )
               )
     )
);

drop policy if exists woe_write on public.work_order_time_entries;
create policy woe_write on public.work_order_time_entries for all
  using (
    fn_is_md_or_admin()
    or fn_my_role() = 'manager'
    or (
         user_id = fn_my_id()
         and exists (
               select 1 from public.work_orders w
                where w.id = work_order_time_entries.work_order_id
                  and (
                        w.assigned_lead = fn_my_id()
                        or exists (
                              select 1 from public.work_order_assignments a
                               where a.work_order_id = w.id and a.user_id = fn_my_id()
                            )
                      )
             )
       )
  )
  with check (
    fn_is_md_or_admin()
    or fn_my_role() = 'manager'
    or (
         user_id = fn_my_id()
         and exists (
               select 1 from public.work_orders w
                where w.id = work_order_time_entries.work_order_id
                  and (
                        w.assigned_lead = fn_my_id()
                        or exists (
                              select 1 from public.work_order_assignments a
                               where a.work_order_id = w.id and a.user_id = fn_my_id()
                            )
                      )
             )
       )
  );

-- ============================================================
-- 5) Smoke test — every assertion has a specific failure path so the
--    migration aborts rather than half-applying.
-- ============================================================
do $$
declare
  v_wo_cols     int;
  v_table       boolean;
  v_idx         int;
  v_uniq        int;
  v_recalc_fn   boolean;
  v_trg_fn      boolean;
  v_trigger     int;
  v_pol_read    boolean;
  v_pol_write   boolean;
  v_rls_on      boolean;
  v_check       int;
  v_elapsed_min boolean;
begin
  -- new work_orders columns
  select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'work_orders'
     and column_name in ('started_at','completed_at','duration_minutes','actual_workers_count')
   into v_wo_cols;

  -- entries table
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'work_order_time_entries'
  ) into v_table;

  -- indexes (3 simple + 1 unique partial)
  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in ('idx_woe_wo','idx_woe_user','idx_woe_open')
   into v_idx;

  select count(*) from pg_indexes
   where schemaname = 'public' and indexname = 'woe_uniq_open'
   into v_uniq;

  -- helper functions
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_recalc_work_order_duration'
  ) into v_recalc_fn;

  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_trg_woe_recalc'
  ) into v_trg_fn;

  -- trigger
  select count(*) from pg_trigger
   where tgrelid = 'public.work_order_time_entries'::regclass
     and tgname  = 'trg_woe_recalc'
   into v_trigger;

  -- policies
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'work_order_time_entries' and policyname = 'woe_read'
  ) into v_pol_read;
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'work_order_time_entries' and policyname = 'woe_write'
  ) into v_pol_write;

  -- RLS is actually ON
  select relrowsecurity from pg_class
   where oid = 'public.work_order_time_entries'::regclass
   into v_rls_on;

  -- CHECK constraint installed
  select count(*) from pg_constraint
   where conrelid = 'public.work_order_time_entries'::regclass
     and conname  = 'woe_chk_end_after_start'
   into v_check;

  -- legacy elapsed_min still present (we must NOT have dropped it)
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'work_orders' and column_name = 'elapsed_min'
  ) into v_elapsed_min;

  raise notice '─── 0022 smoke test ───';
  raise notice '  new work_orders columns           = % (expect 4)', v_wo_cols;
  raise notice '  work_order_time_entries table     = %', v_table;
  raise notice '  woe support indexes               = % (expect 3)', v_idx;
  raise notice '  woe_uniq_open partial unique idx  = % (expect 1)', v_uniq;
  raise notice '  fn_recalc_work_order_duration     = %', v_recalc_fn;
  raise notice '  fn_trg_woe_recalc                 = %', v_trg_fn;
  raise notice '  trg_woe_recalc on entries         = % (expect 1)', v_trigger;
  raise notice '  RLS woe_read policy               = %', v_pol_read;
  raise notice '  RLS woe_write policy              = %', v_pol_write;
  raise notice '  RLS enabled on entries table      = %', v_rls_on;
  raise notice '  CHECK woe_chk_end_after_start     = % (expect 1)', v_check;
  raise notice '  legacy elapsed_min intact         = %', v_elapsed_min;

  if v_wo_cols <> 4 then
    raise exception '0022: expected 4 new columns on work_orders, found %', v_wo_cols;
  end if;
  if not v_table then
    raise exception '0022: work_order_time_entries table missing';
  end if;
  if v_idx <> 3 then
    raise exception '0022: expected 3 support indexes (idx_woe_wo, idx_woe_user, idx_woe_open), found %', v_idx;
  end if;
  if v_uniq <> 1 then
    raise exception '0022: woe_uniq_open partial unique index missing';
  end if;
  if not v_recalc_fn then
    raise exception '0022: fn_recalc_work_order_duration() missing';
  end if;
  if not v_trg_fn then
    raise exception '0022: fn_trg_woe_recalc() missing';
  end if;
  if v_trigger <> 1 then
    raise exception '0022: trg_woe_recalc trigger not installed';
  end if;
  if not v_pol_read then
    raise exception '0022: woe_read RLS policy missing';
  end if;
  if not v_pol_write then
    raise exception '0022: woe_write RLS policy missing';
  end if;
  if not v_rls_on then
    raise exception '0022: RLS not enabled on work_order_time_entries';
  end if;
  if v_check <> 1 then
    raise exception '0022: woe_chk_end_after_start constraint missing';
  end if;
  if not v_elapsed_min then
    raise exception '0022: legacy work_orders.elapsed_min was dropped — that breaks existing dashboard widgets';
  end if;

  raise notice '─── 0022 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm new columns + types on work_orders:
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'work_orders'
--    and column_name in ('started_at','completed_at','duration_minutes','actual_workers_count')
--  order by column_name;
--
-- -- 2. Confirm entries table shape:
-- select column_name, data_type, is_nullable, column_default,
--        is_generated, generation_expression
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'work_order_time_entries'
--  order by ordinal_position;
--
-- -- 3. Round-trip a session against a real WO (replace <wo-id> + <user-id>):
-- --    a) Insert an open session.
-- insert into public.work_order_time_entries (work_order_id, user_id, started_at)
-- values ('<wo-id>', '<user-id>', now() - interval '90 minutes')
-- returning id, duration_minutes;
-- --    Expect duration_minutes = 0 (still open).
-- --
-- --    b) Close it.
-- update public.work_order_time_entries
--    set ended_at = now()
--  where work_order_id = '<wo-id>' and user_id = '<user-id>' and ended_at is null
-- returning id, duration_minutes;
-- --    Expect duration_minutes ≈ 90.
-- --
-- --    c) Confirm the trigger updated the WO roll-up:
-- select duration_minutes, actual_workers_count, started_at
--   from public.work_orders where id = '<wo-id>';
-- --    Expect duration_minutes ≈ 90, actual_workers_count = 1.
-- --
-- --    d) Cleanup:
-- delete from public.work_order_time_entries
--  where work_order_id = '<wo-id>' and user_id = '<user-id>';
--
-- -- 4. Confirm double-Start is blocked:
-- insert into public.work_order_time_entries (work_order_id, user_id, started_at)
-- values ('<wo-id>', '<user-id>', now());
-- insert into public.work_order_time_entries (work_order_id, user_id, started_at)
-- values ('<wo-id>', '<user-id>', now());  -- expect: duplicate key violates woe_uniq_open
-- delete from public.work_order_time_entries
--  where work_order_id = '<wo-id>' and user_id = '<user-id>';
--
-- ============================================================
