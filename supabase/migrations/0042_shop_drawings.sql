-- ============================================================
-- 0042 — Shop Drawing (Design phase, activity 2)
--
-- Second of the three Main-Contractor Design activities. Mirrors the
-- Material Submittal (0040) lifecycle exactly — the ONLY difference is
-- the payload: a revision carries uploaded DRAWING FILES (PDF for
-- sharing + DWG AutoCAD source) instead of a list of material items.
--
-- A project has ONE shop drawing, which goes through one or more
-- REVISIONS. Each revision is a draft set of files (+ a description)
-- that gets submitted to the client (outside the app); the client's
-- response is recorded back here. Returned/Rejected revisions spawn a
-- new revision that inherits the prior description. Full revision
-- history is kept as an audit trail.
--
-- Lifecycle per revision:
--   draft → submitted → (approved | returned | rejected)
--   returned/rejected → a new draft revision is started
--
-- Tables:
--   shop_drawings           — one per project (code SD-YYYY-NNNN)
--   shop_drawing_revisions  — status lifecycle, description, comments
--   shop_drawing_files      — uploaded files per revision (pdf/dwg)
--
-- Storage: reuses the private bucket 'project-design-docs' created in
-- 0040 (its storage.objects policies already cover every path in the
-- bucket, so no new storage policy is needed). Files live under
-- drawing/<projectId>/…
--
-- RLS (same matrix as 0040):
--   read  : admin · md · manager · lead_worker · sales
--   write : admin · md · manager        (the MANAGE_DESIGN roles)
--
-- Strictly additive — touches nothing existing. Idempotent; single txn.
-- ============================================================

begin;

-- ── 1) Revision status enum ─────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shop_drawing_status') then
    create type shop_drawing_status as enum (
      'draft', 'submitted', 'approved', 'returned', 'rejected'
    );
  end if;
end $$;

-- ── 2) Tables ───────────────────────────────────────────────
create table if not exists public.shop_drawings (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null unique references public.projects(id) on delete cascade,
  code              text unique,                  -- SD-YYYY-NNNN, set by trigger
  current_revision  int  not null default 1,
  approved_revision int,                          -- set when a revision is approved
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.shop_drawing_revisions (
  id              uuid primary key default gen_random_uuid(),
  drawing_id      uuid not null references public.shop_drawings(id) on delete cascade,
  revision_number int  not null,
  status          shop_drawing_status not null default 'draft',
  description     text,
  submitted_at    timestamptz,
  responded_at    timestamptz,
  client_comments text,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (drawing_id, revision_number)
);

create table if not exists public.shop_drawing_files (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.shop_drawing_revisions(id) on delete cascade,
  file_path   text not null,
  file_name   text not null,
  file_size   bigint not null default 0,
  mime_type   text,
  kind        text not null default 'other' check (kind in ('pdf', 'dwg', 'other')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_sd_project    on public.shop_drawings(project_id);
create index if not exists idx_sdr_drawing    on public.shop_drawing_revisions(drawing_id);
create index if not exists idx_sdf_revision   on public.shop_drawing_files(revision_id);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.shop_drawings           enable row level security;
alter table public.shop_drawing_revisions  enable row level security;
alter table public.shop_drawing_files       enable row level security;

-- Read = the Design-doc viewer roles. Write = MANAGE_DESIGN roles.
drop policy if exists sd_read on public.shop_drawings;
create policy sd_read on public.shop_drawings for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','sales')
);
drop policy if exists sd_write on public.shop_drawings;
create policy sd_write on public.shop_drawings for all
  using      (public.fn_my_role() in ('admin','md','manager'))
  with check (public.fn_my_role() in ('admin','md','manager'));

drop policy if exists sdr_read on public.shop_drawing_revisions;
create policy sdr_read on public.shop_drawing_revisions for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','sales')
);
drop policy if exists sdr_write on public.shop_drawing_revisions;
create policy sdr_write on public.shop_drawing_revisions for all
  using      (public.fn_my_role() in ('admin','md','manager'))
  with check (public.fn_my_role() in ('admin','md','manager'));

drop policy if exists sdf_read on public.shop_drawing_files;
create policy sdf_read on public.shop_drawing_files for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','sales')
);
drop policy if exists sdf_write on public.shop_drawing_files;
create policy sdf_write on public.shop_drawing_files for all
  using      (public.fn_my_role() in ('admin','md','manager'))
  with check (public.fn_my_role() in ('admin','md','manager'));

-- ── 4) updated_at touch triggers ────────────────────────────
create or replace function public.fn_sd_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
alter function public.fn_sd_touch() owner to postgres;

drop trigger if exists trg_sd_touch on public.shop_drawings;
create trigger trg_sd_touch before update on public.shop_drawings
  for each row execute function public.fn_sd_touch();

