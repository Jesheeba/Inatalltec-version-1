-- ============================================================
-- 0028 — Quotations (Phase 11, minimal)
--
-- A light-weight quotation tracker. Title + customer + value + status,
-- with two FK pointers showing what the quotation converted into.
-- Out of scope for v1: line items, tax, discounts, PDF generation,
-- email delivery. Add later if the boss wants the full builder.
--
-- Status machine:
--   draft → sent → accepted → converted
--          → rejected
-- We don't enforce transitions in CHECK constraints — the UI gates,
-- and the boss may want to force-flip manually for edge cases. RLS
-- gates who can write at all.
--
-- RLS:
--   read   admin / md / manager / sales / accounts
--   write  admin / md / manager / sales
--
-- Single BEGIN/COMMIT. Idempotent.
-- ============================================================

begin;

create table if not exists public.quotations (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null unique,
  customer_id              uuid references public.customers(id) on delete set null,
  title                    text not null,
  value_aed                numeric(12,2) not null default 0,
  status                   text not null default 'draft'
                             check (status in ('draft','sent','accepted','rejected','converted')),
  valid_until              date,
  converted_to_project_id  uuid references public.projects(id) on delete set null,
  converted_to_amc_id      uuid references public.amc_contracts(id) on delete set null,
  notes                    text,
  created_by               uuid references public.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_quotations_customer on public.quotations(customer_id);
create index if not exists idx_quotations_status   on public.quotations(status);
create index if not exists idx_quotations_created  on public.quotations(created_at);

alter table public.quotations enable row level security;

drop policy if exists quote_read on public.quotations;
create policy quote_read on public.quotations for select using (
  fn_is_md_or_admin()
  or fn_my_role() in ('manager','sales','accounts','estimator')
);

drop policy if exists quote_write on public.quotations;
create policy quote_write on public.quotations for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'));

-- Touch updated_at on update.
create or replace function public.fn_quotation_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
alter function public.fn_quotation_touch_updated() owner to postgres;

drop trigger if exists trg_quotation_touch on public.quotations;
create trigger trg_quotation_touch
before update on public.quotations
for each row execute function public.fn_quotation_touch_updated();

-- Smoke test
do $$
declare
  v_table     boolean;
  v_check     int;
  v_idx       int;
  v_policies  int;
  v_trg       int;
begin
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'quotations'
  ) into v_table;

  select count(*) from pg_constraint
   where conrelid = 'public.quotations'::regclass and contype = 'c'
   into v_check;

  select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in ('idx_quotations_customer','idx_quotations_status','idx_quotations_created')
   into v_idx;

  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'quotations'
     and policyname in ('quote_read','quote_write')
   into v_policies;

  select count(*) from pg_trigger
   where tgname = 'trg_quotation_touch' and not tgisinternal
   into v_trg;

  raise notice '─── 0028 smoke test ───';
  raise notice '  quotations table      = %', v_table;
  raise notice '  CHECK constraints     = % (expect >=1 for status)', v_check;
  raise notice '  support indexes       = % (expect 3)', v_idx;
  raise notice '  RLS policies          = % (expect 2)', v_policies;
  raise notice '  touch trigger         = % (expect 1)', v_trg;

  if not v_table then raise exception '0028: quotations table missing'; end if;
  if v_check < 1   then raise exception '0028: status CHECK constraint missing'; end if;
  if v_idx <> 3    then raise exception '0028: expected 3 indexes, found %', v_idx; end if;
  if v_policies <> 2 then raise exception '0028: expected 2 policies, found %', v_policies; end if;
  if v_trg <> 1    then raise exception '0028: touch trigger missing'; end if;

  raise notice '─── 0028 applied ───';
end $$;

commit;
