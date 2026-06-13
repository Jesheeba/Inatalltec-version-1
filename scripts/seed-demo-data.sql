-- ============================================================
-- seed-demo-data.sql — realistic demo data for documentation screenshots
--
-- Populates ONE complete project ("Marina Bay Tower") plus the
-- accounting data (vendors, POs, invoice + payment, employees, payroll
-- run, expenses) so the Playwright screenshot scripts capture realistic
-- content instead of empty pages.
--
-- ── HOW TO RUN ──────────────────────────────────────────────
--   Paste the whole file into the Supabase SQL Editor and Run.
--   (Runs as the service role → RLS is bypassed; all auto-numbering,
--   total-rollup and audit triggers still fire normally.)
--
-- ── SAFETY ──────────────────────────────────────────────────
--   • Wrapped in BEGIN/COMMIT → any failure rolls the whole thing back.
--   • Idempotent → safe to run repeatedly. Each section is guarded by a
--     natural key (project code, customer/vendor name, payroll period,
--     or a "[demo-seed]" marker in notes) and only inserts when missing.
--   • Strictly additive → never updates or deletes existing rows.
--   • Companion: scripts/clean-demo-data.sql removes everything this adds.
--
-- ── SCHEMA NOTES (where the brief and the real schema differ) ──
--   • customers has NO contact/phone/email/address/TRN columns, so the
--     customer contact + address live on the project's SITE (which does),
--     and the TRN is recorded in the site's access_instructions.
--   • material_items has NO price column — a Material Submittal is a
--     design-phase list (description + model + qty). Prices live on the
--     PO / invoice / JCA.
--   • shop_drawings has no title/drawing-number column — those go in the
--     revision's description; the note goes in client_comments.
--   • project_jca has NO status/approval (it is an internal budget).
--     "Equipment rental" + "Overheads" are merged into other_charges.
--   • invoices / purchase_orders / payroll_runs totals are maintained by
--     triggers from their line items — never written here directly.
--   • The bank statement (item 13) is a CSV file at
--     docs/sample-data/feb-2026-bank-statement.csv, uploaded via the UI —
--     it is NOT seeded into bank_statements here.
--
--   ⚠️  NOT FOR PRODUCTION — documentation / demo data only.
-- ============================================================

begin;

do $$
declare
  -- Actors
  v_actor uuid;   -- super admin (or any admin/md) — used for created_by/approved_by
  v_mgr   uuid;   -- "Yusuf" operations manager (falls back to v_actor)
  v_lead  uuid;   -- any lead_worker (nullable)

  -- Core entities
  v_customer uuid;
  v_site     uuid;
  v_project  uuid;

  -- Design phase
  v_ms     uuid;  v_ms_rev uuid;
  v_sd     uuid;  v_sd_rev uuid;
  v_jca    uuid;

  -- Accounting
  v_v_aft uuid;   -- Al Futtaim Technologies LLC
  v_v_eci uuid;   -- Emirates Cable Industries
  v_v_pio uuid;   -- Pioneer ELV Services FZE
  v_po1   uuid;
  v_po2   uuid;
  v_inv   uuid;
  v_run   uuid;
  v_emp1  uuid;   -- Mohammed Saleem
  v_emp2  uuid;   -- Rajesh Kumar
  v_emp3  uuid;   -- Ahmed Mahmoud
  v_emp4  uuid;   -- Ali Rahman
