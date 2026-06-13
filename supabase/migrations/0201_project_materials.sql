-- ============================================================
-- 0201 — Phase 2 Material Supply (Slice MS-A): schema + data layer
--
-- Tracks per-project material procurement progress between Phase 1
-- (Design — approved BOM in material_submittals/material_items) and
-- Phase 3 (Installation). Each row is one material line with a status
-- workflow from "not_ordered" through "delivered_to_site".
--
-- DATA MODEL DECISION (documented in slice report; key points here):
--   • Separate table, NOT a derivation from material_items + po_line_items.
--     PO descriptions are free text typed by the Accountant — string
--     matching against the approved BOM is fragile. Also, "delivered to
--     site" is a project-side concept that po_receipts don't capture.
--   • Snapshot description/model/quantity at seed time so the project
--     side is independent of any later edits to the Phase 1 submittal.
--   • source_material_item_id (nullable FK) preserves provenance back
--     to the approved BOM line; NULL when added mid-phase.
--   • po_line_item_id (nullable FK to the Accountant's po_line_items,
--     READ ONLY from our side) is the procurement link, filled in by
--     UI in MS-B.
--   • Quantity tracked separately for warehouse vs site (matches the
--     two-step receipt model in the actual workflow).
--
-- Tables:
--   project_materials         — items + status + quantities + links
--   project_material_history  — append-only audit (mirrors po_history
--                                / project_jca_history pattern)
--
-- Triggers:
--   trg_pm_touch                       — updated_at
--   trg_pm_audit_ins, trg_pm_audit_upd — history rows for create /
--                                        status change / qty change
--   trg_pm_seed_on_phase_advance       — auto-seed from approved
--                                        material submittal revision
--                                        when projects.current_phase
--                                        becomes 'material_supply'
--   trg_check_material_supply_gate     — BEFORE UPDATE of current_phase
--                                        on projects; blocks
--                                        material_supply → installation
--                                        unless every material is
--                                        delivered_to_site or cancelled
--
-- RLS:
--   read  : admin · md · manager · lead_worker · accounts · sales
--   write : admin · md · manager · lead_worker · accounts
--           (lead_worker is the on-site project lead;
--            accounts can link/edit PO references)
--   history read : admin · md · manager · lead_worker · accounts
--   history write: trigger-only (no policy ⇒ immutable to callers)
--
-- INTEGRATION: po_line_items is owned by the parallel Accountant
-- session (migration 0048). We only READ from it via the nullable FK;
-- the constraint uses ON DELETE SET NULL so a PO line being deleted
-- on the Accountant side doesn't cascade-destroy our row, it just
-- detaches the link.
--
-- Strictly additive. Reuses fn_ms_touch from 0040 for updated_at.
-- Idempotent. Single txn.
-- ============================================================

begin;

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_material_status') then
    create type project_material_status as enum (
      'not_ordered',
      'ordered',
      'received_at_warehouse',
      'delivered_to_site',
      'cancelled',
      'issue'
    );
  end if;
end $$;

