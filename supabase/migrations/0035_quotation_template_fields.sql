-- ============================================================
-- 0035 — Quotation template fields + direct project link
--
-- Adds three columns to public.quotations so the system can
-- auto-generate an editable starter quotation when a project is
-- created and round-trip the user's edits.
--
--   • project_id    — direct link to the project the quotation was
--                     auto-generated FOR. Distinct from the existing
--                     converted_to_project_id (which records "this
--                     quotation was later converted into project X" —
--                     the inverse direction). Nullable, so manually-
--                     created quotations not tied to a project still
--                     work.
--   • description   — multi-line scope of work. Pre-filled with
--                     placeholder bullet points when auto-generated;
--                     Sales edits to match the actual job.
--   • terms         — multi-line payment / commercial terms. Pre-
--                     filled with a 50/40/10 placeholder schedule;
--                     Sales overwrites with the agreed terms.
--
-- RLS: no policy changes. The existing quote_read / quote_write
-- policies cover the new columns automatically (row-level, not
-- column-level).
--
-- IDEMPOTENCY: ADD COLUMN IF NOT EXISTS, smoke test verifies the
-- final shape regardless of re-runs.
-- ============================================================

begin;

-- ─── 1) Columns ────────────────────────────────────────────
alter table public.quotations
  add column if not exists project_id  uuid references public.projects(id) on delete set null;

alter table public.quotations
  add column if not exists description text;

alter table public.quotations
  add column if not exists terms       text;

create index if not exists idx_quotations_project on public.quotations(project_id);

comment on column public.quotations.project_id is
  'Project this quotation was auto-generated FOR (migration 0035). '
  'Distinct from converted_to_project_id which means "this quotation '
  'was later converted INTO a project" — inverse direction.';

comment on column public.quotations.description is
  'Multi-line scope of work. Editable starter text seeded by the '
  'auto-generate-on-project-create flow (migration 0035).';

comment on column public.quotations.terms is
  'Multi-line commercial / payment terms. Editable starter text '
  'seeded by the auto-generate flow (migration 0035).';

-- ─── 2) Smoke test ─────────────────────────────────────────
do $$
declare
  v_cols int;
  v_fk   int;
begin
  -- All three new columns present.
  select count(*) into v_cols
    from information_schema.columns
   where table_schema='public' and table_name='quotations'
     and column_name in ('project_id','description','terms');
  if v_cols <> 3 then
    raise exception '0035 failed: expected 3 new columns on quotations, found %', v_cols;
  end if;

  -- project_id FK actually references projects (not just a uuid).
  select count(*) into v_fk
    from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = rc.constraint_name
   where kcu.table_schema='public'
     and kcu.table_name='quotations'
     and kcu.column_name='project_id';
  if v_fk < 1 then
    raise exception '0035 failed: project_id FK to projects missing';
  end if;

  raise notice '─── 0035 applied ───';
  raise notice 'quotations gained: project_id (FK), description, terms';
end $$;

commit;
