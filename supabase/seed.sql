-- ============================================================
-- Installtec OS - Seed data (mirrors prototype/data.jsx)
-- Run with: supabase db reset  (applies migrations then this seed)
-- All inserts use deterministic UUIDs so re-runs are idempotent.
-- Auth users must be created separately via supabase auth admin
-- and linked via users.auth_id (or use NEXT_PUBLIC_USE_MOCK_DATA=true
-- to browse the UI without auth).
-- ============================================================

-- ── ROLE TEMPLATES ─────────────────────────────────────────
insert into role_permission_templates (role, default_permissions, description) values
  ('admin', '{"all": true}', 'Full system control'),
  ('md',    '{"approve_md_tier": true, "view_financials": true}', 'Strategic + MD-tier approvals'),
  ('manager', '{"approve_to": 200000, "reassign_cross_team": true, "create_customers": true}', 'Operational oversight'),
  ('sales',   '{"create_quotation": true, "discount_pct": 5}', 'Sales pipeline + AMC renewals'),
  ('estimator', '{"edit_boq": true}', 'BOQ + costing'),
  ('lead_worker', '{"approve_material_to": 5000, "request_overtime": true, "approve_leave": true, "manage_leave": true, "view_team_leave_calendar": true}', 'Crew lead'),
  ('worker', '{"request_leave": true, "request_materials": true}', 'Field technician'),
  ('driver', '{"deliver": true}', 'Material delivery'),
  ('subcontractor', '{}', 'Scoped delivery only'),
  ('service_support', '{"open_tickets": true, "classify_call": true}', 'Repair intake + comms'),
  ('accounts', '{"invoice": true, "reconcile_payment": true}', 'Finance')
on conflict (role) do nothing;

-- ── TEAMS ──────────────────────────────────────────────────
insert into teams (id, name, region, skills) values
  ('00000000-0000-0000-0000-000000000a01', 'ELV Installation Alpha', 'UAE', array['CCTV','ACS','SCS','Fiber'])
on conflict (id) do nothing;

-- ── USERS ──────────────────────────────────────────────────
insert into users (id, email, phone, full_name, initials, tint, role, region, team_id) values
  ('00000000-0000-0000-0000-000000001001', 'rashid@installtec.ae',  '+971 50 482 1108', 'Rashid Al-Hashimi',  'RH', 'primary', 'manager',         'UAE', null),
  ('00000000-0000-0000-0000-000000001002', 'amir@installtec.ae',    '+971 50 110 4221', 'Amir Hadid',         'AH', 'violet',  'md',              'UAE', null),
  ('00000000-0000-0000-0000-000000001003', 'admin@installtec.ae',   '+971 50 999 0000', 'Ops Admin',          'OA', 'peach',   'admin',           'UAE', null),
  ('00000000-0000-0000-0000-000000001004', 'arvind@installtec.ae',  '+971 55 220 3344', 'Arvind Krishnan',    'AK', 'primary', 'lead_worker',     'UAE', '00000000-0000-0000-0000-000000000a01'),
  ('00000000-0000-0000-0000-000000001005', 'bilal@installtec.ae',   '+971 56 880 1212', 'Bilal Sayed',        'BS', 'warm',    'worker',          'UAE', '00000000-0000-0000-0000-000000000a01'),
  ('00000000-0000-0000-0000-000000001006', 'joseph@installtec.ae',  '+971 54 330 7788', 'Joseph Mathew',      'JM', 'info',    'worker',          'UAE', '00000000-0000-0000-0000-000000000a01'),
  ('00000000-0000-0000-0000-000000001007', 'karthik@installtec.ae', '+971 50 412 8800', 'Karthik Iyer',       'KI', 'warm',    'driver',          'UAE', null),
  ('00000000-0000-0000-0000-000000001008', 'saif@gmail.com',        '+971 56 110 2233', 'Saif Ibrahim',       'SI', 'peach',   'subcontractor',   'UAE', null),
  ('00000000-0000-0000-0000-000000001009', 'pooja@installtec.ae',   '+971 50 224 8867', 'Pooja Menon',        'PM', 'violet',  'service_support', 'UAE', null),
  ('00000000-0000-0000-0000-000000001010', 'priya@installtec.ae',   '+971 50 887 9911', 'Priya Nair',         'PN', 'info',    'accounts',        'UAE', null),
  ('00000000-0000-0000-0000-000000001011', 'noor@installtec.ae',    '+971 55 999 3322', 'Noor El-Sayed',      'NE', 'peach',   'sales',           'UAE', null),
  ('00000000-0000-0000-0000-000000001012', 'sara@installtec.ae',    '+971 50 220 1144', 'Sara Anand',         'SA', 'primary', 'estimator',       'UAE', null)
