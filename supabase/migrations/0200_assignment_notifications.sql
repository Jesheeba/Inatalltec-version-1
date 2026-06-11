-- ============================================================
-- 0200 — Assignment notifications (re-installs migration 0036 work)
--
-- Slice N0 of the in-app notification fix.
--
-- WHY THIS EXISTS:
-- Migration 0036 (assignment_notifications) was authored months ago but
-- the audit done at the start of Slice N0 (queries A1–A4) confirmed it
-- was never applied to production. Result: the `notifications` table
-- has stayed empty since 0001, the bell UI renders nothing, and workers
-- never knew they were assigned. Every later notification migration
-- (Material Requests 0038, Material Submittal 0040, Shop Drawing 0042,
-- etc.) DID apply, so those flows have their own custom triggers — but
-- the foundational WO / AMC / project assignment events from 0036 were
-- silently absent.
--
-- WHY A FRESH 0200 INSTEAD OF RE-RUNNING 0036:
-- This session's migration allocation is 0200+ (the 0045–0199 range
-- belongs to the parallel Accountant Module session, which has already
-- shipped 0045–0047). Replaying 0036 with its original number would
-- read as out-of-order and risks a version-tracking collision. A
-- forward-only 0200 keeps history linear.
--
-- ONE INTENTIONAL DIVERGENCE FROM 0036:
-- Each per-trigger error swallow was
--     exception when others then null;     -- silent
-- here it becomes
--     exception when others then raise warning 'notify failed (%): %', tg_name, sqlerrm;
-- The intent — "never block the underlying write" — is preserved (we
-- still trap so the assignment row lands). What changes is that future
-- failures surface in `postgres_logs` instead of disappearing forever.
-- That single hidden-handler is exactly how 0036's never-applied state
-- went unnoticed until the boss feedback prompted this audit.
--
-- SCHEMA REFERENCES (verified live against the repo schema):
--   work_orders                : assigned_lead, code, title, scheduled_start,
--                                scheduled_end, status (wo_status enum)
--   work_order_assignments     : composite PK (work_order_id, user_id),
--                                no id column, no created_at column
--   work_order_sub_contractors : id, work_order_id, sub_contractor_id
--   sub_contractors            : name
--   amc_contracts              : id, code, lead_tech_id (added by 0018)
--   projects                   : id, code, name, lead_tech_id (0018),
--                                current_phase (0020)
--   users                      : id, full_name
--   notifications              : user_id, kind, title, body, target_kind,
--                                target_id (no INSERT policy — postgres
--                                role has BYPASSRLS, verified in audit D4)
--
-- IDEMPOTENT. Single txn. Smoke-tested end-to-end at the bottom — if
-- the test insert into work_order_assignments doesn't produce a
-- notification row, the entire transaction rolls back.
-- ============================================================

begin;

-- ── Shared helpers ──────────────────────────────────────────
-- Insert one notification, skipping self-notifications + null recipients.
create or replace function public.fn_notify(
  p_user        uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_target_kind text,
  p_target_id   uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if p_user = fn_my_id() then return; end if;   -- don't notify the actor
  insert into notifications (user_id, kind, title, body, target_kind, target_id)
  values (p_user, p_kind, p_title, p_body, p_target_kind, p_target_id);
end $$;
alter function public.fn_notify(uuid, text, text, text, text, uuid) owner to postgres;

-- Display name of whoever triggered the change (best-effort).
create or replace function public.fn_actor_name() returns text
language sql security definer set search_path = public as $$
  select coalesce((select full_name from users where id = fn_my_id()), 'Someone');
$$;
alter function public.fn_actor_name() owner to postgres;

-- ── 1) Work order created → notify the assigned lead ────────
create or replace function public.fn_notify_wo_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.assigned_lead is not null then
      perform fn_notify(
        new.assigned_lead, 'workorder',
        'Assigned to ' || new.code,
        fn_actor_name() || ' assigned you as lead on ' || new.code
          || coalesce(' — ' || new.title, ''),
        'wo', new.id);
    end if;
  exception when others then
    raise warning 'notify failed (fn_notify_wo_insert): %', sqlerrm;
  end;
  return new;
end $$;
alter function public.fn_notify_wo_insert() owner to postgres;

drop trigger if exists trg_wo_insert_notify on public.work_orders;
create trigger trg_wo_insert_notify after insert on public.work_orders
  for each row execute function public.fn_notify_wo_insert();

