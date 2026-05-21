-- ============================================================
-- Installtec OS - One-shot setup
-- Run this ENTIRE file in Supabase Dashboard → SQL Editor → Run.
-- It will:
--   1. Drop any prior Installtec tables/types (clean slate)
--   2. Create the full schema
--   3. Seed sample data
--   4. Create 11 demo auth users (one per role) with a default password
--   5. Link auth users to their public.users row
--
-- DEFAULT PASSWORD for every demo user: Installtec!2026
-- (change in production)
-- ============================================================

begin;

-- ============================================================
-- 1) CLEAN SLATE
-- ============================================================
drop table if exists
  notifications, feed_events, risks, customer_comms, assets, inventory_items,
  approval_steps, approvals, work_order_status_history, work_order_tasks,
  work_order_assignments, work_orders, repair_tickets, amc_payments,
  amc_service_schedule, amc_contracts, milestones, projects, sites, customers,
  admin_audit_log, approval_chain_config, role_permission_templates, teams, users
  cascade;

drop type if exists approval_state cascade;
drop type if exists wo_status      cascade;
drop type if exists wo_type        cascade;
drop type if exists amc_state      cascade;
drop type if exists customer_tier  cascade;
drop type if exists role           cascade;

-- ============================================================
-- 2) EXTENSIONS + ENUMS
-- ============================================================
create extension if not exists "pgcrypto";

create type role           as enum ('admin','md','manager','sales','estimator','lead_worker','worker','driver','subcontractor','service_support','accounts','customer');
create type customer_tier  as enum ('Strategic','Key','Standard');
create type amc_state      as enum ('DRAFT','SIGNED','ACTIVE','PENDING_REACTIVATION','BLOCKED','RENEWAL_DUE','EXPIRED','CANCELLED');
create type wo_type        as enum ('PROJECT','REPAIR','AMC','DELIVERY','SURVEY','EMERGENCY');
create type wo_status      as enum ('Scheduled','Assigned','Accepted','In Transit','Checked In','In Progress','Waiting For Material','Waiting For Customer','Completed','Customer Approved','Closed');
create type approval_state as enum ('queued','pending','approved','rejected','escalated');

-- ============================================================
-- 3) TABLES
-- ============================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique,
  email text unique not null,
  phone text,
  full_name text not null,
  initials text,
  tint text default 'primary',
  role role not null,
  permissions jsonb not null default '{}'::jsonb,
  scope jsonb not null default '{}'::jsonb,
  manager_id uuid references users(id) on delete set null,
  team_id uuid,
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lead_worker_id uuid references users(id) on delete set null,
  manager_id     uuid references users(id) on delete set null,
  skills text[] not null default '{}',
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table users add constraint users_team_fk foreign key (team_id) references teams(id) on delete set null;

create table role_permission_templates (
  template_role role primary key,
  default_permissions jsonb not null,
  description text
);

create table approval_chain_config (
  id uuid primary key default gen_random_uuid(),
  approval_type text not null,
  conditions jsonb not null default '{}'::jsonb,
  chain jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references users(id),
  action text not null,
  target_type text,
  target_id uuid,
  before_value jsonb,
  after_value jsonb,
  occurred_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier customer_tier not null default 'Standard',
  region text,
  sector text,
  owner_id uuid references users(id) on delete set null,
  customer_since date,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  area text,
  access_instructions text,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  customer_id uuid not null references customers(id),
  site_id uuid references sites(id),
  manager_id uuid references users(id),
  team_id uuid references teams(id),
  status text not null default 'In Progress',
  stage text,
  progress int not null default 0,
  value_aed numeric(14,2) not null default 0,
  started_at date,
  due_at date,
  created_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  is_done boolean not null default false,
  pct int not null,
  position int not null default 0
);

create table amc_contracts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_id uuid not null references customers(id),
  site_id uuid references sites(id),
  manager_id uuid references users(id),
  state amc_state not null default 'DRAFT',
  value_aed numeric(14,2) not null default 0,
  next_due_label text,
  overdue_days int not null default 0,
  free_calls_used int not null default 0,
  free_calls_included int not null default 10,
  expires_at date,
  created_at timestamptz not null default now()
);

create table amc_service_schedule (
  id uuid primary key default gen_random_uuid(),
  amc_id uuid not null references amc_contracts(id) on delete cascade,
  quarter int not null check (quarter between 1 and 4),
  due_at date,
  is_done boolean not null default false,
  work_order_id uuid
);

create table amc_payments (
  id uuid primary key default gen_random_uuid(),
  amc_id uuid not null references amc_contracts(id) on delete cascade,
  amount_aed numeric(14,2) not null,
  received_at timestamptz not null default now()
);

