-- ============================================================
-- 0056 — Accountant module · Phase 7 (Module 10): Bank Reconciliation
--
-- Import a bank statement (CSV) → store its transaction rows → match them
-- against the cash movements the system already recorded (invoice receipts,
-- vendor/expense/sub/payroll payments) → close the month with a reconciliation
-- record (book vs bank, difference). Matching is done in the data layer; the
-- DB just stores the statement, its lines, and the close-out.
--
-- Tables:
--   bank_statements             — one imported statement (period + balances + CSV file)
--   bank_transactions           — parsed rows; status unmatched/matched/ignored
--   bank_reconciliations        — monthly close-out (book vs bank, generated difference)
--   bank_reconciliation_history — append-only audit (mirrors expense_history)
--
-- RLS: everything admin/md/accounts (reconciliation is accountant work).
-- Private 'bank-statements' bucket holds the uploaded CSVs.
--
-- Strictly ADDITIVE. Reuses fn_my_role() (0007) + fn_acct_touch() (0045).
-- Idempotent; single txn.
-- ============================================================

begin;

-- ── 1) Tables ───────────────────────────────────────────────
create table if not exists public.bank_statements (
  id              uuid primary key default gen_random_uuid(),
  org_key         text not null default 'org_installtec',
  statement_ref   text unique,                       -- BS-YYYY-NNNN, set by trigger
  bank_name       text,
  account_label   text,
  period_start    date,
  period_end      date,
  opening_balance numeric(14,2) not null default 0,
  closing_balance numeric(14,2) not null default 0,
  file_path       text,                              -- CSV in private 'bank-statements' bucket
  file_name       text,
  created_by      uuid references public.users(id),
  last_action_by  uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id            uuid primary key default gen_random_uuid(),
  statement_id  uuid not null references public.bank_statements(id) on delete cascade,
  txn_date      date not null,
  description   text,
  reference     text,
  -- Signed: positive = money IN (credit), negative = money OUT (debit).
  amount        numeric(14,2) not null,
  status        text not null default 'unmatched' check (status in ('unmatched','matched','ignored')),
  matched_type  text,                                -- 'invoice_payment' | 'vendor_payment' | 'expense' | 'sub_payment' | 'payroll' | 'manual'
  matched_ref   text,                                -- human ref of the matched record
  matched_note  text,
  matched_at    timestamptz,
  matched_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);

create table if not exists public.bank_reconciliations (
  id              uuid primary key default gen_random_uuid(),
  org_key         text not null default 'org_installtec',
  recon_ref       text unique,                       -- REC-YYYY-MM, set by trigger
  period_year     int not null check (period_year between 2000 and 2100),
  period_month    int not null check (period_month between 1 and 12),
  statement_id    uuid references public.bank_statements(id) on delete set null,
  book_balance    numeric(14,2) not null default 0,  -- per our records
  bank_balance    numeric(14,2) not null default 0,  -- per the statement
  difference      numeric(14,2) generated always as (bank_balance - book_balance) stored,
  status          text not null default 'draft' check (status in ('draft','finalized')),
  notes           text,
  finalized_by    uuid references public.users(id),
  finalized_at    timestamptz,
  created_by      uuid references public.users(id),
  last_action_by  uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.bank_reconciliation_history (
  id                 uuid primary key default gen_random_uuid(),
  reconciliation_id  uuid not null references public.bank_reconciliations(id) on delete cascade,
  action             text not null,
  detail             text,
  changed_by         uuid references public.users(id),
  changed_at         timestamptz not null default now()
);

create index if not exists idx_bank_txn_statement on public.bank_transactions(statement_id);
create index if not exists idx_bank_txn_status    on public.bank_transactions(status);
create index if not exists idx_bank_txn_date      on public.bank_transactions(txn_date);
create index if not exists idx_bank_recon_period  on public.bank_reconciliations(period_year, period_month);
create index if not exists idx_bank_recon_hist    on public.bank_reconciliation_history(reconciliation_id, changed_at desc);

-- ── 2) RLS — admin / md / accounts ──────────────────────────
alter table public.bank_statements             enable row level security;
alter table public.bank_transactions           enable row level security;
alter table public.bank_reconciliations        enable row level security;
alter table public.bank_reconciliation_history enable row level security;

drop policy if exists bank_stmt_read on public.bank_statements;
create policy bank_stmt_read on public.bank_statements for select using (public.fn_my_role() in ('admin','md','accounts'));
drop policy if exists bank_stmt_write on public.bank_statements;
create policy bank_stmt_write on public.bank_statements for all
  using (public.fn_my_role() in ('admin','md','accounts')) with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists bank_txn_read on public.bank_transactions;
create policy bank_txn_read on public.bank_transactions for select using (public.fn_my_role() in ('admin','md','accounts'));
drop policy if exists bank_txn_write on public.bank_transactions;
create policy bank_txn_write on public.bank_transactions for all
  using (public.fn_my_role() in ('admin','md','accounts')) with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists bank_recon_read on public.bank_reconciliations;
create policy bank_recon_read on public.bank_reconciliations for select using (public.fn_my_role() in ('admin','md','accounts'));
drop policy if exists bank_recon_write on public.bank_reconciliations;
create policy bank_recon_write on public.bank_reconciliations for all
  using (public.fn_my_role() in ('admin','md','accounts')) with check (public.fn_my_role() in ('admin','md','accounts'));

