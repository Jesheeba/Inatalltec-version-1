-- ============================================================
-- 0051 — Accountant module · Phase 3 (Slice 3A): Subcontractor Payments
--
-- Converts tracked subcontractor HOURS into payable amounts and records
-- the payments we make to settle them.
--
-- RATE MODEL = HOURLY (flagged in the slice report). The business already
-- logs hours per WO per sub (work_order_sub_contractor_hours, 0026), and
-- Phase 3's premise is "tracked hours → payable amounts". So:
--     earned   = Σ(logged hours) × sub_contractors.payment_hourly_rate
--     paid     = Σ(sub_contractor_payments.amount)
--     outstanding = earned − paid
-- A per-job rate would ignore the existing hours log entirely.
--
-- OUTSTANDING IS COMPUTED LIVE (data layer), NOT via a stored balance.
-- Maintaining a denormalised balance would require triggers on the
-- PROTECTED v1.0.1 hours table (work_order_sub_contractor_hours) and on
-- rate changes — risky and out of scope. Live computation from the three
-- sources is always correct and touches no protected table. (Deviation
-- from the brief's "triggers to calculate outstanding" — flagged.)
--
-- Net-new objects:
--   • sub_contractors.payment_hourly_rate     (additive column)
--   • additive RLS so Accounts can set the rate (coarse row UPDATE; the
--     UI only edits the rate field — same coarse-RLS/fine-UI pattern used
--     across this module). The existing sub_write policy is untouched.
--   • sub_contractor_payments                 (payments we make)
--   • sub_contractor_payment_history          (append-only audit, written
--                                              only by trigger; immutable)
--
-- RLS (coarse, mirrors the app):
--   payments read  : admin · md · manager · accounts
--   payments write : admin · md · accounts
--   history read   : admin · md · accounts (audit-confidential)
--
-- ASSUMPTION: a single CURRENT hourly rate applies to ALL of a sub's
-- logged hours (rate is not snapshotted per hour-entry). Changing the
-- rate re-prices past hours. Flagged in the report.
--
-- Strictly additive. Reuses fn_my_role()/fn_my_id() (0006/0001). Idempotent.
-- ============================================================

begin;

-- ── 1) Hourly rate on the subcontractor profile ─────────────
alter table public.sub_contractors
  add column if not exists payment_hourly_rate numeric(12,2);

-- Additive: let Accounts (besides the existing md/admin/manager via
-- sub_write) UPDATE a subcontractor so they can maintain the rate. The
-- existing sub_write (FOR ALL) policy is left exactly as-is; this only
-- ADDs access, never removes any.
drop policy if exists sub_rate_update_accounts on public.sub_contractors;
create policy sub_rate_update_accounts on public.sub_contractors for update
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- ── 2) Payments ─────────────────────────────────────────────
create table if not exists public.sub_contractor_payments (
  id                 uuid primary key default gen_random_uuid(),
  org_key            text not null default 'org_installtec',
  sub_contractor_id  uuid not null references public.sub_contractors(id) on delete cascade,
  amount             numeric(14,2) not null check (amount > 0),
  payment_date       date not null default current_date,
  method             text,                       -- payment_method code (configurable)
  reference          text,
  notes              text,
  recorded_by        uuid references public.users(id),
  created_at         timestamptz not null default now()
);

create table if not exists public.sub_contractor_payment_history (
  id                 uuid primary key default gen_random_uuid(),
  sub_contractor_id  uuid not null references public.sub_contractors(id) on delete cascade,
  action             text not null,              -- 'payment' | 'payment_reversed'
  detail             text,
  amount             numeric(14,2),
  changed_by         uuid references public.users(id),
  changed_at         timestamptz not null default now()
);

create index if not exists idx_subpay_sub      on public.sub_contractor_payments(sub_contractor_id);
create index if not exists idx_subpay_date      on public.sub_contractor_payments(payment_date);
create index if not exists idx_subpay_hist_sub  on public.sub_contractor_payment_history(sub_contractor_id);

-- ── 3) RLS ──────────────────────────────────────────────────
alter table public.sub_contractor_payments         enable row level security;
alter table public.sub_contractor_payment_history  enable row level security;

drop policy if exists subpay_read on public.sub_contractor_payments;
create policy subpay_read on public.sub_contractor_payments for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists subpay_write on public.sub_contractor_payments;
create policy subpay_write on public.sub_contractor_payments for all
  using      (public.fn_my_role() in ('admin','md','accounts'))
  with check (public.fn_my_role() in ('admin','md','accounts'));

-- Audit history: read-only to the audit audience; trigger-written only.
drop policy if exists subpay_hist_read on public.sub_contractor_payment_history;
create policy subpay_hist_read on public.sub_contractor_payment_history for select using (
  public.fn_my_role() in ('admin','md','accounts')
);

-- ── 4) Append-only audit trail (payment recorded / reversed) ──
create or replace function public.fn_sub_payment_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into sub_contractor_payment_history (sub_contractor_id, action, detail, amount, changed_by)
      values (new.sub_contractor_id, 'payment',
              'Payment of ' || new.amount || ' recorded', new.amount,
              coalesce(new.recorded_by, fn_my_id()));
  elsif tg_op = 'DELETE' then
    insert into sub_contractor_payment_history (sub_contractor_id, action, detail, amount, changed_by)
      values (old.sub_contractor_id, 'payment_reversed',
              'Payment of ' || old.amount || ' reversed', -old.amount,
              fn_my_id());
  end if;
  return null;
end $$;
alter function public.fn_sub_payment_audit() owner to postgres;

drop trigger if exists trg_subpay_audit_ins on public.sub_contractor_payments;
create trigger trg_subpay_audit_ins after insert on public.sub_contractor_payments
  for each row execute function public.fn_sub_payment_audit();

drop trigger if exists trg_subpay_audit_del on public.sub_contractor_payments;
create trigger trg_subpay_audit_del after delete on public.sub_contractor_payments
  for each row execute function public.fn_sub_payment_audit();

-- ── 5) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_trgs int; v_col int; v_ratepol int;
begin
  select count(*) into v_col from information_schema.columns
   where table_schema='public' and table_name='sub_contractors' and column_name='payment_hourly_rate';
  if v_col <> 1 then raise exception '0051 failed: payment_hourly_rate column missing'; end if;

  select count(*) into v_ratepol from pg_policies
   where schemaname='public' and tablename='sub_contractors' and policyname='sub_rate_update_accounts';
  if v_ratepol <> 1 then raise exception '0051 failed: accounts rate-update policy missing'; end if;

  select count(*) into v_tabs from information_schema.tables
   where table_schema='public' and table_name in ('sub_contractor_payments','sub_contractor_payment_history');
  if v_tabs <> 2 then raise exception '0051 failed: expected 2 tables, found %', v_tabs; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public' and tablename in ('sub_contractor_payments','sub_contractor_payment_history');
  if v_pols < 3 then raise exception '0051 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname in (
    'trg_subpay_audit_ins','trg_subpay_audit_del'
  );
  if v_trgs < 2 then raise exception '0051 failed: audit triggers missing (%)', v_trgs; end if;

  raise notice '─── 0051 applied: subcontractor payments + history, % policies, % triggers ───', v_pols, v_trgs;
end $$;

commit;
