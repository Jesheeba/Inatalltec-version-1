-- ============================================================
-- 0204 — Phase 5 Handover: schema + data layer
--
-- The formal delivery of project deliverables to the client. Happens at
-- the START of the DLP phase (Phase 4 advanced current_phase to 'dlp').
--
-- PHASE MODEL DECISION (Option B — confirmed at top of slice report):
--   There is no 'handover' phase value. A project sits in current_phase
--   = 'dlp' and is "handed over" the moment a customer sign-off is
--   recorded — stamped on the NEW projects.handover_completed_at column.
--   The DLP warranty period is counted from that timestamp. The
--   project stays in 'dlp' throughout (Phase 6 handles dlp → closed).
--   No project_phase enum change.
--
-- Tables:
--   handover_documents        — uploaded deliverables, by category
--   handover_checklist_items  — mandatory/optional handover checklist,
--                               auto-seeded on entry to DLP from a
--                               default template (configurable template
--                               is a future enhancement — flagged)
--   handover_signoff          — one customer sign-off per project; its
--                               insert is GATED (all mandatory checklist
--                               items done + >=1 doc per required
--                               category) and sets handover_completed_at
--   handover_history          — append-only audit across all three
--
-- New column: projects.handover_completed_at (nullable timestamptz).
--
-- CATEGORIES: an enum handover_doc_category (drawings, manuals,
-- certificates, warranty, other). The build plan suggested storing these
-- in accounting_lookups, but that table belongs to the PROTECTED
-- Accountant module — a Main Contractor feature shouldn't write into it.
-- Using an enum keeps Handover self-contained and type-safe; making the
-- category list fully configurable via Settings is a future enhancement
-- (flagged in the report).
--
-- Triggers:
--   trg_handover_checklist_touch        — updated_at (fn_ms_touch, 0040)
--   trg_handover_checklist_before_write — actor seed; completed_at/by
--                                         lifecycle on is_completed flips
--   trg_handover_doc_audit_ins          — history: document_uploaded
--   trg_handover_checklist_audit        — history: created / completed /
--                                         reopened
--   trg_handover_signoff_gate           — BEFORE INSERT: blocks sign-off
--                                         until mandatory checklist done
--                                         + every required category has a
--                                         document
--   trg_handover_signoff_after          — sets projects.
--                                         handover_completed_at, notifies
--                                         the lead tech (reuses fn_notify
--                                         from 0200), logs history
--   trg_handover_seed_on_dlp            — AFTER UPDATE OF current_phase:
--                                         seeds the checklist when a
--                                         project enters 'dlp'
--   + one-time backfill for projects ALREADY in 'dlp' when this migration
--     is applied (the seed trigger can't fire retroactively).
--
-- RLS (mirrors lib/permissions.ts VIEW_HANDOVER / MANAGE_HANDOVER):
--   read  : admin · md · manager · lead_worker · accounts · sales
--   write : admin · md · manager · lead_worker
--   history write: trigger-only.
--
-- Storage bucket: project-handover-docs (private).
--
-- Strictly additive. Reuses fn_ms_touch (0040) + fn_notify (0200).
-- Idempotent. Single txn.
-- ============================================================

begin;

-- ── 1) Enum ─────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'handover_doc_category') then
    create type handover_doc_category as enum ('drawings', 'manuals', 'certificates', 'warranty', 'other');
  end if;
end $$;

-- ── 2) projects.handover_completed_at ───────────────────────
alter table public.projects add column if not exists handover_completed_at timestamptz;

