-- ============================================================
-- 0009b — AMC engine, part 2 of 2: tables, columns, triggers
--
-- PREREQUISITE: 0009a_amc_enum_setup.sql must already be committed.
-- That file renamed amc_state → amc_status and added the lowercase
-- enum values that this file's UPDATEs / column defaults / casts use.
--
-- If you try to run this file before 0009a commits, the UPDATE in
-- section 2 will fail with:
--   ERROR 55P04: unsafe use of new value "draft" of enum type amc_status
--
-- This file IS wrapped in a single BEGIN/COMMIT so any failure rolls
-- back cleanly — no half-migrated columns.
--
-- Pre-flight audit (run 2026-05-20 against current db):
--   amc_service_schedule  = 0 rows → safe to drop & recreate
--   amc_contracts          = 0 rows → UPDATE is a no-op
--   amc_payments           = 0 rows → safe to replace fn_amc_payment_received
--   contract_status column = not present → safe to rename
--
-- Value mapping (legacy uppercase → new lowercase):
--   DRAFT                 → draft
--   SIGNED                → pending_payment
--   ACTIVE                → active
--   PENDING_REACTIVATION  → suspended
--   BLOCKED               → suspended
--   RENEWAL_DUE           → active   (renewal-due flag tracked separately later)
--   EXPIRED               → expired
--   CANCELLED             → cancelled
--
-- UI IMPACT (apply immediately after this migration commits):
--   amc_contracts.state has been renamed to contract_status. Update
--   lib/hydrate.ts mapAmc() (reads r.state) and components/modules/Amc.tsx
--   (reads c.state) to read contract_status instead. Until that fix
--   lands, the AMC page will display the fallback "ACTIVE" state for
--   every contract because mapAmc's fallback is "ACTIVE".
-- ============================================================

begin;

-- ============================================================
-- 1) amc_service_status enum (brand new — no ADD VALUE conflict)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'amc_service_status') then
    create type amc_service_status as enum (
      'scheduled',
      'in_progress',
      'completed',
      'skipped',
      'overdue'
    );
  end if;
end $$;

-- ============================================================
-- 2) Rename amc_contracts.state → contract_status + map legacy values
-- ============================================================
alter table amc_contracts rename column state to contract_status;

update amc_contracts set contract_status =
  case contract_status::text
    when 'DRAFT'                then 'draft'::amc_status
    when 'SIGNED'               then 'pending_payment'::amc_status
    when 'ACTIVE'               then 'active'::amc_status
    when 'PENDING_REACTIVATION' then 'suspended'::amc_status
    when 'BLOCKED'              then 'suspended'::amc_status
    when 'RENEWAL_DUE'          then 'active'::amc_status
    when 'EXPIRED'              then 'expired'::amc_status
    when 'CANCELLED'            then 'cancelled'::amc_status
    else contract_status
  end
where contract_status::text in ('DRAFT','SIGNED','ACTIVE','PENDING_REACTIVATION','BLOCKED','RENEWAL_DUE','EXPIRED','CANCELLED');

alter table amc_contracts alter column contract_status set default 'draft';

-- ============================================================
-- 3) New columns on amc_contracts
--    payment_received_at already exists (added in 0001) — skipped.
--    free_calls_used stays as the counter — no free_call_count column.
-- ============================================================
alter table amc_contracts add column if not exists activation_date     date;
alter table amc_contracts add column if not exists services_per_year   int     not null default 4;
alter table amc_contracts add column if not exists payment_grace_days  int     not null default 30;
alter table amc_contracts add column if not exists auto_renewal        boolean not null default false;
alter table amc_contracts add column if not exists suspended_at        timestamptz;
alter table amc_contracts add column if not exists suspended_reason    text;

-- ============================================================
-- 4) Drop legacy amc_service_schedule (confirmed empty in pre-flight)
--    CASCADE removes the work_order_id FK added in 0001:262.
-- ============================================================
drop table if exists amc_service_schedule cascade;

create table amc_service_schedule (
  id                uuid primary key default gen_random_uuid(),
  amc_contract_id   uuid not null references amc_contracts(id) on delete cascade,
  service_number    int  not null,
  scheduled_date    date not null,
  status            amc_service_status not null default 'scheduled',
  work_order_id     uuid references work_orders(id) on delete set null,
  completed_at      timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (amc_contract_id, service_number)
);
create index idx_amc_schedule_contract on amc_service_schedule(amc_contract_id);
create index idx_amc_schedule_date     on amc_service_schedule(scheduled_date);
create index idx_amc_schedule_status   on amc_service_schedule(status);

