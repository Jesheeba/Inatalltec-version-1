// ============================================================
// Installtec OS - Shared types (mirrors prototype data shape)
// ============================================================

export type Role =
  | "super_admin"
  | "admin"
  | "md"
  | "manager"
  | "sales"
  | "estimator"
  | "lead_worker"
  | "worker"
  | "driver"
  | "subcontractor"
  | "service_support"
  | "accounts";

export interface Organization {
  id: string;
  name: string;
  display_name: string;
  legal_name?: string;
  tagline?: string;
  login_page_message?: string;

  logo_url?: string;
  logo_dark_url?: string;
  favicon_url?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;

  subdomain: string;
  custom_domain?: string;
  domain_verified?: boolean;

  default_currency: string;
  currency_symbol: string;
  currency_position: "before" | "after";
  decimal_separator: string;
  thousand_separator: string;
  decimal_places: number;

  default_locale: string;
  default_timezone: string;
  date_format: string;
  time_format: "12h" | "24h";

  invoice_footer_text?: string;
  invoice_terms_text?: string;
  service_report_footer_text?: string;
  amc_contract_footer_text?: string;
  quotation_footer_text?: string;

  email_from_name?: string;
  email_signature?: string;
  email_reply_to?: string;

  whatsapp_business_name?: string;
  whatsapp_greeting_template?: string;
  whatsapp_sign_off?: string;

  admin_can_manage_branding?: boolean;
  is_active: boolean;
  created_at?: string;
}

export type Tint = "primary" | "violet" | "peach" | "warm" | "info";

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  phone: string;
  initials: string;
  tint: Tint;
  mgr: string | null;
  /** @deprecated Teams retired — the Lead Tech assigns workers per Work Order
   *  directly. Field kept on the model so historical rows still hydrate. */
  team: string | null;
  skills: string[];
  region: string;
  organization_id?: string;
}

export interface Team {
  id: string;
  name: string;
  lead: string;
  manager: string;
  members: string[];
  skills: string[];
  region: string;
}

export interface Customer {
  id: string;
  name: string;
  tier: "Strategic" | "Key" | "Standard";
  region: string;
  sector: string;
  owner: string;
  since: string;
  tags: string[];
}

export interface Site {
  id: string;
  name: string;
  customer: string;
  // City / area (the sites.area column, kept under the legacy `area` key
  // so downstream readers — Misc.tsx, AmcDetail, etc. — don't change).
  area: string;
  // Access notes (sites.access_instructions). Same legacy alias.
  access: string;
  // Optional fields added by migration 0013. Old rows may have these unset;
  // every reader must treat them as optional.
  address_line_1?: string;
  address_line_2?: string;
  emirate?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  geo_lat?: number;
  geo_lng?: number;
  is_active?: boolean;
}

export interface Milestone {
  id: string;
  name: string;
  done: boolean;
  pct: number;
}

// Project execution phase (migration 0020). Six manually-advanced steps
// a Main Contractor job moves through after kickoff. Only md/admin/manager
// can change this; UI surfaces a horizontal stepper on the detail page and
// a small pill badge on cards / calendar events.
export type ProjectPhase =
  | "design"
  | "material_supply"
  | "installation"
  | "tc"
  | "dlp"
  | "closed";

export interface ProjectPhaseHistory {
  id: string;
  projectId: string;
  fromPhase: ProjectPhase | null;
  toPhase: ProjectPhase;
  changedBy: string | null;   // users.id, NULL when set under service-role
  changedAt: string;          // ISO timestamptz
  note: string | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  customer: string;
  site: string;
  manager: string;
  /** @deprecated Teams retired — execution ownership lives on leadTechId.
   *  Field kept on the model so old rows still hydrate from projects.team_id. */
  team: string;
  // Lead Technician assigned by Operations Manager at creation time
  // (migration 0018). Empty string when no Lead is assigned yet.
  leadTechId: string;
  status: string;
  stage: string;
  // Execution phase (migration 0020). NULL for projects created before
  // the migration — Operations Manager backfills via "Set Phase" UI.
  // New projects default to 'design' server-side.
  currentPhase: ProjectPhase | null;
  progress: number;
  value: number;
  startedAt: string;
  dueAt: string;
  milestones: Milestone[];
}