on conflict (id) do nothing;

-- Manager linkage
update users set manager_id = '00000000-0000-0000-0000-000000001002' where id = '00000000-0000-0000-0000-000000001001';
update users set manager_id = '00000000-0000-0000-0000-000000001001' where id in (
  '00000000-0000-0000-0000-000000001004',
  '00000000-0000-0000-0000-000000001007','00000000-0000-0000-0000-000000001009',
  '00000000-0000-0000-0000-000000001011','00000000-0000-0000-0000-000000001012'
);
update users set manager_id = '00000000-0000-0000-0000-000000001004' where id in (
  '00000000-0000-0000-0000-000000001005','00000000-0000-0000-0000-000000001006','00000000-0000-0000-0000-000000001008'
);
update users set manager_id = '00000000-0000-0000-0000-000000001002' where id = '00000000-0000-0000-0000-000000001010';

-- Team leadership
update teams set lead_worker_id = '00000000-0000-0000-0000-000000001004',
                 manager_id     = '00000000-0000-0000-0000-000000001001'
 where id = '00000000-0000-0000-0000-000000000a01';

-- ── CUSTOMERS ──────────────────────────────────────────────
insert into customers (id, name, tier, region, sector, owner_id, customer_since, tags) values
  ('00000000-0000-0000-0000-000000002001','DAMAC Properties',             'Strategic','UAE','Real Estate','00000000-0000-0000-0000-000000001011','2014-03-01', array['ACS','CCTV','SCS']),
  ('00000000-0000-0000-0000-000000002002','MAG Group',                    'Strategic','UAE','Real Estate','00000000-0000-0000-0000-000000001011','2017-08-01', array['CCTV','SCS']),
  ('00000000-0000-0000-0000-000000002003','Azizi Developments',           'Key',      'UAE','Real Estate','00000000-0000-0000-0000-000000001011','2019-05-01', array['CCTV','Fiber']),
  ('00000000-0000-0000-0000-000000002004','Manipal University Dubai',     'Key',      'UAE','Education',  '00000000-0000-0000-0000-000000001011','2018-11-01', array['ACS','CCTV','AV']),
  ('00000000-0000-0000-0000-000000002005','Canadian Specialist Hospital', 'Key',      'UAE','Healthcare', '00000000-0000-0000-0000-000000001011','2016-04-01', array['CCTV','Nurse Call']),
  ('00000000-0000-0000-0000-000000002006','NMC Hospital',                 'Standard', 'UAE','Healthcare', '00000000-0000-0000-0000-000000001011','2020-02-01', array['CCTV']),
  ('00000000-0000-0000-0000-000000002007','Emaar Mgmt - Burj District',   'Key',      'UAE','Hospitality','00000000-0000-0000-0000-000000001011','2021-09-01', array['CCTV']),
  ('00000000-0000-0000-0000-000000002008','DIFC Authority',               'Strategic','UAE','Government', '00000000-0000-0000-0000-000000001011','2015-06-01', array['ACS','Compliance'])
on conflict (id) do nothing;

