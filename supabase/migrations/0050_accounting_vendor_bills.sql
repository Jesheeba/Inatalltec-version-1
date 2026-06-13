-- ============================================================
-- 0050 — Accountant module · Phase 2 (Slice 2C.1): Vendor Payables
--
-- Vendor bills = the amounts we owe vendors. SOURCE MODEL = Option B
-- (manual bill entry): the Accountant records the vendor's own invoice
-- against a vendor (optionally linked to a PO), capturing the vendor's
-- real invoice number / date / amount — which may differ from the PO
-- (discounts, returns, partial supply). AP aging + payments derive from
-- these bills. There is no separate "payables" table — a payable is just
-- a bill with an outstanding balance (mirrors how receivables derive from
-- invoices in 0046).
--
-- Tables:
--   vendor_bills          — header: our bill_number (BILL-YYYY-NNNN) +
--                           the vendor's invoice number, dates, amounts;
--                           amount_paid + status are trigger-maintained
--   vendor_bill_payments  — payments we make against a bill; drive status
--   vendor_bill_history   — APPEND-ONLY audit trail (mirrors
--                           project_jca_history / po_history: read-only +
--                           trigger-written; never editable/deletable)
--
-- CONFIG-DRIVEN (reads accounting_settings, 0045 + this file):
--   • bill number prefix  → added here as bill_prefix (default 'BILL')
--   • due date            → vendor.payment_terms_days, else invoice_due_days
--   • aging buckets       → used by the UI (Slice 2C.2), not here
--   • payment methods     → the configurable lookup list
--
-- Status workflow (money → status by trigger):
--   unpaid → partial_paid → paid    (set automatically from payments)
--          → cancelled              (void an erroneous bill, no payments)
--
-- RLS (coarse, mirrors the app; fine-grained who-does-what is in the UI):
--   bills / payments read  : admin · md · manager · accounts
--   bills / payments write : admin · md · accounts   (Accountant owns AP)
--   history read  : admin · md · accounts (audit-confidential); written
--                   only by trigger; no insert/update/delete → immutable
--
-- Strictly additive. Reuses fn_my_role() (0006) + fn_acct_touch() (0045).
-- Idempotent; single txn.
-- ============================================================

begin;

-- ── 0) Extend settings with the bill-number prefix ──────────
alter table public.accounting_settings
  add column if not exists bill_prefix text not null default 'BILL';

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'bill_status') then
    create type bill_status as enum ('unpaid', 'partial_paid', 'paid', 'cancelled');
  end if;
end $$;

-- ── 2) Tables ───────────────────────────────────────────────
create table if not exists public.vendor_bills (
  id                     uuid primary key default gen_random_uuid(),
  org_key                text not null default 'org_installtec',
  bill_number            text unique,            -- BILL-YYYY-NNNN, set by trigger
  vendor_id              uuid not null references public.vendors(id) on delete restrict,
  po_id                  uuid references public.purchase_orders(id) on delete set null,
  project_id             uuid references public.projects(id) on delete set null,
  -- The vendor's own invoice number (their document; free text).
  vendor_invoice_number  text,
  status                 bill_status not null default 'unpaid',
  bill_date              date not null default current_date,
  due_date               date,                   -- defaulted from vendor terms
  -- Amounts entered from the vendor's invoice; total is generated.
  subtotal               numeric(14,2) not null default 0,
  tax_amount             numeric(14,2) not null default 0,
  total                  numeric(14,2) generated always as (subtotal + tax_amount) stored,
  amount_paid            numeric(14,2) not null default 0,   -- trigger-maintained
  notes                  text,
  created_by             uuid references public.users(id),
  last_action_by         uuid references public.users(id),   -- read by audit trigger
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Guard against entering the same vendor invoice twice (when a number is
-- supplied). Nulls are allowed/duplicable (some bills have no number yet).
create unique index if not exists uq_vendor_bill_vinv
  on public.vendor_bills(org_key, vendor_id, vendor_invoice_number)
  where vendor_invoice_number is not null;

create table if not exists public.vendor_bill_payments (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references public.vendor_bills(id) on delete cascade,
  amount        numeric(14,2) not null check (amount > 0),
  paid_at       date not null default current_date,
  method        text,                            -- payment_method code (configurable)
  reference     text,
  notes         text,
  recorded_by   uuid references public.users(id),
  created_at    timestamptz not null default now()
);

create table if not exists public.vendor_bill_history (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references public.vendor_bills(id) on delete cascade,
  action        text not null,                   -- 'created' | <new status>
  detail        text,
  changed_by    uuid references public.users(id),
  changed_at    timestamptz not null default now()
);

create index if not exists idx_vbills_vendor    on public.vendor_bills(vendor_id);
create index if not exists idx_vbills_po          on public.vendor_bills(po_id);
create index if not exists idx_vbills_status      on public.vendor_bills(status);
create index if not exists idx_vbill_pays_bill    on public.vendor_bill_payments(bill_id);
create index if not exists idx_vbill_hist_bill    on public.vendor_bill_history(bill_id);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.vendor_bills         enable row level security;
alter table public.vendor_bill_payments enable row level security;
alter table public.vendor_bill_history  enable row level security;

drop policy if exists vbills_read on public.vendor_bills;
create policy vbills_read on public.vendor_bills for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists vbills_write on public.vendor_bills;
create policy vbills_write on public.vendor_bills for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists vbill_pays_read on public.vendor_bill_payments;
create policy vbill_pays_read on public.vendor_bill_payments for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists vbill_pays_write on public.vendor_bill_payments;
create policy vbill_pays_write on public.vendor_bill_payments for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- Audit history: read-only to the audit audience; trigger-written only.
drop policy if exists vbill_hist_read on public.vendor_bill_history;
create policy vbill_hist_read on public.vendor_bill_history for select using (
  public.fn_my_role() in ('admin','md','accounts')
);

-- ── 4) updated_at touch (reuse fn_acct_touch from 0045) ─────
drop trigger if exists trg_vbills_touch on public.vendor_bills;
create trigger trg_vbills_touch before update on public.vendor_bills
  for each row execute function public.fn_acct_touch();

