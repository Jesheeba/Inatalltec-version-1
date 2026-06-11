-- ============================================================
-- 0046 — Accountant module · Phase 1: Invoices + Receivables
--
-- Project invoicing with a status workflow, line items, and payments.
-- Receivables (AR aging) are DERIVED from invoices (outstanding = total
-- - amount_paid), so there is no separate receivables table — aging is
-- computed in the UI using the configurable buckets from settings (0045).
--
-- Tables:
--   invoices             — header: number, project/customer, status,
--                          dates, denormalised subtotal/tax/total/paid
--   invoice_line_items   — qty × rate (+ per-line tax %); line amounts
--                          are GENERATED; header totals rolled up by trg
--   invoice_payments     — receipts against an invoice; drive paid status
--
-- CONFIG-DRIVEN (reads accounting_settings, migration 0045):
--   • invoice number prefix      → invoices.invoice_number
--   • default invoice due days    → invoices.due_date (when not supplied)
--   • default tax rate            → applied by the data layer per line
--   • aging buckets               → used by the UI, not here
--
-- Status workflow (app-driven transitions; money→status by trigger):
--   draft → pending_approval → approved → sent
--         → partially_paid / paid   (set automatically from payments)
--         → cancelled               (void, from any non-paid state)
--   'overdue' is an ENUM value for completeness but is DERIVED in the UI
--   (sent/partially_paid past due_date) — no scheduler flips it here.
--
-- RLS (coarse, mirrors the app; fine-grained who-does-what is in the UI):
--   read  : admin · md · manager · accounts
--   invoices write : admin · md · manager · accounts  (manager = approve)
--   lines/payments write : admin · md · accounts
--
-- Strictly additive. Reuses fn_my_role() (0006) + fn_acct_touch() (0045).
-- Idempotent; single txn.
-- ============================================================

begin;

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type invoice_status as enum (
      'draft', 'pending_approval', 'approved', 'sent',
      'partially_paid', 'paid', 'overdue', 'cancelled'
    );
  end if;
end $$;

-- ── 2) Tables ───────────────────────────────────────────────
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  org_key         text not null default 'org_installtec',
  invoice_number  text unique,                 -- PREFIX-YYYY-NNNN, set by trigger
  project_id      uuid references public.projects(id) on delete set null,
  customer_id     uuid not null references public.customers(id) on delete restrict,
  status          invoice_status not null default 'draft',
  invoice_date    date not null default current_date,
  due_date        date,                         -- defaulted from settings if null
  description     text,
  notes           text,
  -- Denormalised money, maintained by triggers (never written directly).
  subtotal        numeric(14,2) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,
  created_by      uuid references public.users(id),
  approved_by     uuid references public.users(id),
  approved_at     timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.invoice_line_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  description   text not null,
  quantity      numeric(14,2) not null default 1 check (quantity >= 0),
  rate          numeric(14,2) not null default 0,
  tax_pct       numeric(6,2)  not null default 0 check (tax_pct >= 0),
  -- Generated line amounts (base columns only → valid generated exprs).
  line_subtotal numeric(14,2) generated always as (round(quantity * rate, 2)) stored,
  line_tax      numeric(14,2) generated always as (round(quantity * rate * tax_pct / 100, 2)) stored,
  line_total    numeric(14,2) generated always as (round(quantity * rate, 2) + round(quantity * rate * tax_pct / 100, 2)) stored,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.invoice_payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  amount        numeric(14,2) not null check (amount > 0),
  received_at   date not null default current_date,
  method        text,                           -- payment_method code (configurable list)
  reference     text,
  notes         text,
  recorded_by   uuid references public.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_invoices_project   on public.invoices(project_id);
create index if not exists idx_invoices_customer   on public.invoices(customer_id);
create index if not exists idx_invoices_status     on public.invoices(status);
create index if not exists idx_inv_lines_invoice   on public.invoice_line_items(invoice_id);
create index if not exists idx_inv_pays_invoice    on public.invoice_payments(invoice_id);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.invoices            enable row level security;
alter table public.invoice_line_items  enable row level security;
alter table public.invoice_payments    enable row level security;

drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices for all
  using      (public.fn_my_role() in ('admin','md','manager','accounts'))
  with check (public.fn_my_role() in ('admin','md','manager','accounts'));

drop policy if exists inv_lines_read on public.invoice_line_items;
create policy inv_lines_read on public.invoice_line_items for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists inv_lines_write on public.invoice_line_items;
create policy inv_lines_write on public.invoice_line_items for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists inv_pays_read on public.invoice_payments;
create policy inv_pays_read on public.invoice_payments for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists inv_pays_write on public.invoice_payments;
create policy inv_pays_write on public.invoice_payments for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- ── 4) updated_at touch (reuse fn_acct_touch from 0045) ─────
drop trigger if exists trg_invoices_touch on public.invoices;
create trigger trg_invoices_touch before update on public.invoices
  for each row execute function public.fn_acct_touch();