-- ── SITES ──────────────────────────────────────────────────
insert into sites (id, customer_id, name, area, access_instructions) values
  ('00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000002001','Burj Vista Tower 2',     'Downtown Dubai',      'Rear loading bay · Security desk B'),
  ('00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000002002','MAG 318 - Business Bay', 'Business Bay',        'Service entrance · Mr. Khan'),
  ('00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000002008','DIFC Gate Avenue West',  'DIFC',                'Concierge · Block 4'),
  ('00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000002004','Manipal Campus',         'Dubai Academic City', 'Maintenance gate 2'),
  ('00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000002005','CSH Deira - Main Block', 'Deira',               'Goods lift · Basement B1'),
  ('00000000-0000-0000-0000-000000003006','00000000-0000-0000-0000-000000002003','Azizi Riviera Phase 5',  'MBR City',            'Site office trailer'),
  ('00000000-0000-0000-0000-000000003007','00000000-0000-0000-0000-000000002006','NMC Deira Branch',       'Deira',               'Reception escort required')
on conflict (id) do nothing;

-- ── PROJECTS + MILESTONES ──────────────────────────────────
insert into projects (id, code, name, customer_id, site_id, manager_id, team_id, status, stage, progress, value_aed, started_at, due_at) values
  ('00000000-0000-0000-0000-000000004001','PRJ-2025-014','DIFC Gate Ave West - ELV Upgrade',          '00000000-0000-0000-0000-000000002008','00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000a01','In Progress','Installation', 62, 1840000,'2025-02-10','2025-07-30'),
  ('00000000-0000-0000-0000-000000004002','PRJ-2025-022','Azizi Riviera Ph.5 - CCTV + Fiber Backbone','00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000003006','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000a01','In Progress','Installation', 38,  920000,'2025-03-22','2025-08-15'),
  ('00000000-0000-0000-0000-000000004003','PRJ-2025-009','Manipal Campus - Phase 2 ACS Expansion',    '00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000a01','Awaiting VO Approval','Variation', 78,  540000,'2025-01-08','2025-06-12'),
  ('00000000-0000-0000-0000-000000004004','PRJ-2025-018','MAG 318 - Phase A Tenant Floors',           '00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000a01','On Track','Termination', 84,  690000,'2025-02-01','2025-06-04')
on conflict (id) do nothing;

-- ── AMC CONTRACTS ──────────────────────────────────────────
insert into amc_contracts (id, code, customer_id, site_id, manager_id, state, value_aed, next_due_label, overdue_days, free_calls_used, expires_at) values
  ('00000000-0000-0000-0000-000000005001','AMC-091','00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000001001','PENDING_REACTIVATION', 48000, 'Today',  12, 3, '2025-12-31'),
  ('00000000-0000-0000-0000-000000005002','AMC-092','00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000001001','ACTIVE',               36000, 'May 28',  0, 5, '2025-11-15'),
  ('00000000-0000-0000-0000-000000005003','AMC-088','00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000001001','BLOCKED',              64000, '-',      34, 0, '2026-01-30'),
  ('00000000-0000-0000-0000-000000005004','AMC-085','00000000-0000-0000-0000-000000002006','00000000-0000-0000-0000-000000003007','00000000-0000-0000-0000-000000001001','ACTIVE',               22000, 'Jun 02',  0, 2, '2025-10-08'),
  ('00000000-0000-0000-0000-000000005005','AMC-080','00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000003006','00000000-0000-0000-0000-000000001001','RENEWAL_DUE',          41000, 'Jun 14',  0, 7, '2025-06-22'),
  ('00000000-0000-0000-0000-000000005006','AMC-079','00000000-0000-0000-0000-000000002005','00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000001001','ACTIVE',               28000, 'Jun 05',  0, 1, '2025-12-10')
on conflict (id) do nothing;