-- ── 3) Tables ───────────────────────────────────────────────
create table if not exists public.handover_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  category      handover_doc_category not null default 'other',
  file_path     text not null,                  -- path in project-handover-docs bucket
  file_name     text not null,
  file_size     bigint,
  mime_type     text,
  description   text,
  is_required   boolean not null default false, -- marks a deliverable as mandatory
  uploaded_by   uuid references public.users(id),
  uploaded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table if not exists public.handover_checklist_items (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  category         handover_doc_category,
  item_description text not null,
  is_required      boolean not null default true,
  is_completed     boolean not null default false,
  completed_at     timestamptz,
  completed_by     uuid references public.users(id),
  sort_order       int not null default 0,
  last_action_by   uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.handover_signoff (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  customer_name     text not null,
  customer_email    text,
  notes             text,
  signature_method  text not null default 'typed',  -- 'typed' | 'digital' (future)
  signed_at         timestamptz not null default now(),
  signed_by_user_id uuid references public.users(id),
  created_at        timestamptz not null default now(),
  -- One formal handover sign-off per project.
  unique (project_id)
);

create table if not exists public.handover_history (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  entity_kind  text not null,                   -- 'document' | 'checklist' | 'signoff'
  entity_id    uuid,
  action       text not null,                   -- 'document_uploaded' | 'created' | 'completed' | 'reopened' | 'handover_signed'
  detail       text,
  changed_by   uuid references public.users(id),
  changed_at   timestamptz not null default now()
);

create index if not exists idx_handover_doc_project   on public.handover_documents(project_id);
create index if not exists idx_handover_doc_category  on public.handover_documents(project_id, category);
create index if not exists idx_handover_chk_project   on public.handover_checklist_items(project_id);
create index if not exists idx_handover_signoff_proj  on public.handover_signoff(project_id);
create index if not exists idx_handover_hist_project  on public.handover_history(project_id, changed_at desc);

-- ── 4) RLS ──────────────────────────────────────────────────
alter table public.handover_documents       enable row level security;
alter table public.handover_checklist_items enable row level security;
alter table public.handover_signoff         enable row level security;
alter table public.handover_history         enable row level security;

do $$
declare
  t text;
  read_roles  text := 'public.fn_my_role() in (''admin'',''md'',''manager'',''lead_worker'',''accounts'',''sales'')';
  write_roles text := 'public.fn_my_role() in (''admin'',''md'',''manager'',''lead_worker'')';
begin
  foreach t in array array['handover_documents','handover_checklist_items','handover_signoff'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (%s)', t || '_read', t, read_roles);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (%s) with check (%s)', t || '_write', t, write_roles, write_roles);
  end loop;
end $$;

drop policy if exists handover_history_read on public.handover_history;
create policy handover_history_read on public.handover_history for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','accounts','sales')
);

-- ── 5) updated_at touch (reuse fn_ms_touch from 0040) ───────
drop trigger if exists trg_handover_checklist_touch on public.handover_checklist_items;
create trigger trg_handover_checklist_touch before update on public.handover_checklist_items
  for each row execute function public.fn_ms_touch();

-- ── 6) Checklist before-write: actor seed + completion stamp ─
create or replace function public.fn_handover_chk_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.last_action_by := coalesce(new.last_action_by, new.completed_by);
  if tg_op = 'INSERT' then
    if new.is_completed and new.completed_at is null then
      new.completed_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    if new.is_completed and not old.is_completed then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, new.last_action_by);
    elsif not new.is_completed and old.is_completed then
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;
  return new;
end $$;
alter function public.fn_handover_chk_before_write() owner to postgres;

drop trigger if exists trg_handover_checklist_before_write on public.handover_checklist_items;
create trigger trg_handover_checklist_before_write before insert or update on public.handover_checklist_items
  for each row execute function public.fn_handover_chk_before_write();

-- ── 7) Audit (handover_history) ─────────────────────────────
create or replace function public.fn_handover_doc_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into handover_history (project_id, entity_kind, entity_id, action, detail, changed_by)
    values (new.project_id, 'document', new.id, 'document_uploaded',
            new.category::text || ': ' || new.file_name, new.uploaded_by);
  return null;
end $$;
alter function public.fn_handover_doc_audit() owner to postgres;

drop trigger if exists trg_handover_doc_audit_ins on public.handover_documents;
create trigger trg_handover_doc_audit_ins after insert on public.handover_documents
  for each row execute function public.fn_handover_doc_audit();

create or replace function public.fn_handover_chk_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into handover_history (project_id, entity_kind, entity_id, action, detail, changed_by)
      values (new.project_id, 'checklist', new.id, 'created',
              'Checklist item: ' || new.item_description, new.last_action_by);
  elsif tg_op = 'UPDATE' and old.is_completed is distinct from new.is_completed then
    insert into handover_history (project_id, entity_kind, entity_id, action, detail, changed_by)
      values (new.project_id, 'checklist', new.id,
              case when new.is_completed then 'completed' else 'reopened' end,
              (case when new.is_completed then 'Completed: ' else 'Reopened: ' end) || new.item_description,
              new.last_action_by);
  end if;
  return null;
end $$;
alter function public.fn_handover_chk_audit() owner to postgres;

drop trigger if exists trg_handover_checklist_audit on public.handover_checklist_items;
create trigger trg_handover_checklist_audit after insert or update on public.handover_checklist_items
  for each row execute function public.fn_handover_chk_audit();