drop policy if exists bank_recon_hist_read on public.bank_reconciliation_history;
create policy bank_recon_hist_read on public.bank_reconciliation_history for select using (public.fn_my_role() in ('admin','md','accounts'));

-- ── 3) Touch triggers ───────────────────────────────────────
drop trigger if exists trg_bank_stmt_touch on public.bank_statements;
create trigger trg_bank_stmt_touch before update on public.bank_statements
  for each row execute function public.fn_acct_touch();
drop trigger if exists trg_bank_recon_touch on public.bank_reconciliations;
create trigger trg_bank_recon_touch before update on public.bank_reconciliations
  for each row execute function public.fn_acct_touch();

-- ── 4) Ref assignment + actor seed ──────────────────────────
create or replace function public.fn_bank_statement_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year text; v_count int;
begin
  if new.statement_ref is null then
    v_year := to_char(now(), 'YYYY');
    select count(*) + 1 into v_count from bank_statements where statement_ref like 'BS-' || v_year || '-%';
    new.statement_ref := 'BS-' || v_year || '-' || lpad(v_count::text, 4, '0');
  end if;
  new.last_action_by := coalesce(new.last_action_by, new.created_by);
  return new;
end $$;
alter function public.fn_bank_statement_before_insert() owner to postgres;
drop trigger if exists trg_bank_stmt_before_insert on public.bank_statements;
create trigger trg_bank_stmt_before_insert before insert on public.bank_statements
  for each row execute function public.fn_bank_statement_before_insert();

create or replace function public.fn_bank_recon_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.recon_ref is null then
    new.recon_ref := 'REC-' || new.period_year::text || '-' || lpad(new.period_month::text, 2, '0');
  end if;
  new.last_action_by := coalesce(new.last_action_by, new.created_by);
  return new;
end $$;
alter function public.fn_bank_recon_before_insert() owner to postgres;
drop trigger if exists trg_bank_recon_before_insert on public.bank_reconciliations;
create trigger trg_bank_recon_before_insert before insert on public.bank_reconciliations
  for each row execute function public.fn_bank_recon_before_insert();

-- ── 5) Reconciliation audit (append-only) ───────────────────
create or replace function public.fn_bank_recon_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into bank_reconciliation_history (reconciliation_id, action, detail, changed_by)
      values (new.id, 'created', 'Reconciliation ' || new.recon_ref || ' created', new.last_action_by);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into bank_reconciliation_history (reconciliation_id, action, detail, changed_by)
      values (new.id, new.status, 'Status: ' || old.status || ' → ' || new.status, new.last_action_by);
  end if;
  return null;
end $$;
alter function public.fn_bank_recon_audit() owner to postgres;
drop trigger if exists trg_bank_recon_audit_ins on public.bank_reconciliations;
create trigger trg_bank_recon_audit_ins after insert on public.bank_reconciliations
  for each row execute function public.fn_bank_recon_audit();
drop trigger if exists trg_bank_recon_audit_upd on public.bank_reconciliations;
create trigger trg_bank_recon_audit_upd after update on public.bank_reconciliations
  for each row execute function public.fn_bank_recon_audit();

-- ── 6) Private bucket + storage RLS ─────────────────────────
insert into storage.buckets (id, name, public)
values ('bank-statements', 'bank-statements', false)
on conflict (id) do nothing;

drop policy if exists bank_stmt_storage_read on storage.objects;
create policy bank_stmt_storage_read on storage.objects for select using (
  bucket_id = 'bank-statements' and public.fn_my_role() in ('admin','md','accounts'));
drop policy if exists bank_stmt_storage_insert on storage.objects;
create policy bank_stmt_storage_insert on storage.objects for insert with check (
  bucket_id = 'bank-statements' and public.fn_my_role() in ('admin','md','accounts'));
drop policy if exists bank_stmt_storage_delete on storage.objects;
create policy bank_stmt_storage_delete on storage.objects for delete using (
  bucket_id = 'bank-statements' and public.fn_my_role() in ('admin','md','accounts'));

-- ── 7) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_bucket int; v_gen int; v_pols int; v_trgs int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in
     ('bank_statements','bank_transactions','bank_reconciliations','bank_reconciliation_history');
  if v_tabs <> 4 then raise exception '0056 failed: expected 4 tables, found %', v_tabs; end if;

  select count(*) into v_gen from information_schema.columns
   where table_schema='public' and table_name='bank_reconciliations' and column_name='difference' and is_generated='ALWAYS';
  if v_gen <> 1 then raise exception '0056 failed: difference is not generated'; end if;

  select count(*) into v_bucket from storage.buckets where id='bank-statements';
  if v_bucket <> 1 then raise exception '0056 failed: bank-statements bucket missing'; end if;

  select count(*) into v_pols from pg_policies where schemaname='public'
   and tablename in ('bank_statements','bank_transactions','bank_reconciliations','bank_reconciliation_history');
  if v_pols < 7 then raise exception '0056 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_bank_stmt_touch','trg_bank_recon_touch','trg_bank_stmt_before_insert',
    'trg_bank_recon_before_insert','trg_bank_recon_audit_ins','trg_bank_recon_audit_upd'
  ) and not tgisinternal;
  if v_trgs <> 6 then raise exception '0056 failed: expected 6 triggers, found %', v_trgs; end if;

  raise notice '─── 0056 applied: bank reconciliation (4 tables, % policies, % triggers) ───', v_pols, v_trgs;
end $$;

commit;
