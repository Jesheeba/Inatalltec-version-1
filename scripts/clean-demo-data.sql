-- ============================================================
-- clean-demo-data.sql — removes everything seed-demo-data.sql creates
--
-- Paste into the Supabase SQL Editor and Run, then re-run
-- seed-demo-data.sql for a fresh dataset.
--
-- Demo rows are tagged with a "[demo-seed]" marker in their notes (or, for
-- the customer, a 'demo-seed' tag; for the project, code = 'PRJ-2026-DEMO').
-- Deletions are ordered to respect foreign keys; child tables with ON
-- DELETE CASCADE are removed automatically by deleting their parent.
--
-- Safe to run when nothing is seeded (each DELETE simply affects 0 rows).
-- Wrapped in BEGIN/COMMIT so a failure rolls back the whole cleanup.
--
--   ⚠️  Only touches rows carrying the demo marker. It will NOT delete
--       real customers, projects, invoices, employees, etc.
-- ============================================================

begin;

-- 1) Expenses + recurring templates  (expense_history cascades)
delete from public.expenses           where notes like '%[demo-seed]%';
delete from public.recurring_expenses where notes like '%[demo-seed]%';

-- 2) Payroll run  (payroll_lines, salary_payments, history cascade)
delete from public.payroll_runs where notes like '%[demo-seed]%';

-- 3) Employees  (only after their payroll lines are gone)
delete from public.employees where notes like '%[demo-seed]%';

-- 4) Invoices  (invoice_line_items, invoice_payments cascade)
delete from public.invoices where notes like '%[demo-seed]%';

-- 5) Purchase orders  (po_line_items, po_receipts, po_history cascade)
delete from public.purchase_orders where notes like '%[demo-seed]%';

-- 6) Vendors  (only after their POs / expenses are gone)
delete from public.vendors where notes like '%[demo-seed]%';

-- 7) Project  (material submittal, shop drawing, JCA, materials,
--    installation, T&C, handover, DLP, closure, milestones and all
--    phase/status history cascade via ON DELETE CASCADE)
delete from public.projects where code = 'PRJ-2026-DEMO';

-- 8) Site + customer  (project already gone, so the FKs are clear;
--    deleting the customer also cascades any remaining sites)
delete from public.sites
  where customer_id in (
    select id from public.customers
     where name = 'Marina Bay Office LLC' or tags @> array['demo-seed']::text[]
  );

delete from public.customers
  where name = 'Marina Bay Office LLC' or tags @> array['demo-seed']::text[];

commit;

-- ============================================================
-- After running this, paste scripts/seed-demo-data.sql to reseed.
-- ============================================================
