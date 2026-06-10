-- ============================================================
-- 0040 — Material Submittal (Design phase, activity 1)
--
-- First of the three Main-Contractor Design activities. A project has
-- ONE material submittal, which goes through one or more REVISIONS.
-- Each revision is a draft list of materials that gets submitted to the
-- client (outside the app); the client's response is recorded back here.
-- Returned/Rejected revisions spawn a new revision that copies the prior
-- items. Full revision history is kept as an audit trail.
--
-- Lifecycle per revision:
--   draft → submitted → (approved | returned | rejected)
--   returned/rejected → a new draft revision is started
--
-- Tables:
--   material_submittals            — one per project (code MS-YYYY-NNNN)
--   material_submittal_revisions   — status lifecycle, client comments
--   material_items                 — line items per revision (+ datasheet)
--
-- Storage: a private bucket 'project-design-docs' (shared with Shop
-- Drawing in slice B). Datasheets live under submittal/<projectId>/…
--
-- RLS (mirrors who edits vs views Design work):
--   read  : admin · md · manager · lead_worker · sales
--   write : admin · md · manager        (the MANAGE_DESIGN roles)
--
-- Mirrors the replacement_requests pattern (0017) for the code-gen +
-- touch triggers, and 0039 for the bucket + storage RLS. Strictly
-- additive — touches nothing existing. Idempotent; single txn.
-- ============================================================

begin;

-- ── 1) Revision status enum ─────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'material_submittal_status') then
    create type material_submittal_status as enum (
      'draft', 'submitted', 'approved', 'returned', 'rejected'
    );
  end if;
end $$;

-- ── 2) Tables ───────────────────────────────────────────────
create table if not exists public.material_submittals (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null unique references public.projects(id) on delete cascade,
  code              text unique,                  -- MS-YYYY-NNNN, set by trigger
  current_revision  int  not null default 1,
  approved_revision int,                          -- set when a revision is approved
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.material_submittal_revisions (
  id              uuid primary key default gen_random_uuid(),
  submittal_id    uuid not null references public.material_submittals(id) on delete cascade,
  revision_number int  not null,
  status          material_submittal_status not null default 'draft',
  submitted_at    timestamptz,
  responded_at    timestamptz,
  client_comments text,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (submittal_id, revision_number)
);

create table if not exists public.material_items (
  id             uuid primary key default gen_random_uuid(),
  revision_id    uuid not null references public.material_submittal_revisions(id) on delete cascade,
  description    text not null,
  model_number   text,
  quantity       int  not null default 1 check (quantity > 0),
  datasheet_path text,
  datasheet_name text,
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_ms_project       on public.material_submittals(project_id);
create index if not exists idx_msr_submittal     on public.material_submittal_revisions(submittal_id);
create index if not exists idx_mi_revision       on public.material_items(revision_id);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.material_submittals          enable row level security;
alter table public.material_submittal_revisions enable row level security;
alter table public.material_items               enable row level security;

-- Read = the Design-doc viewer roles. Write = MANAGE_DESIGN roles.
drop policy if exists ms_read on public.material_submittals;
create policy ms_read on public.material_submittals for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','sales')
);
drop policy if exists ms_write on public.material_submittals;
create policy ms_write on public.material_submittals for all
  using      (public.fn_my_role() in ('admin','md','manager'))
  with check (public.fn_my_role() in ('admin','md','manager'));

drop policy if exists msr_read on public.material_submittal_revisions;
create policy msr_read on public.material_submittal_revisions for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','sales')
);
drop policy if exists msr_write on public.material_submittal_revisions;
create policy msr_write on public.material_submittal_revisions for all
  using      (public.fn_my_role() in ('admin','md','manager'))
  with check (public.fn_my_role() in ('admin','md','manager'));

drop policy if exists mi_read on public.material_items;
create policy mi_read on public.material_items for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','sales')
);
drop policy if exists mi_write on public.material_items;
create policy mi_write on public.material_items for all
  using      (public.fn_my_role() in ('admin','md','manager'))
  with check (public.fn_my_role() in ('admin','md','manager'));

-- ── 4) updated_at touch triggers ────────────────────────────
create or replace function public.fn_ms_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
alter function public.fn_ms_touch() owner to postgres;

drop trigger if exists trg_ms_touch on public.material_submittals;
create trigger trg_ms_touch before update on public.material_submittals
  for each row execute function public.fn_ms_touch();

drop trigger if exists trg_msr_touch on public.material_submittal_revisions;
create trigger trg_msr_touch before update on public.material_submittal_revisions
  for each row execute function public.fn_ms_touch();

