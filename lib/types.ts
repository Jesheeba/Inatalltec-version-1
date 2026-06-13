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
  // Execution phase (migration 0020). NULL for projects created before
  // the migration — Operations Manager backfills via "Set Phase" UI.
  // New projects default to 'design' server-side.
  currentPhase: ProjectPhase | null;
  // Formal handover moment (migration 0204). Set when a customer
  // handover sign-off is recorded during the DLP phase; the DLP warranty
  // period is counted from here. NULL until handover is signed off.
  handoverCompletedAt: string | null;
  // DLP (Defects Liability Period) length in months (migration 0205).
  // The DLP window runs handoverCompletedAt → +dlpDurationMonths.
  dlpDurationMonths: number;
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

// Free-call entitlement mode for an AMC contract (migration 0037).
export type FreeCallsMode = "limited" | "unlimited" | "none";

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
  // Free-call entitlement configuration (migration 0037).
  //   freeCallsMode === null   → unset; UI shows a red "No free calls
  //                              assigned" warning on detail + contract list.
  //   'limited'   → capped at freeCallsIncluded (e.g. "1 of 10 included").
  //   'unlimited' → no cap; KPI shows used count + "Unlimited".
  //   'none'      → no free calls included; visits are billable.
  freeCallsMode: FreeCallsMode | null;
  freeCallsIncluded: number | null; // the cap, meaningful when mode='limited'
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
  firstPaymentDueAt: string | null; // first_visit_date + payment_grace_days, ISO (was signed_at + grace pre-0033)
  renewedFromId: string | null;     // previous AMC this one renews (chain)
  // OM-selected anchor for service 1 and the 30-day payment grace
  // window. NULL until "Book first visit date" is clicked. Once set,
  // service 1 lands on the calendar and first_payment_due_at is
  // populated by a BEFORE UPDATE trigger. Migration 0033.
  firstVisitDate: string | null;    // YYYY-MM-DD date
}

// AMC document — uploaded paperwork against an AMC contract.
// Migration 0034. Binaries live in Supabase Storage bucket
// 'amc-documents'; this row holds the metadata + path pointer.
export interface AmcDocument {
  id: string;
  amcId: string;
  fileName: string;
  filePath: string;          // path inside the amc-documents bucket
  fileSizeBytes: number | null;
  mimeType: string | null;
  uploadedBy: string | null; // users.id
  uploadedAt: string;        // ISO timestamptz
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
  workOrderId: string;
  label: string;
  done: boolean;
  position: number;
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

// Free call (migration 0009b). Existing schema only carries
// `symptom`, `reported_by_customer_at`, `work_order_id`. We map
// `symptom` as the user-facing description on the form. Technician
// and notes fields shown on the form are display-only — not
// persisted, to avoid touching the schema this round.
export interface FreeCall {
  id: string;
  amcContractId: string;
  reportedAt: string;          // timestamptz, ISO
  symptom: string;             // user-entered description
  workOrderId: string | null;
  completedAt: string | null;
  createdAt: string;
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

// Quotation (migration 0028). Light-weight tracker — title, value,
// customer + a status machine. No line items, no PDF, no tax — that's
// out of scope for v1. Convert flips status to 'converted' and points
// at the resulting project or AMC.
export type QuotationStatus =
  | "draft" | "sent" | "accepted" | "rejected" | "converted";

export interface Quotation {
  id: string;
  code: string;
  customerId: string | null;
  title: string;
  valueAed: number;
  status: QuotationStatus;
  validUntil: string | null;        // YYYY-MM-DD
  convertedToProjectId: string | null;
  convertedToAmcId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Migration 0035 — quotation template fields.
  // projectId   = the project this quotation was auto-generated FOR
  //               (distinct from convertedToProjectId — see migration).
  // description = scope of work, multi-line text, edited by Sales.
  // terms       = commercial / payment terms, multi-line.
  projectId: string | null;
  description: string | null;
  terms: string | null;
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

  // Refund photo (migration 0039) — single dedicated image of the
  // refundable item. Replaceable; binary in the 'replacement-documents'
  // bucket. General documents live in replacement_documents (see
  // ReplacementDocument), not here.
  refundPhotoPath: string | null;
  refundPhotoName: string | null;
  refundPhotoUploadedBy: string | null;
  refundPhotoUploadedAt: string | null;