create table repair_tickets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  customer_id uuid not null references customers(id),
  site_id uuid references sites(id),
  state text not null default 'New',
  classification text,
  priority text not null default 'normal',
  sla_target_min int,
  sla_elapsed_min int not null default 0,
  assigned_to uuid references users(id),
  visits int not null default 0,
  flagged text,
  opened_at timestamptz not null default now()
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type wo_type not null,
  priority text not null default 'Standard',
  title text not null,
  source_kind text,
  source_id uuid,
  customer_id uuid references customers(id),
  site_id uuid references sites(id),
  scheduled_start timestamptz not null,
  scheduled_end   timestamptz not null,
  status wo_status not null default 'Scheduled',
  assigned_lead uuid references users(id),
  progress int not null default 0,
  sla_min int,
  elapsed_min int not null default 0,
  materials text[] not null default '{}',
  flagged text,
  created_at timestamptz not null default now()
);
alter table amc_service_schedule add constraint amc_sched_wo_fk foreign key (work_order_id) references work_orders(id) on delete set null;

create table work_order_assignments (
  work_order_id uuid not null references work_orders(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (work_order_id, user_id)
);

create table work_order_tasks (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  label text not null,
  is_done boolean not null default false,
  count_label text,
  position int not null default 0
);

create table work_order_status_history (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  from_status wo_status,
  to_status wo_status not null,
  changed_by uuid references users(id),
  changed_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kind text not null,
  amount_aed numeric(14,2),
  context text,
  requester_id uuid references users(id),
  is_system_trigger boolean not null default false,
  target_kind text,
  target_id uuid,
  priority text not null default 'normal',
  state approval_state not null default 'pending',
  opened_at timestamptz not null default now(),
  notes text
);

create table approval_steps (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references approvals(id) on delete cascade,
  step int not null,
  step_role role not null,
  approver_id uuid references users(id),
  state approval_state not null default 'queued',
  decided_at timestamptz
);

create table feed_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  kind text not null,
  actor_id uuid references users(id),
  is_system boolean not null default false,
  body text not null,
  tag text not null default 'neutral',
  target_kind text,
  target_id uuid
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  kind text not null,
  title text not null,
  body text,
  target_kind text,
  target_id uuid
);

create table risks (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  label text not null,
  detail text,
  severity text not null default 'info',
  created_at timestamptz not null default now()
);

create table customer_comms (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  channel text not null,
  from_label text,
  body text
);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  unit text not null default 'pcs',
  qty_central int not null default 0,
  qty_vehicles int not null default 0,
  qty_sites int not null default 0,
  reorder_at int not null default 0,
  value_aed numeric(14,2) not null default 0
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  tag text unique not null,
  model text,
  site_id uuid references sites(id),
  installed_at date,
  warranty_to date,
  fault_count int not null default 0,
  status text not null default 'Healthy'
);

create index on users(role);
create index on users(manager_id);
create index on work_orders(status);
create index on work_orders(scheduled_start);
create index on amc_contracts(state);

-- ============================================================
-- 4) HELPER FUNCTIONS
-- ============================================================
create or replace function fn_my_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from users where auth_id = auth.uid() limit 1
$$;

create or replace function fn_my_role() returns role language sql stable security definer set search_path = public as $$
  select role from users where auth_id = auth.uid() limit 1
$$;

create or replace function fn_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where auth_id = auth.uid() and role = 'admin')
$$;

create or replace function fn_is_md_or_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where auth_id = auth.uid() and role in ('admin','md'))
$$;

-- ============================================================
-- 5) ROW-LEVEL SECURITY
-- ============================================================
alter table users                      enable row level security;
alter table teams                      enable row level security;
alter table role_permission_templates  enable row level security;
alter table approval_chain_config      enable row level security;
alter table admin_audit_log            enable row level security;
alter table customers                  enable row level security;
alter table sites                      enable row level security;
alter table projects                   enable row level security;
alter table milestones                 enable row level security;
alter table amc_contracts              enable row level security;
alter table amc_service_schedule       enable row level security;
alter table amc_payments               enable row level security;
alter table repair_tickets             enable row level security;
alter table work_orders                enable row level security;
alter table work_order_assignments     enable row level security;
alter table work_order_tasks           enable row level security;
alter table work_order_status_history  enable row level security;
alter table approvals                  enable row level security;
alter table approval_steps             enable row level security;
alter table feed_events                enable row level security;
alter table notifications              enable row level security;
alter table risks                      enable row level security;
alter table customer_comms             enable row level security;
alter table inventory_items            enable row level security;
alter table assets                     enable row level security;

create policy users_read       on users for select using (fn_is_admin() or id = fn_my_id() or manager_id = fn_my_id());
create policy users_admin_all  on users for all    using (fn_is_admin()) with check (fn_is_admin());

create policy teams_read       on teams for select using (true);
create policy teams_admin_all  on teams for all    using (fn_is_admin()) with check (fn_is_admin());

create policy tpl_read         on role_permission_templates for select using (true);
create policy tpl_admin_all    on role_permission_templates for all    using (fn_is_admin()) with check (fn_is_admin());

create policy chain_read       on approval_chain_config for select using (true);
create policy chain_admin_all  on approval_chain_config for all    using (fn_is_admin()) with check (fn_is_admin());

