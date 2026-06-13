-- ============================================================
-- 0203 — Phase 4 Testing & Commissioning (T&C): schema + data layer
--
-- The phase where the customer walks the completed installation, signs
-- off per zone, and defects found during the walkthrough are tracked as
-- a snagging list. A final Acceptance Certificate is produced once every
-- zone is signed and no snag is still open/in-progress.
--
-- PHASE MAPPING NOTE (flagged in the slice report):
--   The build plan calls the next phase "Handover", but the
--   project_phase enum (migration 0020) has NO 'handover' value — it is
--   [design, material_supply, installation, tc, dlp, closed]. 'handover'
--   exists only in the separate project_stage enum (0008). DLP is "the
--   12-month warranty period AFTER handover", so the project enters DLP
--   the moment handover sign-off completes. The phase gate therefore
--   guards the tc → dlp transition, and the UI "Advance to Handover"
--   button advances current_phase to 'dlp'. No enum change (keeps the
--   phase stepper / nextPhase() ordering intact).
--
-- Tables:
--   snagging_items          — defects found at walkthrough (per zone)
--   snagging_photos         — proof photos per snag (private bucket)
--   zone_acceptances        — per-zone customer sign-off (typed name)
--   acceptance_certificates — final cert, auto-numbered AC-YYYY-NNNN
--   tc_history              — append-only audit across all three
--                             (mirrors project_material_history /
--                              installation_task_history)
--
-- Triggers:
--   trg_snag_touch              — updated_at (reuses fn_ms_touch, 0040)
--   trg_snag_before_write       — actor seed; completed_at/by lifecycle
--                                 (stamped when a snag enters fixed/
--                                 verified, cleared when it returns to
--                                 open/in_progress); workflow validation
--                                 (cannot jump straight to 'verified'
--                                 without passing through 'fixed')
--   trg_snag_audit_ins/_upd     — tc_history: created / status / assign
--   trg_snag_photo_audit_ins    — tc_history: photo_added
--   trg_zone_accept_audit       — tc_history: zone_signed (ins or upd)
--   trg_cert_before_insert      — assigns AC-YYYY-NNNN
--   trg_cert_audit_ins          — tc_history: certificate_generated
--   trg_check_tc_gate           — BEFORE UPDATE OF current_phase on
--                                 projects; blocks tc → dlp unless every
--                                 installation zone is signed AND zero
--                                 open/in_progress snags
--
-- RLS (mirrors lib/permissions.ts VIEW_TC / MANAGE_TC):
--   read  : admin · md · manager · lead_worker · accounts · sales
--   write : admin · md · manager · lead_worker
--   history write: trigger-only (immutable to callers)
--
-- NOTIFICATIONS: trg_project_phase_notify (0200) already fires to the
-- project's lead_tech_id on ANY phase advance, including tc → dlp.
--
-- Strictly additive. Reuses fn_ms_touch (0040). Idempotent. Single txn.
-- ============================================================

begin;

-- ── 1) Enums ────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'snagging_status') then
    create type snagging_status as enum ('open', 'in_progress', 'fixed', 'verified');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'snagging_severity') then
    create type snagging_severity as enum ('low', 'medium', 'high', 'critical');
  end if;
end $$;