-- ── 5) Number + due-date assignment (reads settings + vendor) ─
create or replace function public.fn_vendor_bill_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_year text; v_count int; v_days int;
begin
  if new.bill_number is null then
    select bill_prefix into v_prefix from accounting_settings
      where org_key = coalesce(new.org_key, 'org_installtec');
    v_prefix := coalesce(v_prefix, 'BILL');
    v_year := to_char(now(), 'YYYY');
    select count(*) + 1 into v_count from vendor_bills
      where bill_number like v_prefix || '-' || v_year || '-%';
    new.bill_number := v_prefix || '-' || v_year || '-' || lpad(v_count::text, 4, '0');
  end if;
  -- Default due date from the vendor's terms, then the org default.
  if new.due_date is null then
    select payment_terms_days into v_days from vendors where id = new.vendor_id;
    if v_days is null then
      select invoice_due_days into v_days from accounting_settings
        where org_key = coalesce(new.org_key, 'org_installtec');
    end if;
    new.due_date := new.bill_date + coalesce(v_days, 30);
  end if;
  new.last_action_by := coalesce(new.last_action_by, new.created_by);
  return new;
end $$;
alter function public.fn_vendor_bill_before_insert() owner to postgres;

drop trigger if exists trg_vbill_before_insert on public.vendor_bills;
create trigger trg_vbill_before_insert before insert on public.vendor_bills
  for each row execute function public.fn_vendor_bill_before_insert();

-- ── 6) Payments → amount_paid + paid/partial status ─────────
create or replace function public.fn_vendor_bill_payment_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_paid numeric; v_total numeric; v_status bill_status; v_new bill_status; v_actor uuid;
begin
  v_id := coalesce(new.bill_id, old.bill_id);
  v_actor := coalesce(new.recorded_by, old.recorded_by);
  select total, status into v_total, v_status from vendor_bills where id = v_id;
  select coalesce(sum(amount), 0) into v_paid from vendor_bill_payments where bill_id = v_id;

  v_new := v_status;
  if v_status <> 'cancelled' then
    if v_total > 0 and v_paid >= v_total then
      v_new := 'paid';
    elsif v_paid > 0 then
      v_new := 'partial_paid';
    else
      v_new := 'unpaid';
    end if;
  end if;

  update vendor_bills
     set amount_paid = v_paid, status = v_new, last_action_by = coalesce(v_actor, last_action_by)
   where id = v_id;
  return null;
end $$;
alter function public.fn_vendor_bill_payment_recalc() owner to postgres;

drop trigger if exists trg_vbill_payment_recalc on public.vendor_bill_payments;
create trigger trg_vbill_payment_recalc after insert or update or delete on public.vendor_bill_payments
  for each row execute function public.fn_vendor_bill_payment_recalc();

-- ── 7) Append-only audit trail (created + status transitions) ──
create or replace function public.fn_vendor_bill_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into vendor_bill_history (bill_id, action, detail, changed_by)
      values (new.id, 'created', 'Vendor bill recorded', new.last_action_by);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into vendor_bill_history (bill_id, action, detail, changed_by)
      values (new.id, new.status::text, 'Status changed to ' || new.status, new.last_action_by);
  end if;
  return null;
end $$;
alter function public.fn_vendor_bill_audit() owner to postgres;

drop trigger if exists trg_vbill_audit_ins on public.vendor_bills;
create trigger trg_vbill_audit_ins after insert on public.vendor_bills
  for each row execute function public.fn_vendor_bill_audit();

drop trigger if exists trg_vbill_audit_upd on public.vendor_bills;
create trigger trg_vbill_audit_upd after update of status on public.vendor_bills
  for each row execute function public.fn_vendor_bill_audit();

-- ── 8) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_trgs int; v_enum int; v_col int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('vendor_bills','vendor_bill_payments','vendor_bill_history');
  if v_tabs <> 3 then raise exception '0050 failed: expected 3 tables, found %', v_tabs; end if;

  select count(*) into v_enum from pg_type where typname='bill_status';
  if v_enum <> 1 then raise exception '0050 failed: bill_status enum missing'; end if;

  select count(*) into v_col from information_schema.columns
   where table_schema='public' and table_name='accounting_settings' and column_name='bill_prefix';
  if v_col <> 1 then raise exception '0050 failed: bill_prefix setting missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('vendor_bills','vendor_bill_payments','vendor_bill_history');
  if v_pols < 5 then raise exception '0050 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_vbill_before_insert','trg_vbill_payment_recalc',
    'trg_vbill_audit_ins','trg_vbill_audit_upd','trg_vbills_touch'
  );
  if v_trgs < 5 then raise exception '0050 failed: triggers missing (%)', v_trgs; end if;

  raise notice '─── 0050 applied: vendor_bills + payments + history, % policies, % triggers ───', v_pols, v_trgs;
end $$;

commit;
