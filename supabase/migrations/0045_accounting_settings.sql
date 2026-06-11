-- ============================================================
-- 0045 — Accountant module · Phase 0: Settings
--
-- Configuration foundation for the whole Accountant module. Every
-- accounting rule that could change (tax rate, document prefixes,
-- payment terms, aging buckets, enumerated lists like payment methods)
-- lives here instead of being hardcoded, so later phases read config
-- rather than baking in constants.
--
-- Two tables:
--   accounting_settings  — scalar config, ONE row per org_key
--   accounting_lookups   — generic editable enumerated lists
--                          (payment_method now; expense_category,
--                          vendor_type, etc. added by later phases)
--
-- ORG MODEL: this codebase has NO `organizations` table — "org" is an
-- app-level string id (lib/db.ts DEFAULT_ORG_ID = 'org_installtec').
-- So we key on a plain text `org_key` (default 'org_installtec', no FK).
-- Single-org in practice; future multi-org just adds rows.
--
-- RLS mirrors the app's coarse role model:
--   read  : admin · md · manager · accounts
--   write : admin · md · accounts        (manager is view-only here;
--           manager's powers are approvals, handled in later phases)
--
-- Strictly additive — touches nothing existing. Idempotent; single txn.
-- Reuses fn_my_role() (migration 0006).
-- ============================================================

begin;

-- ── 1) Scalar settings (one row per org_key) ────────────────
create table if not exists public.accounting_settings (
  id                   uuid primary key default gen_random_uuid(),
  org_key              text not null unique default 'org_installtec',
  -- Tax. UAE VAT is 5% (ASSUMPTION — editable from the Settings UI).
  default_tax_rate_pct numeric(6,2) not null default 5,
  tax_label            text not null default 'VAT',
  -- Document numbering prefixes. The running sequence per document is
  -- assigned by per-table triggers in later phases; this is just the
  -- human prefix (e.g. INV-2026-0001).
  invoice_prefix       text not null default 'INV',
  po_prefix            text not null default 'PO',
  -- Default invoice terms. Net 30 (ASSUMPTION — editable).
  invoice_due_days     int  not null default 30,
  -- AR / AP aging bucket upper bounds (days). Bucket 4 = beyond bucket_3.
  -- Defaults 30 / 60 / 90 (the spec's buckets; editable).
  aging_bucket_1_days  int  not null default 30,
  aging_bucket_2_days  int  not null default 60,
  aging_bucket_3_days  int  not null default 90,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 2) Generic enumerated lists ─────────────────────────────
create table if not exists public.accounting_lookups (
  id              uuid primary key default gen_random_uuid(),
  org_key         text not null default 'org_installtec',
  lookup_type     text not null,       -- e.g. 'payment_method'
  code            text not null,       -- stable machine value
  label           text not null,       -- human label
  sort_order      int  not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (org_key, lookup_type, code)
);

create index if not exists idx_acct_lookups_org_type
  on public.accounting_lookups(org_key, lookup_type);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.accounting_settings enable row level security;
alter table public.accounting_lookups  enable row level security;

drop policy if exists acct_settings_read on public.accounting_settings;
create policy acct_settings_read on public.accounting_settings for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists acct_settings_write on public.accounting_settings;
create policy acct_settings_write on public.accounting_settings for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists acct_lookups_read on public.accounting_lookups;
create policy acct_lookups_read on public.accounting_lookups for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists acct_lookups_write on public.accounting_lookups;
create policy acct_lookups_write on public.accounting_lookups for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- ── 4) updated_at touch trigger ─────────────────────────────
create or replace function public.fn_acct_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
alter function public.fn_acct_touch() owner to postgres;

drop trigger if exists trg_acct_settings_touch on public.accounting_settings;
create trigger trg_acct_settings_touch before update on public.accounting_settings
  for each row execute function public.fn_acct_touch();

-- ── 5) Seed defaults (idempotent) ───────────────────────────
-- One settings row for the default org.
insert into public.accounting_settings (org_key)
  values ('org_installtec')
  on conflict (org_key) do nothing;

-- Default payment methods (used by invoice/receivable/payable payments).
insert into public.accounting_lookups (org_key, lookup_type, code, label, sort_order)
  select 'org_installtec', 'payment_method', m.code, m.label, m.ord
  from (values
    ('bank_transfer', 'Bank Transfer', 1),
    ('cash',          'Cash',          2),
    ('cheque',        'Cheque',        3),
    ('card',          'Credit/Debit Card', 4),
    ('other',         'Other',         5)
  ) as m(code, label, ord)
  on conflict (org_key, lookup_type, code) do nothing;

-- ── 6) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_settings int; v_methods int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('accounting_settings','accounting_lookups');
  if v_tabs <> 2 then raise exception '0045 failed: expected 2 tables, found %', v_tabs; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('accounting_settings','accounting_lookups');
  if v_pols < 4 then raise exception '0045 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_settings from public.accounting_settings where org_key='org_installtec';
  if v_settings <> 1 then raise exception '0045 failed: default settings row not seeded'; end if;

  select count(*) into v_methods from public.accounting_lookups
   where org_key='org_installtec' and lookup_type='payment_method';
  if v_methods < 5 then raise exception '0045 failed: payment methods not seeded (%)', v_methods; end if;

  raise notice '─── 0045 applied: settings + lookups, % policies, % payment methods ───', v_pols, v_methods;
end $$;

commit;