-- ── 2) Tables ───────────────────────────────────────────────
create table if not exists public.snagging_items (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  zone            text,
  description     text not null,
  severity        snagging_severity not null default 'medium',
  status          snagging_status   not null default 'open',
  -- Worker who fixes; nullable until assigned.
  assigned_to     uuid references public.users(id) on delete set null,
  reported_by     uuid references public.users(id),
  -- Stamped by trg_snag_before_write when status enters fixed/verified.
  completed_by    uuid references public.users(id),
  completed_at    timestamptz,
  notes           text,
  last_action_by  uuid references public.users(id),
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.snagging_photos (
  id               uuid primary key default gen_random_uuid(),
  snagging_item_id uuid not null references public.snagging_items(id) on delete cascade,
  -- Path within the private 'project-snagging-photos' bucket.
  storage_path     text not null,
  caption          text,
  uploaded_by      uuid references public.users(id),
  uploaded_at      timestamptz not null default now()
);

create table if not exists public.zone_acceptances (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  zone              text not null,
  customer_name     text not null,
  customer_email    text,
  notes             text,
  -- Typed sign-off (no digital signature in this slice — flagged).
  signed_at         timestamptz not null default now(),
  -- Staff member who recorded the customer's sign-off.
  signed_by_user_id uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One acceptance row per zone; re-recording upserts.
  unique (project_id, zone)
);

create table if not exists public.acceptance_certificates (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  certificate_number  text unique,                -- AC-YYYY-NNNN, set by trigger
  issued_to           text,                       -- customer / company name
  scope_summary       text,                       -- snapshot blurb for the cert body
  generated_by        uuid references public.users(id),
  generated_at        timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create table if not exists public.tc_history (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  entity_kind  text not null,                     -- 'snagging' | 'zone' | 'certificate'
  entity_id    uuid,
  action       text not null,                     -- 'created' | <status> | 'assigned' | 'photo_added' | 'zone_signed' | 'certificate_generated'
  detail       text,
  from_status  snagging_status,
  to_status    snagging_status,
  changed_by   uuid references public.users(id),
  changed_at   timestamptz not null default now()
);

create index if not exists idx_snag_project       on public.snagging_items(project_id);
create index if not exists idx_snag_status         on public.snagging_items(status);
create index if not exists idx_snag_assigned       on public.snagging_items(assigned_to) where assigned_to is not null;
create index if not exists idx_snag_zone           on public.snagging_items(project_id, zone) where zone is not null;
create index if not exists idx_snag_photo_item     on public.snagging_photos(snagging_item_id);
create index if not exists idx_zone_accept_project on public.zone_acceptances(project_id);
create index if not exists idx_cert_project        on public.acceptance_certificates(project_id);
create index if not exists idx_tc_hist_project     on public.tc_history(project_id, changed_at desc);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.snagging_items          enable row level security;
alter table public.snagging_photos         enable row level security;
alter table public.zone_acceptances        enable row level security;
alter table public.acceptance_certificates enable row level security;
alter table public.tc_history              enable row level security;

-- read = VIEW_TC, write = MANAGE_TC (admin/md/manager/lead_worker).
do $$
declare
  t text;
  read_roles  text := 'public.fn_my_role() in (''admin'',''md'',''manager'',''lead_worker'',''accounts'',''sales'')';
  write_roles text := 'public.fn_my_role() in (''admin'',''md'',''manager'',''lead_worker'')';
begin
  foreach t in array array['snagging_items','snagging_photos','zone_acceptances','acceptance_certificates'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (%s)', t || '_read', t, read_roles);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (%s) with check (%s)', t || '_write', t, write_roles, write_roles);
  end loop;
end $$;

-- History is read-only; only the SECURITY DEFINER triggers write.
drop policy if exists tc_history_read on public.tc_history;
create policy tc_history_read on public.tc_history for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','accounts','sales')
);

-- ── 4) updated_at touch (reuse fn_ms_touch from 0040) ───────
drop trigger if exists trg_snag_touch on public.snagging_items;
create trigger trg_snag_touch before update on public.snagging_items
  for each row execute function public.fn_ms_touch();
drop trigger if exists trg_zone_accept_touch on public.zone_acceptances;
create trigger trg_zone_accept_touch before update on public.zone_acceptances
  for each row execute function public.fn_ms_touch();

-- ── 5) Snagging before-write: actor seed + completion + workflow ──
create or replace function public.fn_snag_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.last_action_by := coalesce(new.last_action_by, new.created_by);

  if tg_op = 'INSERT' then
    new.reported_by := coalesce(new.reported_by, new.created_by);
    if new.status in ('fixed','verified') and new.completed_at is null then
      new.completed_at := now();
      new.completed_by := coalesce(new.completed_by, new.last_action_by);
    end if;
  elsif tg_op = 'UPDATE' then
    -- Workflow validation: a snag must be fixed before it is verified.
    if new.status = 'verified' and old.status not in ('fixed','verified') then
      raise exception 'A snag must be marked "fixed" before it can be "verified"'
        using errcode = 'P0001', hint = 'Move the item to "fixed" first.';
    end if;
    -- Completion lifecycle: stamp on entering fixed/verified, clear on
    -- returning to open/in_progress.
    if new.status in ('fixed','verified') and old.status in ('open','in_progress') then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, new.last_action_by);
    elsif new.status in ('open','in_progress') and old.status in ('fixed','verified') then
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;
  return new;
end $$;
alter function public.fn_snag_before_write() owner to postgres;

drop trigger if exists trg_snag_before_write on public.snagging_items;
create trigger trg_snag_before_write before insert or update on public.snagging_items
  for each row execute function public.fn_snag_before_write();

-- ── 6) Append-only audit (tc_history) ──────────────────────
create or replace function public.fn_snag_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into tc_history (project_id, entity_kind, entity_id, action, detail, to_status, changed_by)
      values (new.project_id, 'snagging', new.id, 'created',
              'Snag raised: ' || left(new.description, 120) ||
                coalesce(' (' || new.zone || ')', ''),
              new.status, new.last_action_by);
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      insert into tc_history (project_id, entity_kind, entity_id, action, detail, from_status, to_status, changed_by)
        values (new.project_id, 'snagging', new.id, new.status::text,
                'Status: ' || old.status::text || ' → ' || new.status::text,
                old.status, new.status, new.last_action_by);
    end if;
    if old.assigned_to is distinct from new.assigned_to then
      insert into tc_history (project_id, entity_kind, entity_id, action, detail, changed_by)
        values (new.project_id, 'snagging', new.id, 'assigned',
                case when new.assigned_to is null then 'Unassigned'
                     else 'Assigned to ' ||
                          coalesce((select full_name from users where id = new.assigned_to), new.assigned_to::text)
                end,
                new.last_action_by);
    end if;
  end if;
  return null;