-- ── 8) Sign-off gate (BEFORE INSERT) ───────────────────────
-- Refuses the customer sign-off until every mandatory checklist item is
-- complete AND every REQUIRED category (drawings, manuals, certificates,
-- warranty) has at least one uploaded document.
create or replace function public.fn_handover_signoff_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_incomplete int;
  v_incomplete_list text;
  v_missing text := '';
  cat text;
begin
  select count(*), string_agg(item_description, '; ' order by sort_order)
    into v_incomplete, v_incomplete_list
    from handover_checklist_items
   where project_id = new.project_id and is_required and not is_completed;

  foreach cat in array array['drawings','manuals','certificates','warranty'] loop
    if not exists (
      select 1 from handover_documents
       where project_id = new.project_id and category = cat::handover_doc_category
    ) then
      v_missing := v_missing || cat || ' ';
    end if;
  end loop;

  if coalesce(v_incomplete, 0) > 0 or v_missing <> '' then
    raise exception
      'Cannot record handover sign-off — incomplete checklist (%); missing document category(ies): %',
      coalesce(v_incomplete_list, 'none'), coalesce(nullif(trim(v_missing), ''), 'none')
      using errcode = 'P0001',
            hint = 'Complete all mandatory checklist items and upload at least one document per required category.';
  end if;
  return new;
end $$;
alter function public.fn_handover_signoff_gate() owner to postgres;

drop trigger if exists trg_handover_signoff_gate on public.handover_signoff;
create trigger trg_handover_signoff_gate before insert on public.handover_signoff
  for each row execute function public.fn_handover_signoff_gate();

-- ── 9) Sign-off after-insert: stamp project + notify + audit ─
create or replace function public.fn_handover_signoff_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead uuid; v_code text; v_name text;
begin
  -- Mark the formal handover moment on the project (DLP counts from here).
  update projects set handover_completed_at = new.signed_at
   where id = new.project_id and handover_completed_at is null;

  -- Notify the project lead tech (reuses the 0200 helper; never blocks).
  begin
    select lead_tech_id, code, name into v_lead, v_code, v_name from projects where id = new.project_id;
    if v_lead is not null then
      perform fn_notify(v_lead, 'project',
        coalesce(v_name, v_code, 'Project') || ' handover complete',
        fn_actor_name() || ' recorded customer handover sign-off for '
          || coalesce(v_code, v_name, 'a project'),
        'project', new.project_id);
    end if;
  exception when others then
    raise warning 'notify failed (fn_handover_signoff_after): %', sqlerrm;
  end;

  insert into handover_history (project_id, entity_kind, entity_id, action, detail, changed_by)
    values (new.project_id, 'signoff', new.id, 'handover_signed',
            'Handover signed off by ' || new.customer_name, new.signed_by_user_id);
  return null;
end $$;
alter function public.fn_handover_signoff_after() owner to postgres;

drop trigger if exists trg_handover_signoff_after on public.handover_signoff;
create trigger trg_handover_signoff_after after insert on public.handover_signoff
  for each row execute function public.fn_handover_signoff_after();

-- ── 10) Default checklist template + seed function ──────────
-- Seeds the mandatory handover checklist for a project (idempotent —
-- skips if any items already exist). Used by both the on-DLP trigger and
-- the one-time backfill below.
create or replace function public.fn_handover_seed_for_project(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from handover_checklist_items where project_id = p_project) then
    return;
  end if;
  insert into handover_checklist_items (project_id, category, item_description, is_required, sort_order) values
    (p_project, 'drawings',     'As-built drawings provided to the client',          true, 1),
    (p_project, 'manuals',      'Equipment manuals & user guides provided',          true, 2),
    (p_project, 'certificates', 'Warranty / compliance certificates issued',         true, 3),
    (p_project, 'certificates', 'T&C acceptance certificate attached',               true, 4),
    (p_project, 'warranty',     'Warranty terms & service contact details provided', true, 5),
    (p_project, 'other',        'Asset register / serial numbers recorded',          true, 6);
end $$;
alter function public.fn_handover_seed_for_project(uuid) owner to postgres;

create or replace function public.fn_handover_seed_on_dlp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.current_phase is distinct from 'dlp' and new.current_phase = 'dlp' then
    perform fn_handover_seed_for_project(new.id);
  end if;
  return new;
end $$;
alter function public.fn_handover_seed_on_dlp() owner to postgres;

drop trigger if exists trg_handover_seed_on_dlp on public.projects;
create trigger trg_handover_seed_on_dlp
  after update of current_phase on public.projects
  for each row execute function public.fn_handover_seed_on_dlp();

