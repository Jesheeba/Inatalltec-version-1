-- ============================================================
-- 0205 — Phase 6 DLP (Defects Liability Period): schema + data layer
--
-- The warranty period after handover. The DLP clock starts at
-- projects.handover_completed_at (set in Phase 5) and runs for
-- dlp_duration_months (default 12). During DLP the client reports
-- warranty defects as dlp_tickets; the team works them to 'closed'.
--
-- The project STAYS in current_phase = 'dlp' the whole time (handover is
-- a sub-state of dlp — Option B from Phase 5). DLP "completes" when the
-- end date passes AND every ticket is closed, which is exactly the gate
-- for advancing dlp → closed (Phase 7).
--
-- DLP WINDOW (derived, not stored):
--   start = handover_completed_at
--   end   = handover_completed_at + dlp_duration_months months
--   Both are computed on the fly (in the gate trigger and in
--   lib/projects/dlp.ts). Only dlp_duration_months is stored — casting
--   the timestamptz handover_completed_at to a date is timezone-stable
--   (not immutable), so a stored generated end-date column isn't allowed.
--
-- Tables:
--   dlp_tickets        — warranty defects reported during DLP
--   dlp_ticket_photos  — photos per ticket (private bucket)
--   dlp_history        — append-only audit
--
-- Reuses the snagging_severity enum (0203) for ticket severity.
--
-- Triggers:
--   trg_dlp_ticket_touch        — updated_at (fn_ms_touch, 0040)
--   trg_dlp_ticket_before_write — actor seed; resolved_at/by stamped on
--                                 entering 'closed', cleared on leaving
--   trg_dlp_ticket_audit_ins/upd — dlp_history: created/status/assign
--   trg_dlp_photo_audit_ins     — dlp_history: photo_added
--   trg_check_dlp_gate          — BEFORE UPDATE OF current_phase on
--                                 projects; blocks dlp → closed unless
--                                 handover is done, the DLP end date has
--                                 passed, AND every ticket is closed
--
-- RLS (mirrors VIEW_DLP / MANAGE_DLP): read incl. accounts/sales; write
-- = field roles (admin/md/manager/lead_worker/worker) so any field role
-- can REPORT a ticket (the UI scopes assignment/resolution to managers).
--
-- Storage bucket: project-dlp-photos (private).
--
-- Strictly additive. Reuses fn_ms_touch (0040). Idempotent. Single txn.
-- ============================================================

begin;

-- ── 1) projects.dlp_duration_months ─────────────────────────
alter table public.projects add column if not exists dlp_duration_months int not null default 12;

-- ── 2) Enum ─────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dlp_ticket_status') then
    create type dlp_ticket_status as enum ('open', 'in_progress', 'fixed', 'verified', 'closed');
  end if;
end $$;

-- ── 3) Tables ───────────────────────────────────────────────
create table if not exists public.dlp_tickets (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  description      text not null,
  severity         snagging_severity not null default 'medium',
  status           dlp_ticket_status not null default 'open',
  assigned_to      uuid references public.users(id) on delete set null,
  reported_by      uuid references public.users(id),
  reported_at      timestamptz not null default now(),
  resolution_notes text,
  resolved_by      uuid references public.users(id),
  resolved_at      timestamptz,
  last_action_by   uuid references public.users(id),
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.dlp_ticket_photos (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.dlp_tickets(id) on delete cascade,
  storage_path text not null,
  caption      text,
  uploaded_by  uuid references public.users(id),
  uploaded_at  timestamptz not null default now()
);

create table if not exists public.dlp_history (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  ticket_id   uuid,
  action      text not null,                    -- 'created' | <status> | 'assigned' | 'photo_added'
  detail      text,
  from_status dlp_ticket_status,
  to_status   dlp_ticket_status,
  changed_by  uuid references public.users(id),
  changed_at  timestamptz not null default now()
);

create index if not exists idx_dlp_ticket_project on public.dlp_tickets(project_id);
create index if not exists idx_dlp_ticket_status  on public.dlp_tickets(status);
create index if not exists idx_dlp_ticket_assign  on public.dlp_tickets(assigned_to) where assigned_to is not null;
create index if not exists idx_dlp_photo_ticket   on public.dlp_ticket_photos(ticket_id);
create index if not exists idx_dlp_hist_project   on public.dlp_history(project_id, changed_at desc);

-- ── 4) RLS ──────────────────────────────────────────────────
alter table public.dlp_tickets       enable row level security;
alter table public.dlp_ticket_photos enable row level security;
alter table public.dlp_history       enable row level security;

