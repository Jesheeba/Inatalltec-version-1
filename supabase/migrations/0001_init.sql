-- ============================================================
-- Installtec OS - Schema (Phase 1 foundation)
-- Mirrors the prototype entity model + MASTER_PROMPT §10 & §2.
-- Includes scope-aware RLS, audit log, AMC reactivation trigger,
-- and the fn_resolve_approver stub.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
do $$ begin
  create type role as enum (
    'admin','md','manager','sales','estimator','lead_worker','worker',
    'driver','subcontractor','service_support','accounts','customer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type customer_tier  as enum ('Strategic','Key','Standard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type amc_state      as enum ('DRAFT','SIGNED','ACTIVE','PENDING_REACTIVATION','BLOCKED','RENEWAL_DUE','EXPIRED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type wo_type        as enum ('PROJECT','REPAIR','AMC','DELIVERY','SURVEY','EMERGENCY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type wo_status      as enum ('Scheduled','Assigned','Accepted','In Transit','Checked In','In Progress','Waiting For Material','Waiting For Customer','Completed','Customer Approved','Closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_state as enum ('queued','pending','approved','rejected','escalated');
exception when duplicate_object then null; end $$;

-- ============================================================
-- USERS / TEAMS / ROLES
-- ============================================================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique,                  -- supabase.auth.users.id
  email text unique not null,
  phone text,
  full_name text not null,
  initials text,
  tint text default 'primary',
  profile_photo_url text,
  employee_id text,
  office_location text,
  role role not null,
  permissions jsonb not null default '{}'::jsonb,
  scope jsonb not null default '{}'::jsonb,
  manager_id uuid references users(id) on delete set null,
  team_id uuid,                         -- fk added below
  region text,
  is_active boolean not null default true,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  deactivated_at timestamptz,
  deactivation_reason text
);
create index if not exists users_role_idx        on users(role);
create index if not exists users_manager_idx     on users(manager_id);
create index if not exists users_team_idx        on users(team_id);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lead_worker_id uuid references users(id) on delete set null,
  manager_id     uuid references users(id) on delete set null,
  skills text[] not null default '{}',
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table users
  add constraint users_team_fk foreign key (team_id) references teams(id) on delete set null;

create table if not exists role_permission_templates (
  role role primary key,
  default_permissions jsonb not null,
  description text
);

create table if not exists approval_chain_config (
  id uuid primary key default gen_random_uuid(),
  approval_type text not null,
  conditions jsonb not null default '{}'::jsonb,
  chain jsonb not null,                 -- [{ step: 1, role: 'manager' }, …]
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references users(id),
  action text not null,
  target_type text,
  target_id uuid,
  before_value jsonb,
  after_value jsonb,
  ip_address text,
  occurred_at timestamptz not null default now()
);

-- ============================================================
-- CUSTOMERS / SITES
-- ============================================================
create table if not exists customers (
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

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  area text,
  geo_lat double precision,
  geo_lng double precision,
  access_instructions text,
  security_clearance text,
  created_at timestamptz not null default now()
);
create index if not exists sites_customer_idx on sites(customer_id);

-- ============================================================
-- PROJECTS
-- ============================================================
create table if not exists projects (
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

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  is_done boolean not null default false,
  pct int not null,
  position int not null default 0
);

-- ============================================================
-- AMC CONTRACTS + SCHEDULE
-- ============================================================
create table if not exists amc_contracts (
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
  signed_at date,
  payment_due_at date,
  payment_received_at timestamptz,
  expires_at date,
  created_at timestamptz not null default now()
);
create index if not exists amc_customer_idx on amc_contracts(customer_id);
create index if not exists amc_state_idx    on amc_contracts(state);

create table if not exists amc_service_schedule (
  id uuid primary key default gen_random_uuid(),
  amc_id uuid not null references amc_contracts(id) on delete cascade,
  quarter int not null check (quarter between 1 and 4),
  due_at date,
  is_done boolean not null default false,
  work_order_id uuid                              -- fk added below
);

create table if not exists amc_payments (
  id uuid primary key default gen_random_uuid(),
  amc_id uuid not null references amc_contracts(id) on delete cascade,
  amount_aed numeric(14,2) not null,
  received_at timestamptz not null default now(),
  reference text
);

-- ============================================================
-- REPAIR TICKETS
-- ============================================================
create table if not exists repair_tickets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  customer_id uuid not null references customers(id),
  site_id uuid references sites(id),
  state text not null default 'New',
  classification text,                  -- 'AMC free-call' / 'Chargeable' / 'Warranty'
  priority text not null default 'normal',
  sla_target_min int,
  sla_elapsed_min int not null default 0,
  assigned_to uuid references users(id),
  visits int not null default 0,
  flagged text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ============================================================
-- WORK ORDERS - universal execution layer
-- ============================================================
create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type wo_type not null,
  priority text not null default 'Standard',
  title text not null,
  source_kind text,                     -- 'project' | 'amc' | 'repair'
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
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists wo_status_idx       on work_orders(status);
create index if not exists wo_customer_idx     on work_orders(customer_id);
create index if not exists wo_scheduled_idx    on work_orders(scheduled_start);
create index if not exists wo_assigned_lead_idx on work_orders(assigned_lead);

alter table amc_service_schedule
  add constraint amc_service_wo_fk foreign key (work_order_id) references work_orders(id) on delete set null;

create table if not exists work_order_assignments (
  work_order_id uuid not null references work_orders(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (work_order_id, user_id)
);

create table if not exists work_order_tasks (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  label text not null,
  is_done boolean not null default false,
  count_label text,
  position int not null default 0
);

create table if not exists work_order_status_history (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  from_status wo_status,
  to_status wo_status not null,
  changed_by uuid references users(id),
  changed_at timestamptz not null default now(),
  note text
);

-- ============================================================
-- APPROVALS
-- ============================================================
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kind text not null,                   -- 'AMC Reactivation', 'Material Request', etc.
  amount_aed numeric(14,2),
  context text,
  requester_id uuid references users(id),       -- null = system trigger
  is_system_trigger boolean not null default false,
  target_kind text,
  target_id uuid,
  priority text not null default 'normal',
  state approval_state not null default 'pending',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text
);

create table if not exists approval_steps (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references approvals(id) on delete cascade,
  step int not null,
  role role not null,
  approver_id uuid references users(id),
  state approval_state not null default 'queued',
  decided_at timestamptz,
  decision_note text
);

-- ============================================================
-- FEED / NOTIFICATIONS / RISKS
-- ============================================================
create table if not exists feed_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  kind text not null,
  actor_id uuid references users(id),
  is_system boolean not null default false,
  text text not null,
  tag text not null default 'neutral',
  target_kind text,
  target_id uuid
);

create table if not exists notifications (
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

create table if not exists risks (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  label text not null,
  detail text,
  severity text not null default 'info',
  created_at timestamptz not null default now()
);

-- ============================================================
-- COMMS TIMELINE / INVENTORY / ASSETS
-- ============================================================
create table if not exists customer_comms (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  channel text not null,                -- 'WhatsApp','Email','Site visit','System','Invoice'
  from_label text,
  body text
);
create index if not exists customer_comms_customer_idx on customer_comms(customer_id, occurred_at desc);

create table if not exists inventory_items (
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

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  tag text unique not null,
  model text,
  site_id uuid references sites(id),
  installed_at date,
  warranty_to date,
  fault_count int not null default 0,
  status text not null default 'Healthy'
);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Audit insert for every users / approval_chain_config mutation
create or replace function fn_admin_audit() returns trigger language plpgsql as $$
begin
  insert into admin_audit_log (admin_id, action, target_type, target_id, before_value, after_value)
  values (auth.uid()::uuid, tg_op, tg_table_name, coalesce((new).id, (old).id), to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_users_audit on users;
create trigger trg_users_audit
  after insert or update or delete on users
  for each row execute function fn_admin_audit();

drop trigger if exists trg_chain_audit on approval_chain_config;
create trigger trg_chain_audit
  after insert or update or delete on approval_chain_config
  for each row execute function fn_admin_audit();

-- AMC payment-arrival reactivation
create or replace function fn_amc_payment_received() returns trigger language plpgsql as $$
declare total_paid numeric;
begin
  select coalesce(sum(amount_aed), 0) into total_paid from amc_payments where amc_id = new.amc_id;
  update amc_contracts
     set payment_received_at = greatest(coalesce(payment_received_at, '-infinity'::timestamptz), new.received_at),
         state = case when state = 'BLOCKED' and total_paid >= value_aed then 'PENDING_REACTIVATION'::amc_state else state end,
         overdue_days = 0
   where id = new.amc_id;

  -- queue a reactivation approval for the assigned manager
  if exists (select 1 from amc_contracts a where a.id = new.amc_id and a.state = 'PENDING_REACTIVATION') then
    insert into approvals (code, kind, context, is_system_trigger, target_kind, target_id, priority, state)
    select 'AP-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
           'AMC Reactivation',
           a.code || ' - payment cleared, manager approval required',
           true, 'amc', a.id, 'high', 'pending'
      from amc_contracts a where a.id = new.amc_id;
  end if;

  return new;
end $$;

drop trigger if exists trg_amc_payment on amc_payments;
create trigger trg_amc_payment
  after insert on amc_payments
  for each row execute function fn_amc_payment_received();

-- Approver resolution: walk approval_chain_config and resolve each role to a user
-- in the requester's scope (manager hierarchy / team). Phase-1 stub: looks up
-- the requester's manager for 'manager' role, team lead for 'lead_worker',
-- and any user with role 'md' / 'accounts' otherwise. Extend per MASTER_PROMPT §2.
create or replace function fn_resolve_approver(p_role role, p_requester uuid)
returns uuid language plpgsql stable as $$
declare v_id uuid;
begin
  if p_role = 'manager' then
    select coalesce(u.manager_id, t.manager_id) into v_id
    from users u left join teams t on t.id = u.team_id where u.id = p_requester;
  elsif p_role = 'lead_worker' then
    select t.lead_worker_id into v_id
    from users u join teams t on t.id = u.team_id where u.id = p_requester;
  else
    select id into v_id from users where role = p_role and is_active limit 1;
  end if;
  return v_id;
end $$;

-- ============================================================
-- HELPER: current user's row (by auth uid)
-- ============================================================
create or replace function fn_me() returns users language sql stable as $$
  select * from users where auth_id = auth.uid() limit 1
$$;

-- ============================================================
-- ROW-LEVEL SECURITY - scope-aware (MASTER_PROMPT §2 / §18)
-- ============================================================
alter table users                       enable row level security;
alter table teams                       enable row level security;
alter table role_permission_templates   enable row level security;
alter table approval_chain_config       enable row level security;
alter table admin_audit_log             enable row level security;
alter table customers                   enable row level security;
alter table sites                       enable row level security;
alter table projects                    enable row level security;
alter table milestones                  enable row level security;
alter table amc_contracts               enable row level security;
alter table amc_service_schedule        enable row level security;
alter table amc_payments                enable row level security;
alter table repair_tickets              enable row level security;
alter table work_orders                 enable row level security;
alter table work_order_assignments      enable row level security;
alter table work_order_tasks            enable row level security;
alter table work_order_status_history   enable row level security;
alter table approvals                   enable row level security;
alter table approval_steps              enable row level security;
alter table feed_events                 enable row level security;
alter table notifications               enable row level security;
alter table risks                       enable row level security;
alter table customer_comms              enable row level security;
alter table inventory_items             enable row level security;
alter table assets                      enable row level security;

-- ── helper: am I admin? am I MD?
create or replace function fn_is_admin() returns boolean language sql stable as $$
  select exists (select 1 from users where auth_id = auth.uid() and role in ('admin'))
$$;
create or replace function fn_is_md_or_admin() returns boolean language sql stable as $$
  select exists (select 1 from users where auth_id = auth.uid() and role in ('admin','md'))
$$;
create or replace function fn_my_role() returns role language sql stable as $$
  select role from users where auth_id = auth.uid() limit 1
$$;
create or replace function fn_my_id() returns uuid language sql stable as $$
  select id from users where auth_id = auth.uid() limit 1
$$;

-- ── USERS: everyone reads themselves; admins read all; managers read their reports
drop policy if exists users_read on users;
create policy users_read on users for select using (
  fn_is_admin()
  or id = fn_my_id()
  or manager_id = fn_my_id()
);
drop policy if exists users_write_admin on users;
create policy users_write_admin on users for all using (fn_is_admin()) with check (fn_is_admin());

-- ── TEAMS / CONFIG: admin-write, read for all signed-in
drop policy if exists teams_read on teams;
create policy teams_read on teams for select using (true);
drop policy if exists teams_admin_write on teams;
create policy teams_admin_write on teams for all using (fn_is_admin()) with check (fn_is_admin());

drop policy if exists tpl_read on role_permission_templates;
create policy tpl_read on role_permission_templates for select using (true);
drop policy if exists tpl_admin_write on role_permission_templates;
create policy tpl_admin_write on role_permission_templates for all using (fn_is_admin()) with check (fn_is_admin());

drop policy if exists chain_read on approval_chain_config;
create policy chain_read on approval_chain_config for select using (true);
drop policy if exists chain_admin_write on approval_chain_config;
create policy chain_admin_write on approval_chain_config for all using (fn_is_admin()) with check (fn_is_admin());

drop policy if exists audit_read_admin on admin_audit_log;
create policy audit_read_admin on admin_audit_log for select using (fn_is_admin());

-- ── CUSTOMERS / SITES: admin+MD see all; manager sees scope; sales/service see all
drop policy if exists customers_read on customers;
create policy customers_read on customers for select using (
  fn_is_md_or_admin()
  or fn_my_role() in ('manager','sales','service_support','accounts')
  or owner_id = fn_my_id()
);
drop policy if exists customers_write on customers;
create policy customers_write on customers for all using (
  fn_is_md_or_admin() or fn_my_role() in ('manager','sales')
) with check (
  fn_is_md_or_admin() or fn_my_role() in ('manager','sales')
);

drop policy if exists sites_read on sites;
create policy sites_read on sites for select using (
  exists (select 1 from customers c where c.id = sites.customer_id) -- inherits customer RLS via cascade
);
drop policy if exists sites_write on sites;
create policy sites_write on sites for all using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales'));

-- ── PROJECTS / MILESTONES
drop policy if exists projects_read on projects;
create policy projects_read on projects for select using (
  fn_is_md_or_admin() or manager_id = fn_my_id() or fn_my_role() in ('manager','sales','estimator','lead_worker','accounts')
);
drop policy if exists projects_write on projects;
create policy projects_write on projects for all using (
  fn_is_md_or_admin() or fn_my_role() in ('manager','estimator')
) with check (
  fn_is_md_or_admin() or fn_my_role() in ('manager','estimator')
);
drop policy if exists milestones_read on milestones;
create policy milestones_read on milestones for select using (true);
drop policy if exists milestones_write on milestones;
create policy milestones_write on milestones for all using (
  fn_is_md_or_admin() or fn_my_role() in ('manager','estimator')
) with check (
  fn_is_md_or_admin() or fn_my_role() in ('manager','estimator')
);

-- ── AMC
drop policy if exists amc_read on amc_contracts;
create policy amc_read on amc_contracts for select using (
  fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts')
  or manager_id = fn_my_id()
);
drop policy if exists amc_write on amc_contracts;
create policy amc_write on amc_contracts for all using (
  fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts')
) with check (
  fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts')
);
drop policy if exists amc_sched_read on amc_service_schedule;
create policy amc_sched_read on amc_service_schedule for select using (true);
drop policy if exists amc_sched_write on amc_service_schedule;
create policy amc_sched_write on amc_service_schedule for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','accounts'));
drop policy if exists amc_pay_read on amc_payments;
create policy amc_pay_read on amc_payments for select using (
  fn_is_md_or_admin() or fn_my_role() in ('manager','accounts')
);
drop policy if exists amc_pay_write on amc_payments;
create policy amc_pay_write on amc_payments for all
  using (fn_is_md_or_admin() or fn_my_role() = 'accounts')
  with check (fn_is_md_or_admin() or fn_my_role() = 'accounts');

-- ── REPAIRS
drop policy if exists repair_read on repair_tickets;
create policy repair_read on repair_tickets for select using (
  fn_is_md_or_admin() or fn_my_role() in ('manager','service_support','lead_worker','worker','sales')
  or assigned_to = fn_my_id()
);
drop policy if exists repair_write on repair_tickets;
create policy repair_write on repair_tickets for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','service_support','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','service_support','lead_worker'));

-- ── WORK ORDERS
drop policy if exists wo_read on work_orders;
create policy wo_read on work_orders for select using (
  fn_is_md_or_admin()
  or fn_my_role() in ('manager','service_support','accounts','sales','lead_worker','estimator')
  or assigned_lead = fn_my_id()
  or exists (select 1 from work_order_assignments a where a.work_order_id = work_orders.id and a.user_id = fn_my_id())
);
drop policy if exists wo_write on work_orders;
create policy wo_write on work_orders for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'));
drop policy if exists woa_read on work_order_assignments;
create policy woa_read on work_order_assignments for select using (true);
drop policy if exists woa_write on work_order_assignments;
create policy woa_write on work_order_assignments for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker'));
drop policy if exists wot_read on work_order_tasks;
create policy wot_read on work_order_tasks for select using (true);
drop policy if exists wot_write on work_order_tasks;
create policy wot_write on work_order_tasks for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','worker'));
drop policy if exists wosh_read on work_order_status_history;
create policy wosh_read on work_order_status_history for select using (true);

-- ── APPROVALS
drop policy if exists ap_read on approvals;
create policy ap_read on approvals for select using (
  fn_is_md_or_admin()
  or requester_id = fn_my_id()
  or exists (select 1 from approval_steps s where s.approval_id = approvals.id and s.approver_id = fn_my_id())
);
drop policy if exists ap_write on approvals;
create policy ap_write on approvals for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts','lead_worker'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','accounts','lead_worker'));
drop policy if exists aps_read on approval_steps;
create policy aps_read on approval_steps for select using (true);
drop policy if exists aps_write on approval_steps;
create policy aps_write on approval_steps for update using (
  approver_id = fn_my_id() or fn_is_md_or_admin()
) with check (true);

-- ── FEED / NOTIFICATIONS / RISKS
drop policy if exists feed_read on feed_events;
create policy feed_read on feed_events for select using (true);
drop policy if exists notif_read on notifications;
create policy notif_read on notifications for select using (user_id = fn_my_id() or fn_is_admin());
drop policy if exists notif_update on notifications;
create policy notif_update on notifications for update using (user_id = fn_my_id()) with check (user_id = fn_my_id());
drop policy if exists risks_read on risks;
create policy risks_read on risks for select using (true);

-- ── COMMS / INVENTORY / ASSETS
drop policy if exists comms_read on customer_comms;
create policy comms_read on customer_comms for select using (
  fn_is_md_or_admin() or fn_my_role() in ('manager','sales','service_support','accounts')
);
drop policy if exists comms_write on customer_comms;
create policy comms_write on customer_comms for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','service_support'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','sales','service_support'));