-- ── REPAIR TICKETS ─────────────────────────────────────────
insert into repair_tickets (id, code, title, customer_id, site_id, state, sla_target_min, sla_elapsed_min, classification, priority, assigned_to, visits, flagged, opened_at) values
  ('00000000-0000-0000-0000-000000006001','TKT-412','Reception camera offline',         '00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','In Progress', 240, 142, 'AMC free-call', 'high',   '00000000-0000-0000-0000-000000001005', 2, null, '2025-05-15 14:20'),
  ('00000000-0000-0000-0000-000000006002','TKT-410','NVR rack - power supply fault',    '00000000-0000-0000-0000-000000002005','00000000-0000-0000-0000-000000003005','Resolved',    240,  95, 'Chargeable',    'normal', '00000000-0000-0000-0000-000000001006', 1, null, '2025-05-13 09:30'),
  ('00000000-0000-0000-0000-000000006003','TKT-408','ACS reader stuck - main lobby',    '00000000-0000-0000-0000-000000002008','00000000-0000-0000-0000-000000003003','New',         120,  18, 'AMC free-call', 'high',    null,                                  0, null, '2025-05-16 08:40'),
  ('00000000-0000-0000-0000-000000006004','TKT-405','AC unit alarm - server room',      '00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000003006','Resolved',    240, 188, 'Warranty',      'normal', '00000000-0000-0000-0000-000000001004', 1, null, '2025-05-09 11:00'),
  ('00000000-0000-0000-0000-000000006005','TKT-402','CAM-B-204 third failure',          '00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','Resolved',    240, 220, 'AMC free-call', 'high',   '00000000-0000-0000-0000-000000001005', 3, 'Repeat failure', '2025-05-02 10:15')
on conflict (id) do nothing;

-- ── WORK ORDERS ────────────────────────────────────────────
insert into work_orders (id, code, type, priority, title, source_kind, source_id, customer_id, site_id, scheduled_start, scheduled_end, status, assigned_lead, progress, sla_min, elapsed_min, materials, flagged) values
  ('00000000-0000-0000-0000-000000007001','WO-3284','AMC',     'Standard','Q2 Quarterly Service - CCTV + ACS',                  'amc',     '00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000003001','2025-05-16 09:00','2025-05-16 11:30','In Progress','00000000-0000-0000-0000-000000001004', 60, 240, 142, array['Lens cleaning kit','NVR HDD test','ACS reader spare'], null),
  ('00000000-0000-0000-0000-000000007002','WO-3285','REPAIR',  'High',    'Reception camera offline - Visit 2',                  'repair',  '00000000-0000-0000-0000-000000006001','00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','2025-05-16 13:00','2025-05-16 14:30','Assigned',   '00000000-0000-0000-0000-000000001005', 0,  180,  12, array['Replacement 4MP dome cam','PoE injector'], 'Repeat failure - 3 visits in 90 days'),
  ('00000000-0000-0000-0000-000000007003','WO-3286','PROJECT', 'Standard','Cable pulling - L4 to L6 risers',                     'project', '00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000003006','2025-05-16 15:00','2025-05-16 18:00','Scheduled',  '00000000-0000-0000-0000-000000001006', 0, null,   0, array['Cat6A 305m drum','Containment','Tie wraps'], null),
  ('00000000-0000-0000-0000-000000007004','WO-3287','DELIVERY','Standard','Site delivery - Cat6A drums & patch panels',          'project', '00000000-0000-0000-0000-000000004003','00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000003004','2025-05-16 10:30','2025-05-16 11:30','In Transit', '00000000-0000-0000-0000-000000001007', 35, null,  22, array['Cat6A drum × 4','Patch panel × 8','Cable ties'], null),
  ('00000000-0000-0000-0000-000000007005','WO-3288','PROJECT', 'Standard','ACS device fit - Block A floors 3-5',                  'project', '00000000-0000-0000-0000-000000004003','00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000003004','2025-05-17 08:30','2025-05-17 17:00','Scheduled',  '00000000-0000-0000-0000-000000001004', 0, null,   0, array['12× ACS readers','Cabling kit'], null),
  ('00000000-0000-0000-0000-000000007006','WO-3279','AMC',     'Standard','CSH AMC service Q2',                                   'amc',     '00000000-0000-0000-0000-000000005006','00000000-0000-0000-0000-000000002005','00000000-0000-0000-0000-000000003005','2025-05-15 08:00','2025-05-15 11:00','Closed',     '00000000-0000-0000-0000-000000001006', 100, 240, 180, array[]::text[], null),
  ('00000000-0000-0000-0000-000000007007','WO-3290','SURVEY',  'Standard','Site survey - DIFC Gate Ave variation order',          'project', '00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000002008','00000000-0000-0000-0000-000000003003','2025-05-16 14:00','2025-05-16 16:00','Scheduled',  '00000000-0000-0000-0000-000000001012', 0, null,   0, array[]::text[], null),
  ('00000000-0000-0000-0000-000000007008','WO-3271','REPAIR',  'High',    'ACS reader stuck - NMC main lobby',                    'repair',  '00000000-0000-0000-0000-000000006003','00000000-0000-0000-0000-000000002006','00000000-0000-0000-0000-000000003007','2025-05-16 09:30','2025-05-16 11:00','In Progress','00000000-0000-0000-0000-000000001005', 30, 120, 108, array['Reader spare','Tooling'], null)