do $$
declare
  t text;
  read_roles  text := 'public.fn_my_role() in (''admin'',''md'',''manager'',''lead_worker'',''worker'',''accounts'',''sales'')';
  write_roles text := 'public.fn_my_role() in (''admin'',''md'',''manager'',''lead_worker'',''worker'')';
begin
  foreach t in array array['dlp_tickets','dlp_ticket_photos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (%s)', t || '_read', t, read_roles);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (%s) with check (%s)', t || '_write', t, write_roles, write_roles);
  end loop;
end $$;

drop policy if exists dlp_history_read on public.dlp_history;
create policy dlp_history_read on public.dlp_history for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','worker','accounts','sales')
);

-- ── 5) updated_at touch ─────────────────────────────────────
drop trigger if exists trg_dlp_ticket_touch on public.dlp_tickets;
create trigger trg_dlp_ticket_touch before update on public.dlp_tickets
  for each row execute function public.fn_ms_touch();

-- ── 6) Before-write: actor seed + resolved lifecycle ────────
create or replace function public.fn_dlp_ticket_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.last_action_by := coalesce(new.last_action_by, new.created_by, new.reported_by);
  if tg_op = 'INSERT' then
    new.reported_by := coalesce(new.reported_by, new.created_by);
    if new.status = 'closed' and new.resolved_at is null then
      new.resolved_at := now();
      new.resolved_by := coalesce(new.resolved_by, new.last_action_by);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'closed' and old.status is distinct from 'closed' then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.resolved_by := coalesce(new.resolved_by, new.last_action_by);
    elsif new.status is distinct from 'closed' and old.status = 'closed' then
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  end if;
  return new;
end $$;
alter function public.fn_dlp_ticket_before_write() owner to postgres;

drop trigger if exists trg_dlp_ticket_before_write on public.dlp_tickets;
create trigger trg_dlp_ticket_before_write before insert or update on public.dlp_tickets
  for each row execute function public.fn_dlp_ticket_before_write();

-- ── 7) Audit (dlp_history) ──────────────────────────────────
create or replace function public.fn_dlp_ticket_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into dlp_history (project_id, ticket_id, action, detail, to_status, changed_by)
      values (new.project_id, new.id, 'created',
              'Ticket raised: ' || left(new.description, 120), new.status, new.last_action_by);
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      insert into dlp_history (project_id, ticket_id, action, detail, from_status, to_status, changed_by)
        values (new.project_id, new.id, new.status::text,
                'Status: ' || old.status::text || ' → ' || new.status::text,
                old.status, new.status, new.last_action_by);
    end if;
    if old.assigned_to is distinct from new.assigned_to then
      insert into dlp_history (project_id, ticket_id, action, detail, changed_by)
        values (new.project_id, new.id, 'assigned',
                case when new.assigned_to is null then 'Unassigned'
                     else 'Assigned to ' || coalesce((select full_name from users where id = new.assigned_to), new.assigned_to::text) end,
                new.last_action_by);
    end if;
  end if;
  return null;
end $$;
alter function public.fn_dlp_ticket_audit() owner to postgres;

drop trigger if exists trg_dlp_ticket_audit_ins on public.dlp_tickets;
create trigger trg_dlp_ticket_audit_ins after insert on public.dlp_tickets
  for each row execute function public.fn_dlp_ticket_audit();
drop trigger if exists trg_dlp_ticket_audit_upd on public.dlp_tickets;
create trigger trg_dlp_ticket_audit_upd after update on public.dlp_tickets
  for each row execute function public.fn_dlp_ticket_audit();

create or replace function public.fn_dlp_photo_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from dlp_tickets where id = new.ticket_id;
  insert into dlp_history (project_id, ticket_id, action, detail, changed_by)
    values (v_project, new.ticket_id, 'photo_added',
            coalesce('Photo: ' || new.caption, 'Photo attached'), new.uploaded_by);
  return null;
end $$;
alter function public.fn_dlp_photo_audit() owner to postgres;

drop trigger if exists trg_dlp_photo_audit_ins on public.dlp_ticket_photos;
create trigger trg_dlp_photo_audit_ins after insert on public.dlp_ticket_photos
  for each row execute function public.fn_dlp_photo_audit();

-- ── 8) Storage bucket (private) + RLS ───────────────────────
insert into storage.buckets (id, name, public)
values ('project-dlp-photos', 'project-dlp-photos', false)
on conflict (id) do nothing;

drop policy if exists dlp_photos_storage_read on storage.objects;
create policy dlp_photos_storage_read on storage.objects for select using (
  bucket_id = 'project-dlp-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','worker','accounts','sales')
);
drop policy if exists dlp_photos_storage_insert on storage.objects;
create policy dlp_photos_storage_insert on storage.objects for insert with check (
  bucket_id = 'project-dlp-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','worker')
);
drop policy if exists dlp_photos_storage_delete on storage.objects;
create policy dlp_photos_storage_delete on storage.objects for delete using (
  bucket_id = 'project-dlp-photos'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','worker')
);

