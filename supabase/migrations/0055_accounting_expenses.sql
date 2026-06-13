-- ============================================================
-- 0055 — Accountant module · Phase 5 (Module 8): Expense Management
--
-- Operating-expense capture with mandatory receipts, a configurable
-- approval threshold, recurring-expense templates, and an append-only
-- audit trail. Mirrors the established accounting patterns:
--   • configurable categories  → accounting_lookups (lookup_type='expense_category')
--   • approval threshold        → accounting_settings.expense_approval_threshold
--   • payment method            → reuses the existing payment_method lookup
--   • append-only history        → mirrors vendor_bill_history / po_history
--   • private receipts bucket    → mirrors project-install-photos (0202)
--
-- WORKFLOW:
--   draft → (submit) → approved        [if total ≤ threshold: auto-approved]
--                    → pending_approval [if total > threshold: needs APPROVE]
--   pending_approval → approved | rejected
--   approved → paid
--   A receipt is REQUIRED to leave 'draft' (enforced by trigger). Manual
--   creation always carries a receipt; recurring-generated rows start as a
--   draft and must have a receipt attached before they can be submitted.
--
-- RLS (coarse, mirrors invoices/payables — the UI does the fine-grained
-- who-does-what): expenses read+write = admin/md/manager/accounts (manager
-- is in WRITE only so it can APPROVE; create/edit/pay is gated to accountant
-- in the data layer). Recurring templates: write = admin/md/accounts.
--
-- ⚠️ ASSUMPTIONS (flagged in the phase report):
--   • Approval threshold defaults to AED 5,000 (configurable in Settings).
--   • VAT is informational: `amount` + `vat_included` + `vat_amount` →
--     generated `total`. No tax posting/return is produced here.
--
-- Strictly ADDITIVE. Reuses fn_my_role() (0007) + fn_acct_touch() (0045).
-- Idempotent; single txn. Touches nothing outside this migration's objects
-- except additive columns/seeds on accounting_settings / accounting_lookups.
-- ============================================================

begin;

-- ── 1) Status enum ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_status') then
    create type expense_status as enum ('draft', 'pending_approval', 'approved', 'paid', 'rejected');
  end if;
end $$;

-- ── 2) Settings: approval threshold (additive) ──────────────
alter table public.accounting_settings
  add column if not exists expense_approval_threshold numeric(14,2) not null default 5000;

-- ── 3) Configurable expense categories (seed; editable in Settings) ──
insert into public.accounting_lookups (org_key, lookup_type, code, label, sort_order)
  select 'org_installtec', 'expense_category', c.code, c.label, c.ord
  from (values
    ('office_rent',     'Office Rent',     1),
    ('electricity',     'Electricity',     2),
    ('water',           'Water',           3),
    ('transportation',  'Transportation',  4),
    ('fuel',            'Fuel',            5),
    ('internet',        'Internet',        6),
    ('maintenance',     'Maintenance',     7),
    ('office_supplies', 'Office Supplies', 8),
    ('communication',   'Communication',   9),
    ('travel',          'Travel',          10),
    ('miscellaneous',   'Miscellaneous',   11)
  ) as c(code, label, ord)
  on conflict (org_key, lookup_type, code) do nothing;