-- ── 2) Tables ───────────────────────────────────────────────
create table if not exists public.project_materials (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid not null references public.projects(id) on delete cascade,

  -- Source row in material_items (the approved BOM line). NULL when added
  -- mid-phase (not part of the original approved scope).
  source_material_item_id     uuid references public.material_items(id) on delete set null,

  -- Snapshot of the planned scope at seed time. Decoupled from
  -- material_items so Phase 2 is stable against any future edits to
  -- the Phase 1 submittal.
  description                 text not null,
  model_number                text,
  quantity_planned            int  not null check (quantity_planned > 0),

  -- Status workflow.
  status                      project_material_status not null default 'not_ordered',

  -- Procurement linkage (filled in by lead tech / accountant during phase).
  -- ON DELETE SET NULL: if the Accountant deletes the PO line, our row
  -- just detaches (doesn't cascade-destroy).
  po_line_item_id             uuid references public.po_line_items(id) on delete set null,

  -- Delivery progress (running totals).
  quantity_received_warehouse numeric(14,2) not null default 0,
  quantity_delivered_site     numeric(14,2) not null default 0,

  notes                       text,

  -- Audit actor for the history trigger.
  last_action_by              uuid references public.users(id),
  created_by                  uuid references public.users(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table if not exists public.project_material_history (
  id            uuid primary key default gen_random_uuid(),
  material_id   uuid not null references public.project_materials(id) on delete cascade,
  action        text not null,                    -- 'created' | <new_status> | 'qty_warehouse' | 'qty_site'
  detail        text,
  from_status   project_material_status,
  to_status     project_material_status,
  qty_delta     numeric(14,2),                    -- positive for received/delivered, NULL for status-only changes
  changed_by    uuid references public.users(id),
  changed_at    timestamptz not null default now()
);

create index if not exists idx_pm_project      on public.project_materials(project_id);
create index if not exists idx_pm_status        on public.project_materials(status);
create index if not exists idx_pm_po_line       on public.project_materials(po_line_item_id);
create index if not exists idx_pm_source_item   on public.project_materials(source_material_item_id);
create index if not exists idx_pm_hist_material on public.project_material_history(material_id, changed_at desc);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.project_materials        enable row level security;
alter table public.project_material_history enable row level security;

drop policy if exists pm_read on public.project_materials;
create policy pm_read on public.project_materials for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','accounts','sales')
);
drop policy if exists pm_write on public.project_materials;
create policy pm_write on public.project_materials for all
  using      (public.fn_my_role() in ('admin','md','manager','lead_worker','accounts'))
  with check (public.fn_my_role() in ('admin','md','manager','lead_worker','accounts'));

-- History is read-only; only the SECURITY DEFINER trigger writes.
drop policy if exists pm_hist_read on public.project_material_history;
create policy pm_hist_read on public.project_material_history for select using (
  public.fn_my_role() in ('admin','md','manager','lead_worker','accounts')
);

-- ── 4) updated_at touch (reuse fn_ms_touch from 0040) ───────
drop trigger if exists trg_pm_touch on public.project_materials;
create trigger trg_pm_touch before update on public.project_materials
  for each row execute function public.fn_ms_touch();

-- ── 5) Append-only audit ────────────────────────────────────
-- One row per significant change. INSERTs always log 'created'.
-- UPDATEs log status changes and quantity changes separately so the
-- history feed can render distinct timeline events.
create or replace function public.fn_pm_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_qty_delta numeric;
begin
  if tg_op = 'INSERT' then
    insert into project_material_history
      (material_id, action, detail, to_status, changed_by)
      values (new.id, 'created',
              'Material added: ' || new.description ||
                ' (qty ' || new.quantity_planned || ')',
              new.status, new.last_action_by);
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      insert into project_material_history
        (material_id, action, detail, from_status, to_status, changed_by)
        values (new.id, new.status::text,
                'Status: ' || old.status::text || ' → ' || new.status::text,
                old.status, new.status, new.last_action_by);
    end if;
    if old.quantity_received_warehouse is distinct from new.quantity_received_warehouse then
      v_qty_delta := new.quantity_received_warehouse - old.quantity_received_warehouse;
      insert into project_material_history
        (material_id, action, detail, qty_delta, changed_by)
        values (new.id, 'qty_warehouse',
                'Warehouse qty: ' || old.quantity_received_warehouse ||
                  ' → ' || new.quantity_received_warehouse,
                v_qty_delta, new.last_action_by);
    end if;
    if old.quantity_delivered_site is distinct from new.quantity_delivered_site then
      v_qty_delta := new.quantity_delivered_site - old.quantity_delivered_site;
      insert into project_material_history
        (material_id, action, detail, qty_delta, changed_by)
        values (new.id, 'qty_site',
                'Site qty: ' || old.quantity_delivered_site ||
                  ' → ' || new.quantity_delivered_site,
                v_qty_delta, new.last_action_by);
    end if;
  end if;
  return null;
end $$;
alter function public.fn_pm_audit() owner to postgres;

drop trigger if exists trg_pm_audit_ins on public.project_materials;
create trigger trg_pm_audit_ins after insert on public.project_materials
  for each row execute function public.fn_pm_audit();

drop trigger if exists trg_pm_audit_upd on public.project_materials;
create trigger trg_pm_audit_upd after update on public.project_materials
  for each row execute function public.fn_pm_audit();

-- ── 6) Auto-seed on Design → Material Supply phase advance ──
-- AFTER UPDATE on projects. When current_phase changes to
-- 'material_supply', copy the items from the approved material
-- submittal revision into project_materials. ONE-TIME: skipped if
-- rows already exist for this project (defensive against phase
-- regression + re-advance, or accidental double-fire).
--
-- material_submittals.approved_revision stores the revision_NUMBER,
-- not the revision_id, so we resolve via JOIN to find the row.
--
-- Defensive: if no approved revision exists (shouldn't happen — the
-- design gate in 0044 blocks the transition without one), the seed
-- is skipped silently rather than raising. The phase advance still
-- succeeds (the project just lands in Material Supply with no
-- materials yet, which the lead tech can add manually).
create or replace function public.fn_pm_seed_on_phase_advance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_approved_rev_id uuid;
  v_seeded_count    int;
begin
  if old.current_phase is distinct from 'material_supply'
     and new.current_phase = 'material_supply' then
    -- Skip if already seeded.
    if exists (select 1 from project_materials where project_id = new.id) then
      return new;
    end if;
    -- Resolve approved revision_number → revision_id.
    select r.id into v_approved_rev_id
      from material_submittal_revisions r
      join material_submittals s on s.id = r.submittal_id
     where s.project_id = new.id
       and s.approved_revision is not null
       and r.revision_number = s.approved_revision
     limit 1;
    if v_approved_rev_id is null then
      return new;   -- design gate should prevent this; silent skip
    end if;
    insert into project_materials
      (project_id, source_material_item_id, description, model_number, quantity_planned)
      select new.id, mi.id, mi.description, mi.model_number, mi.quantity
        from material_items mi
       where mi.revision_id = v_approved_rev_id;
    get diagnostics v_seeded_count = row_count;
    raise notice 'project_materials seeded: project=%, items=%', new.id, v_seeded_count;
  end if;
  return new;