// AMC contract lifecycle (migration 0009 / amc_status enum).
// Kept in sync with supabase/migrations/0009a_amc_enum_setup.sql.
// Legacy uppercase variants are retired — the DB still carries them as
// dormant enum labels but no row should ever hold one after 0009b.
export type AmcStatus =
  | "draft"
  | "pending_payment"
  | "active"
  | "suspended"
  | "expired"
  | "cancelled"
  | "renewed";

// Back-compat alias so any straggler imports of `AmcState` keep compiling
// while we migrate them over. Safe to delete once nothing references it.
export type AmcState = AmcStatus;

export interface AmcContract {
  id: string;
  code: string;
  customer: string;
  site: string;
  manager: string;
  // Lead Technician — same role as projects.leadTechId (migration 0018).
  leadTechId: string;
  contract_status: AmcStatus;
  value: number;
  services: { done: number; total: number };
  nextDue: string;
  overdueDays: number;
  freeCalls: number;
  expiresAt: string;
  // Pause / resume / renewal fields. The frontend labels
  // contract_status='suspended' as "Paused"; the DB keeps the existing
  // 'suspended' value so the auto-resume payment trigger keeps working.
  // suspendedAt / suspendedReason have lived on the DB since 0009b and
  // are surfaced now so the AmcDetail page can show "Paused since X
  // because Y". pausedBy / resumedAt / firstPaymentDueAt / renewedFromId
  // are new in migration 0021.
  suspendedAt: string | null;       // ISO timestamptz of pause (existing column)
  suspendedReason: string | null;   // free-text reason (existing column)
  pausedBy: string | null;          // users.id of who paused (auto sweep → null)
  resumedAt: string | null;         // ISO timestamptz of most recent resume
  firstPaymentDueAt: string | null; // signed_at + payment_grace_days, ISO
  renewedFromId: string | null;     // previous AMC this one renews (chain)
}

export interface RepairTicket {
  id: string;
  code: string;
  title: string;
  customer: string;
  site: string;
  // Lead Technician — same role as projects.leadTechId (migration 0018).
  leadTechId: string;
  state: "New" | "In Progress" | "Resolved";
  sla: { target: number; elapsed: number; breach: boolean };
  classification: string;
  priority: "high" | "normal";
  openedAt: string;
  assigned: string | null;
  visits: number;
  flagged?: string;
}

export type WoType = "AMC" | "PROJECT" | "REPAIR" | "DELIVERY" | "SURVEY";
// Migration 0014 replaced the legacy Title-case enum (Scheduled / Assigned /
// In Transit / In Progress / Completed / Closed) with this 8-state lowercase
// lifecycle. Keep these literals in lock-step with the wo_status enum in
// Postgres.
export type WoStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "waiting_material"
  | "pending_confirmation"
  | "done"
  | "closed"
  | "cancelled";

export interface WoTask {
  id: string;
  label: string;
  done: boolean;
  count?: string;
}

export interface WorkOrder {
  id: string;
  code: string;
  type: WoType;
  priority: string;
  title: string;
  source: { kind: "amc" | "project" | "repair"; id: string };
  customer: string;
  site: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: WoStatus;
  assignedLead: string;
  assigned: string[];
  progress: number;
  slaMin: number | null;
  elapsedMin: number;
  materials: string[];
  tasks?: WoTask[];
  flagged?: string;
  // Time-tracking fields (migration 0022). All nullable for WOs created
  // before the migration applied / before any worker clicked Start.
  // durationMinutes is trigger-computed from work_order_time_entries
  // (sum across all closed sessions); actualWorkersCount is count of
  // distinct workers who ever logged a session.
  startedAt: string | null;            // earliest entry's started_at
  completedAt: string | null;          // "Mark WO Done" timestamp
  durationMinutes: number;             // default 0
  actualWorkersCount: number;          // default 0
}