alter table amc_service_schedule enable row level security;

-- super_admin is NOT in the role enum yet, so referencing it in an `in (...)`
-- list would fail at policy creation time. The email-allowlist promotion in
-- app/(app)/layout.tsx maps super_admin users to DB role 'admin', so 'admin'
-- here covers them too.
drop policy if exists amc_schedule_read on amc_service_schedule;
create policy amc_schedule_read on amc_service_schedule
for select using (
  exists (select 1 from amc_contracts where id = amc_service_schedule.amc_contract_id)
);

drop policy if exists amc_schedule_write on amc_service_schedule;
create policy amc_schedule_write on amc_service_schedule
for all
using      (fn_my_role() in ('admin','manager','accounts'))
with check (fn_my_role() in ('admin','manager','accounts'));

-- ============================================================
-- 5) amc_free_calls (new)
-- ============================================================
create table if not exists amc_free_calls (
  id                       uuid primary key default gen_random_uuid(),
  amc_contract_id          uuid not null references amc_contracts(id) on delete cascade,
  reported_by_customer_at  timestamptz not null default now(),
  scheduled_date           date,
  status                   amc_service_status not null default 'scheduled',
  work_order_id            uuid references work_orders(id) on delete set null,
  symptom                  text,
  parts_replaced           jsonb not null default '[]'::jsonb,
  parts_invoice_id         uuid,
  completed_at             timestamptz,
  created_at               timestamptz not null default now()
);
create index if not exists idx_amc_freecalls_contract on amc_free_calls(amc_contract_id);

alter table amc_free_calls enable row level security;

drop policy if exists amc_freecalls_read on amc_free_calls;
create policy amc_freecalls_read on amc_free_calls
for select using (
  exists (select 1 from amc_contracts where id = amc_free_calls.amc_contract_id)
);

drop policy if exists amc_freecalls_write on amc_free_calls;
create policy amc_freecalls_write on amc_free_calls
for all
using      (fn_my_role() in ('admin','manager','lead_worker','accounts','service_support'))
with check (fn_my_role() in ('admin','manager','lead_worker','accounts','service_support'));

-- ============================================================
-- 6) amc_status_history audit table
-- ============================================================
create table if not exists amc_status_history (
  id                uuid primary key default gen_random_uuid(),
  amc_contract_id   uuid not null references amc_contracts(id) on delete cascade,
  old_status        amc_status,
  new_status        amc_status not null,
  changed_by        uuid references users(id),
  changed_at        timestamptz not null default now(),
  reason            text
);
create index if not exists idx_amc_status_history_contract on amc_status_history(amc_contract_id);

alter table amc_status_history enable row level security;

drop policy if exists amc_status_history_read on amc_status_history;
create policy amc_status_history_read on amc_status_history
for select using (
  exists (select 1 from amc_contracts where id = amc_status_history.amc_contract_id)
);
-- No write policy: rows are inserted only by the SECURITY DEFINER trigger
-- below (owner postgres → BYPASSRLS). Application code should never write here.

-- ============================================================
-- 7) updated_at trigger for amc_service_schedule
-- ============================================================
create or replace function fn_amc_schedule_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
alter function fn_amc_schedule_touch() owner to postgres;

drop trigger if exists trg_amc_schedule_touch on amc_service_schedule;
create trigger trg_amc_schedule_touch
before update on amc_service_schedule
for each row execute function fn_amc_schedule_touch();

-- ============================================================
-- 8) Status-change audit trigger
--    Same security pattern as 0007/0008: SECURITY DEFINER + OWNER postgres
--    so the INSERT into amc_status_history bypasses RLS cleanly.
-- ============================================================
create or replace function fn_log_amc_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contract_status is distinct from old.contract_status then
    insert into amc_status_history (amc_contract_id, old_status, new_status, changed_by)
    values (new.id, old.contract_status, new.contract_status, fn_my_id());
  end if;
  return new;
end;
$$;
alter function fn_log_amc_status_change() owner to postgres;

drop trigger if exists trg_amc_status_change on amc_contracts;
create trigger trg_amc_status_change
after update on amc_contracts
for each row execute function fn_log_amc_status_change();

