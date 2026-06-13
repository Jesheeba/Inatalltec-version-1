-- ============================================================
-- 0202 — Phase 3 Installation (Slice INST-A): schema + data layer
--
-- Tracks the physical installation work a Main Contractor project does
-- on site between Phase 2 (Material Supply — equipment delivered) and
-- Phase 4 (Testing & Commissioning, current_phase = 'tc'). Installation
-- for an ELV (Extra Low Voltage) contractor — cameras, NVRs, network
-- racks, structured cabling — is naturally a CHECKLIST of located tasks,
-- so this mirrors the Phase 2 shape (table + append-only history +
-- phase gate) rather than inventing new machinery.
--
-- DATA MODEL DECISION (confirmed with the boss before build; recorded
-- in the slice report, key points here):
--   • installation_tasks — one row per discrete on-site activity
--     ("Mount CAM-07 at lobby", "Terminate rack R1 cabling",
--     "Configure NVR"). MANUALLY built by the lead tech (NOT auto-seeded
--     from project_materials): a qty-10 camera line splits into 10
--     located tasks, and cabling/configuration work has no material line
--     at all, so 1:1 seeding would be the wrong granularity. An OPTIONAL
--     source_material_id preserves provenance when a task IS "install
--     this delivered device".
--   • zone (free text — "Ground Floor", "Parking B1") groups tasks for
--     multi-area sites. category enum classifies the work type.
--   • Progress % is DERIVED in the data layer (completed / (total −
--     not_applicable)), never stored — same as Phase 2's
--     computeMaterialSupplyProgress.
--   • Defects during installation = a task set to 'blocked' + a note.
--     Full snagging lists and per-zone CUSTOMER SIGN-OFF deliberately
--     belong to the T&C / handover phase, NOT here.
--   • Photo documentation (proof-of-install) lands NOW as
--     installation_task_photos + a private bucket, so the schema is
--     evidence-ready; the upload UI is wired in INST-B.
--
-- Tables:
--   installation_tasks          — task + status + zone + assignment
--   installation_task_history   — append-only audit (mirrors
--                                  project_material_history pattern)
--   installation_task_photos    — proof-of-install photos (storage path)
--
-- Triggers:
--   trg_it_touch                  — updated_at (reuses fn_ms_touch, 0040)
--   trg_it_before_write           — seed last_action_by; auto-stamp /
--                                   clear completed_at + completed_by on
--                                   the completed-status transition
--   trg_it_audit_ins, _upd        — history rows for create / status
--                                   change / (re)assignment
--   trg_itp_audit_ins             — history row when a photo is attached
--   trg_check_installation_gate   — BEFORE UPDATE OF current_phase on
--                                   projects; blocks installation → tc
--                                   unless every task is completed or
--                                   not_applicable
--
-- RLS:
--   tasks   read : admin · md · manager · lead_worker · worker · sales
--   tasks   write: admin · md · manager · lead_worker · worker
--                  (field workers mark their tasks on phones on site —
--                   the responsive requirement; accounts is intentionally
--                   NOT granted, installation has no accounting tie)
--   history read : same as tasks read ; history write: trigger-only
--   photos  read : same as tasks read ; photos write: tasks-write roles
--
-- NOTIFICATIONS: the existing trg_project_phase_notify (migration 0200)
-- already fires to the project's lead_tech_id on ANY phase advance,
-- including installation → tc. Nothing to add here.
--
-- Strictly additive. Reuses fn_ms_touch (0040). Idempotent. Single txn.
-- ============================================================

begin;

-- ── 1) Enums ────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'installation_task_status') then
    create type installation_task_status as enum (
      'pending',
      'in_progress',
      'blocked',
      'completed',
      'not_applicable'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'installation_task_category') then
    create type installation_task_category as enum (
      'cabling',
      'device_mounting',
      'termination',
      'configuration',
      'testing',
      'other'
    );
  end if;
end $$;