create policy audit_read_admin on admin_audit_log for select using (fn_is_admin());

create policy customers_read   on customers for select using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','service_support','accounts'));
create policy customers_write  on customers for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'));

create policy sites_read       on sites for select using (true);
create policy sites_write      on sites for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'));

create policy projects_read    on projects for select using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','estimator','lead_worker','accounts'));
create policy projects_write   on projects for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','estimator')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','estimator'));

create policy milestones_read  on milestones for select using (true);
create policy milestones_write on milestones for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','estimator')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','estimator'));

create policy amc_read         on amc_contracts for select using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'));
create policy amc_write        on amc_contracts for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'));

create policy amc_sched_read   on amc_service_schedule for select using (true);
create policy amc_sched_write  on amc_service_schedule for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'));

create policy amc_pay_read     on amc_payments for select using (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts'));
create policy amc_pay_write    on amc_payments for all    using (fn_is_md_or_admin() or fn_my_role() = 'accounts') with check (fn_is_md_or_admin() or fn_my_role() = 'accounts');

create policy repair_read      on repair_tickets for select using (fn_is_md_or_admin() or fn_my_role() in ('manager','service_support','lead_worker','worker','sales') or assigned_to = fn_my_id());
create policy repair_write     on repair_tickets for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','service_support','lead_worker')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','service_support','lead_worker'));

create policy wo_read          on work_orders for select using (
  fn_is_md_or_admin()
  or fn_my_role() in ('manager','service_support','accounts','sales','lead_worker','estimator')
  or assigned_lead = fn_my_id()
  or exists (select 1 from work_order_assignments a where a.work_order_id = work_orders.id and a.user_id = fn_my_id())
);
create policy wo_write         on work_orders for all using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'));

create policy woa_read         on work_order_assignments for select using (true);
create policy woa_write        on work_order_assignments for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'));

create policy wot_read         on work_order_tasks for select using (true);
create policy wot_write        on work_order_tasks for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','worker')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','worker'));

create policy wosh_read        on work_order_status_history for select using (true);

create policy ap_read          on approvals for select using (
  fn_is_md_or_admin()
  or requester_id = fn_my_id()
  or exists (select 1 from approval_steps s where s.approval_id = approvals.id and s.approver_id = fn_my_id())
);
create policy ap_write         on approvals for all using (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts','lead_worker')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts','lead_worker'));

create policy aps_read         on approval_steps for select using (true);
create policy aps_update       on approval_steps for update using (approver_id = fn_my_id() or fn_is_md_or_admin()) with check (true);

create policy feed_read        on feed_events for select using (true);
create policy notif_read       on notifications for select using (user_id = fn_my_id() or fn_is_admin());
create policy notif_update     on notifications for update using (user_id = fn_my_id()) with check (user_id = fn_my_id());
create policy risks_read       on risks for select using (true);

create policy comms_read       on customer_comms for select using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','service_support','accounts'));
create policy comms_write      on customer_comms for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','service_support')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','service_support'));

create policy inv_read         on inventory_items for select using (true);
create policy inv_write        on inventory_items for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','driver')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','driver'));

create policy assets_read      on assets for select using (true);
create policy assets_write     on assets for all    using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','worker','service_support')) with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','worker','service_support'));

-- ============================================================
-- 6) SEED - reference data
-- ============================================================
insert into role_permission_templates (template_role, default_permissions, description) values
  ('admin'::role,           '{"all": true}'::jsonb,                                                                    'Full system control'),
  ('md'::role,              '{"approve_md_tier": true, "view_financials": true}'::jsonb,                                'Strategic + MD-tier approvals'),
  ('manager'::role,         '{"approve_to": 200000, "reassign_cross_team": true, "create_customers": true}'::jsonb,     'Operational oversight'),
  ('sales'::role,           '{"create_quotation": true, "discount_pct": 5}'::jsonb,                                     'Sales pipeline + AMC renewals'),
  ('estimator'::role,       '{"edit_boq": true}'::jsonb,                                                                'BOQ + costing'),
  ('lead_worker'::role,     '{"approve_material_to": 5000, "request_overtime": true, "approve_leave": true, "manage_leave": true, "view_team_leave_calendar": true}'::jsonb, 'Crew lead'),
  ('worker'::role,          '{"request_leave": true, "request_materials": true}'::jsonb,                                'Field technician'),
  ('driver'::role,          '{"deliver": true}'::jsonb,                                                                 'Material delivery'),
  ('subcontractor'::role,   '{}'::jsonb,                                                                                'Scoped delivery only'),
  ('service_support'::role, '{"open_tickets": true, "classify_call": true}'::jsonb,                                     'Repair intake + comms'),
  ('accounts'::role,        '{"invoice": true, "reconcile_payment": true}'::jsonb,                                      'Finance');