end $$;
alter function public.fn_snag_audit() owner to postgres;

drop trigger if exists trg_snag_audit_ins on public.snagging_items;
create trigger trg_snag_audit_ins after insert on public.snagging_items
  for each row execute function public.fn_snag_audit();
drop trigger if exists trg_snag_audit_upd on public.snagging_items;
create trigger trg_snag_audit_upd after update on public.snagging_items
  for each row execute function public.fn_snag_audit();

create or replace function public.fn_snag_photo_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from snagging_items where id = new.snagging_item_id;
  insert into tc_history (project_id, entity_kind, entity_id, action, detail, changed_by)
    values (v_project, 'snagging', new.snagging_item_id, 'photo_added',
            coalesce('Photo: ' || new.caption, 'Photo attached'), new.uploaded_by);
  return null;
end $$;
alter function public.fn_snag_photo_audit() owner to postgres;

drop trigger if exists trg_snag_photo_audit_ins on public.snagging_photos;
create trigger trg_snag_photo_audit_ins after insert on public.snagging_photos
  for each row execute function public.fn_snag_photo_audit();

create or replace function public.fn_zone_accept_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into tc_history (project_id, entity_kind, entity_id, action, detail, changed_by)
    values (new.project_id, 'zone', new.id,
            case when tg_op = 'INSERT' then 'zone_signed' else 'zone_resigned' end,
            'Zone "' || new.zone || '" signed off by ' || new.customer_name,
            new.signed_by_user_id);
  return null;
end $$;
alter function public.fn_zone_accept_audit() owner to postgres;

drop trigger if exists trg_zone_accept_audit on public.zone_acceptances;
create trigger trg_zone_accept_audit after insert or update on public.zone_acceptances
  for each row execute function public.fn_zone_accept_audit();

-- ── 7) Certificate numbering + audit ───────────────────────
create or replace function public.fn_cert_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year text; v_seq int;
begin
  if new.certificate_number is null then
    v_year := to_char(coalesce(new.generated_at, now()), 'YYYY');
    select count(*) + 1 into v_seq from acceptance_certificates
      where certificate_number like 'AC-' || v_year || '-%';
    new.certificate_number := 'AC-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end $$;
alter function public.fn_cert_before_insert() owner to postgres;

drop trigger if exists trg_cert_before_insert on public.acceptance_certificates;
create trigger trg_cert_before_insert before insert on public.acceptance_certificates
  for each row execute function public.fn_cert_before_insert();

create or replace function public.fn_cert_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into tc_history (project_id, entity_kind, entity_id, action, detail, changed_by)
    values (new.project_id, 'certificate', new.id, 'certificate_generated',
            'Acceptance certificate ' || coalesce(new.certificate_number, '') || ' generated',
            new.generated_by);
  return null;
end $$;
alter function public.fn_cert_audit() owner to postgres;

drop trigger if exists trg_cert_audit_ins on public.acceptance_certificates;
create trigger trg_cert_audit_ins after insert on public.acceptance_certificates
  for each row execute function public.fn_cert_audit();

-- ── 8) Storage bucket (private) + RLS ───────────────────────
insert into storage.buckets (id, name, public)
values ('project-snagging-photos', 'project-snagging-photos', false)
on conflict (id) do nothing;

drop policy if exists snag_photos_storage_read on storage.objects;
create policy snag_photos_storage_read on storage.objects for select using (
  bucket_id = 'project-snagging-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','accounts','sales')
);
drop policy if exists snag_photos_storage_insert on storage.objects;
create policy snag_photos_storage_insert on storage.objects for insert with check (
  bucket_id = 'project-snagging-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker')
);
drop policy if exists snag_photos_storage_delete on storage.objects;
create policy snag_photos_storage_delete on storage.objects for delete using (
  bucket_id = 'project-snagging-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker')
);

-- ── 9) Phase gate — T&C → DLP (handover) ───────────────────
-- Refuses tc → dlp unless:
--   (a) every installation zone (distinct non-empty installation_tasks.
--       zone for this project) has a zone_acceptances row, AND
--   (b) zero snagging_items are still 'open' or 'in_progress'.
-- Defensive: a project with no zoned installation tasks has an empty
-- required-zone set, so only (b) applies (flagged in the report).
create or replace function public.fn_check_tc_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_unsigned int;
  v_unsigned_list text;
  v_open_snags int;
