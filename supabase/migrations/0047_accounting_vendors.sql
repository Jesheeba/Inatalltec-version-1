-- ============================================================
-- 0047 — Accountant module · Phase 2 (Slice 2A): Vendors
--
-- Vendor / supplier master. The foundation for Purchase Orders (Slice 2B)
-- and Vendor Payables (Slice 2C). This slice is the schema + data layer
-- only — PO and payable tables, plus their UI, land in later slices.
--
-- Tables:
--   vendors  — one row per supplier; code auto-assigned (VEN-NNNN);
--              category is a CONFIGURABLE lookup (seeded below), status
--              is an enum (active / inactive / blacklisted)
--
-- CONFIG-DRIVEN (reads accounting_settings / lookups, migration 0045):
--   • vendor categories  → accounting_lookups (lookup_type='vendor_category')
--   • default pay terms   → vendors.payment_terms_days falls back to the
--                           org default (invoice_due_days) when not supplied
--                           [ASSUMPTION — flagged in the slice report]
--
-- Status workflow is flat (no transitions to gate): a vendor is active,
-- or made inactive / blacklisted from the Vendors UI (Slice 2B).
--
-- RLS (coarse, mirrors the app; fine-grained who-does-what is in the UI):
--   read  : admin · md · manager · accounts   (the finance audience)
--   write : admin · md · accounts             (Accountant owns the master)
--
-- Strictly additive. Reuses fn_my_role() (0006) + fn_acct_touch() (0045).
-- Idempotent; single txn.
-- ============================================================

begin;

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'vendor_status') then
    create type vendor_status as enum ('active', 'inactive', 'blacklisted');
  end if;
end $$;

-- ── 2) Table ────────────────────────────────────────────────
create table if not exists public.vendors (
  id                  uuid primary key default gen_random_uuid(),
  org_key             text not null default 'org_installtec',
  vendor_code         text unique,              -- VEN-NNNN, set by trigger
  name                text not null,
  -- Primary contact (the spec lists a multi-contact "Vendor Contacts"
  -- feature; this slice keeps the single primary contact on the row and
  -- defers a separate contacts table — flagged as an assumption).
  contact_person      text,
  phone               text,
  email               text,
  address             text,
  -- Tax identifiers. UAE vendors carry a 15-digit TRN; foreign vendors
  -- use their home registration number (kept free-text — validated in UI).
  trn                 text,
  foreign_tax_number  text,
  -- Free-text bank details for payment instructions (account name / no.
  -- / IBAN / bank). Structured later if a payment-file export needs it.
  bank_account        text,
  -- Net payment terms (days). Null at insert → defaulted from settings.
  payment_terms_days  int,
  -- Category: a configurable lookup code (see seed below).
  category            text not null default 'other',
  -- Country of registration. UAE default; supports foreign vendors.
  country             text not null default 'United Arab Emirates',
  status              vendor_status not null default 'active',
  notes               text,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_vendors_status   on public.vendors(status);
create index if not exists idx_vendors_category  on public.vendors(category);
create index if not exists idx_vendors_org       on public.vendors(org_key);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.vendors enable row level security;

drop policy if exists vendors_read on public.vendors;
create policy vendors_read on public.vendors for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists vendors_write on public.vendors;
create policy vendors_write on public.vendors for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- ── 4) updated_at touch (reuse fn_acct_touch from 0045) ─────
drop trigger if exists trg_vendors_touch on public.vendors;
create trigger trg_vendors_touch before update on public.vendors
  for each row execute function public.fn_acct_touch();

-- ── 5) Code assignment + pay-terms default (reads settings) ──
create or replace function public.fn_vendor_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int; v_days int;
begin
  -- Assign VEN-NNNN (sequential per org, zero-padded to 4).
  if new.vendor_code is null then
    select count(*) + 1 into v_count from vendors
      where org_key = coalesce(new.org_key, 'org_installtec');
    new.vendor_code := 'VEN-' || lpad(v_count::text, 4, '0');
  end if;
  -- Default net payment terms from the org standard (invoice_due_days)
  -- when the caller didn't specify them.
  if new.payment_terms_days is null then
    select invoice_due_days into v_days from accounting_settings
      where org_key = coalesce(new.org_key, 'org_installtec');
    new.payment_terms_days := coalesce(v_days, 30);
  end if;
  return new;
end $$;
alter function public.fn_vendor_before_insert() owner to postgres;

drop trigger if exists trg_vendor_before_insert on public.vendors;
create trigger trg_vendor_before_insert before insert on public.vendors
  for each row execute function public.fn_vendor_before_insert();

-- ── 6) Seed configurable vendor categories ──────────────────
-- Mirrors the payment_method seed shape from 0045. Categories are the
-- spec's four defaults; editable later via the lookups settings UI.
insert into public.accounting_lookups (org_key, lookup_type, code, label, sort_order)
  select 'org_installtec', 'vendor_category', c.code, c.label, c.ord
  from (values
    ('materials_supplier', 'Materials Supplier', 1),
    ('service_provider',   'Service Provider',   2),
    ('subcontractor',      'Subcontractor',      3),
    ('other',              'Other',              4)
  ) as c(code, label, ord)
  on conflict (org_key, lookup_type, code) do nothing;

-- ── 7) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_trgs int; v_enum int; v_cats int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name = 'vendors';
  if v_tabs <> 1 then raise exception '0047 failed: vendors table missing'; end if;

  select count(*) into v_enum from pg_type where typname='vendor_status';
  if v_enum <> 1 then raise exception '0047 failed: vendor_status enum missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename='vendors';
  if v_pols < 2 then raise exception '0047 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_vendor_before_insert','trg_vendors_touch'
  );
  if v_trgs < 2 then raise exception '0047 failed: triggers missing (%)', v_trgs; end if;

  select count(*) into v_cats from public.accounting_lookups
   where org_key='org_installtec' and lookup_type='vendor_category';
  if v_cats < 4 then raise exception '0047 failed: vendor categories not seeded (%)', v_cats; end if;

  raise notice '─── 0047 applied: vendors, % policies, % triggers, % categories ───', v_pols, v_trgs, v_cats;
end $$;

commit;