insert into teams (id, name, region, skills) values
  ('00000000-0000-0000-0000-000000000a01', 'ELV Installation Alpha', 'UAE', array['CCTV','ACS','SCS','Fiber']);

insert into users (id, email, phone, full_name, initials, tint, role, region, team_id) values
  ('00000000-0000-0000-0000-000000001001', 'rashid@installtec.ae',  '+971 50 482 1108', 'Rashid Al-Hashimi',  'RH', 'primary', 'manager',         'UAE', null),
  ('00000000-0000-0000-0000-000000001002', 'amir@installtec.ae',    '+971 50 110 4221', 'Amir Hadid',         'AH', 'violet',  'md',              'UAE', null),
  ('00000000-0000-0000-0000-000000001003', 'admin@installtec.ae',   '+971 50 999 0000', 'Ops Admin',          'OA', 'peach',   'admin',           'UAE', null),
  ('00000000-0000-0000-0000-000000001004', 'arvind@installtec.ae',  '+971 55 220 3344', 'Arvind Krishnan',    'AK', 'primary', 'lead_worker',     'UAE', '00000000-0000-0000-0000-000000000a01'),
  ('00000000-0000-0000-0000-000000001005', 'bilal@installtec.ae',   '+971 56 880 1212', 'Bilal Sayed',        'BS', 'warm',    'worker',          'UAE', '00000000-0000-0000-0000-000000000a01'),
  ('00000000-0000-0000-0000-000000001006', 'joseph@installtec.ae',  '+971 54 330 7788', 'Joseph Mathew',      'JM', 'info',    'worker',          'UAE', '00000000-0000-0000-0000-000000000a01'),
  ('00000000-0000-0000-0000-000000001007', 'karthik@installtec.ae', '+971 50 412 8800', 'Karthik Iyer',       'KI', 'warm',    'driver',          'UAE', null),
  ('00000000-0000-0000-0000-000000001008', 'saif@installtec.ae',    '+971 56 110 2233', 'Saif Ibrahim',       'SI', 'peach',   'subcontractor',   'UAE', null),
  ('00000000-0000-0000-0000-000000001009', 'pooja@installtec.ae',   '+971 50 224 8867', 'Pooja Menon',        'PM', 'violet',  'service_support', 'UAE', null),
  ('00000000-0000-0000-0000-000000001010', 'priya@installtec.ae',   '+971 50 887 9911', 'Priya Nair',         'PN', 'info',    'accounts',        'UAE', null),
  ('00000000-0000-0000-0000-000000001011', 'noor@installtec.ae',    '+971 55 999 3322', 'Noor El-Sayed',      'NE', 'peach',   'sales',           'UAE', null),
  ('00000000-0000-0000-0000-000000001012', 'sara@installtec.ae',    '+971 50 220 1144', 'Sara Anand',         'SA', 'primary', 'estimator',       'UAE', null);

update users set manager_id = '00000000-0000-0000-0000-000000001002' where id = '00000000-0000-0000-0000-000000001001';
update users set manager_id = '00000000-0000-0000-0000-000000001001' where id in ('00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-000000001007','00000000-0000-0000-0000-000000001009','00000000-0000-0000-0000-000000001011','00000000-0000-0000-0000-000000001012');
update users set manager_id = '00000000-0000-0000-0000-000000001004' where id in ('00000000-0000-0000-0000-000000001005','00000000-0000-0000-0000-000000001006','00000000-0000-0000-0000-000000001008');
update users set manager_id = '00000000-0000-0000-0000-000000001002' where id = '00000000-0000-0000-0000-000000001010';
update teams set lead_worker_id = '00000000-0000-0000-0000-000000001004', manager_id = '00000000-0000-0000-0000-000000001001' where id = '00000000-0000-0000-0000-000000000a01';

insert into customers (id, name, tier, region, sector, owner_id, customer_since, tags) values
  ('00000000-0000-0000-0000-000000002001','DAMAC Properties',             'Strategic','UAE','Real Estate','00000000-0000-0000-0000-000000001011','2014-03-01', array['ACS','CCTV','SCS']),
  ('00000000-0000-0000-0000-000000002002','MAG Group',                    'Strategic','UAE','Real Estate','00000000-0000-0000-0000-000000001011','2017-08-01', array['CCTV','SCS']),
  ('00000000-0000-0000-0000-000000002003','Azizi Developments',           'Key',      'UAE','Real Estate','00000000-0000-0000-0000-000000001011','2019-05-01', array['CCTV','Fiber']),
  ('00000000-0000-0000-0000-000000002004','Manipal University Dubai',     'Key',      'UAE','Education',  '00000000-0000-0000-0000-000000001011','2018-11-01', array['ACS','CCTV','AV']),
  ('00000000-0000-0000-0000-000000002005','Canadian Specialist Hospital', 'Key',      'UAE','Healthcare', '00000000-0000-0000-0000-000000001011','2016-04-01', array['CCTV','Nurse Call']),
  ('00000000-0000-0000-0000-000000002006','NMC Hospital',                 'Standard', 'UAE','Healthcare', '00000000-0000-0000-0000-000000001011','2020-02-01', array['CCTV']),
  ('00000000-0000-0000-0000-000000002007','Emaar Mgmt - Burj District',   'Key',      'UAE','Hospitality','00000000-0000-0000-0000-000000001011','2021-09-01', array['CCTV']),
  ('00000000-0000-0000-0000-000000002008','DIFC Authority',               'Strategic','UAE','Government', '00000000-0000-0000-0000-000000001011','2015-06-01', array['ACS','Compliance']);