-- One-time backfill: projects ALREADY in 'dlp' (e.g. advanced during
-- Phase 4, before this trigger existed) won't have fired the seed.
do $$
declare r record; v_seeded int := 0;
begin
  for r in select id from projects where current_phase = 'dlp' loop
    perform fn_handover_seed_for_project(r.id);
    v_seeded := v_seeded + 1;
  end loop;
  raise notice '0204 backfill: ensured handover checklist for % project(s) in dlp', v_seeded;
end $$;

-- ── 11) Storage bucket (private) + RLS ──────────────────────
insert into storage.buckets (id, name, public)
values ('project-handover-docs', 'project-handover-docs', false)
on conflict (id) do nothing;

drop policy if exists handover_docs_storage_read on storage.objects;
create policy handover_docs_storage_read on storage.objects for select using (
  bucket_id = 'project-handover-docs'
  and public.fn_my_role() in ('admin','md','manager','lead_worker','accounts','sales')
);
drop policy if exists handover_docs_storage_insert on storage.objects;
create policy handover_docs_storage_insert on storage.objects for insert with check (
  bucket_id = 'project-handover-docs'
  and public.fn_my_role() in ('admin','md','manager','lead_worker')
);
drop policy if exists handover_docs_storage_delete on storage.objects;
create policy handover_docs_storage_delete on storage.objects for delete using (
  bucket_id = 'project-handover-docs'
  and public.fn_my_role() in ('admin','md','manager','lead_worker')
);

-- ── 12) Smoke test ──────────────────────────────────────────
do $$
declare v_tabs int; v_enum int; v_col int; v_bucket int; v_pols int; v_trgs int; v_fns int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public'
     and table_name in ('handover_documents','handover_checklist_items','handover_signoff','handover_history');
  if v_tabs <> 4 then raise exception '0204 failed: expected 4 tables, found %', v_tabs; end if;

  select count(*) into v_enum from pg_type where typname='handover_doc_category';
  if v_enum <> 1 then raise exception '0204 failed: handover_doc_category enum missing'; end if;

  select count(*) into v_col from information_schema.columns
   where table_schema='public' and table_name='projects' and column_name='handover_completed_at';
  if v_col <> 1 then raise exception '0204 failed: projects.handover_completed_at missing'; end if;

  select count(*) into v_bucket from storage.buckets where id='project-handover-docs';
  if v_bucket <> 1 then raise exception '0204 failed: handover docs bucket missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public'
     and tablename in ('handover_documents','handover_checklist_items','handover_signoff','handover_history');
  if v_pols < 7 then raise exception '0204 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_handover_checklist_touch','trg_handover_checklist_before_write',
    'trg_handover_doc_audit_ins','trg_handover_checklist_audit',
    'trg_handover_signoff_gate','trg_handover_signoff_after','trg_handover_seed_on_dlp'
  ) and not tgisinternal;
  if v_trgs <> 7 then raise exception '0204 failed: expected 7 triggers, found %', v_trgs; end if;

  select count(*) into v_fns from pg_proc where proname in (
    'fn_handover_chk_before_write','fn_handover_doc_audit','fn_handover_chk_audit',
    'fn_handover_signoff_gate','fn_handover_signoff_after',
    'fn_handover_seed_for_project','fn_handover_seed_on_dlp'
  );
  if v_fns < 7 then raise exception '0204 failed: expected 7 functions, found %', v_fns; end if;

  raise notice '─── 0204 applied: handover docs + checklist + signoff + history, % policies, % triggers, % functions ───',
    v_pols, v_trgs, v_fns;
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- /*
-- -- 1) Structure:
-- select unnest(enum_range(null::handover_doc_category));
-- select column_name from information_schema.columns
--  where table_name='projects' and column_name='handover_completed_at';
-- select id from storage.buckets where id='project-handover-docs';
--
-- -- 2) Checklist auto-seed (a project already in dlp should already have 6 items):
-- select project_id, count(*) from handover_checklist_items group by project_id;
--
-- -- 3) Sign-off gate (with incomplete checklist / missing category docs):
-- insert into handover_signoff (project_id, customer_name) values ('<dlp_project_uuid>','ACME Mall LLC');
-- -- Expect: ERROR listing incomplete checklist items + missing categories.
--
-- -- After: complete all mandatory items + upload >=1 doc per required
-- -- category, the same insert succeeds, projects.handover_completed_at is
-- -- set, and the lead tech gets a notification.
-- -- */
-- ============================================================