begin
  -- ════════════════════════════════════════════════════════
  -- 0) Resolve actors (existing users)
  -- ════════════════════════════════════════════════════════
  select id into v_actor from public.users
    where lower(email) = 'superadmin@sirahdigital.in' limit 1;
  if v_actor is null then
    select id into v_actor from public.users
      where role in ('admin','md') and is_active order by created_at limit 1;
  end if;

  select id into v_mgr from public.users
    where full_name ilike '%yusuf%' and is_active order by created_at limit 1;
  if v_mgr is null then v_mgr := v_actor; end if;

  select id into v_lead from public.users
    where role = 'lead_worker' and is_active order by created_at limit 1;
  -- v_lead may stay NULL — projects.lead_tech_id is nullable.

  raise notice 'demo-seed actors: actor=%, manager=%, lead=%', v_actor, v_mgr, v_lead;

  -- ════════════════════════════════════════════════════════
  -- 1) Customer  (contact + address go on the SITE below)
  -- ════════════════════════════════════════════════════════
  select id into v_customer from public.customers where name = 'Marina Bay Office LLC' limit 1;
  if v_customer is null then
    insert into public.customers (name, tier, region, sector, customer_since, owner_id, tags)
    values ('Marina Bay Office LLC', 'Key', 'Dubai', 'Commercial Real Estate',
            date '2026-01-05', v_actor, array['demo-seed'])
    returning id into v_customer;
    raise notice 'created customer Marina Bay Office LLC';
  end if;

  -- 1b) Site — holds the customer contact + address + TRN
  select id into v_site from public.sites
    where customer_id = v_customer and name = 'Marina Bay Tower' limit 1;
  if v_site is null then
    insert into public.sites
      (customer_id, name, area, address_line_1, contact_name, contact_phone, contact_email, access_instructions)
    values
      (v_customer, 'Marina Bay Tower', 'Dubai Marina',
       'Office 1502, Marina Bay Tower, Dubai Marina',
       'Ahmed Al-Mansoori', '+971 4 555 0123', 'ahmed@marinabay.ae',
       'Customer TRN: 100123456700003. 15th floor office fit-out.')
    returning id into v_site;
  end if;

  -- ════════════════════════════════════════════════════════
  -- 2) Project  (current_phase = design → all phase tabs visible, none locked)
  -- ════════════════════════════════════════════════════════
  select id into v_project from public.projects where code = 'PRJ-2026-DEMO' limit 1;
  if v_project is null then
    insert into public.projects
      (code, name, customer_id, site_id, manager_id, lead_tech_id,
       status, stage, current_phase, progress, value_aed,
       job_category, scope_description, contract_meta, started_at, due_at)
    values
      ('PRJ-2026-DEMO',
       'Marina Bay Tower - CCTV & Access Control Installation',
       v_customer, v_site, v_mgr, v_lead,
       'in_progress'::project_status, 'execution'::project_stage, 'design'::project_phase,
       20, 285000,
       'cctv',
       'Supply, install, commission and test 20-camera IP CCTV system with 4-door access control for Marina Bay Tower 15th floor office',
       '{"demo_seed": true}'::jsonb,
       date '2026-01-12', date '2026-04-30')
    returning id into v_project;
    raise notice 'created project PRJ-2026-DEMO (%)', v_project;
  end if;

  -- ════════════════════════════════════════════════════════
  -- 3) Material Submittal (15 items) — Approved
  --    code MS-YYYY-NNNN is assigned by trigger; do not set it.
  -- ════════════════════════════════════════════════════════
  select id into v_ms from public.material_submittals where project_id = v_project limit 1;
  if v_ms is null then
    insert into public.material_submittals (project_id, current_revision, approved_revision, created_by)
    values (v_project, 1, 1, v_actor)
    returning id into v_ms;

    insert into public.material_submittal_revisions
      (submittal_id, revision_number, status, submitted_at, responded_at, client_comments, created_by)
    values
      (v_ms, 1, 'approved', timestamptz '2026-01-18 10:00+04', timestamptz '2026-01-22 14:00+04',
       'Approved — proceed to procurement.', v_actor)
    returning id into v_ms_rev;

    insert into public.material_items (revision_id, description, model_number, quantity, sort_order) values
      (v_ms_rev, 'Hikvision IP Dome Camera 4MP',          'DS-2CD2143G2-I',   15,  1),
      (v_ms_rev, 'Hikvision IP Bullet Camera 4MP',        'DS-2CD2T43G2-I',    5,  2),
      (v_ms_rev, 'Hikvision 16-Channel NVR',              'DS-7616NI-Q2/16P',  1,  3),
      (v_ms_rev, 'Seagate Skyhawk 4TB Surveillance HDD',  'ST4000VX007',       2,  4),
      (v_ms_rev, 'TP-Link 24-Port PoE Switch',            'TL-SG2428P',        1,  5),
      (v_ms_rev, 'Dell 19" Monitor',                      'P1917S',            1,  6),
      (v_ms_rev, 'Cat6 UTP Cable (305m box)',             'Cat6-UTP-305',      4,  7),
      (v_ms_rev, 'RJ45 Cat6 Connectors',                  'RJ45-CAT6',       100,  8),
      (v_ms_rev, 'PVC Cable Conduit 25mm',                'PVC-CONDUIT-25',   50,  9),
      (v_ms_rev, 'Suprema 4-Door Access Controller',      'CoreStation',       1, 10),
      (v_ms_rev, 'Suprema BioEntry P2 Fingerprint Reader','BioEntry-P2',       4, 11),
      (v_ms_rev, 'Securitron Electric Door Strike',       'HID-32D',           4, 12),
      (v_ms_rev, 'Exit Push Button',                      'EXIT-BTN',          4, 13),
      (v_ms_rev, '12V 7Ah UPS Battery',                   '12V-7AH',           2, 14),
      (v_ms_rev, 'Installation Labor (lot)',               null,               1, 15);
    raise notice 'created material submittal with 15 items';
  end if;

  -- ════════════════════════════════════════════════════════
  -- 4) Shop Drawing — Approved (title/number in description)
  -- ════════════════════════════════════════════════════════
  select id into v_sd from public.shop_drawings where project_id = v_project limit 1;
  if v_sd is null then
    insert into public.shop_drawings (project_id, current_revision, approved_revision, created_by)
    values (v_project, 1, 1, v_actor)
    returning id into v_sd;

    insert into public.shop_drawing_revisions
      (drawing_id, revision_number, status, description, submitted_at, responded_at, client_comments, created_by)
    values
      (v_sd, 1, 'approved',
       'Marina Bay Tower 15F - CCTV Layout Drawing (DWG-MBT-15F-001, Rev R0)',
       timestamptz '2026-01-19 09:00+04', timestamptz '2026-01-23 16:00+04',
       'All camera positions per client approved walk-through', v_actor)
    returning id into v_sd_rev;
    raise notice 'created shop drawing (approved)';
  end if;

  -- ════════════════════════════════════════════════════════
  -- 5) JCA — internal budget (no status column)
  --    materials 110000 / manpower 35000 / subcontractor 15000 /
  --    other 21500 (equipment 5000 + overheads 16500) / margin 20%
  -- ════════════════════════════════════════════════════════
  select id into v_jca from public.project_jca where project_id = v_project limit 1;
  if v_jca is null then
    insert into public.project_jca
      (project_id, materials_budget, manpower_budget, subcontractor_budget,
       other_charges, profit_margin_pct, created_by, updated_by)
    values
      (v_project, 110000, 35000, 15000, 21500, 20, v_actor, v_actor)
    returning id into v_jca;

    insert into public.project_jca_history
      (jca_id, materials_budget, manpower_budget, subcontractor_budget,
       other_charges, profit_margin_pct, note, edited_by)
    values
      (v_jca, 110000, 35000, 15000, 21500, 20,
       'Initial budget — total estimated cost AED 181,500 (excl. margin).', v_actor);
    raise notice 'created JCA';
  end if;

  -- ════════════════════════════════════════════════════════
  -- 6) Vendors (3) — vendor_code VEN-NNNN assigned by trigger
  -- ════════════════════════════════════════════════════════
  select id into v_v_aft from public.vendors where name = 'Al Futtaim Technologies LLC' limit 1;
  if v_v_aft is null then
    insert into public.vendors
      (name, contact_person, phone, email, trn, category, payment_terms_days, status, notes, created_by)
    values
      ('Al Futtaim Technologies LLC', 'Khalid Hassan', '+971 4 444 8800', 'sales@aft-tech.ae',
       '100234567800003', 'materials_supplier', 30, 'active', '[demo-seed]', v_actor)
    returning id into v_v_aft;
  end if;

  select id into v_v_eci from public.vendors where name = 'Emirates Cable Industries' limit 1;
  if v_v_eci is null then
    insert into public.vendors
      (name, contact_person, phone, trn, category, payment_terms_days, status, notes, created_by)
    values
      ('Emirates Cable Industries', 'Raj Kumar', '+971 4 333 7700',
       '100345678900003', 'materials_supplier', 45, 'active', '[demo-seed]', v_actor)
    returning id into v_v_eci;
  end if;

  select id into v_v_pio from public.vendors where name = 'Pioneer ELV Services FZE' limit 1;
  if v_v_pio is null then
    insert into public.vendors
      (name, contact_person, phone, trn, category, payment_terms_days, status, notes, created_by)
    values
      ('Pioneer ELV Services FZE', 'Mohammed Iqbal', '+971 50 123 4567',
       '100456789000003', 'subcontractor', 30, 'active', '[demo-seed]', v_actor)
    returning id into v_v_pio;
  end if;

  -- ════════════════════════════════════════════════════════
  -- 7) Purchase Orders (2) — Approved.  Totals roll up from lines.
  --    PO1 → AFT  : subtotal 23,500 + 5% VAT = 24,675
  --    PO2 → ECI  : subtotal  4,500 + 5% VAT =  4,725
  -- ════════════════════════════════════════════════════════
  if not exists (select 1 from public.purchase_orders where notes like '%[demo-seed]%') then
    -- PO1 → Al Futtaim Technologies (cameras, NVR, HDD)
    insert into public.purchase_orders
      (vendor_id, project_id, status, order_date, expected_date, description,
       approved_by, approved_at, notes, created_by, last_action_by)
    values
      (v_v_aft, v_project, 'approved', date '2026-01-26', date '2026-02-05',
       'CCTV cameras, NVR and storage for Marina Bay Tower',
       v_actor, timestamptz '2026-01-27 11:00+04', '[demo-seed]', v_actor, v_actor)
    returning id into v_po1;

    insert into public.po_line_items (po_id, description, quantity, rate, tax_pct, sort_order) values
      (v_po1, 'Hikvision IP Dome Camera 4MP (DS-2CD2143G2-I)',   15,  850, 5, 1),
      (v_po1, 'Hikvision IP Bullet Camera 4MP (DS-2CD2T43G2-I)',  5,  950, 5, 2),
      (v_po1, 'Hikvision 16-Channel NVR (DS-7616NI-Q2/16P)',      1, 4500, 5, 3),
      (v_po1, 'Seagate Skyhawk 4TB HDD (ST4000VX007)',            2,  750, 5, 4);

    -- PO2 → Emirates Cable Industries (cables, connectors, conduit)
    insert into public.purchase_orders
      (vendor_id, project_id, status, order_date, expected_date, description,
       approved_by, approved_at, notes, created_by, last_action_by)
    values
      (v_v_eci, v_project, 'approved', date '2026-01-26', date '2026-02-03',
       'Structured cabling materials for Marina Bay Tower',
       v_actor, timestamptz '2026-01-27 11:30+04', '[demo-seed]', v_actor, v_actor)
    returning id into v_po2;

    insert into public.po_line_items (po_id, description, quantity, rate, tax_pct, sort_order) values
      (v_po2, 'Cat6 UTP Cable (305m box)',  4, 850, 5, 1),
      (v_po2, 'RJ45 Cat6 Connectors',     100,   5, 5, 2),
      (v_po2, 'PVC Cable Conduit 25mm',    50,  12, 5, 3);
    raise notice 'created 2 purchase orders';
  end if;

  -- ════════════════════════════════════════════════════════
  -- 8 & 9) Invoice (5 lines, 190,000 + 5% = 199,500) + full payment
  --    Insert as 'sent'; the payment trigger flips it to 'paid'.
  -- ════════════════════════════════════════════════════════
  if not exists (select 1 from public.invoices where notes like '%[demo-seed]%') then
    insert into public.invoices
      (project_id, customer_id, status, invoice_date, due_date, description, notes,
       created_by, approved_by, approved_at, sent_at)
    values
      (v_project, v_customer, 'sent', date '2026-02-10', date '2026-03-12',
       'Marina Bay Tower - CCTV & Access Control (supply + installation)', '[demo-seed]',
       v_actor, v_actor, timestamptz '2026-02-10 12:00+04', timestamptz '2026-02-11 09:00+04')
    returning id into v_inv;

    insert into public.invoice_line_items (invoice_id, description, quantity, rate, tax_pct, sort_order) values
      (v_inv, 'Equipment supply — IP CCTV system (cameras, NVR, storage)', 1, 110000, 5, 1),
      (v_inv, 'Access control system — 4-door (controllers, readers, strikes)', 1, 30000, 5, 2),
      (v_inv, 'Installation & termination services', 1, 35000, 5, 3),
      (v_inv, 'Cable laying & containment', 1, 5000, 5, 4),
      (v_inv, 'Project management & commissioning', 1, 10000, 5, 5);

    -- Full payment received → trigger sets amount_paid + status = 'paid'
    insert into public.invoice_payments
      (invoice_id, amount, received_at, method, reference, notes, recorded_by)
    values
      (v_inv, 199500, date '2026-02-25', 'bank_transfer', 'TRX-MBT-20260225-001',
       'Full settlement received.', v_actor);
    raise notice 'created invoice + full payment (status → paid)';
  end if;

  -- ════════════════════════════════════════════════════════
  -- 10) Employees (4) — employee_code EMP-NNNN assigned by trigger.
  --     total_salary is a generated column (sum of the components).
  -- ════════════════════════════════════════════════════════
  select id into v_emp1 from public.employees where name = 'Mohammed Saleem' limit 1;
  if v_emp1 is null then
    insert into public.employees
      (name, position, department, date_of_joining, date_of_birth, nationality,
       passport_number, emirates_id, visa_status,
       basic_salary, housing_allowance, transport_allowance, other_allowances,
       bank_account, iban, status, notes, created_by, last_action_by)
    values
      ('Mohammed Saleem', 'Senior Technician', 'Operations', date '2023-03-15', date '1990-06-12',
       'Indian', 'P1234567', '784-1990-1234567-1', 'Employment',
       3600, 1500, 600, 300, '0123456789001', 'AE070331234567890100001', 'active',
       '[demo-seed]', v_actor, v_actor)
    returning id into v_emp1;
  end if;

  select id into v_emp2 from public.employees where name = 'Rajesh Kumar' limit 1;
  if v_emp2 is null then
    insert into public.employees
      (name, position, department, date_of_joining, date_of_birth, nationality,
       passport_number, emirates_id, visa_status,
       basic_salary, housing_allowance, transport_allowance, other_allowances,
       bank_account, iban, status, notes, created_by, last_action_by)
    values
      ('Rajesh Kumar', 'Lead Technician', 'Operations', date '2022-09-01', date '1987-02-25',
       'Indian', 'P2345678', '784-1987-2345678-2', 'Employment',
       5100, 2125, 850, 425, '0123456789002', 'AE070331234567890100002', 'active',
       '[demo-seed]', v_actor, v_actor)
    returning id into v_emp2;
  end if;

  select id into v_emp3 from public.employees where name = 'Ahmed Mahmoud' limit 1;
  if v_emp3 is null then
    insert into public.employees
      (name, position, department, date_of_joining, date_of_birth, nationality,
       passport_number, emirates_id, visa_status,
       basic_salary, housing_allowance, transport_allowance, other_allowances,
       bank_account, iban, status, notes, created_by, last_action_by)
    values
      ('Ahmed Mahmoud', 'Operations Manager', 'Management', date '2021-05-10', date '1982-11-03',
       'Egyptian', 'A3456789', '784-1982-3456789-3', 'Employment',
       11400, 4750, 1900, 950, '0123456789003', 'AE070331234567890100003', 'active',
       '[demo-seed]', v_actor, v_actor)
    returning id into v_emp3;
  end if;

  select id into v_emp4 from public.employees where name = 'Ali Rahman' limit 1;
  if v_emp4 is null then
    insert into public.employees
      (name, position, department, date_of_joining, date_of_birth, nationality,
       passport_number, emirates_id, visa_status,
       basic_salary, housing_allowance, transport_allowance, other_allowances,
       bank_account, iban, status, notes, created_by, last_action_by)
    values
      ('Ali Rahman', 'Junior Technician', 'Operations', date '2026-01-05', date '1996-08-19',
       'Bangladeshi', 'B4567890', '784-1996-4567890-4', 'Employment',
       2160, 900, 360, 180, '0123456789004', 'AE070331234567890100004', 'probation',
       '[demo-seed]', v_actor, v_actor)
    returning id into v_emp4;
  end if;

  -- ════════════════════════════════════════════════════════
  -- 11) Expenses (6) — Feb 2026.  total is generated; receipt_path is
  --     mandatory to leave 'draft' (enforced by trigger).
  -- ════════════════════════════════════════════════════════
  if not exists (select 1 from public.expenses where notes like '%[demo-seed]%') then
    insert into public.expenses
      (expense_date, category_code, description, amount, vat_included, status,
       payment_method, payment_reference, paid_date, receipt_path, receipt_name,
       notes, created_by, last_action_by)
    values
      (date '2026-02-01', 'office_rent', 'Office rent — February 2026', 8000, true, 'paid',
       'bank_transfer', 'RENT-FEB-2026', date '2026-02-02',
       'expense-receipts/demo/office-rent-feb-2026.pdf', 'office-rent-feb-2026.pdf',
       '[demo-seed]', v_actor, v_actor),
      (date '2026-02-05', 'electricity', 'DEWA — electricity (Feb 2026)', 650, true, 'paid',
       'bank_transfer', 'DEWA-FEB-2026', date '2026-02-28',
       'expense-receipts/demo/dewa-feb-2026.pdf', 'dewa-feb-2026.pdf',
       '[demo-seed]', v_actor, v_actor),
      (date '2026-02-05', 'internet', 'Etisalat — internet & telephone (Feb 2026)', 400, true, 'paid',
       'bank_transfer', 'ETISALAT-FEB-2026', date '2026-02-28',
       'expense-receipts/demo/etisalat-feb-2026.pdf', 'etisalat-feb-2026.pdf',
       '[demo-seed]', v_actor, v_actor),
      (date '2026-02-12', 'fuel', 'Vehicle fuel — company van', 450, true, 'paid',
       'cash', 'FUEL-FEB-2026', date '2026-02-12',
       'expense-receipts/demo/fuel-feb-2026.jpg', 'fuel-feb-2026.jpg',
       '[demo-seed]', v_actor, v_actor),
      (date '2026-02-15', 'office_supplies', 'Office supplies — stationery & printer ink', 320, true, 'paid',
       'cash', 'SUPPLIES-FEB-2026', date '2026-02-15',
       'expense-receipts/demo/supplies-feb-2026.jpg', 'supplies-feb-2026.jpg',
       '[demo-seed]', v_actor, v_actor),
      -- Above the AED 5,000 approval threshold → still Pending approval.
      (date '2026-02-20', 'travel', 'Travel — Abu Dhabi site visit', 7500, true, 'pending_approval',
       null, null, null,
       'expense-receipts/demo/travel-auh-feb-2026.pdf', 'travel-auh-feb-2026.pdf',
       '[demo-seed]', v_actor, v_actor);
    raise notice 'created 6 expenses';
  end if;

  -- 11b) A recurring expense template (populates the Recurring sub-tab)
  if not exists (select 1 from public.recurring_expenses where notes like '%[demo-seed]%') then
    insert into public.recurring_expenses
      (category_code, description, base_amount, vat_included, frequency, next_due_date, is_active, notes, created_by)
    values
      ('office_rent', 'Office rent (monthly)', 8000, true, 'monthly', date '2026-03-01', true,
       '[demo-seed]', v_actor);
  end if;

  -- ════════════════════════════════════════════════════════
  -- 12) Payroll run — February 2026, Draft.  Totals roll up from lines.
  --     4 lines snapshot salary; +500 OT (Mohammed), +1000 bonus (Rajesh).
  -- ════════════════════════════════════════════════════════
  if not exists (
    select 1 from public.payroll_runs
     where org_key = 'org_installtec' and period_year = 2026 and period_month = 2 and status <> 'cancelled'
  ) then
    insert into public.payroll_runs (period_year, period_month, status, notes, created_by, last_action_by)
    values (2026, 2, 'draft', '[demo-seed]', v_actor, v_actor)
    returning id into v_run;

    -- gross/additions/net are generated columns — only base components +
    -- adjustments are inserted. days_in_period = 28 (Feb 2026, non-leap).
    insert into public.payroll_lines
      (run_id, employee_id, employee_code, employee_name,
       basic_salary, housing_allowance, transport_allowance, other_allowances,
       overtime_amount, bonus_amount, deductions,
       emirates_id, iban, days_in_period)
    select v_run, e.id, e.employee_code, e.name,
           e.basic_salary, e.housing_allowance, e.transport_allowance, e.other_allowances,
           case when e.id = v_emp1 then 500  else 0 end,   -- Mohammed: overtime
           case when e.id = v_emp2 then 1000 else 0 end,   -- Rajesh: bonus
           0,
           e.emirates_id, e.iban, 28
      from public.employees e
     where e.id in (v_emp1, v_emp2, v_emp3, v_emp4);
    raise notice 'created Feb-2026 payroll run (draft) with 4 lines';
  end if;

  raise notice '════ demo seed complete ════';
end $$;

commit;

-- ============================================================
-- POST-RUN VERIFICATION (optional — paste separately)
-- ============================================================
-- select code, name, status, current_phase, value_aed from projects where code = 'PRJ-2026-DEMO';
-- select invoice_number, status, total, amount_paid from invoices where notes like '%[demo-seed]%';
-- select po_number, status, total from purchase_orders where notes like '%[demo-seed]%';
-- select run_code, status, total_gross, total_additions, total_net, employee_count
--   from payroll_runs where notes like '%[demo-seed]%';
-- select expense_number, category_code, total, status from expenses where notes like '%[demo-seed]%' order by expense_date;
-- ============================================================