-- ── 2) Tables ───────────────────────────────────────────────
create table if not exists public.installation_tasks (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,

  title               text not null,
  description         text,

  -- Site grouping for multi-area ELV jobs. Free text (no fixed zone
  -- master — every site is laid out differently).
  zone                text,
  category            installation_task_category not null default 'other',

  status              installation_task_status   not null default 'pending',

  -- The technician responsible. Nullable until assigned. lead_worker /
  -- worker on site; same users table as projects.lead_tech_id.
  assigned_to         uuid references public.users(id) on delete set null,

  -- Provenance: the delivered material this task installs, when one
  -- exists. NULL for cabling / configuration / ad-hoc tasks. ON DELETE
  -- SET NULL so deleting a Phase 2 row just detaches the link.
  source_material_id  uuid references public.project_materials(id) on delete set null,

  sort_order          int  not null default 0,

  -- Stamped by trg_it_before_write when status enters 'completed',
  -- cleared when it leaves. Not caller-managed.
  completed_at        timestamptz,
  completed_by        uuid references public.users(id),

  notes               text,

  -- Audit actor for the history trigger.
  last_action_by      uuid references public.users(id),
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.installation_task_history (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.installation_tasks(id) on delete cascade,
  action        text not null,                    -- 'created' | <new_status> | 'assigned' | 'photo_added'
  detail        text,
  from_status   installation_task_status,
  to_status     installation_task_status,
  changed_by    uuid references public.users(id),
  changed_at    timestamptz not null default now()
);

create table if not exists public.installation_task_photos (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.installation_tasks(id) on delete cascade,
  -- Path within the private 'project-install-photos' bucket.
  storage_path  text not null,
  caption       text,
  uploaded_by   uuid references public.users(id),
  uploaded_at   timestamptz not null default now()
);

create index if not exists idx_it_project       on public.installation_tasks(project_id);
create index if not exists idx_it_status         on public.installation_tasks(status);
create index if not exists idx_it_assigned       on public.installation_tasks(assigned_to)        where assigned_to is not null;
create index if not exists idx_it_zone           on public.installation_tasks(project_id, zone)   where zone is not null;
create index if not exists idx_it_source         on public.installation_tasks(source_material_id) where source_material_id is not null;
create index if not exists idx_it_hist_task      on public.installation_task_history(task_id, changed_at desc);
create index if not exists idx_itp_task          on public.installation_task_photos(task_id);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.installation_tasks         enable row level security;
alter table public.installation_task_history  enable row level security;
alter table public.installation_task_photos   enable row level security;

drop policy if exists it_read on public.installation_tasks;
create policy it_read on public.installation_tasks for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','worker','sales')
);
drop policy if exists it_write on public.installation_tasks;
create policy it_write on public.installation_tasks for all
  using      (public.fn_my_role() in ('admin','md','manager','lead_worker','worker'))
  with check (public.fn_my_role() in ('admin','md','manager','lead_worker','worker'));

-- History is read-only; only the SECURITY DEFINER trigger writes.
drop policy if exists it_hist_read on public.installation_task_history;
create policy it_hist_read on public.installation_task_history for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','worker','sales')
);

drop policy if exists itp_read on public.installation_task_photos;
create policy itp_read on public.installation_task_photos for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','worker','sales')
);
drop policy if exists itp_write on public.installation_task_photos;
create policy itp_write on public.installation_task_photos for all
  using      (public.fn_my_role() in ('admin','md','manager','lead_worker','worker'))
  with check (public.fn_my_role() in ('admin','md','manager','lead_worker','worker'));

-- ── 4) updated_at touch (reuse fn_ms_touch from 0040) ───────
drop trigger if exists trg_it_touch on public.installation_tasks;
create trigger trg_it_touch before update on public.installation_tasks
  for each row execute function public.fn_ms_touch();

-- ── 5) Before-write: actor seed + completed_at lifecycle ────
-- Keeps completed_at / completed_by honest regardless of what the caller
-- sends: stamped when status enters 'completed', cleared when it leaves.
create or replace function public.fn_it_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.last_action_by := coalesce(new.last_action_by, new.created_by);

  if tg_op = 'INSERT' then
    if new.status = 'completed' and new.completed_at is null then
      new.completed_at := now();
      new.completed_by := coalesce(new.completed_by, new.last_action_by);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'completed' and old.status is distinct from 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, new.last_action_by);
    elsif new.status is distinct from 'completed' and old.status = 'completed' then
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;
  return new;