  createdAt: string;
  updatedAt: string;
}

// Supporting documents attached to a replacement record (migration 0039).
// Mirrors AmcDocument. Binaries live in the private 'replacement-documents'
// Storage bucket; this is metadata only.
export interface ReplacementDocument {
  id: string;
  replacementRequestId: string;
  fileName: string;
  filePath: string;          // path inside the replacement-documents bucket
  fileSizeBytes: number | null;
  mimeType: string | null;
  uploadedBy: string | null; // users.id
  uploadedAt: string;        // ISO timestamptz
}

// Material Submittal — Design-phase activity 1 (migration 0040). A
// project has ONE submittal; it goes through one or more REVISIONS, each
// a list of materials submitted to the client. Lifecycle per revision:
//   draft → submitted → (approved | returned | rejected)
export type MaterialSubmittalStatus =
  | "draft" | "submitted" | "approved" | "returned" | "rejected";

export interface MaterialSubmittal {
  id: string;
  projectId: string;
  code: string;                    // MS-YYYY-NNNN
  currentRevision: number;
  approvedRevision: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialSubmittalRevision {
  id: string;
  submittalId: string;
  revisionNumber: number;
  status: MaterialSubmittalStatus;
  submittedAt: string | null;
  respondedAt: string | null;
  clientComments: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialItem {
  id: string;
  revisionId: string;
  description: string;
  modelNumber: string | null;
  quantity: number;
  datasheetPath: string | null;   // path inside the project-design-docs bucket
  datasheetName: string | null;
  sortOrder: number;
  createdAt: string;
}

// Shop Drawing — Design phase activity 2 (migration 0042). Identical
// lifecycle to Material Submittal; the payload is uploaded DRAWING FILES
// (PDF for sharing + DWG AutoCAD source) instead of material items.
//   draft → submitted → (approved | returned | rejected)
export type ShopDrawingStatus =
  | "draft" | "submitted" | "approved" | "returned" | "rejected";

export interface ShopDrawing {
  id: string;
  projectId: string;
  code: string;                    // SD-YYYY-NNNN
  currentRevision: number;
  approvedRevision: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopDrawingRevision {
  id: string;
  drawingId: string;
  revisionNumber: number;
  status: ShopDrawingStatus;
  description: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  clientComments: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopDrawingFile {
  id: string;
  revisionId: string;
  filePath: string;                // path inside the project-design-docs bucket
  fileName: string;
  fileSize: number;                // bytes
  mimeType: string | null;
  kind: "pdf" | "dwg" | "other";
  sortOrder: number;
  createdAt: string;
}

// Job Cost Analysis — Design phase activity 3 (migration 0043). An
// INTERNAL budget; no revision / client cycle. One per project, five
// numeric inputs; subtotal/profit/total are derived in the UI. Every
// save appends a ProjectJcaHistory snapshot (permanent audit trail).
export interface ProjectJca {
  id: string;
  projectId: string;
  materialsBudget: number;
  manpowerBudget: number;
  subcontractorBudget: number;
  otherCharges: number;
  profitMarginPct: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectJcaHistory {
  id: string;
  jcaId: string;
  materialsBudget: number;
  manpowerBudget: number;
  subcontractorBudget: number;
  otherCharges: number;
  profitMarginPct: number;
  note: string | null;
  editedBy: string | null;
  editedAt: string;
}

// Phase 2 — Material Supply (migration 0201). One row per material per
// project, auto-seeded from the approved material submittal revision when
// the project advances from Design → Material Supply. Snapshot of the
// planned scope at seed time; status workflow tracks procurement +
// delivery progress; optional FK to po_line_items connects to the
// Accountant module's PO row when known.
export type ProjectMaterialStatus =
  | "not_ordered"
  | "ordered"
  | "received_at_warehouse"
  | "delivered_to_site"
  | "cancelled"
  | "issue";

export interface ProjectMaterial {
  id: string;
  projectId: string;
  // Source row in material_items (the approved BOM line). NULL when
  // added mid-phase (not part of the original approved scope).
  sourceMaterialItemId: string | null;
  // Snapshot at seed time.
  description: string;
  modelNumber: string | null;
  quantityPlanned: number;
  // Status workflow.
  status: ProjectMaterialStatus;
  // Procurement linkage to the Accountant module's PO line. NULL until
  // matched by lead tech / accountant in MS-B UI.
  poLineItemId: string | null;
  // Delivery progress (running totals).
  quantityReceivedWarehouse: number;
  quantityDeliveredSite: number;
  notes: string | null;
  lastActionBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMaterialHistory {
  id: string;
  materialId: string;
  // 'created' | <status enum value> | 'qty_warehouse' | 'qty_site'
  action: string;
  detail: string | null;
  fromStatus: ProjectMaterialStatus | null;
  toStatus: ProjectMaterialStatus | null;
  // Positive for received/delivered increases; NULL for status-only events.
  qtyDelta: number | null;
  changedBy: string | null;
  changedAt: string;
}

// Phase 3 — Installation (migration 0202). One row per discrete on-site
// activity (mount a camera, terminate a rack, configure an NVR), MANUALLY
// built by the lead tech and grouped by site zone. Progress % is derived
// in the data layer (lib/projects/installation.ts), never stored. Defects
// during installation = a task set to 'blocked' + a note; snagging and
// customer sign-off belong to the T&C phase. Photos (proof-of-install)
// live in a sibling table backed by the private project-install-photos
// storage bucket.
export type InstallationTaskStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "completed"
  | "not_applicable";

export type InstallationTaskCategory =
  | "cabling"
  | "device_mounting"
  | "termination"
  | "configuration"
  | "testing"
  | "other";

export interface InstallationTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  // Free-text site grouping ("Ground Floor", "Parking B1").
  zone: string | null;
  category: InstallationTaskCategory;
  status: InstallationTaskStatus;
  // The technician responsible; null until assigned.
  assignedTo: string | null;
  // Provenance to the Phase 2 delivered material this task installs;
  // null for cabling / configuration / ad-hoc tasks.
  sourceMaterialId: string | null;
  sortOrder: number;
  // Auto-stamped by the DB when status enters 'completed', cleared when
  // it leaves. Not caller-managed.
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  lastActionBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstallationTaskHistory {
  id: string;
  taskId: string;
  // 'created' | <status enum value> | 'assigned' | 'photo_added'
  action: string;
  detail: string | null;
  fromStatus: InstallationTaskStatus | null;
  toStatus: InstallationTaskStatus | null;
  changedBy: string | null;
  changedAt: string;
}

export interface InstallationTaskPhoto {
  id: string;
  taskId: string;
  // Path within the private 'project-install-photos' bucket.
  storagePath: string;
  caption: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
}

// Phase 4 — Testing & Commissioning (migration 0203). Customer walks the
// completed work, signs off per zone, and walkthrough defects are tracked
// as a snagging list. A final Acceptance Certificate (auto-numbered
// AC-YYYY-NNNN) is produced once every installation zone is signed and no
// snag is still open/in-progress. tc_history is the append-only audit
// across snagging, zone acceptances, and certificates.
export type SnaggingStatus = "open" | "in_progress" | "fixed" | "verified";
export type SnaggingSeverity = "low" | "medium" | "high" | "critical";

export interface SnaggingItem {
  id: string;
  projectId: string;
  zone: string | null;
  description: string;
  severity: SnaggingSeverity;
  status: SnaggingStatus;
  // Worker who fixes; null until assigned.
  assignedTo: string | null;
  reportedBy: string | null;
  // Auto-stamped by the DB when status enters fixed/verified.
  completedBy: string | null;
  completedAt: string | null;
  notes: string | null;
  lastActionBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SnaggingPhoto {
  id: string;
  snaggingItemId: string;
  // Path within the private 'project-snagging-photos' bucket.
  storagePath: string;
  caption: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
}

export interface ZoneAcceptance {
  id: string;
  projectId: string;
  zone: string;
  customerName: string;
  customerEmail: string | null;
  notes: string | null;
  // Typed sign-off (no digital signature in this slice).
  signedAt: string;
  // Staff member who recorded the customer's sign-off.
  signedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptanceCertificate {
  id: string;
  projectId: string;
  // AC-YYYY-NNNN, assigned by trigger.
  certificateNumber: string | null;
  issuedTo: string | null;
  scopeSummary: string | null;
  generatedBy: string | null;
  generatedAt: string;
  createdAt: string;
}

export interface TcHistory {
  id: string;
  projectId: string;
  // 'snagging' | 'zone' | 'certificate'
  entityKind: string;
  entityId: string | null;
  // 'created' | <snag status> | 'assigned' | 'photo_added' |
  // 'zone_signed' | 'zone_resigned' | 'certificate_generated'
  action: string;
  detail: string | null;
  fromStatus: SnaggingStatus | null;
  toStatus: SnaggingStatus | null;
  changedBy: string | null;
  changedAt: string;
}

// Phase 5 — Handover (migration 0204). Formal delivery of deliverables
// to the client during the DLP phase: documents by category, a
// mandatory checklist (auto-seeded on entry to DLP), and a one-time
// customer sign-off that stamps projects.handoverCompletedAt. Option B:
// handover is a sub-state of the dlp phase, not its own phase value.
export type HandoverDocCategory = "drawings" | "manuals" | "certificates" | "warranty" | "other";

export interface HandoverDocument {
  id: string;
  projectId: string;
  category: HandoverDocCategory;
  // Path within the private 'project-handover-docs' bucket.
  filePath: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  description: string | null;
  isRequired: boolean;
  uploadedBy: string | null;
  uploadedAt: string;
  createdAt: string;
}

export interface HandoverChecklistItem {
  id: string;
  projectId: string;
  category: HandoverDocCategory | null;
  itemDescription: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: string | null;
  sortOrder: number;
  lastActionBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HandoverSignoff {
  id: string;
  projectId: string;
  customerName: string;
  customerEmail: string | null;
  notes: string | null;
  // 'typed' | 'digital' (digital is a future enhancement)
  signatureMethod: string;
  signedAt: string;
  signedByUserId: string | null;
  createdAt: string;
}

export interface HandoverHistory {
  id: string;
  projectId: string;
  // 'document' | 'checklist' | 'signoff'
  entityKind: string;
  entityId: string | null;
  // 'document_uploaded' | 'created' | 'completed' | 'reopened' | 'handover_signed'
  action: string;
  detail: string | null;
  changedBy: string | null;
  changedAt: string;
}

// Phase 6 — DLP / Defects Liability Period (migration 0205). The warranty
// window after handover; clients report warranty defects as dlp_tickets.
// The window runs projects.handoverCompletedAt → +dlpDurationMonths.
export type DlpTicketStatus = "open" | "in_progress" | "fixed" | "verified" | "closed";

export interface DlpTicket {
  id: string;
  projectId: string;
  description: string;
  severity: SnaggingSeverity;
  status: DlpTicketStatus;
  assignedTo: string | null;
  reportedBy: string | null;
  reportedAt: string;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  lastActionBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DlpTicketPhoto {
  id: string;
  ticketId: string;
  // Path within the private 'project-dlp-photos' bucket.
  storagePath: string;
  caption: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
}

export interface DlpHistory {
  id: string;
  projectId: string;
  ticketId: string | null;
  action: string;
  detail: string | null;
  fromStatus: DlpTicketStatus | null;
  toStatus: DlpTicketStatus | null;
  changedBy: string | null;
  changedAt: string;
}

// Phase 7 — Closed (migration 0206). Terminal phase: a close-out
// checklist (auto-seeded), a financial closure snapshot, and an audit
// trail. Admin/MD can reopen (moves the phase back to 'dlp').
export interface ClosureChecklistItem {
  id: string;
  projectId: string;
  item: string;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: string | null;
  sortOrder: number;
  lastActionBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClosureSummary {
  id: string;
  projectId: string;
  finalTotalCost: number;
  totalInvoiced: number;
  totalReceived: number;
  totalPaidOut: number;
  notes: string | null;
  closedBy: string | null;
  closedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClosureHistory {
  id: string;
  projectId: string;
  // 'checklist' | 'summary' | 'project'
  entityKind: string;
  entityId: string | null;
  // 'created' | 'completed' | 'reopened' | 'closed' | 'summary_updated'
  action: string;
  detail: string | null;
  changedBy: string | null;
  changedAt: string;
}

// Material Requests — on-site material/parts procurement flow
// (migration 0038). A technician raises a request from a Work Order;
// the parent project/AMC manager + supervising Lead Tech are notified;
// managers approve / reject / fulfil. Every transition is timestamped
// with the actor for a complete audit trail.
export type MaterialRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";
export type MaterialRequestUrgency = "low" | "normal" | "high";

export interface MaterialRequest {
  id: string;
  code: string;                  // MR-YYYY-NNNN, assigned by trigger
  // Parent links — work order is the origin; project/amc/repair are
  // denormalised from the WO source for project/AMC roll-up filtering.
  workOrderId: string | null;
  projectId: string | null;
  amcContractId: string | null;
  repairTicketId: string | null;
  customerId: string;
  siteId: string | null;

  itemName: string;              // material name / description
  quantity: number;
  urgency: MaterialRequestUrgency;
  notes: string | null;

  status: MaterialRequestStatus;

  requestedBy: string | null;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  fulfilledBy: string | null;
  fulfilledAt: string | null;
  fulfillmentNote: string | null;

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