begin
  if old.current_phase is distinct from 'tc'
     or new.current_phase is distinct from 'dlp' then
    return new;
  end if;

  with req as (
    select distinct trim(zone) as z
      from installation_tasks
     where project_id = new.id and zone is not null and trim(zone) <> ''
  ),
  signed as (
    select distinct lower(trim(zone)) as z
      from zone_acceptances where project_id = new.id
  )
  select count(*), string_agg(req.z, '; ' order by req.z)
    into v_unsigned, v_unsigned_list
    from req
   where lower(req.z) not in (select z from signed);

  select count(*) into v_open_snags
    from snagging_items
   where project_id = new.id and status in ('open','in_progress');

  if v_unsigned > 0 or v_open_snags > 0 then
    raise exception
      'Cannot advance to Handover — % zone(s) unsigned (%); % snag(s) still open/in-progress',
      coalesce(v_unsigned, 0), coalesce(v_unsigned_list, 'none'), coalesce(v_open_snags, 0)
      using errcode = 'P0001',
            hint = 'Get customer sign-off for every zone and close (fix/verify) all snags, then retry.';
  end if;
  return new;
end $$;
alter function public.fn_check_tc_gate() owner to postgres;

drop trigger if exists trg_check_tc_gate on public.projects;
create trigger trg_check_tc_gate
  before update of current_phase on public.projects
  for each row execute function public.fn_check_tc_gate();

-- ── 10) Smoke test ──────────────────────────────────────────
do $$
declare v_tabs int; v_enums int; v_bucket int; v_pols int; v_trgs int; v_fns int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public'
     and table_name in ('snagging_items','snagging_photos','zone_acceptances',
                        'acceptance_certificates','tc_history');
  if v_tabs <> 5 then raise exception '0203 failed: expected 5 tables, found %', v_tabs; end if;

  select count(*) into v_enums from pg_type
   where typname in ('snagging_status','snagging_severity');
  if v_enums <> 2 then raise exception '0203 failed: expected 2 enums, found %', v_enums; end if;

  select count(*) into v_bucket from storage.buckets where id='project-snagging-photos';
  if v_bucket <> 1 then raise exception '0203 failed: snagging photos bucket missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public'
     and tablename in ('snagging_items','snagging_photos','zone_acceptances',
                       'acceptance_certificates','tc_history');
  if v_pols < 9 then raise exception '0203 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_snag_touch','trg_zone_accept_touch','trg_snag_before_write',
    'trg_snag_audit_ins','trg_snag_audit_upd','trg_snag_photo_audit_ins',
    'trg_zone_accept_audit','trg_cert_before_insert','trg_cert_audit_ins',
    'trg_check_tc_gate'
  ) and not tgisinternal;
  if v_trgs <> 10 then raise exception '0203 failed: expected 10 triggers, found %', v_trgs; end if;

  select count(*) into v_fns from pg_proc where proname in (
    'fn_snag_before_write','fn_snag_audit','fn_snag_photo_audit',
    'fn_zone_accept_audit','fn_cert_before_insert','fn_cert_audit','fn_check_tc_gate'
  );
  if v_fns < 7 then raise exception '0203 failed: expected 7 functions, found %', v_fns; end if;

  raise notice '─── 0203 applied: snagging + zone acceptances + certificates + history, % policies, % triggers, % functions ───',
    v_pols, v_trgs, v_fns;
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- /*
-- -- 1) Structure:
-- select unnest(enum_range(null::snagging_status));
-- select unnest(enum_range(null::snagging_severity));
-- select id from storage.buckets where id='project-snagging-photos';
--
-- -- 2) Certificate auto-numbering (pick a project at 'tc'):
-- insert into acceptance_certificates (project_id, issued_to, scope_summary)
--   values ('<project_uuid>', 'ACME Mall LLC', 'CCTV + ACS install, 4 zones');
-- select certificate_number from acceptance_certificates where project_id='<project_uuid>';
-- -- Expect: AC-<year>-0001
--
-- -- 3) Snagging workflow validation:
-- insert into snagging_items (project_id, zone, description) values ('<p>','Zone A','Loose connector');
-- update snagging_items set status='verified' where project_id='<p>' and zone='Zone A';
-- -- Expect: ERROR — must be 'fixed' before 'verified'.
--
-- -- 4) Phase gate (with an open snag and/or an unsigned installation zone):
-- update projects set current_phase='dlp' where id='<project_uuid>';
-- -- Expect: ERROR listing unsigned zones + open snag count.
-- -- After: every installation zone has a zone_acceptances row AND all snags
-- -- are fixed/verified, the same UPDATE succeeds (trg_project_phase_notify
-- -- fires a notification to the project's lead_tech_id).
-- */
-- ============================================================
