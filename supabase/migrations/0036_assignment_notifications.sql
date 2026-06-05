-- ============================================================
-- 0036 — Assignment notifications (DB triggers)
--
-- Problem: when the Operations Manager assigns someone to work, the
-- assignee has no way of knowing until they happen to open the app and
-- check. This wires the EXISTING in-app notification system (the
-- `notifications` table from 0001 + the bell/dropdown UI) so a row is
-- created automatically the moment an assignment happens.
--
-- Approach: AFTER triggers on the assignment tables. Trigger functions
-- are SECURITY DEFINER (owned by postgres) so they can INSERT a
-- notification for ANOTHER user without needing a permissive INSERT
-- policy on `notifications` — clients still cannot forge notifications.
--
-- Events covered (per spec):
--   • WO lead assigned          (work_orders INSERT / UPDATE assigned_lead)
--   • WO worker added           (work_order_assignments INSERT)
--   • Sub-contractor assigned   (work_order_sub_contractors INSERT → WO lead)
--   • WO rescheduled            (work_orders UPDATE scheduled_start/end)
--   • WO cancelled              (work_orders UPDATE status → cancelled)
--   • AMC lead tech assigned    (amc_contracts INSERT / UPDATE lead_tech_id)
--   • Project phase advanced    (projects UPDATE current_phase → project lead)
--
-- SAFETY:
--   • fn_notify() never notifies the actor (the person making the change)
--     and never inserts for a null recipient.
--   • EVERY trigger body is wrapped in EXCEPTION WHEN OTHERS THEN NULL so a
--     notification failure can NEVER roll back / block the underlying
--     assignment write. Notifications are strictly best-effort.
--
-- `target_kind` values ('wo' | 'amc' | 'project') match the client's
-- followTarget() switch so clicking a notification opens the right thing.
-- `kind` values ('workorder' | 'amc') match the bell UI's icon map.
--
-- Idempotent. Single begin/commit.
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

-- Display name of whoever triggered the change (best-effort).
create or replace function public.fn_actor_name() returns text
language sql security definer set search_path = public as $$
  select coalesce((select full_name from users where id = fn_my_id()), 'Someone');
$$;

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
  exception when others then null;   -- never block the WO create
  end;
  return new;
end $$;

drop trigger if exists trg_wo_insert_notify on work_orders;
create trigger trg_wo_insert_notify after insert on work_orders
  for each row execute function fn_notify_wo_insert();

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

    -- (c) cancelled → notify lead + crew
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
  exception when others then null;   -- never block the WO update
  end;
  return new;
end $$;

drop trigger if exists trg_wo_update_notify on work_orders;
create trigger trg_wo_update_notify after update on work_orders
  for each row execute function fn_notify_wo_update();

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
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists trg_woa_insert_notify on work_order_assignments;
create trigger trg_woa_insert_notify after insert on work_order_assignments
  for each row execute function fn_notify_woa_insert();

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
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists trg_wosub_insert_notify on work_order_sub_contractors;
create trigger trg_wosub_insert_notify after insert on work_order_sub_contractors
  for each row execute function fn_notify_wosub_insert();

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
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists trg_amc_lead_notify on amc_contracts;
create trigger trg_amc_lead_notify after insert or update on amc_contracts
  for each row execute function fn_notify_amc_lead();

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
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists trg_project_phase_notify on projects;
create trigger trg_project_phase_notify after update on projects
  for each row execute function fn_notify_project_phase();

-- ── 7) Make notifications available to Supabase Realtime ─────
-- Harmless if the publication is missing or the table is already in it;
-- prepares the ground for Phase-2 live/push delivery.
do $$
begin
  begin
    alter publication supabase_realtime add table notifications;
  exception when others then null;
  end;
end $$;

-- ── Smoke test ──────────────────────────────────────────────
do $$
declare v int;
begin
  select count(*) into v from pg_trigger where tgname in (
    'trg_wo_insert_notify','trg_wo_update_notify','trg_woa_insert_notify',
    'trg_wosub_insert_notify','trg_amc_lead_notify','trg_project_phase_notify'
  );
  if v < 6 then
    raise exception '0036 failed: expected 6 notification triggers, found %', v;
  end if;
  raise notice '─── 0036 applied: % notification triggers live ───', v;
end $$;

commit;