-- ── 5) Code-generation trigger — MS-YYYY-NNNN ───────────────
-- SECURITY DEFINER + owner postgres so the COUNT spans the whole table
-- regardless of the caller's RLS scope (same reasoning as fn_rr_assign_code).
create or replace function public.fn_ms_assign_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year text; v_count int;
begin
  if new.code is not null then return new; end if;
  v_year := to_char(now(), 'YYYY');
  select count(*) + 1 into v_count
    from material_submittals where code like 'MS-' || v_year || '-%';
  new.code := 'MS-' || v_year || '-' || lpad(v_count::text, 4, '0');
  return new;
end $$;
alter function public.fn_ms_assign_code() owner to postgres;

drop trigger if exists trg_ms_code on public.material_submittals;
create trigger trg_ms_code before insert on public.material_submittals
  for each row execute function public.fn_ms_assign_code();

-- ── 6) Notification triggers (best-effort; never block writes) ──
-- Reuses fn_notify() + fn_actor_name() from 0036. target_kind 'project'
-- so clicking the notification opens the project (followTarget supports it).

-- New submittal → notify the project's Lead Tech.
create or replace function public.fn_notify_ms_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead uuid; v_name text;
begin
  begin
    select lead_tech_id, name into v_lead, v_name from projects where id = new.project_id;
    perform fn_notify(v_lead, 'material',
      'Material Submittal created',
      fn_actor_name() || ' created a material submittal for ' || coalesce(v_name, 'your project'),
      'project', new.project_id);
  exception when others then null;
  end;
  return new;
end $$;
alter function public.fn_notify_ms_created() owner to postgres;

drop trigger if exists trg_ms_created_notify on public.material_submittals;
create trigger trg_ms_created_notify after insert on public.material_submittals
  for each row execute function public.fn_notify_ms_created();

-- Revision approved / returned → notify the project Lead Tech + manager.
create or replace function public.fn_notify_msr_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_lead uuid; v_mgr uuid; v_name text; v_title text;
begin
  begin
    if new.status is distinct from old.status
       and new.status in ('approved','returned','rejected') then
      select s.project_id into v_pid from material_submittals s where s.id = new.submittal_id;
      select lead_tech_id, manager_id, name into v_lead, v_mgr, v_name
        from projects where id = v_pid;
      v_title := case new.status
        when 'approved' then 'Material Submittal approved'
        when 'returned' then 'Material Submittal returned with comments'
        else 'Material Submittal rejected' end;
      perform fn_notify(v_lead, 'material', v_title,
        coalesce(v_name, 'Project') || ' · revision ' || new.revision_number, 'project', v_pid);
      perform fn_notify(v_mgr, 'material', v_title,
        coalesce(v_name, 'Project') || ' · revision ' || new.revision_number, 'project', v_pid);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
alter function public.fn_notify_msr_response() owner to postgres;

drop trigger if exists trg_msr_response_notify on public.material_submittal_revisions;
create trigger trg_msr_response_notify after update on public.material_submittal_revisions
  for each row execute function public.fn_notify_msr_response();

-- ── 7) Storage bucket (private) + RLS ───────────────────────
insert into storage.buckets (id, name, public)
values ('project-design-docs', 'project-design-docs', false)
on conflict (id) do nothing;

drop policy if exists design_docs_storage_read on storage.objects;
create policy design_docs_storage_read on storage.objects for select using (
  bucket_id = 'project-design-docs'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','sales')
);

drop policy if exists design_docs_storage_insert on storage.objects;
create policy design_docs_storage_insert on storage.objects for insert with check (
  bucket_id = 'project-design-docs'
  and public.fn_my_role() in ('admin','md','manager')
);

drop policy if exists design_docs_storage_delete on storage.objects;
create policy design_docs_storage_delete on storage.objects for delete using (
  bucket_id = 'project-design-docs'
  and public.fn_my_role() in ('admin','md','manager')
);

-- ── 8) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_bucket int; v_pols int; v_trgs int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public'
     and table_name in ('material_submittals','material_submittal_revisions','material_items');
  if v_tabs <> 3 then raise exception '0040 failed: expected 3 tables, found %', v_tabs; end if;

  select count(*) into v_bucket from storage.buckets where id='project-design-docs';
  if v_bucket <> 1 then raise exception '0040 failed: project-design-docs bucket missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public'
     and tablename in ('material_submittals','material_submittal_revisions','material_items');
  if v_pols < 6 then raise exception '0040 failed: table RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_ms_code','trg_ms_touch','trg_msr_touch','trg_ms_created_notify','trg_msr_response_notify'
  );
  if v_trgs < 5 then raise exception '0040 failed: triggers missing (%)', v_trgs; end if;

  raise notice '─── 0040 applied: 3 tables, bucket, % policies, % triggers ───', v_pols, v_trgs;
end $$;

commit;