end $$;
alter function public.fn_it_before_write() owner to postgres;

drop trigger if exists trg_it_before_write on public.installation_tasks;
create trigger trg_it_before_write before insert or update on public.installation_tasks
  for each row execute function public.fn_it_before_write();

-- ── 6) Append-only audit ────────────────────────────────────
-- One row per significant change. INSERTs log 'created'. UPDATEs log
-- status changes and (re)assignments separately so the timeline feed
-- renders distinct events.
create or replace function public.fn_it_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into installation_task_history
      (task_id, action, detail, to_status, changed_by)
      values (new.id, 'created',
              'Task added: ' || new.title,
              new.status, new.last_action_by);
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      insert into installation_task_history
        (task_id, action, detail, from_status, to_status, changed_by)
        values (new.id, new.status::text,
                'Status: ' || old.status::text || ' → ' || new.status::text,
                old.status, new.status, new.last_action_by);
    end if;
    if old.assigned_to is distinct from new.assigned_to then
      insert into installation_task_history
        (task_id, action, detail, changed_by)
        values (new.id, 'assigned',
                case when new.assigned_to is null
                     then 'Unassigned'
                     else 'Assigned to ' ||
                          coalesce((select full_name from users where id = new.assigned_to),
                                   new.assigned_to::text)
                end,
                new.last_action_by);
    end if;
  end if;
  return null;
end $$;
alter function public.fn_it_audit() owner to postgres;

drop trigger if exists trg_it_audit_ins on public.installation_tasks;
create trigger trg_it_audit_ins after insert on public.installation_tasks
  for each row execute function public.fn_it_audit();

drop trigger if exists trg_it_audit_upd on public.installation_tasks;
create trigger trg_it_audit_upd after update on public.installation_tasks
  for each row execute function public.fn_it_audit();

-- Photo attached → log on the parent task's timeline.
create or replace function public.fn_it_photo_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into installation_task_history
    (task_id, action, detail, changed_by)
    values (new.task_id, 'photo_added',
            coalesce('Photo: ' || new.caption, 'Photo attached'),
            new.uploaded_by);
  return null;
end $$;
alter function public.fn_it_photo_audit() owner to postgres;

drop trigger if exists trg_itp_audit_ins on public.installation_task_photos;
create trigger trg_itp_audit_ins after insert on public.installation_task_photos
  for each row execute function public.fn_it_photo_audit();

-- ── 7) Storage bucket (private) + RLS ───────────────────────
insert into storage.buckets (id, name, public)
values ('project-install-photos', 'project-install-photos', false)
on conflict (id) do nothing;

drop policy if exists install_photos_storage_read on storage.objects;
create policy install_photos_storage_read on storage.objects for select using (
  bucket_id = 'project-install-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','worker','sales')
);

drop policy if exists install_photos_storage_insert on storage.objects;
create policy install_photos_storage_insert on storage.objects for insert with check (
  bucket_id = 'project-install-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','worker')
);

drop policy if exists install_photos_storage_delete on storage.objects;
create policy install_photos_storage_delete on storage.objects for delete using (
  bucket_id = 'project-install-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','worker')
);

-- ── 8) Phase gate — Installation → T&C (tc) ─────────────────
-- Mirrors fn_check_material_supply_gate (0201). Refuses installation →
-- tc unless every installation_tasks row is completed or
-- not_applicable. Defensive: an empty task list passes (no-op).
create or replace function public.fn_check_installation_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pending int; v_pending_titles text;
begin
  if old.current_phase is distinct from 'installation'
     or new.current_phase is distinct from 'tc' then
    return new;
  end if;
  select count(*),
         string_agg(title || ' (' || status::text || ')', '; ' order by sort_order, title)
    into v_pending, v_pending_titles
    from installation_tasks
   where project_id = new.id
     and status not in ('completed','not_applicable');
  if v_pending > 0 then
    raise exception
      'Cannot advance to Testing & Commissioning — % installation task(s) still open: %',
      v_pending, v_pending_titles
      using errcode = 'P0001',
            hint = 'Mark each task completed or not_applicable, then retry.';
  end if;
  return new;