drop policy if exists inv_read on inventory_items;
create policy inv_read on inventory_items for select using (true);
drop policy if exists inv_write on inventory_items;
create policy inv_write on inventory_items for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','driver'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','driver'));

drop policy if exists assets_read on assets;
create policy assets_read on assets for select using (true);
drop policy if exists assets_write on assets;
create policy assets_write on assets for all
  using (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','worker','service_support'))
  with check (fn_is_md_or_admin() or fn_my_role() in ('manager','lead_worker','worker','service_support'));

-- ============================================================
-- STORAGE BUCKETS (per MASTER_PROMPT §20)
-- ============================================================
insert into storage.buckets (id, name, public) values
  ('admin',              'admin',              false),
  ('project-documents',  'project-documents',  false),
  ('amc-documents',      'amc-documents',      false),
  ('repair-tickets',     'repair-tickets',     false),
  ('work-orders',        'work-orders',        false),
  ('asset-registry',     'asset-registry',     false),
  ('communication',      'communication',      false),
  ('approvals',          'approvals',          false),
  ('compliance',         'compliance',         false),
  ('customer-comms',     'customer-comms',     false)
on conflict (id) do nothing;

-- Storage policies: any authenticated user can read; write follows table RLS by convention.
-- Tighten later per MASTER_PROMPT §18.
drop policy if exists "auth read all buckets"  on storage.objects;
drop policy if exists "auth write all buckets" on storage.objects;
create policy "auth read all buckets"  on storage.objects for select to authenticated using (true);
create policy "auth write all buckets" on storage.objects for insert to authenticated with check (true);