-- ── 2) Work order updated → lead change / reschedule / cancel ─
create or replace function public.fn_notify_wo_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  begin
    -- (a) lead reassigned
    if new.assigned_lead is distinct from old.assigned_lead
       and new.assigned_lead is not null then
      perform fn_notify(new.assigned_lead, 'workorder',
        'Assigned to ' || new.code,
        fn_actor_name() || ' assigned you as lead on ' || new.code,
        'wo', new.id);
    end if;

    -- (b) rescheduled → notify lead + crew
    if new.scheduled_start is distinct from old.scheduled_start
       or new.scheduled_end is distinct from old.scheduled_end then
      perform fn_notify(new.assigned_lead, 'workorder',
        new.code || ' rescheduled',
        fn_actor_name() || ' changed the schedule for ' || new.code,
        'wo', new.id);
      for r in select user_id from work_order_assignments where work_order_id = new.id loop
        perform fn_notify(r.user_id, 'workorder',
          new.code || ' rescheduled',
          fn_actor_name() || ' changed the schedule for ' || new.code,
          'wo', new.id);
      end loop;
    end if;

    -- (c) cancelled → notify lead + crew. Defensive: `wo_status` only
    --     carries 'cancelled', but checking both spellings is harmless
    --     and survives an enum rename if one ever lands.
    if new.status is distinct from old.status
       and new.status::text in ('cancelled', 'canceled') then
      perform fn_notify(new.assigned_lead, 'workorder',
        new.code || ' cancelled',
        fn_actor_name() || ' cancelled ' || new.code,
        'wo', new.id);
      for r in select user_id from work_order_assignments where work_order_id = new.id loop
        perform fn_notify(r.user_id, 'workorder',
          new.code || ' cancelled',
          fn_actor_name() || ' cancelled ' || new.code,
          'wo', new.id);
      end loop;
    end if;
  exception when others then
    raise warning 'notify failed (fn_notify_wo_update): %', sqlerrm;
  end;
  return new;
end $$;
alter function public.fn_notify_wo_update() owner to postgres;

drop trigger if exists trg_wo_update_notify on public.work_orders;
create trigger trg_wo_update_notify after update on public.work_orders
  for each row execute function public.fn_notify_wo_update();

-- ── 3) Worker added to a WO → notify that worker ────────────
create or replace function public.fn_notify_woa_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text; v_title text;
begin
  begin
    select code, title into v_code, v_title from work_orders where id = new.work_order_id;
    perform fn_notify(new.user_id, 'workorder',
      'Added to ' || coalesce(v_code, 'a work order'),
      fn_actor_name() || ' added you to ' || coalesce(v_code, 'a work order')
        || coalesce(' — ' || v_title, ''),
      'wo', new.work_order_id);
  exception when others then
    raise warning 'notify failed (fn_notify_woa_insert): %', sqlerrm;
  end;
  return new;
end $$;
alter function public.fn_notify_woa_insert() owner to postgres;

drop trigger if exists trg_woa_insert_notify on public.work_order_assignments;
create trigger trg_woa_insert_notify after insert on public.work_order_assignments
  for each row execute function public.fn_notify_woa_insert();

-- ── 4) Sub-contractor assigned → notify the supervising lead ─
create or replace function public.fn_notify_wosub_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lead uuid; v_code text; v_sub text;
begin
  begin
    select assigned_lead, code into v_lead, v_code from work_orders where id = new.work_order_id;
    select name into v_sub from sub_contractors where id = new.sub_contractor_id;
    perform fn_notify(v_lead, 'workorder',
      'Sub-contractor assigned to ' || coalesce(v_code, 'a work order'),
      fn_actor_name() || ' assigned ' || coalesce(v_sub, 'a sub-contractor')
        || ' to ' || coalesce(v_code, 'a work order'),
      'wo', new.work_order_id);
  exception when others then
    raise warning 'notify failed (fn_notify_wosub_insert): %', sqlerrm;
  end;
  return new;
end $$;
alter function public.fn_notify_wosub_insert() owner to postgres;

drop trigger if exists trg_wosub_insert_notify on public.work_order_sub_contractors;
create trigger trg_wosub_insert_notify after insert on public.work_order_sub_contractors
  for each row execute function public.fn_notify_wosub_insert();

-- ── 5) AMC lead tech assigned (create or change) ────────────
create or replace function public.fn_notify_amc_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lead uuid;
begin
  begin
    if tg_op = 'INSERT' then
      v_lead := new.lead_tech_id;
    elsif new.lead_tech_id is distinct from old.lead_tech_id then
      v_lead := new.lead_tech_id;
    else
      v_lead := null;
    end if;
    if v_lead is not null then
      perform fn_notify(v_lead, 'amc',
        'Assigned to AMC ' || coalesce(new.code, ''),
        fn_actor_name() || ' assigned you to AMC ' || coalesce(new.code, ''),
        'amc', new.id);
    end if;
  exception when others then
    raise warning 'notify failed (fn_notify_amc_lead): %', sqlerrm;
  end;
  return new;