// One row per (worker × session). Mirror of public.work_order_time_entries
// from migration 0022. endedAt = null means the session is currently open
// (the worker hasn't clicked Done yet). durationMinutes is the DB-generated
// stored column — 0 while open, integer minutes once closed.
export interface WorkOrderTimeEntry {
  id: string;
  workOrderId: string;
  userId: string | null;               // null after worker is soft-deleted
  startedAt: string;                   // ISO timestamptz
  endedAt: string | null;
  durationMinutes: number;
  note: string | null;
  createdAt: string;
}

// External contractor directory (migration 0023). No login — these
// profiles are stored so we can list them in WO assignment, track
// their hours, and keep HR/compliance fields (Emirates ID, phone).
// Distinct concept from the `subcontractor` role enum value, which is
// for the rare case of a sub-contractor who has a sign-in account.
export interface SubContractor {
  id: string;
  name: string;
  phone: string | null;
  emiratesId: string | null;
  company: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;            // users.id who added them
}

// One row per (work_order × sub_contractor). Tracks the assignment +
// the sub-contractor's own start/done timestamps + computed duration.
// Parallel to work_order_time_entries but with a different key shape
// because sub-contractors don't have user_id rows.
export interface WorkOrderSubContractor {
  id: string;
  workOrderId: string;
  subContractorId: string;
  assignedAt: string;
  assignedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number;
  note: string | null;
}

// One row per logged session for a sub-contractor on a work order
// (migration 0026). Layered on top of the assignment row in
// work_order_sub_contractors — the composite FK guarantees the sub is
// already on the WO before hours can land. Multiple entries per
// (WO, sub, day) are allowed (a sub may come and go during the day).
// hours is numeric(5,2) at the DB; it round-trips as a number here.
export interface WorkOrderSubContractorHours {
  id: string;
  workOrderId: string;
  subContractorId: string;
  entryDate: string;       // YYYY-MM-DD (DB column is `date`, not timestamptz)
  hours: number;           // > 0 and <= 24 (DB CHECK)
  notes: string | null;
  loggedBy: string | null; // users.id who entered it; null if user was deleted
  loggedAt: string;        // ISO timestamptz, server default now()
}

// ============================================================
// AMC scheduled service visit — one row per quarterly PPM in
// amc_service_schedule (migration 0009b). Hydrated separately from
// AmcContract.services (which is just an aggregate done/total) so the
// Growth Plan calendar can render each visit as an individual event.
// ============================================================
export type AmcServiceStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "skipped"
  | "overdue";

export interface AmcService {
  id: string;
  amcContractId: string;
  serviceNumber: number;      // 1..N within the contract year
  scheduledDate: string;      // YYYY-MM-DD
  status: AmcServiceStatus;
  workOrderId: string | null; // set once a WO has been raised for this visit
  completedAt: string | null;
  notes: string | null;
}

// ============================================================
// Growth Plan / Calendar — normalized event model. Projects, AMC
// scheduled visits, and Work Orders all collapse into this shape so the
// month / week / list views can render and filter against one stream.
// Populated by lib/calendar.ts; not persisted, not hydrated.
// ============================================================
export type CalendarEventKind = "project" | "amc_visit" | "work_order";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  customerId?: string;
  customerName?: string;
  siteId?: string;
  siteName?: string;
  leadTechId?: string;
  leadTechName?: string;
  assigneeIds: string[];
  status?: string;
  color: string;
  source: {
    table: "projects" | "amc_contracts" | "work_orders";
    id: string;
  };
  metadata?: Record<string, unknown>;
}

export type CalendarView = "month" | "week" | "list";
export type CalendarFilter = "all" | "project" | "amc_visit" | "work_order" | "mine";
export type CalendarRange = "today" | "week" | "month" | "3months" | "custom";

// Replacement Requests — Worker → Lead Tech approval flow
// (migration 0017). Workers raise from the field, Lead Techs gate
// approval and confirmation, every step is timestamped.
export type ReplacementStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "in_progress"
  | "pending_confirmation"
  | "completed"
  | "cancelled";

