-- ============================================================
-- 0048 — Accountant module · Phase 2 (Slice 2B): Purchase Orders
--
-- Procurement against vendors (migration 0047). PO header + line items
-- + partial-receipt records + an append-only audit history. Vendor
-- Payables (Slice 2C) will be DERIVED from received POs + vendor invoices.
--
-- Tables:
--   purchase_orders   — header: number, vendor/project, status, dates,
--                       denormalised subtotal/tax/total (trigger-maintained)
--   po_line_items     — qty × rate (+ per-line tax %); line amounts are
--                       GENERATED; quantity_received maintained by receipts
--   po_receipts       — partial goods-receipt records (per line); drive
--                       quantity_received + the received/partially-received
--                       header status
--   po_history        — APPEND-ONLY audit trail (mirrors project_jca_history
--                       from 0043: read + nothing else; rows written only by
--                       a SECURITY DEFINER trigger, never editable/deletable)
--
-- CONFIG-DRIVEN (reads accounting_settings, migration 0045 + this file):
--   • PO number prefix          → purchase_orders.po_number (po_prefix)
--   • approval thresholds        → added to accounting_settings here; the
--                                  data layer reads them to compute the
--                                  required approval tier for a PO total
--
-- Status workflow (app-driven; receipts→status by trigger):
--   draft → pending_approval → approved → issued
--         → partially_received / received   (set from po_receipts)
--         → closed                          (manual, once received)
--         → cancelled                       (from a pre-issue state)
--
-- APPROVAL NOTE: the spec defines MULTI-LEVEL approval (OM / Accountant /
-- MD / Founder by amount). This slice stores the thresholds + computes the
-- required tier for display/gating, but the transition to 'approved' is a
-- SINGLE approval action (APPROVE_POS). Full multi-signatory enforcement is
-- deferred and flagged in the slice report.
--
-- RLS (coarse, mirrors the app; fine-grained who-does-what is in the UI):
--   PO read  : admin · md · manager · accounts
--   PO write : admin · md · manager · accounts   (manager = approve)
--   lines/receipts write : admin · md · accounts
--   history  : read = admin · md · accounts (audit-confidential); written
--              only by trigger; no insert/update/delete policy → immutable
--
-- Strictly additive. Reuses fn_my_role() (0006) + fn_acct_touch() (0045).
-- Idempotent; single txn.
-- ============================================================

begin;

-- ── 0) Extend settings with configurable PO approval thresholds ──
-- Defaults from the spec (Module 4); editable in the Settings UI.
alter table public.accounting_settings
  add column if not exists po_approval_threshold_1 numeric(14,2) not null default 10000,
  add column if not exists po_approval_threshold_2 numeric(14,2) not null default 50000,
  add column if not exists po_approval_threshold_3 numeric(14,2) not null default 200000;

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'po_status') then
    create type po_status as enum (
      'draft', 'pending_approval', 'approved', 'issued',
      'partially_received', 'received', 'closed', 'cancelled'
    );
  end if;
end $$;