-- ── 4) Tables ───────────────────────────────────────────────
create table if not exists public.expenses (
  id               uuid primary key default gen_random_uuid(),
  org_key          text not null default 'org_installtec',
  expense_number   text unique,                       -- EXP-YYYY-NNNN, set by trigger
  expense_date     date not null default current_date,
  category_code    text,                              -- accounting_lookups expense_category code
  vendor_id        uuid references public.vendors(id),
  description      text not null,

  amount           numeric(14,2) not null default 0 check (amount >= 0),
  vat_included     boolean       not null default false,
  vat_amount       numeric(14,2) not null default 0 check (vat_amount >= 0),
  -- If VAT is embedded in `amount`, total = amount; otherwise total = amount + vat.
  total            numeric(14,2) generated always as
                     (case when vat_included then amount else amount + vat_amount end) stored,

  -- Mandatory receipt to leave draft (enforced by trigger). Path in the
  -- private 'expense-receipts' bucket.
  receipt_path     text,
  receipt_name     text,

  payment_method   text,                              -- payment_method lookup code
  payment_reference text,
  paid_date        date,

  status           expense_status not null default 'draft',
  rejection_reason text,

  notes            text,
  created_by       uuid references public.users(id),
  last_action_by   uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.expense_history (
  id            uuid primary key default gen_random_uuid(),
  expense_id    uuid not null references public.expenses(id) on delete cascade,
  action        text not null,                        -- 'created' | <new status> | 'paid'
  detail        text,
  changed_by    uuid references public.users(id),
  changed_at    timestamptz not null default now()
);

create table if not exists public.recurring_expenses (
  id              uuid primary key default gen_random_uuid(),
  org_key         text not null default 'org_installtec',
  category_code   text,
  vendor_id       uuid references public.vendors(id),
  description     text not null,
  base_amount     numeric(14,2) not null default 0 check (base_amount >= 0),
  vat_included    boolean not null default false,
  frequency       text not null default 'monthly' check (frequency in ('monthly','quarterly')),
  next_due_date   date not null,
  is_active       boolean not null default true,
  notes           text,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_expenses_status    on public.expenses(status);
create index if not exists idx_expenses_category  on public.expenses(category_code) where category_code is not null;
create index if not exists idx_expenses_vendor    on public.expenses(vendor_id)     where vendor_id is not null;
create index if not exists idx_expenses_date      on public.expenses(org_key, expense_date desc);
create index if not exists idx_exp_hist_expense   on public.expense_history(expense_id, changed_at desc);
create index if not exists idx_recurring_due      on public.recurring_expenses(next_due_date) where is_active;

-- ── 5) RLS ──────────────────────────────────────────────────
alter table public.expenses           enable row level security;
alter table public.expense_history    enable row level security;
alter table public.recurring_expenses enable row level security;

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
-- Manager is in WRITE so it can APPROVE/REJECT; create/edit/pay is gated to
-- accountant in the data layer (RLS here is role-coarse).
drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses for all
  using      (public.fn_my_role() in ('admin','md','manager','accounts'))
  with check (public.fn_my_role() in ('admin','md','manager','accounts'));

drop policy if exists exp_hist_read on public.expense_history;
create policy exp_hist_read on public.expense_history for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);

drop policy if exists recurring_read on public.recurring_expenses;
create policy recurring_read on public.recurring_expenses for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists recurring_write on public.recurring_expenses;
create policy recurring_write on public.recurring_expenses for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- ── 6) updated_at touch (reuse fn_acct_touch from 0045) ─────
drop trigger if exists trg_expenses_touch on public.expenses;
create trigger trg_expenses_touch before update on public.expenses
  for each row execute function public.fn_acct_touch();

drop trigger if exists trg_recurring_touch on public.recurring_expenses;
create trigger trg_recurring_touch before update on public.recurring_expenses
  for each row execute function public.fn_acct_touch();

-- ── 7) Before-write: number + actor seed + receipt guard ────
create or replace function public.fn_expense_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year text; v_count int;
begin
  if tg_op = 'INSERT' and new.expense_number is null then
    v_year := to_char(now(), 'YYYY');
    select count(*) + 1 into v_count from expenses where expense_number like 'EXP-' || v_year || '-%';
    new.expense_number := 'EXP-' || v_year || '-' || lpad(v_count::text, 4, '0');
  end if;
  new.last_action_by := coalesce(new.last_action_by, new.created_by);
  -- A receipt is mandatory to leave draft.
  if new.status <> 'draft' and coalesce(new.receipt_path, '') = '' then
    raise exception 'A receipt is required before this expense can be submitted or approved.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
alter function public.fn_expense_before_write() owner to postgres;

drop trigger if exists trg_expense_before_write on public.expenses;
create trigger trg_expense_before_write before insert or update on public.expenses
  for each row execute function public.fn_expense_before_write();