end $$;
alter function public.fn_notify_amc_lead() owner to postgres;

drop trigger if exists trg_amc_lead_notify on public.amc_contracts;
create trigger trg_amc_lead_notify after insert or update on public.amc_contracts
  for each row execute function public.fn_notify_amc_lead();

-- ── 6) Project phase advanced → notify the project lead tech ─
create or replace function public.fn_notify_project_phase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.current_phase is distinct from old.current_phase
       and new.lead_tech_id is not null then
      perform fn_notify(new.lead_tech_id, 'workorder',
        coalesce(new.name, new.code, 'Project') || ' moved to ' || coalesce(new.current_phase::text, ''),
        fn_actor_name() || ' advanced ' || coalesce(new.code, new.name, 'a project')
          || ' to ' || coalesce(new.current_phase::text, ''),
        'project', new.id);
    end if;
  exception when others then
    raise warning 'notify failed (fn_notify_project_phase): %', sqlerrm;
  end;
  return new;
end $$;
alter function public.fn_notify_project_phase() owner to postgres;

drop trigger if exists trg_project_phase_notify on public.projects;
create trigger trg_project_phase_notify after update on public.projects
  for each row execute function public.fn_notify_project_phase();

-- ── 7) Make notifications available to Supabase Realtime ─────
-- Harmless if the publication is missing or the table is already in it;
-- prepares the ground for Slice N1 (client-side realtime subscription).
do $$
begin
  begin
    alter publication supabase_realtime add table notifications;
  exception when others then null;
  end;
end $$;

-- ── 8) Static smoke test (presence) ─────────────────────────
do $$
declare v_trgs int; v_fns int;
begin
  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_wo_insert_notify','trg_wo_update_notify','trg_woa_insert_notify',
    'trg_wosub_insert_notify','trg_amc_lead_notify','trg_project_phase_notify'
  ) and not tgisinternal;
  if v_trgs <> 6 then
    raise exception '0200 failed: expected 6 notification triggers, found %', v_trgs;
  end if;

  select count(*) into v_fns from pg_proc where proname in (
    'fn_notify','fn_actor_name',
    'fn_notify_wo_insert','fn_notify_wo_update','fn_notify_woa_insert',
    'fn_notify_wosub_insert','fn_notify_amc_lead','fn_notify_project_phase'
  );
  if v_fns < 8 then
    raise exception '0200 failed: expected 8 helper/trigger functions, found %', v_fns;
  end if;

  raise notice '0200 static smoke OK: % triggers, % functions installed', v_trgs, v_fns;
end $$;

-- ── 9) End-to-end smoke test (trigger fires + writes row) ──
-- Picks a (user, work_order) pair that's not already assigned to each
-- other, inserts the assignment, asserts a notifications row was added
-- by the trigger, then deletes both. If anything goes wrong the raise
-- exception rolls back the whole migration — you find out at apply
-- time, not weeks later. If there are no eligible pairs (empty users
-- or work_orders), the live test is skipped with a notice.
--
-- DESIGN — pure row-count delta, no timestamp comparison:
-- Earlier versions used a `created_at >= v_started` time filter to
-- isolate "rows the trigger just created". That collapsed because
-- `notifications.created_at` defaults to `now()` (transaction start),
-- while any in-block timestamp like `clock_timestamp()` is later in
-- wall-clock — the filter always evaluated FALSE for trigger-created
-- rows. We now compare row counts before and after the INSERT, scoped
-- to the unique (recipient, target_kind='wo', target_id=test_wo)
-- tuple. Delta >= 1 ⇒ trigger fired and wrote a row. No timestamps,
-- no ambiguity, no Postgres time-semantics gotchas.
--
-- DIAGNOSTIC NOTICES at every step: if a future apply fails, the log
-- output identifies exactly which stage broke — pre-INSERT count,
-- post-INSERT count, delta, fn_my_id() value. The exception message
-- also points to the two remaining causes a future failure could
-- have: session_replication_role, and tgenabled.
--
-- ACTOR GUARD: fn_notify() skips when p_user = fn_my_id(). We exclude
-- fn_my_id() from the recipient pool so this never trips us up.
-- `is distinct from` keeps every user eligible when fn_my_id() is
-- NULL (raw psql / SQL Editor without an active JWT).
do $$
declare
  v_user_id   uuid;
  v_wo_id     uuid;
  v_my_id     uuid := fn_my_id();
  v_before    int;
  v_after     int;
  v_delta     int;