end $$;
alter function public.fn_check_installation_gate() owner to postgres;

drop trigger if exists trg_check_installation_gate on public.projects;
create trigger trg_check_installation_gate
  before update of current_phase on public.projects
  for each row execute function public.fn_check_installation_gate();

-- ── 9) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_enums int; v_bucket int; v_pols int; v_trgs int; v_fns int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public'
     and table_name in ('installation_tasks','installation_task_history','installation_task_photos');
  if v_tabs <> 3 then raise exception '0202 failed: expected 3 tables, found %', v_tabs; end if;

  select count(*) into v_enums from pg_type
   where typname in ('installation_task_status','installation_task_category');
  if v_enums <> 2 then raise exception '0202 failed: expected 2 enums, found %', v_enums; end if;

  select count(*) into v_bucket from storage.buckets where id='project-install-photos';
  if v_bucket <> 1 then raise exception '0202 failed: project-install-photos bucket missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public'
     and tablename in ('installation_tasks','installation_task_history','installation_task_photos');
  if v_pols < 5 then raise exception '0202 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_it_touch','trg_it_before_write','trg_it_audit_ins','trg_it_audit_upd',
    'trg_itp_audit_ins','trg_check_installation_gate'
  ) and not tgisinternal;
  if v_trgs <> 6 then raise exception '0202 failed: expected 6 triggers, found %', v_trgs; end if;

  select count(*) into v_fns from pg_proc where proname in (
    'fn_it_before_write','fn_it_audit','fn_it_photo_audit','fn_check_installation_gate'
  );
  if v_fns < 4 then raise exception '0202 failed: expected 4 functions, found %', v_fns; end if;

  raise notice '─── 0202 applied: installation_tasks + history + photos, % policies, % triggers, % functions ───',
    v_pols, v_trgs, v_fns;
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- /*
-- -- 1) Confirm tables, enums, bucket, triggers present:
-- select table_name from information_schema.tables
--  where table_schema='public'
--    and table_name in ('installation_tasks','installation_task_history','installation_task_photos');
--
-- select unnest(enum_range(null::installation_task_status));
-- select unnest(enum_range(null::installation_task_category));
-- select id from storage.buckets where id='project-install-photos';
--
-- select tgname from pg_trigger where tgname in (
--   'trg_it_touch','trg_it_before_write','trg_it_audit_ins','trg_it_audit_upd',
--   'trg_itp_audit_ins','trg_check_installation_gate'
-- ) and not tgisinternal order by tgname;
-- -- Expect: 6 rows.
--
-- -- 2) Task lifecycle (pick a project at 'installation'):
-- /*
-- insert into installation_tasks (project_id, title, zone, category)
--   values ('<project_uuid>', 'Mount CAM-07 at lobby', 'Ground Floor', 'device_mounting');
-- -- history should now have a 'created' row:
-- select action, detail, to_status from installation_task_history
--  where task_id in (select id from installation_tasks where project_id='<project_uuid>')
--  order by changed_at;
--
-- update installation_tasks set status='completed'
--  where project_id='<project_uuid>' and title='Mount CAM-07 at lobby';
-- -- completed_at should auto-stamp; history gets a 'completed' row:
-- select title, status, completed_at, completed_by from installation_tasks
--  where project_id='<project_uuid>';
-- */
--
-- -- 3) Phase-gate test (with at least one task NOT completed/not_applicable):
-- /*
-- update projects set current_phase = 'tc' where id = '<project_uuid>';
-- -- Expect: ERROR — open installation tasks listed.
-- */
-- -- Mark all tasks completed/not_applicable, then retry:
-- /*
-- update installation_tasks set status='completed' where project_id='<project_uuid>';
-- update projects set current_phase = 'tc' where id = '<project_uuid>';
-- -- Expect: success. trg_project_phase_notify (0200) fires a notification
-- -- to the project's lead_tech_id.
-- */
-- */
-- ============================================================