-- ── 2) Tables ───────────────────────────────────────────────
create table if not exists public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  org_key         text not null default 'org_installtec',
  po_number       text unique,                 -- PREFIX-YYYY-NNNN, set by trigger
  vendor_id       uuid not null references public.vendors(id) on delete restrict,
  project_id      uuid references public.projects(id) on delete set null,
  status          po_status not null default 'draft',
  order_date      date not null default current_date,
  expected_date   date,
  description     text,
  notes           text,
  -- Denormalised money, maintained by trigger (never written directly).
  subtotal        numeric(14,2) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  created_by      uuid references public.users(id),
  approved_by     uuid references public.users(id),
  approved_at     timestamptz,
  issued_at       timestamptz,
  closed_at       timestamptz,
  -- Actor of the most recent mutating action; read by the audit trigger.
  last_action_by  uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.po_line_items (
  id                uuid primary key default gen_random_uuid(),
  po_id             uuid not null references public.purchase_orders(id) on delete cascade,
  description       text not null,
  quantity          numeric(14,2) not null default 1 check (quantity >= 0),
  rate              numeric(14,2) not null default 0,
  tax_pct           numeric(6,2)  not null default 0 check (tax_pct >= 0),
  line_subtotal     numeric(14,2) generated always as (round(quantity * rate, 2)) stored,
  line_tax          numeric(14,2) generated always as (round(quantity * rate * tax_pct / 100, 2)) stored,
  line_total        numeric(14,2) generated always as (round(quantity * rate, 2) + round(quantity * rate * tax_pct / 100, 2)) stored,
  -- Maintained by the receipts trigger (sum of receipts for this line).
  quantity_received numeric(14,2) not null default 0,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

create table if not exists public.po_receipts (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references public.purchase_orders(id) on delete cascade,
  po_line_id    uuid not null references public.po_line_items(id) on delete cascade,
  quantity      numeric(14,2) not null check (quantity > 0),
  received_at   date not null default current_date,
  reference     text,                           -- delivery note no. (shared across a delivery)
  notes         text,
  received_by   uuid references public.users(id),
  created_at    timestamptz not null default now()
);

create table if not exists public.po_history (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references public.purchase_orders(id) on delete cascade,
  action        text not null,                  -- 'created' | <new status>
  detail        text,
  changed_by    uuid references public.users(id),
  changed_at    timestamptz not null default now()
);

create index if not exists idx_po_vendor       on public.purchase_orders(vendor_id);
create index if not exists idx_po_project        on public.purchase_orders(project_id);
create index if not exists idx_po_status         on public.purchase_orders(status);
create index if not exists idx_po_lines_po       on public.po_line_items(po_id);
create index if not exists idx_po_receipts_po    on public.po_receipts(po_id);
create index if not exists idx_po_receipts_line  on public.po_receipts(po_line_id);
create index if not exists idx_po_history_po     on public.po_history(po_id);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.purchase_orders enable row level security;
alter table public.po_line_items   enable row level security;
alter table public.po_receipts     enable row level security;
alter table public.po_history      enable row level security;

drop policy if exists po_read on public.purchase_orders;
create policy po_read on public.purchase_orders for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists po_write on public.purchase_orders;
create policy po_write on public.purchase_orders for all
  using      (public.fn_my_role() in ('admin','md','manager','accounts'))
  with check (public.fn_my_role() in ('admin','md','manager','accounts'));

drop policy if exists po_lines_read on public.po_line_items;
create policy po_lines_read on public.po_line_items for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists po_lines_write on public.po_line_items;
create policy po_lines_write on public.po_line_items for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists po_receipts_read on public.po_receipts;
create policy po_receipts_read on public.po_receipts for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists po_receipts_write on public.po_receipts;
create policy po_receipts_write on public.po_receipts for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- Audit history: read-only to the audit audience (MD / Accountant / Admin).
-- No insert/update/delete policy → with RLS enabled, only the SECURITY
-- DEFINER trigger (owner postgres, bypasses RLS) can write. Immutable.
drop policy if exists po_history_read on public.po_history;
create policy po_history_read on public.po_history for select using (
  public.fn_my_role() in ('admin','md','accounts')
);

-- ── 4) updated_at touch (reuse fn_acct_touch from 0045) ─────
drop trigger if exists trg_po_touch on public.purchase_orders;
create trigger trg_po_touch before update on public.purchase_orders
  for each row execute function public.fn_acct_touch();

-- ── 5) Number assignment + actor seed (reads settings) ──────
create or replace function public.fn_po_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_year text; v_count int;
begin
  if new.po_number is null then
    select po_prefix into v_prefix from accounting_settings
      where org_key = coalesce(new.org_key, 'org_installtec');
    v_prefix := coalesce(v_prefix, 'PO');
    v_year := to_char(now(), 'YYYY');
    select count(*) + 1 into v_count from purchase_orders
      where po_number like v_prefix || '-' || v_year || '-%';
    new.po_number := v_prefix || '-' || v_year || '-' || lpad(v_count::text, 4, '0');
  end if;
  -- Seed the audit actor for the creation event.
  new.last_action_by := coalesce(new.last_action_by, new.created_by);
  return new;
end $$;
alter function public.fn_po_before_insert() owner to postgres;

drop trigger if exists trg_po_before_insert on public.purchase_orders;
create trigger trg_po_before_insert before insert on public.purchase_orders
  for each row execute function public.fn_po_before_insert();

-- ── 6) Header totals from line items ────────────────────────
create or replace function public.fn_po_lines_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := coalesce(new.po_id, old.po_id);
  update purchase_orders p set
    subtotal   = coalesce((select sum(line_subtotal) from po_line_items where po_id = v_id), 0),
    tax_amount = coalesce((select sum(line_tax)      from po_line_items where po_id = v_id), 0),
    total      = coalesce((select sum(line_total)    from po_line_items where po_id = v_id), 0)
  where p.id = v_id;
  return null;