on conflict (id) do nothing;

-- WO assignments (multi-user)
insert into work_order_assignments (work_order_id, user_id) values
  ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-000000001004'),
  ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-000000001005'),
  ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-000000001005'),
  ('00000000-0000-0000-0000-000000007003','00000000-0000-0000-0000-000000001006'),
  ('00000000-0000-0000-0000-000000007003','00000000-0000-0000-0000-000000001008'),
  ('00000000-0000-0000-0000-000000007004','00000000-0000-0000-0000-000000001007'),
  ('00000000-0000-0000-0000-000000007005','00000000-0000-0000-0000-000000001004'),
  ('00000000-0000-0000-0000-000000007005','00000000-0000-0000-0000-000000001006'),
  ('00000000-0000-0000-0000-000000007005','00000000-0000-0000-0000-000000001005'),
  ('00000000-0000-0000-0000-000000007006','00000000-0000-0000-0000-000000001006'),
  ('00000000-0000-0000-0000-000000007007','00000000-0000-0000-0000-000000001012'),
  ('00000000-0000-0000-0000-000000007007','00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000007008','00000000-0000-0000-0000-000000001005')
on conflict do nothing;

-- WO tasks for WO-3284
insert into work_order_tasks (work_order_id, label, is_done, count_label, position) values
  ('00000000-0000-0000-0000-000000007001','Check-in & site walk',      true,  null,    1),
  ('00000000-0000-0000-0000-000000007001','Inspect 24× IP cameras',    true,  '24/24', 2),
  ('00000000-0000-0000-0000-000000007001','Test NVR & storage',        true,  null,    3),
  ('00000000-0000-0000-0000-000000007001','Inspect 6× ACS readers',    false, '4/6',   4),
  ('00000000-0000-0000-0000-000000007001','Customer walk-through',     false, null,    5),
  ('00000000-0000-0000-0000-000000007001','Service report + sign-off', false, null,    6);

-- ── INVENTORY ──────────────────────────────────────────────
insert into inventory_items (sku, name, unit, qty_central, qty_vehicles, qty_sites, reorder_at, value_aed) values
  ('CCTV-DOME-4MP', '4MP IP Dome Camera',      'pcs',  42, 6, 18, 20, 38000),
  ('CCTV-BULL-8MP', '8MP IP Bullet Camera',    'pcs',  18, 4,  6, 12, 22000),
  ('CAT6A-DRUM',    'Cat6A Cable Drum (305m)', 'drum',  6, 2,  4,  8, 14400),
  ('NVR-32CH',      'NVR 32-channel 4K',       'pcs',   5, 1, 12,  3, 32500),
  ('ACS-RDR-MIFARE','Mifare ACS Reader',       'pcs',  28, 5, 22, 15, 11200),
  ('PATCH-PNL-48',  '48-port patch panel',     'pcs',  12, 2,  8,  5,  8400),
  ('POE-SW-24',     '24-port PoE+ Switch',     'pcs',   8, 1,  4,  4, 18000)
