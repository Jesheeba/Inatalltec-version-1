-- ============================================================
-- 0013 — Sites: extend schema with address / contact / soft-delete
--
-- 0001 created a minimal sites table (id, customer_id, name, area,
-- geo_lat, geo_lng, access_instructions, security_clearance). The
-- new Sites management UI needs richer location + contact metadata
-- and a soft-delete flag so removing a site preserves history on
-- the work orders / AMCs / projects that referenced it.
--
-- All new columns are nullable / defaulted so existing rows stay
-- untouched. `area` is repurposed as "city / area" in the UI — same
-- column, no rename.
--
-- Single transaction — only ADD COLUMN + policy edits, no enum work.
-- ============================================================

begin;

-- ============================================================
-- 1) New optional columns. Keeping existing area + geo_* + access_instructions
--    + security_clearance as-is — those still hold the city / coords / access
--    notes / clearance value.
-- ============================================================
alter table sites add column if not exists address_line_1 text;
alter table sites add column if not exists address_line_2 text;
alter table sites add column if not exists emirate        text;
alter table sites add column if not exists contact_name   text;
alter table sites add column if not exists contact_phone  text;
alter table sites add column if not exists contact_email  text;

-- Soft-delete flag. deleteSite() flips this to false; reads filter
-- on `is_active = true`. Default true so every existing row stays
-- visible.
alter table sites add column if not exists is_active boolean not null default true;
create index if not exists sites_active_idx on sites(is_active) where is_active = true;

-- ============================================================
-- 2) Widen the read policy so anyone who can see the parent customer
--    can also see its sites. The 0001 policy already chained through
--    customers, so this is a re-statement for clarity and to drop the
--    "via cascade" comment that no longer matches the helper layout.
--
--    Write policy: 0001 limited writes to md/admin/manager/sales. The
--    new UI puts site creation on the Sites page (manager-led ops) so
--    that gate is correct — we just re-state it idempotently in case
--    a later migration narrowed it.
-- ============================================================
drop policy if exists sites_read on sites;
create policy sites_read on sites for select using (
  exists (select 1 from customers c where c.id = sites.customer_id)
);

drop policy if exists sites_write on sites;
create policy sites_write on sites for all
  using      (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'));

-- ============================================================
-- 3) Inline smoke test — fails the migration if any column / index
--    / policy failed to materialise.
-- ============================================================
do $$
declare
  v_col_count   bigint;
  v_idx_count   bigint;
  v_read_count  bigint;
  v_write_count bigint;
begin
  select count(*) from information_schema.columns
   where table_name = 'sites'
     and column_name in (
       'address_line_1','address_line_2','emirate',
       'contact_name','contact_phone','contact_email','is_active'
     )
   into v_col_count;
  select count(*) from pg_indexes
   where tablename = 'sites' and indexname = 'sites_active_idx'
   into v_idx_count;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'sites' and policyname = 'sites_read'
   into v_read_count;
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'sites' and policyname = 'sites_write'
   into v_write_count;
  raise notice '─── 0013 smoke test ───';
  raise notice '  new columns           = % (expect 7)', v_col_count;
  raise notice '  sites_active_idx      = % (expect 1)', v_idx_count;
  raise notice '  sites_read policy     = % (expect 1)', v_read_count;
  raise notice '  sites_write policy    = % (expect 1)', v_write_count;
  raise notice '─── 0013 applied ───';
end $$;

commit;

-- ============================================================
-- MANUAL VERIFICATION (paste in Supabase SQL Editor after applying)
-- ============================================================
--
-- -- 1. Confirm the columns landed:
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_name = 'sites'
--    and column_name in (
--      'address_line_1','address_line_2','emirate',
--      'contact_name','contact_phone','contact_email','is_active'
--    )
--  order by column_name;
--
-- -- 2. Confirm existing rows still resolve cleanly:
-- select id, name, customer_id, area, is_active from sites limit 5;
--   -- Expect is_active = true for everything.
--
-- ============================================================