drop trigger if exists trg_sdr_touch on public.shop_drawing_revisions;
create trigger trg_sdr_touch before update on public.shop_drawing_revisions
  for each row execute function public.fn_sd_touch();

-- ── 5) Code-generation trigger — SD-YYYY-NNNN ───────────────
-- SECURITY DEFINER + owner postgres so the COUNT spans the whole table
-- regardless of the caller's RLS scope (same reasoning as fn_ms_assign_code).
create or replace function public.fn_sd_assign_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year text; v_count int;
begin
  if new.code is not null then return new; end if;
  v_year := to_char(now(), 'YYYY');
  select count(*) + 1 into v_count
    from shop_drawings where code like 'SD-' || v_year || '-%';
  new.code := 'SD-' || v_year || '-' || lpad(v_count::text, 4, '0');
  return new;
end $$;
alter function public.fn_sd_assign_code() owner to postgres;

drop trigger if exists trg_sd_code on public.shop_drawings;
create trigger trg_sd_code before insert on public.shop_drawings
  for each row execute function public.fn_sd_assign_code();

-- ── 6) Notification triggers (best-effort; never block writes) ──
-- Reuses fn_notify() + fn_actor_name() from 0036. target_kind 'project'
-- so clicking the notification opens the project.

-- New shop drawing → notify the project's Lead Tech.
create or replace function public.fn_notify_sd_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead uuid; v_name text;
begin
  begin
    select lead_tech_id, name into v_lead, v_name from projects where id = new.project_id;
    perform fn_notify(v_lead, 'drawing',
      'Shop Drawing created',
      fn_actor_name() || ' created a shop drawing for ' || coalesce(v_name, 'your project'),
      'project', new.project_id);
  exception when others then null;
  end;
  return new;
end $$;
alter function public.fn_notify_sd_created() owner to postgres;

drop trigger if exists trg_sd_created_notify on public.shop_drawings;
create trigger trg_sd_created_notify after insert on public.shop_drawings
  for each row execute function public.fn_notify_sd_created();

-- Revision approved / returned / rejected → notify the Lead Tech + manager.
create or replace function public.fn_notify_sdr_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_lead uuid; v_mgr uuid; v_name text; v_title text;
begin
  begin
    if new.status is distinct from old.status
       and new.status in ('approved','returned','rejected') then
      select d.project_id into v_pid from shop_drawings d where d.id = new.drawing_id;
      select lead_tech_id, manager_id, name into v_lead, v_mgr, v_name
        from projects where id = v_pid;
      v_title := case new.status
        when 'approved' then 'Shop Drawing approved'
        when 'returned' then 'Shop Drawing returned with comments'
        else 'Shop Drawing rejected' end;
      perform fn_notify(v_lead, 'drawing', v_title,
        coalesce(v_name, 'Project') || ' · revision ' || new.revision_number, 'project', v_pid);
      perform fn_notify(v_mgr, 'drawing', v_title,
        coalesce(v_name, 'Project') || ' · revision ' || new.revision_number, 'project', v_pid);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
alter function public.fn_notify_sdr_response() owner to postgres;

drop trigger if exists trg_sdr_response_notify on public.shop_drawing_revisions;
create trigger trg_sdr_response_notify after update on public.shop_drawing_revisions
  for each row execute function public.fn_notify_sdr_response();

-- ── 7) Storage ──────────────────────────────────────────────
-- The 'project-design-docs' bucket and its storage.objects policies were
-- created in 0040 and already authorize every path in the bucket for the
-- same role matrix. Shop-drawing files live under drawing/<projectId>/…
-- Re-assert the bucket idempotently in case 0042 is applied stand-alone.
insert into storage.buckets (id, name, public)
values ('project-design-docs', 'project-design-docs', false)
on conflict (id) do nothing;

-- ── 8) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_bucket int; v_pols int; v_trgs int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public'
     and table_name in ('shop_drawings','shop_drawing_revisions','shop_drawing_files');
  if v_tabs <> 3 then raise exception '0042 failed: expected 3 tables, found %', v_tabs; end if;

  select count(*) into v_bucket from storage.buckets where id='project-design-docs';
  if v_bucket <> 1 then raise exception '0042 failed: project-design-docs bucket missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public'
     and tablename in ('shop_drawings','shop_drawing_revisions','shop_drawing_files');
  if v_pols < 6 then raise exception '0042 failed: table RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_sd_code','trg_sd_touch','trg_sdr_touch','trg_sd_created_notify','trg_sdr_response_notify'
  );
  if v_trgs < 5 then raise exception '0042 failed: triggers missing (%)', v_trgs; end if;

  raise notice '─── 0042 applied: 3 tables, bucket, % policies, % triggers ───', v_pols, v_trgs;
end $$;

commit;