end $$;
alter function public.fn_po_lines_recalc() owner to postgres;

drop trigger if exists trg_po_lines_recalc on public.po_line_items;
create trigger trg_po_lines_recalc after insert or update or delete on public.po_line_items
  for each row execute function public.fn_po_lines_recalc();

-- ── 7) Receipts → quantity_received + received status ───────
-- Recomputes the affected line's received qty, then sets the header to
-- received / partially_received / issued based on PER-LINE completion.
-- Only active once the PO is issued; never touches draft/approved.
create or replace function public.fn_po_receipt_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_po uuid; v_line uuid; v_actor uuid; v_status po_status; v_new po_status;
        v_all_full boolean; v_any boolean;
begin
  v_po    := coalesce(new.po_id, old.po_id);
  v_line  := coalesce(new.po_line_id, old.po_line_id);
  v_actor := coalesce(new.received_by, old.received_by);

  -- 1) Roll the affected line's received quantity.
  update po_line_items l set
    quantity_received = coalesce((select sum(quantity) from po_receipts where po_line_id = v_line), 0)
  where l.id = v_line;

  -- 2) Derive header status from per-line completion (only post-issue).
  select status into v_status from purchase_orders where id = v_po;
  if v_status in ('issued','partially_received','received') then
    select not exists (select 1 from po_line_items where po_id = v_po and quantity_received < quantity)
      into v_all_full;
    select exists (select 1 from po_line_items where po_id = v_po and quantity_received > 0)
      into v_any;
    if v_all_full and exists (select 1 from po_line_items where po_id = v_po) then
      v_new := 'received';
    elsif v_any then
      v_new := 'partially_received';
    else
      v_new := 'issued';
    end if;
    if v_new is distinct from v_status then
      update purchase_orders set status = v_new, last_action_by = v_actor where id = v_po;
    end if;
  end if;
  return null;
end $$;
alter function public.fn_po_receipt_recalc() owner to postgres;

drop trigger if exists trg_po_receipt_recalc on public.po_receipts;
create trigger trg_po_receipt_recalc after insert or update or delete on public.po_receipts
  for each row execute function public.fn_po_receipt_recalc();

-- ── 8) Append-only audit trail (created + status transitions) ──
create or replace function public.fn_po_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into po_history (po_id, action, detail, changed_by)
      values (new.id, 'created', 'Purchase order created', new.last_action_by);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into po_history (po_id, action, detail, changed_by)
      values (new.id, new.status::text, 'Status changed to ' || new.status, new.last_action_by);
  end if;
  return null;
end $$;
alter function public.fn_po_audit() owner to postgres;

drop trigger if exists trg_po_audit_ins on public.purchase_orders;
create trigger trg_po_audit_ins after insert on public.purchase_orders
  for each row execute function public.fn_po_audit();

drop trigger if exists trg_po_audit_upd on public.purchase_orders;
create trigger trg_po_audit_upd after update of status on public.purchase_orders
  for each row execute function public.fn_po_audit();

-- ── 9) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_trgs int; v_enum int; v_cols int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('purchase_orders','po_line_items','po_receipts','po_history');
  if v_tabs <> 4 then raise exception '0048 failed: expected 4 tables, found %', v_tabs; end if;

  select count(*) into v_enum from pg_type where typname='po_status';
  if v_enum <> 1 then raise exception '0048 failed: po_status enum missing'; end if;

  select count(*) into v_cols from information_schema.columns
   where table_schema='public' and table_name='accounting_settings'
     and column_name in ('po_approval_threshold_1','po_approval_threshold_2','po_approval_threshold_3');
  if v_cols <> 3 then raise exception '0048 failed: PO threshold columns missing (%)', v_cols; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('purchase_orders','po_line_items','po_receipts','po_history');
  if v_pols < 7 then raise exception '0048 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_po_before_insert','trg_po_lines_recalc','trg_po_receipt_recalc',
    'trg_po_audit_ins','trg_po_audit_upd','trg_po_touch'
  );
  if v_trgs < 6 then raise exception '0048 failed: triggers missing (%)', v_trgs; end if;

  raise notice '─── 0048 applied: POs + lines + receipts + history, % policies, % triggers ───', v_pols, v_trgs;
end $$;

commit;