on conflict (sku) do nothing;

-- ── ASSETS ─────────────────────────────────────────────────
insert into assets (tag, model, site_id, installed_at, warranty_to, fault_count, status) values
  ('CAM-B-204',  '4MP IP Dome',    '00000000-0000-0000-0000-000000003002','2022-03-14','2025-03-13', 3, 'Repeat failure'),
  ('NVR-MAIN-1', 'NVR 32-channel', '00000000-0000-0000-0000-000000003001','2021-09-22','2024-09-21', 0, 'Healthy'),
  ('ACS-D-12',   'Mifare Reader',  '00000000-0000-0000-0000-000000003005','2023-06-01','2026-05-30', 1, 'Healthy')
on conflict (tag) do nothing;

-- ── APPROVAL CHAINS (admin-configurable, per MASTER_PROMPT §2) ──
insert into approval_chain_config (approval_type, conditions, chain) values
  ('Quotation',             '{"value_lt": 50000}',                  '[{"step":1,"role":"sales"}]'),
  ('Quotation',             '{"value_between": [50000, 200000]}',   '[{"step":1,"role":"sales"},{"step":2,"role":"manager"}]'),
  ('Quotation',             '{"value_gt": 200000}',                 '[{"step":1,"role":"sales"},{"step":2,"role":"manager"},{"step":3,"role":"md"}]'),
  ('AMC Reactivation',      '{}',                                   '[{"step":1,"role":"manager"}]'),
  ('AMC Block Override',    '{}',                                   '[{"step":1,"role":"md"}]'),
  ('Material Request',      '{"value_lt": 5000}',                   '[{"step":1,"role":"lead_worker"}]'),
  ('Material Request',      '{"value_gte": 5000}',                  '[{"step":1,"role":"lead_worker"},{"step":2,"role":"manager"}]'),
  ('Overtime Request',      '{}',                                   '[{"step":1,"role":"lead_worker"},{"step":2,"role":"manager"}]'),
  ('Variation Order',       '{}',                                   '[{"step":1,"role":"manager"},{"step":2,"role":"md"}]'),
  ('Subcontractor Payment', '{}',                                   '[{"step":1,"role":"manager"},{"step":2,"role":"accounts"},{"step":3,"role":"md"}]'),
  ('Leave Request',         '{}',                                   '[{"step":1,"role":"lead_worker"}]'),
  ('Invoice Approval',      '{}',                                   '[{"step":1,"role":"accounts"},{"step":2,"role":"manager"}]');

-- ── APPROVALS in flight ────────────────────────────────────
insert into approvals (id, code, kind, amount_aed, context, requester_id, is_system_trigger, target_kind, target_id, priority, state, notes, opened_at) values
  ('00000000-0000-0000-0000-000000008001','AP-441','AMC Reactivation',      null,  'AMC-091 - payment AED 48,000 cleared today',                     null,                                  true,  'amc',     '00000000-0000-0000-0000-000000005001','high',   'pending', 'Customer expecting Q2 service to start immediately. WO-3284 ready and team on site.', now() - interval '14 minutes'),
  ('00000000-0000-0000-0000-000000008002','AP-440','Material Request',      6200,  'Cat6A bulk + accessories for Azizi Riviera',                     '00000000-0000-0000-0000-000000001006', false, 'project', '00000000-0000-0000-0000-000000004002','normal', 'pending', null, now() - interval '38 minutes'),
  ('00000000-0000-0000-0000-000000008003','AP-439','Variation Order',       28400, 'Add 2× corner cameras - Manipal Phase 2',                        '00000000-0000-0000-0000-000000001011', false, 'project', '00000000-0000-0000-0000-000000004003','normal', 'pending', null, now() - interval '1 hour 12 minutes'),
  ('00000000-0000-0000-0000-000000008004','AP-438','Subcontractor Payment', 4800,  'Saif Ibrahim - 3 days, Riviera fiber pulling',                   '00000000-0000-0000-0000-000000001010', false, 'project', '00000000-0000-0000-0000-000000004002','normal', 'pending', null, now() - interval '2 hours 4 minutes'),
  ('00000000-0000-0000-0000-000000008005','AP-437','Leave Request',         null,  'Bilal Sayed - May 20-22 - 2 WO conflicts',                       '00000000-0000-0000-0000-000000001005', false, 'user',    '00000000-0000-0000-0000-000000001005','normal', 'pending', null, now() - interval '3 hours 28 minutes')