insert into sites (id, customer_id, name, area, access_instructions) values
  ('00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000002001','Burj Vista Tower 2',     'Downtown Dubai',      'Rear loading bay - Security desk B'),
  ('00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000002002','MAG 318 - Business Bay', 'Business Bay',        'Service entrance - Mr. Khan'),
  ('00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000002008','DIFC Gate Avenue West',  'DIFC',                'Concierge - Block 4'),
  ('00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000002004','Manipal Campus',         'Dubai Academic City', 'Maintenance gate 2'),
  ('00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000002005','CSH Deira - Main Block', 'Deira',               'Goods lift - Basement B1'),
  ('00000000-0000-0000-0000-000000003006','00000000-0000-0000-0000-000000002003','Azizi Riviera Phase 5',  'MBR City',            'Site office trailer'),
  ('00000000-0000-0000-0000-000000003007','00000000-0000-0000-0000-000000002006','NMC Deira Branch',       'Deira',               'Reception escort required');

insert into projects (id, code, name, customer_id, site_id, manager_id, team_id, status, stage, progress, value_aed, started_at, due_at) values
  ('00000000-0000-0000-0000-000000004001','PRJ-2025-014','DIFC Gate Ave West - ELV Upgrade',          '00000000-0000-0000-0000-000000002008','00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000a01','In Progress','Installation', 62, 1840000,'2025-02-10','2025-07-30'),
  ('00000000-0000-0000-0000-000000004002','PRJ-2025-022','Azizi Riviera Ph.5 - CCTV + Fiber Backbone','00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000003006','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000a01','In Progress','Installation', 38,  920000,'2025-03-22','2025-08-15'),
  ('00000000-0000-0000-0000-000000004003','PRJ-2025-009','Manipal Campus - Phase 2 ACS Expansion',    '00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000a01','Awaiting VO Approval','Variation', 78,  540000,'2025-01-08','2025-06-12'),
  ('00000000-0000-0000-0000-000000004004','PRJ-2025-018','MAG 318 - Phase A Tenant Floors',           '00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000a01','On Track','Termination', 84,  690000,'2025-02-01','2025-06-04');

insert into amc_contracts (id, code, customer_id, site_id, manager_id, state, value_aed, next_due_label, overdue_days, free_calls_used, expires_at) values
  ('00000000-0000-0000-0000-000000005001','AMC-091','00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000001001','PENDING_REACTIVATION', 48000, 'Today',  12, 3, '2025-12-31'),
  ('00000000-0000-0000-0000-000000005002','AMC-092','00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000001001','ACTIVE',               36000, 'May 28',  0, 5, '2025-11-15'),
  ('00000000-0000-0000-0000-000000005003','AMC-088','00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000001001','BLOCKED',              64000, '-',      34, 0, '2026-01-30'),
  ('00000000-0000-0000-0000-000000005004','AMC-085','00000000-0000-0000-0000-000000002006','00000000-0000-0000-0000-000000003007','00000000-0000-0000-0000-000000001001','ACTIVE',               22000, 'Jun 02',  0, 2, '2025-10-08'),
  ('00000000-0000-0000-0000-000000005005','AMC-080','00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000003006','00000000-0000-0000-0000-000000001001','RENEWAL_DUE',          41000, 'Jun 14',  0, 7, '2025-06-22'),
  ('00000000-0000-0000-0000-000000005006','AMC-079','00000000-0000-0000-0000-000000002005','00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000001001','ACTIVE',               28000, 'Jun 05',  0, 1, '2025-12-10');

insert into repair_tickets (id, code, title, customer_id, site_id, state, sla_target_min, sla_elapsed_min, classification, priority, assigned_to, visits, flagged, opened_at) values
  ('00000000-0000-0000-0000-000000006001','TKT-412','Reception camera offline',         '00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','In Progress', 240, 142, 'AMC free-call', 'high',   '00000000-0000-0000-0000-000000001005', 2, null,             '2025-05-15 14:20'),
  ('00000000-0000-0000-0000-000000006002','TKT-410','NVR rack - power supply fault',    '00000000-0000-0000-0000-000000002005','00000000-0000-0000-0000-000000003005','Resolved',    240,  95, 'Chargeable',    'normal', '00000000-0000-0000-0000-000000001006', 1, null,             '2025-05-13 09:30'),
  ('00000000-0000-0000-0000-000000006003','TKT-408','ACS reader stuck - main lobby',    '00000000-0000-0000-0000-000000002008','00000000-0000-0000-0000-000000003003','New',         120,  18, 'AMC free-call', 'high',    null,                                  0, null,             '2025-05-16 08:40'),
  ('00000000-0000-0000-0000-000000006004','TKT-405','AC unit alarm - server room',      '00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000003006','Resolved',    240, 188, 'Warranty',      'normal', '00000000-0000-0000-0000-000000001004', 1, null,             '2025-05-09 11:00'),
  ('00000000-0000-0000-0000-000000006005','TKT-402','CAM-B-204 third failure',          '00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','Resolved',    240, 220, 'AMC free-call', 'high',   '00000000-0000-0000-0000-000000001005', 3, 'Repeat failure', '2025-05-02 10:15');