-- ── 5) Number + due-date assignment (reads settings 0045) ───
create or replace function public.fn_invoice_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_days int; v_year text; v_count int;
begin
  -- Default due date from the configurable invoice_due_days.
  if new.due_date is null then
    select invoice_due_days into v_days from accounting_settings
      where org_key = coalesce(new.org_key, 'org_installtec');
    new.due_date := new.invoice_date + coalesce(v_days, 30);
  end if;
  -- Assign PREFIX-YYYY-NNNN using the configurable prefix.
  if new.invoice_number is null then
    select invoice_prefix into v_prefix from accounting_settings
      where org_key = coalesce(new.org_key, 'org_installtec');
    v_prefix := coalesce(v_prefix, 'INV');
    v_year := to_char(now(), 'YYYY');
    select count(*) + 1 into v_count from invoices
      where invoice_number like v_prefix || '-' || v_year || '-%';
    new.invoice_number := v_prefix || '-' || v_year || '-' || lpad(v_count::text, 4, '0');
  end if;
  return new;
end $$;
alter function public.fn_invoice_before_insert() owner to postgres;

drop trigger if exists trg_invoice_before_insert on public.invoices;
create trigger trg_invoice_before_insert before insert on public.invoices
  for each row execute function public.fn_invoice_before_insert();

-- ── 6) Header totals from line items ────────────────────────
create or replace function public.fn_invoice_lines_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := coalesce(new.invoice_id, old.invoice_id);
  update invoices i set
    subtotal   = coalesce((select sum(line_subtotal) from invoice_line_items where invoice_id = v_id), 0),
    tax_amount = coalesce((select sum(line_tax)      from invoice_line_items where invoice_id = v_id), 0),
    total      = coalesce((select sum(line_total)    from invoice_line_items where invoice_id = v_id), 0)
  where i.id = v_id;
  return null;
end $$;
alter function public.fn_invoice_lines_recalc() owner to postgres;

drop trigger if exists trg_inv_lines_recalc on public.invoice_line_items;
create trigger trg_inv_lines_recalc after insert or update or delete on public.invoice_line_items
  for each row execute function public.fn_invoice_lines_recalc();

-- ── 7) Payments → amount_paid + paid/partially_paid status ──
-- The "money received → status" rule lives here so it's consistent
-- regardless of caller. Only auto-manages the active billing states;
-- never touches draft/pending_approval/cancelled.
create or replace function public.fn_invoice_payment_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_paid numeric; v_total numeric; v_status invoice_status; v_new invoice_status;
begin
  v_id := coalesce(new.invoice_id, old.invoice_id);
  select total, status into v_total, v_status from invoices where id = v_id;
  select coalesce(sum(amount), 0) into v_paid from invoice_payments where invoice_id = v_id;

  v_new := v_status;
  if v_status in ('approved','sent','partially_paid','paid') then
    if v_total > 0 and v_paid >= v_total then
      v_new := 'paid';
    elsif v_paid > 0 then
      v_new := 'partially_paid';
    elsif v_status in ('partially_paid','paid') then
      v_new := 'sent';   -- all payments removed → revert to sent
    end if;
  end if;

  update invoices set amount_paid = v_paid, status = v_new where id = v_id;
  return null;
end $$;
alter function public.fn_invoice_payment_recalc() owner to postgres;

drop trigger if exists trg_inv_payment_recalc on public.invoice_payments;
create trigger trg_inv_payment_recalc after insert or update or delete on public.invoice_payments
  for each row execute function public.fn_invoice_payment_recalc();

-- ── 8) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_trgs int; v_enum int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('invoices','invoice_line_items','invoice_payments');
  if v_tabs <> 3 then raise exception '0046 failed: expected 3 tables, found %', v_tabs; end if;

  select count(*) into v_enum from pg_type where typname='invoice_status';
  if v_enum <> 1 then raise exception '0046 failed: invoice_status enum missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('invoices','invoice_line_items','invoice_payments');
  if v_pols < 6 then raise exception '0046 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_invoice_before_insert','trg_inv_lines_recalc','trg_inv_payment_recalc','trg_invoices_touch'
  );
  if v_trgs < 4 then raise exception '0046 failed: triggers missing (%)', v_trgs; end if;

  raise notice '─── 0046 applied: invoices + lines + payments, % policies, % triggers ───', v_pols, v_trgs;
end $$;

commit;