begin
  raise notice '0200 live smoke: fn_my_id() = % (excluded from recipient pool)', coalesce(v_my_id::text, '<null>');

  -- Eligible (user, WO) pair: not the caller, not already assigned to
  -- that WO. LIMIT 1 short-circuits early on Postgres.
  select u.id, wo.id
    into v_user_id, v_wo_id
    from users u
    cross join work_orders wo
   where u.id is distinct from v_my_id
     and not exists (
       select 1 from work_order_assignments a
        where a.user_id = u.id and a.work_order_id = wo.id
     )
   limit 1;

  if v_user_id is null or v_wo_id is null then
    raise notice '0200 live smoke SKIPPED: no eligible (user, work_order) pair available (excluding fn_my_id)';
  else
    raise notice '0200 live smoke: chose recipient=%, wo=%', v_user_id, v_wo_id;

    -- BEFORE snapshot: count existing notifications for this (recipient, wo).
    -- The audit confirmed 0 total notifications, so this should be 0 — but
    -- we record it explicitly so the assertion is delta-based, not absolute.
    select count(*) into v_before
      from notifications
     where user_id = v_user_id
       and target_kind = 'wo'
       and target_id = v_wo_id;
    raise notice '0200 live smoke: pre-INSERT count for (recipient, wo) = %', v_before;

    -- Fire the trigger by INSERTing the assignment row.
    insert into work_order_assignments (work_order_id, user_id)
      values (v_wo_id, v_user_id);
    raise notice '0200 live smoke: INSERT into work_order_assignments succeeded';

    -- AFTER snapshot. Any rows beyond v_before were created within this
    -- transaction (only this migration is writing). Delta tells us
    -- whether the trigger actually produced a row.
    select count(*) into v_after
      from notifications
     where user_id = v_user_id
       and target_kind = 'wo'
       and target_id = v_wo_id;
    v_delta := v_after - v_before;
    raise notice '0200 live smoke: post-INSERT count for (recipient, wo) = % (delta = %)', v_after, v_delta;

    if v_delta < 1 then
      raise exception '0200 live smoke FAILED: trigger did not create a notification (recipient=%, wo=%, fn_my_id=%, before=%, after=%). REMAINING CAUSES TO CHECK: (1) `SHOW session_replication_role` — if ''replica'', triggers with tgenabled=''O'' do NOT fire; (2) `SELECT tgname, tgenabled FROM pg_trigger WHERE tgname=''trg_woa_insert_notify''` — tgenabled=''D'' = disabled, ''O'' = origin (fires unless replica role).',
        v_user_id, v_wo_id, coalesce(v_my_id::text, '<null>'), v_before, v_after;
    end if;

    -- Clean up only the rows we created. Delete the v_delta most-recent
    -- matching notifications by id, leaving any pre-existing rows untouched.
    -- Then delete the test assignment (composite PK = work_order_id+user_id).
    delete from notifications
     where id in (
       select id from notifications
        where user_id = v_user_id
          and target_kind = 'wo'
          and target_id = v_wo_id
        order by created_at desc
        limit v_delta
     );
    delete from work_order_assignments
     where work_order_id = v_wo_id and user_id = v_user_id;

    raise notice '0200 live smoke OK: trigger created % notification(s), cleaned up', v_delta;
  end if;
end $$;

-- ── 10) Apply marker ────────────────────────────────────────
do $$ begin
  raise notice '─── 0200 applied: assignment notifications live ───';
  raise notice 'Future WO / WO-assignment / sub-contractor / AMC / project-phase';
  raise notice 'writes will create a notifications row for the assignee.';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- /*
-- -- Confirm all 6 triggers installed:
-- select tgname from pg_trigger
--  where tgname in (
--    'trg_wo_insert_notify','trg_wo_update_notify','trg_woa_insert_notify',
--    'trg_wosub_insert_notify','trg_amc_lead_notify','trg_project_phase_notify'
--  ) and not tgisinternal
--  order by tgname;
-- -- Expect: 6 rows.
--
-- -- Then sign in as Operations Manager in the app, add a worker to a
-- -- live WO via work_order_assignments insert, sign in as that worker,
-- -- and check the bell. Should show "Added to <WO code>" within one
-- -- bell open (the bell refreshes on open; realtime push lands in
-- -- Slice N1).
-- */
-- ============================================================