export type ReplacementContext =
  | "main_contractor"
  | "amc_free_call"
  | "amc_scheduled"
  | "repair";

export interface ReplacementRequest {
  id: string;
  code: string;                  // RR-YYYY-NNNN, assigned by trigger
  context: ReplacementContext;

  // Parent links — at least one of these is set besides customer.
  workOrderId: string | null;
  projectId: string | null;
  amcContractId: string | null;
  repairTicketId: string | null;
  customerId: string;
  siteId: string | null;

  itemName: string;
  quantity: number;
  reason: string | null;

  status: ReplacementStatus;

  requestedBy: string | null;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  installedBy: string | null;
  installedAt: string | null;
  installationNote: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  confirmationNote: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStep {
  step: number;
  role: Role;
  user: string;
  state: "approved" | "pending" | "queued";
  at?: string;
}

export interface Approval {
  id: string;
  code: string;
  kind:
  | "AMC Reactivation"
  | "Material Request"
  | "Variation Order"
  | "Subcontractor Payment"
  | "Leave Request"
  | "Quotation"
  | "Invoice Approval"
  | "Overtime Request";
  amount: number | null;
  context: string;
  requester: string | "system";
  target: { kind: string; id: string };
  openedAt: string;
  priority: "high" | "normal";
  pendingFor: string;
  chain: ApprovalStep[];
  notes?: string;
}

export interface FeedItem {
  id: string;
  t: string;
  kind: string;
  who: string | "system";
  text: string;
  tag: "success" | "warning" | "danger" | "info" | "primary" | "neutral";
  target: { kind: string; id: string };
}

export type NotificationKind =
  | "approval" | "escalation" | "workorder" | "sla"
  | "message" | "mention" | "payment" | "amc"
  | "signoff" | "material" | "leave" | "system";

export type NotificationPriority = "low" | "normal" | "high";

export interface Notification {
  id: string;
  t: string;
  read: boolean;
  kind: NotificationKind | string;
  title: string;
  body: string;
  target: { kind: string; id: string };
  priority?: NotificationPriority;
  iso?: string;
  actions?: ("approve" | "reject" | "view")[];
}

export interface Risk {
  id: string;
  kind: string;
  label: string;
  detail: string;
  severity: "warning" | "danger" | "info";
}

export interface CommEntry {
  id: string;
  t: string;
  kind: string;
  from: string;
  body: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  central: number;
  vehicles: number;
  sites: number;
  reorderAt: number;
  value: number;
}

export interface AssetRecord {
  id: string;
  tag: string;
  model: string;
  site: string;
  installedAt: string;
  warrantyTo: string;
  faultCount: number;
  status: string;
}

export type IconName =
  | "dashboard" | "feed" | "calendar" | "briefcase" | "wrench" | "shield"
  | "shieldCheck" | "users" | "user" | "cog" | "bell" | "search" | "package"
  | "truck" | "fileText" | "receipt" | "chartBar" | "chartLine" | "pieChart"
  | "inbox" | "messageCircle" | "check" | "checkCircle" | "clock" | "alertCircle"
  | "alertTriangle" | "zap" | "flame" | "pause" | "play" | "loader" | "plus"
  | "minus" | "x" | "filter" | "arrowRight" | "arrowLeft" | "arrowUp" | "arrowDown"
  | "chevronRight" | "chevronLeft" | "chevronDown" | "chevronUp" | "ellipsis"
  | "externalLink" | "mapPin" | "navigation" | "camera" | "scan" | "mic" | "phone"
  | "mail" | "pen" | "paperclip" | "hardHat" | "camera2" | "cable" | "signature"
  | "building" | "banknote" | "trendingUp" | "trendingDown" | "layers" | "list"
  | "grid" | "refresh" | "star" | "thumbsUp" | "warehouse" | "flag" | "cloudOff"
  | "trash" | "eye" | "eyeOff" | "panelLeft";