on conflict (id) do nothing;

insert into approval_steps (approval_id, step, role, approver_id, state, decided_at) values
  ('00000000-0000-0000-0000-000000008001', 1, 'manager',     '00000000-0000-0000-0000-000000001001', 'pending',  null),
  ('00000000-0000-0000-0000-000000008002', 1, 'lead_worker', '00000000-0000-0000-0000-000000001004', 'approved', now() - interval '24 minutes'),
  ('00000000-0000-0000-0000-000000008002', 2, 'manager',     '00000000-0000-0000-0000-000000001001', 'pending',  null),
  ('00000000-0000-0000-0000-000000008003', 1, 'manager',     '00000000-0000-0000-0000-000000001001', 'pending',  null),
  ('00000000-0000-0000-0000-000000008003', 2, 'md',          '00000000-0000-0000-0000-000000001002', 'queued',   null),
  ('00000000-0000-0000-0000-000000008004', 1, 'manager',     '00000000-0000-0000-0000-000000001001', 'pending',  null),
  ('00000000-0000-0000-0000-000000008004', 2, 'accounts',    '00000000-0000-0000-0000-000000001010', 'queued',   null),
  ('00000000-0000-0000-0000-000000008004', 3, 'md',          '00000000-0000-0000-0000-000000001002', 'queued',   null),
  ('00000000-0000-0000-0000-000000008005', 1, 'lead_worker', '00000000-0000-0000-0000-000000001004', 'pending',  null);

-- ── COMMS / RISKS / FEED ──────────────────────────────────
insert into customer_comms (customer_id, occurred_at, channel, from_label, body) values
  ('00000000-0000-0000-0000-000000002001', now() - interval '7 hours',  'WhatsApp',  'DAMAC Site Manager', 'Payment for AMC-091 cleared this morning, please reactivate ASAP.'),
  ('00000000-0000-0000-0000-000000002001', now() - interval '7 hours 24 minutes', 'System', 'Payment gateway', 'AED 48,000 reconciled against AMC-091'),
  ('00000000-0000-0000-0000-000000002001', now() - interval '17 hours', 'Site visit','Arvind Krishnan', 'Preliminary survey complete, photos uploaded'),
  ('00000000-0000-0000-0000-000000002001', now() - interval '22 hours', 'Email',     'Rashid Al-Hashimi','Sent reactivation reminder + Q2 schedule preview'),
  ('00000000-0000-0000-0000-000000002001', now() - interval '4 days',   'Invoice',   'Accounts',         'INV-2238 issued - AED 48,000, due May 15'),
  ('00000000-0000-0000-0000-000000002002', now() - interval '5 hours',  'WhatsApp',  'MAG Reception',    'Camera at lobby still offline, please escalate.'),
  ('00000000-0000-0000-0000-000000002002', now() - interval '19 hours', 'Site visit','Bilal Sayed',      'Replaced PoE injector. Camera still intermittent.');

insert into risks (kind, label, detail, severity) values
  ('Manpower','CCTV technicians overloaded','Week of Jun 02 - 142% capacity','warning'),
  ('Material','Cat6A stock running low','4 active projects, 2.1km on hand','warning'),
  ('AMC',     'Quarterly service cluster','Week of Jun 09 - 14 services due','info'),
  ('SLA',     'NMC ticket near breach','TKT-408 - 12 min remaining','danger');