end $$;
alter function public.fn_pm_seed_on_phase_advance() owner to postgres;

drop trigger if exists trg_pm_seed_on_phase_advance on public.projects;
create trigger trg_pm_seed_on_phase_advance
  after update of current_phase on public.projects
  for each row execute function public.fn_pm_seed_on_phase_advance();

-- ── 7) Phase gate — Material Supply → Installation ──────────
-- Mirrors the Design phase gate from migration 0044. Refuses the
-- transition unless every project_materials row is delivered_to_site
-- or cancelled. Defensive: an empty material list passes (no-op).
create or replace function public.fn_check_material_supply_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pending int; v_pending_descs text;
begin
  if old.current_phase is distinct from 'material_supply'
     or new.current_phase is distinct from 'installation' then
    return new;
  end if;
  select count(*),
         string_agg(description || ' (' || status::text || ')', '; ' order by description)
    into v_pending, v_pending_descs
    from project_materials
   where project_id = new.id
     and status not in ('delivered_to_site','cancelled');
  if v_pending > 0 then
    raise exception
      'Cannot advance to Installation — % material item(s) still pending: %',
      v_pending, v_pending_descs
      using errcode = 'P0001',
            hint = 'Mark each material as delivered_to_site or cancelled, then retry.';
  end if;
  return new;
end $$;
alter function public.fn_check_material_supply_gate() owner to postgres;

drop trigger if exists trg_check_material_supply_gate on public.projects;
create trigger trg_check_material_supply_gate
  before update of current_phase on public.projects
  for each row execute function public.fn_check_material_supply_gate();

-- ── 8) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_trgs int; v_enum int; v_fns int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('project_materials','project_material_history');
  if v_tabs <> 2 then raise exception '0201 failed: expected 2 tables, found %', v_tabs; end if;

  select count(*) into v_enum from pg_type where typname='project_material_status';
  if v_enum <> 1 then raise exception '0201 failed: project_material_status enum missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('project_materials','project_material_history');
  if v_pols < 3 then raise exception '0201 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_pm_touch','trg_pm_audit_ins','trg_pm_audit_upd',
    'trg_pm_seed_on_phase_advance','trg_check_material_supply_gate'
  ) and not tgisinternal;
  if v_trgs <> 5 then raise exception '0201 failed: expected 5 triggers, found %', v_trgs; end if;

  select count(*) into v_fns from pg_proc where proname in (
    'fn_pm_audit','fn_pm_seed_on_phase_advance','fn_check_material_supply_gate'
  );
  if v_fns < 3 then raise exception '0201 failed: expected 3 functions, found %', v_fns; end if;

  raise notice '─── 0201 applied: project_materials + history, % policies, % triggers, % functions ───',
    v_pols, v_trgs, v_fns;
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- /*
-- -- 1) Confirm tables, enum, triggers, functions present:
-- select table_name from information_schema.tables
--  where table_schema='public' and table_name in ('project_materials','project_material_history');
--
-- select unnest(enum_range(null::project_material_status));
--
-- select tgname from pg_trigger where tgname in (
--   'trg_pm_touch','trg_pm_audit_ins','trg_pm_audit_upd',
--   'trg_pm_seed_on_phase_advance','trg_check_material_supply_gate'
-- ) and not tgisinternal order by tgname;
-- -- Expect: 5 rows.
--
-- -- 2) Auto-seed test (no UI):
-- -- Pick a project that completed Phase 1 (approved Material Submittal).
-- -- For convenience, view candidates:
-- select p.id, p.code, p.current_phase, s.code as ms_code, s.approved_revision
--   from projects p
--   left join material_submittals s on s.project_id = p.id
--  where p.current_phase = 'design' and s.approved_revision is not null
--  limit 5;
--
-- -- Advance one such project to material_supply (this fires the seed trigger):
-- /*
-- update projects set current_phase = 'material_supply' where id = '<project_uuid>';
-- select * from project_materials where project_id = '<project_uuid>';
-- -- Expect: one row per material_items in the approved revision, all 'not_ordered'.
-- */
--
-- -- 3) Phase-gate test:
-- -- With the project at material_supply and some rows NOT delivered_to_site:
-- /*
-- update projects set current_phase = 'installation' where id = '<project_uuid>';
-- -- Expect: ERROR — pending materials listed.
-- */
--
-- -- Mark all rows as delivered, then retry:
-- /*
-- update project_materials set status = 'delivered_to_site' where project_id = '<project_uuid>';
-- update projects set current_phase = 'installation' where id = '<project_uuid>';
-- -- Expect: success. trg_project_phase_notify (from 0200) also fires a
-- -- notification to the project's lead_tech_id.
-- */
-- */
-- ============================================================