insert into work_orders (id, code, type, priority, title, source_kind, source_id, customer_id, site_id, scheduled_start, scheduled_end, status, assigned_lead, progress, sla_min, elapsed_min, materials, flagged) values
  ('00000000-0000-0000-0000-000000007001','WO-3284','AMC',     'Standard','Q2 Quarterly Service - CCTV + ACS',                  'amc',     '00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000003001','2025-05-16 09:00','2025-05-16 11:30','In Progress','00000000-0000-0000-0000-000000001004', 60, 240, 142, array['Lens cleaning kit','NVR HDD test','ACS reader spare'], null),
  ('00000000-0000-0000-0000-000000007002','WO-3285','REPAIR',  'High',    'Reception camera offline - Visit 2',                  'repair',  '00000000-0000-0000-0000-000000006001','00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000003002','2025-05-16 13:00','2025-05-16 14:30','Assigned',   '00000000-0000-0000-0000-000000001005', 0,  180,  12, array['Replacement 4MP dome cam','PoE injector'], 'Repeat failure - 3 visits in 90 days'),
  ('00000000-0000-0000-0000-000000007003','WO-3286','PROJECT', 'Standard','Cable pulling - L4 to L6 risers',                     'project', '00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000003006','2025-05-16 15:00','2025-05-16 18:00','Scheduled',  '00000000-0000-0000-0000-000000001006', 0, null,   0, array['Cat6A 305m drum','Containment','Tie wraps'], null),
  ('00000000-0000-0000-0000-000000007004','WO-3287','DELIVERY','Standard','Site delivery - Cat6A drums and patch panels',        'project', '00000000-0000-0000-0000-000000004003','00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000003004','2025-05-16 10:30','2025-05-16 11:30','In Transit', '00000000-0000-0000-0000-000000001007', 35, null,  22, array['Cat6A drum x 4','Patch panel x 8','Cable ties'], null),
  ('00000000-0000-0000-0000-000000007005','WO-3288','PROJECT', 'Standard','ACS device fit - Block A floors 3-5',                  'project', '00000000-0000-0000-0000-000000004003','00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000003004','2025-05-17 08:30','2025-05-17 17:00','Scheduled',  '00000000-0000-0000-0000-000000001004', 0, null,   0, array['12x ACS readers','Cabling kit'], null),
  ('00000000-0000-0000-0000-000000007006','WO-3279','AMC',     'Standard','CSH AMC service Q2',                                   'amc',     '00000000-0000-0000-0000-000000005006','00000000-0000-0000-0000-000000002005','00000000-0000-0000-0000-000000003005','2025-05-15 08:00','2025-05-15 11:00','Closed',     '00000000-0000-0000-0000-000000001006', 100, 240, 180, array[]::text[], null),
  ('00000000-0000-0000-0000-000000007007','WO-3290','SURVEY',  'Standard','Site survey - DIFC Gate Ave variation order',          'project', '00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000002008','00000000-0000-0000-0000-000000003003','2025-05-16 14:00','2025-05-16 16:00','Scheduled',  '00000000-0000-0000-0000-000000001012', 0, null,   0, array[]::text[], null),
  ('00000000-0000-0000-0000-000000007008','WO-3271','REPAIR',  'High',    'ACS reader stuck - NMC main lobby',                    'repair',  '00000000-0000-0000-0000-000000006003','00000000-0000-0000-0000-000000002006','00000000-0000-0000-0000-000000003007','2025-05-16 09:30','2025-05-16 11:00','In Progress','00000000-0000-0000-0000-000000001005', 30, 120, 108, array['Reader spare','Tooling'], null);

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
  ('00000000-0000-0000-0000-000000007008','00000000-0000-0000-0000-000000001005');

insert into work_order_tasks (work_order_id, label, is_done, count_label, position) values
  ('00000000-0000-0000-0000-000000007001','Check-in and site walk',      true,  null,    1),
  ('00000000-0000-0000-0000-000000007001','Inspect 24 IP cameras',       true,  '24/24', 2),
  ('00000000-0000-0000-0000-000000007001','Test NVR and storage',        true,  null,    3),
  ('00000000-0000-0000-0000-000000007001','Inspect 6 ACS readers',       false, '4/6',   4),
  ('00000000-0000-0000-0000-000000007001','Customer walk-through',       false, null,    5),
  ('00000000-0000-0000-0000-000000007001','Service report and sign-off', false, null,    6);