-- ── 9) Phase gate — DLP → Closed ────────────────────────────
-- Refuses dlp → closed unless:
--   (a) handover is complete (handover_completed_at is not null), AND
--   (b) the DLP end date has passed (now >= start + duration), AND
--   (c) every dlp_ticket is in 'closed' status.
create or replace function public.fn_check_dlp_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_end timestamptz; v_open int; v_open_list text;
begin
  if old.current_phase is distinct from 'dlp'
     or new.current_phase is distinct from 'closed' then
    return new;
  end if;

  if new.handover_completed_at is null then
    raise exception 'Cannot close — handover has not been signed off yet'
      using errcode = 'P0001', hint = 'Record the customer handover sign-off first.';
  end if;

  v_end := new.handover_completed_at + make_interval(months => coalesce(new.dlp_duration_months, 12));
  if now() < v_end then
    raise exception 'Cannot close — the DLP warranty period has not ended yet (ends %)', to_char(v_end, 'YYYY-MM-DD')
      using errcode = 'P0001', hint = 'Wait until the DLP end date, then close.';
  end if;

  select count(*), string_agg(left(description, 60), '; ' order by reported_at)
    into v_open, v_open_list
    from dlp_tickets
   where project_id = new.id and status <> 'closed';
  if v_open > 0 then
    raise exception 'Cannot close — % open DLP ticket(s): %', v_open, v_open_list
      using errcode = 'P0001', hint = 'Close every DLP ticket, then retry.';
  end if;
  return new;
end $$;
alter function public.fn_check_dlp_gate() owner to postgres;

drop trigger if exists trg_check_dlp_gate on public.projects;
create trigger trg_check_dlp_gate
  before update of current_phase on public.projects
  for each row execute function public.fn_check_dlp_gate();

-- ── 10) Smoke test ──────────────────────────────────────────
do $$
declare v_tabs int; v_enum int; v_col int; v_bucket int; v_pols int; v_trgs int; v_fns int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('dlp_tickets','dlp_ticket_photos','dlp_history');
  if v_tabs <> 3 then raise exception '0205 failed: expected 3 tables, found %', v_tabs; end if;

  select count(*) into v_enum from pg_type where typname='dlp_ticket_status';
  if v_enum <> 1 then raise exception '0205 failed: dlp_ticket_status enum missing'; end if;

  select count(*) into v_col from information_schema.columns
   where table_schema='public' and table_name='projects' and column_name='dlp_duration_months';
  if v_col <> 1 then raise exception '0205 failed: projects.dlp_duration_months missing'; end if;

  select count(*) into v_bucket from storage.buckets where id='project-dlp-photos';
  if v_bucket <> 1 then raise exception '0205 failed: dlp photos bucket missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('dlp_tickets','dlp_ticket_photos','dlp_history');
  if v_pols < 5 then raise exception '0205 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_dlp_ticket_touch','trg_dlp_ticket_before_write','trg_dlp_ticket_audit_ins',
    'trg_dlp_ticket_audit_upd','trg_dlp_photo_audit_ins','trg_check_dlp_gate'
  ) and not tgisinternal;
  if v_trgs <> 6 then raise exception '0205 failed: expected 6 triggers, found %', v_trgs; end if;

  select count(*) into v_fns from pg_proc where proname in (
    'fn_dlp_ticket_before_write','fn_dlp_ticket_audit','fn_dlp_photo_audit','fn_check_dlp_gate'
  );
  if v_fns < 4 then raise exception '0205 failed: expected 4 functions, found %', v_fns; end if;

  raise notice '─── 0205 applied: dlp tickets + photos + history, % policies, % triggers, % functions ───',
    v_pols, v_trgs, v_fns;
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION
-- ============================================================
-- /*
-- select unnest(enum_range(null::dlp_ticket_status));
-- select column_name from information_schema.columns where table_name='projects' and column_name='dlp_duration_months';
-- -- Gate (project in dlp, handed over, but period not elapsed):
-- update projects set current_phase='closed' where id='<dlp_project>';
-- -- Expect: ERROR — DLP period has not ended.
-- -- To test the happy path, temporarily backdate handover + shorten duration:
-- --   update projects set handover_completed_at = now() - interval '13 months' where id='<dlp_project>';
-- --   update dlp_tickets set status='closed' where project_id='<dlp_project>';
-- --   update projects set current_phase='closed' where id='<dlp_project>';   -- succeeds
-- -- */
-- ============================================================