-- ── 8) Append-only audit (mirrors vendor_bill_history) ──────
create or replace function public.fn_expense_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into expense_history (expense_id, action, detail, changed_by)
      values (new.id, 'created', 'Expense ' || new.expense_number || ' created', new.last_action_by);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into expense_history (expense_id, action, detail, changed_by)
      values (new.id, new.status::text,
              case when new.status = 'rejected' and new.rejection_reason is not null
                   then 'Rejected: ' || new.rejection_reason
                   else 'Status: ' || old.status::text || ' → ' || new.status::text end,
              new.last_action_by);
  end if;
  return null;
end $$;
alter function public.fn_expense_audit() owner to postgres;

drop trigger if exists trg_expense_audit_ins on public.expenses;
create trigger trg_expense_audit_ins after insert on public.expenses
  for each row execute function public.fn_expense_audit();

drop trigger if exists trg_expense_audit_upd on public.expenses;
create trigger trg_expense_audit_upd after update on public.expenses
  for each row execute function public.fn_expense_audit();

-- ── 9) Private receipts bucket + storage RLS ────────────────
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

drop policy if exists expense_receipts_read on storage.objects;
create policy expense_receipts_read on storage.objects for select using (
  bucket_id = 'expense-receipts'
  and public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists expense_receipts_insert on storage.objects;
create policy expense_receipts_insert on storage.objects for insert with check (
  bucket_id = 'expense-receipts'
  and public.fn_my_role() in ('admin','md','accounts')
);
drop policy if exists expense_receipts_delete on storage.objects;
create policy expense_receipts_delete on storage.objects for delete using (
  bucket_id = 'expense-receipts'
  and public.fn_my_role() in ('admin','md','accounts')
);

-- ── 10) Smoke test ──────────────────────────────────────────
do $$
declare v_tabs int; v_enum int; v_bucket int; v_cats int; v_col int; v_gen int; v_pols int; v_trgs int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('expenses','expense_history','recurring_expenses');
  if v_tabs <> 3 then raise exception '0055 failed: expected 3 tables, found %', v_tabs; end if;

  select count(*) into v_enum from pg_type where typname='expense_status';
  if v_enum <> 1 then raise exception '0055 failed: expense_status enum missing'; end if;

  select count(*) into v_gen from information_schema.columns
   where table_schema='public' and table_name='expenses' and column_name='total' and is_generated='ALWAYS';
  if v_gen <> 1 then raise exception '0055 failed: total is not generated'; end if;

  select count(*) into v_col from information_schema.columns
   where table_schema='public' and table_name='accounting_settings' and column_name='expense_approval_threshold';
  if v_col <> 1 then raise exception '0055 failed: expense_approval_threshold column missing'; end if;

  select count(*) into v_cats from accounting_lookups
   where org_key='org_installtec' and lookup_type='expense_category';
  if v_cats < 11 then raise exception '0055 failed: expense categories not seeded (%)', v_cats; end if;

  select count(*) into v_bucket from storage.buckets where id='expense-receipts';
  if v_bucket <> 1 then raise exception '0055 failed: expense-receipts bucket missing'; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('expenses','expense_history','recurring_expenses');
  if v_pols < 5 then raise exception '0055 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_expenses_touch','trg_recurring_touch','trg_expense_before_write',
    'trg_expense_audit_ins','trg_expense_audit_upd'
  ) and not tgisinternal;
  if v_trgs <> 5 then raise exception '0055 failed: expected 5 triggers, found %', v_trgs; end if;

  raise notice '─── 0055 applied: expenses + recurring + history, % categories, % policies, % triggers ───',
    v_cats, v_pols, v_trgs;
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (Supabase SQL Editor, after applying)
-- ============================================================
-- /*
-- select unnest(enum_range(null::expense_status));
-- select code,label from accounting_lookups where lookup_type='expense_category' order by sort_order;
-- select expense_approval_threshold from accounting_settings where org_key='org_installtec';
-- select id from storage.buckets where id='expense-receipts';
-- -- generated total: vat added on top
-- -- insert into expenses(description, amount, vat_amount, receipt_path, status)
-- --   values ('Test', 1000, 50, 'expense/x.jpg', 'draft') returning expense_number, total; -- 1050
-- */
-- ============================================================