insert into inventory_items (sku, name, unit, qty_central, qty_vehicles, qty_sites, reorder_at, value_aed) values
  ('CCTV-DOME-4MP', '4MP IP Dome Camera',      'pcs',  42, 6, 18, 20, 38000),
  ('CCTV-BULL-8MP', '8MP IP Bullet Camera',    'pcs',  18, 4,  6, 12, 22000),
  ('CAT6A-DRUM',    'Cat6A Cable Drum (305m)', 'drum',  6, 2,  4,  8, 14400),
  ('NVR-32CH',      'NVR 32-channel 4K',       'pcs',   5, 1, 12,  3, 32500),
  ('ACS-RDR-MIFARE','Mifare ACS Reader',       'pcs',  28, 5, 22, 15, 11200),
  ('PATCH-PNL-48',  '48-port patch panel',     'pcs',  12, 2,  8,  5,  8400),
  ('POE-SW-24',     '24-port PoE+ Switch',     'pcs',   8, 1,  4,  4, 18000);

insert into assets (tag, model, site_id, installed_at, warranty_to, fault_count, status) values
  ('CAM-B-204',  '4MP IP Dome',    '00000000-0000-0000-0000-000000003002','2022-03-14','2025-03-13', 3, 'Repeat failure'),
  ('NVR-MAIN-1', 'NVR 32-channel', '00000000-0000-0000-0000-000000003001','2021-09-22','2024-09-21', 0, 'Healthy'),
  ('ACS-D-12',   'Mifare Reader',  '00000000-0000-0000-0000-000000003005','2023-06-01','2026-05-30', 1, 'Healthy');

insert into approval_chain_config (approval_type, conditions, chain) values
  ('Quotation',             '{"value_lt": 50000}'::jsonb,                '[{"step":1,"role":"sales"}]'::jsonb),
  ('Quotation',             '{"value_between": [50000, 200000]}'::jsonb, '[{"step":1,"role":"sales"},{"step":2,"role":"manager"}]'::jsonb),
  ('Quotation',             '{"value_gt": 200000}'::jsonb,               '[{"step":1,"role":"sales"},{"step":2,"role":"manager"},{"step":3,"role":"md"}]'::jsonb),
  ('AMC Reactivation',      '{}'::jsonb,                                 '[{"step":1,"role":"manager"}]'::jsonb),
  ('Material Request',      '{"value_lt": 5000}'::jsonb,                 '[{"step":1,"role":"lead_worker"}]'::jsonb),
  ('Material Request',      '{"value_gte": 5000}'::jsonb,                '[{"step":1,"role":"lead_worker"},{"step":2,"role":"manager"}]'::jsonb),
  ('Variation Order',       '{}'::jsonb,                                 '[{"step":1,"role":"manager"},{"step":2,"role":"md"}]'::jsonb),
  ('Subcontractor Payment', '{}'::jsonb,                                 '[{"step":1,"role":"manager"},{"step":2,"role":"accounts"},{"step":3,"role":"md"}]'::jsonb),
  ('Leave Request',         '{}'::jsonb,                                 '[{"step":1,"role":"lead_worker"}]'::jsonb);

insert into approvals (id, code, kind, amount_aed, context, requester_id, is_system_trigger, target_kind, target_id, priority, state, notes, opened_at) values
  ('00000000-0000-0000-0000-000000008001','AP-441','AMC Reactivation',      null,  'AMC-091 - payment AED 48,000 cleared today', null,                                  true,  'amc',     '00000000-0000-0000-0000-000000005001','high',   'pending', 'Customer expecting Q2 service to start immediately. WO-3284 ready and team on site.', now() - interval '14 minutes'),
  ('00000000-0000-0000-0000-000000008002','AP-440','Material Request',      6200,  'Cat6A bulk + accessories for Azizi Riviera', '00000000-0000-0000-0000-000000001006', false, 'project', '00000000-0000-0000-0000-000000004002','normal', 'pending', null, now() - interval '38 minutes'),
  ('00000000-0000-0000-0000-000000008003','AP-439','Variation Order',       28400, 'Add 2 corner cameras - Manipal Phase 2',     '00000000-0000-0000-0000-000000001011', false, 'project', '00000000-0000-0000-0000-000000004003','normal', 'pending', null, now() - interval '1 hour 12 minutes'),
  ('00000000-0000-0000-0000-000000008004','AP-438','Subcontractor Payment', 4800,  'Saif Ibrahim - 3 days, Riviera fiber pulling','00000000-0000-0000-0000-000000001010', false, 'project', '00000000-0000-0000-0000-000000004002','normal', 'pending', null, now() - interval '2 hours 4 minutes'),
  ('00000000-0000-0000-0000-000000008005','AP-437','Leave Request',         null,  'Bilal Sayed - May 20-22 - 2 WO conflicts',   '00000000-0000-0000-0000-000000001005', false, 'user',    '00000000-0000-0000-0000-000000001005','normal', 'pending', null, now() - interval '3 hours 28 minutes');