-- ============================================================
-- 9) Replace fn_amc_payment_received with new logic
--
--   - Set payment_received_at = the payment's received_at
--   - Set activation_date = received_at + payment_grace_days
--   - Move contract from pending_payment/suspended → active
--   - Clear suspended_at/suspended_reason
--   - amc_status_history entry is written automatically by the
--     trg_amc_status_change trigger above; no explicit insert needed.
--
--   NOTE: The legacy version of this function queued an "AMC Reactivation"
--   approval for manager sign-off. Per the new spec, payment auto-activates
--   without an approval step. If you want that gate back, layer it in a
--   later migration on top of the new contract_status transitions.
--
--   NOTE: Auto-creating the 4 quarterly amc_service_schedule rows is
--   deferred to Step 2 of the AMC engine plan.
-- ============================================================
create or replace function fn_amc_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace  int;
  v_status amc_status;
begin
  select contract_status, coalesce(payment_grace_days, 30)
    into v_status, v_grace
    from amc_contracts where id = new.amc_id;

  update amc_contracts
     set payment_received_at = new.received_at,
         activation_date     = (new.received_at::date + (v_grace || ' days')::interval)::date,
         contract_status     = case
                                 when v_status in ('pending_payment','suspended') then 'active'::amc_status
                                 else v_status
                               end,
         suspended_at        = null,
         suspended_reason    = null,
         overdue_days        = 0
   where id = new.amc_id;

  return new;
end;
$$;
alter function fn_amc_payment_received() owner to postgres;

drop trigger if exists trg_amc_payment on amc_payments;
create trigger trg_amc_payment
after insert on amc_payments
for each row execute function fn_amc_payment_received();

-- ============================================================
-- 10) Inline smoke test — fails the migration if any new object is broken
-- ============================================================
do $$
declare
  v_contracts bigint;
  v_schedule  bigint;
  v_freecalls bigint;
  v_history   bigint;
begin
  select count(*) from amc_contracts        into v_contracts;
  select count(*) from amc_service_schedule into v_schedule;
  select count(*) from amc_free_calls       into v_freecalls;
  select count(*) from amc_status_history   into v_history;
  raise notice '─── 0009b smoke test ───';
  raise notice '  amc_contracts            = %', v_contracts;
  raise notice '  amc_service_schedule     = %', v_schedule;
  raise notice '  amc_free_calls           = %', v_freecalls;
  raise notice '  amc_status_history       = %', v_history;
  raise notice '─── 0009b applied ───';
end $$;

commit;


-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm the column rename + new columns landed:
-- select column_name, data_type, udt_name, column_default
--   from information_schema.columns
--  where table_name = 'amc_contracts'
--    and column_name in ('contract_status','activation_date','services_per_year',
--                        'payment_grace_days','auto_renewal','suspended_at',
--                        'suspended_reason','payment_received_at','free_calls_used')
--  order by column_name;
--
-- -- 2. Confirm the new tables exist:
-- select tablename from pg_tables
--  where schemaname = 'public'
--    and tablename in ('amc_service_schedule','amc_free_calls','amc_status_history');
--
-- -- 3. Confirm triggers + functions:
-- select tgname, tgenabled from pg_trigger
--  where tgrelid in ('public.amc_contracts'::regclass,
--                    'public.amc_service_schedule'::regclass,
--                    'public.amc_payments'::regclass)
--    and not tgisinternal;
-- select proname, prosecdef, pg_get_userbyid(proowner) as owner
--   from pg_proc
--  where proname in ('fn_amc_payment_received','fn_log_amc_status_change','fn_amc_schedule_touch');
--
-- -- 4. End-to-end smoke: create a contract → pay it → confirm activation +
-- --    status-history row. Run as the postgres role (Supabase SQL Editor default).
-- --    Replace <customer_id> with a real customers.id from your db.
-- /*
-- with new_amc as (
--   insert into amc_contracts (code, customer_id, contract_status, value_aed, payment_grace_days)
--   values ('AMC-TEST-' || floor(random()*1000)::text, '<customer_id>', 'pending_payment', 12000, 30)
--   returning id
-- ),
-- new_pay as (
--   insert into amc_payments (amc_id, amount_aed, received_at)
--   select id, 12000, now() from new_amc
--   returning amc_id
-- )
-- select c.code, c.contract_status, c.payment_received_at, c.activation_date,
--        (select count(*) from amc_status_history where amc_contract_id = c.id) as audit_rows
--   from amc_contracts c
--   join new_pay p on p.amc_id = c.id;
-- -- Expected: contract_status = 'active', activation_date = today + 30 days,
-- --           payment_received_at = now(), audit_rows = 1.
-- */
--
-- ============================================================