insert into approval_steps (approval_id, step, step_role, approver_id, state, decided_at) values
  ('00000000-0000-0000-0000-000000008001', 1, 'manager',     '00000000-0000-0000-0000-000000001001', 'pending',  null),
  ('00000000-0000-0000-0000-000000008002', 1, 'lead_worker', '00000000-0000-0000-0000-000000001004', 'approved', now() - interval '24 minutes'),
  ('00000000-0000-0000-0000-000000008002', 2, 'manager',     '00000000-0000-0000-0000-000000001001', 'pending',  null),
  ('00000000-0000-0000-0000-000000008003', 1, 'manager',     '00000000-0000-0000-0000-000000001001', 'pending',  null),
  ('00000000-0000-0000-0000-000000008003', 2, 'md',          '00000000-0000-0000-0000-000000001002', 'queued',   null),
  ('00000000-0000-0000-0000-000000008004', 1, 'manager',     '00000000-0000-0000-0000-000000001001', 'pending',  null),
  ('00000000-0000-0000-0000-000000008004', 2, 'accounts',    '00000000-0000-0000-0000-000000001010', 'queued',   null),
  ('00000000-0000-0000-0000-000000008004', 3, 'md',          '00000000-0000-0000-0000-000000001002', 'queued',   null),
  ('00000000-0000-0000-0000-000000008005', 1, 'lead_worker', '00000000-0000-0000-0000-000000001004', 'pending',  null);

insert into customer_comms (customer_id, occurred_at, channel, from_label, body) values
  ('00000000-0000-0000-0000-000000002001', now() - interval '7 hours',                  'WhatsApp',  'DAMAC Site Manager', 'Payment for AMC-091 cleared this morning, please reactivate ASAP.'),
  ('00000000-0000-0000-0000-000000002001', now() - interval '7 hours 24 minutes',       'System',    'Payment gateway',    'AED 48,000 reconciled against AMC-091'),
  ('00000000-0000-0000-0000-000000002001', now() - interval '17 hours',                 'Site visit','Arvind Krishnan',    'Preliminary survey complete, photos uploaded'),
  ('00000000-0000-0000-0000-000000002001', now() - interval '22 hours',                 'Email',     'Rashid Al-Hashimi',  'Sent reactivation reminder + Q2 schedule preview'),
  ('00000000-0000-0000-0000-000000002001', now() - interval '4 days',                   'Invoice',   'Accounts',           'INV-2238 issued - AED 48,000, due May 15'),
  ('00000000-0000-0000-0000-000000002002', now() - interval '5 hours',                  'WhatsApp',  'MAG Reception',      'Camera at lobby still offline, please escalate.'),
  ('00000000-0000-0000-0000-000000002002', now() - interval '19 hours',                 'Site visit','Bilal Sayed',        'Replaced PoE injector. Camera still intermittent.');

insert into risks (kind, label, detail, severity) values
  ('Manpower','CCTV technicians overloaded','Week of Jun 02 - 142% capacity','warning'),
  ('Material','Cat6A stock running low','4 active projects, 2.1km on hand','warning'),
  ('AMC',     'Quarterly service cluster','Week of Jun 09 - 14 services due','info'),
  ('SLA',     'NMC ticket near breach','TKT-408 - 12 min remaining','danger');

-- ============================================================
-- 7) CREATE SUPABASE AUTH USERS + LINK
-- One auth user per seeded public.users row.
-- Default password for every demo account: Installtec!2026
-- ============================================================
do $$
declare
  rec record;
  v_uid uuid;
  v_pwd text := 'Installtec!2026';
begin
  for rec in select id, email, full_name from public.users where auth_id is null loop
    -- skip if an auth.users row with this email already exists
    select id into v_uid from auth.users where email = rec.email limit 1;
    if v_uid is null then
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, is_super_admin, is_sso_user
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_uid, 'authenticated', 'authenticated', rec.email,
        crypt(v_pwd, gen_salt('bf')),
        now(),
        jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', rec.full_name),
        now(), now(), false, false
      );
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', rec.email),
        'email', v_uid::text,
        now(), now(), now()
      );
    end if;
    update public.users set auth_id = v_uid where id = rec.id;
  end loop;
end $$;

commit;

-- ============================================================
-- 8) VERIFY - final readout
-- ============================================================
select email, role, (auth_id is not null) as auth_linked
from public.users
order by case role
  when 'admin' then 1 when 'md' then 2 when 'manager' then 3
  when 'sales' then 4 when 'estimator' then 5 when 'lead_worker' then 6
  when 'worker' then 7 when 'driver' then 8 when 'service_support' then 9
  when 'accounts' then 10 else 11 end;
