// ============================================================
// Installtec OS - Data layer
// All seeds are intentionally empty. Every dashboard, module
// and overlay renders against these collections; once Supabase
// queries are wired in (see lib/supabase/), the same shape is
// returned from the database and nothing in the UI needs to
// change. To re-seed for local development, populate the
// exported collections below - do NOT add data inline elsewhere.
// ============================================================

import type {
  AmcContract, AmcDocument, AmcService, Approval, AssetRecord, CommEntry, Customer, FeedItem, FreeCall,
  InventoryItem, MaterialRequest, Notification, Organization, Project, Quotation, RepairTicket,
  MaterialSubmittal, MaterialSubmittalRevision, MaterialItem,
  ShopDrawing, ShopDrawingRevision, ShopDrawingFile,
  ProjectJca, ProjectJcaHistory,
  ReplacementRequest, ReplacementDocument, Risk, Role,
  Site, SubContractor, Team, User, WorkOrder, WorkOrderSubContractor,
  WorkOrderSubContractorHours, WorkOrderTimeEntry, WoTask,
} from "./types";

// ── ORGANIZATIONS ──────────────────────────────────────────
// The platform is multi-tenant from day one. The Installtec org is seeded
// here so the UI has something to render on first paint; the Super Admin
// console can create / edit / delete additional orgs at runtime.
export const ORGANIZATIONS: Record<string, Organization> = {
  org_installtec: {
    id: "org_installtec",
    name: "Installtec Electromechanical LLC",
    display_name: "Installtec",
    legal_name: "Installtec Electromechanical LLC",
    tagline: "Operations · Dubai",
    login_page_message: "Welcome back - sign in to continue.",

    logo_url: "",
    primary_color: "#5BAE9C",
    secondary_color: "#A78BFA",
    accent_color: "#F4B8A4",

    subdomain: "installtec",
    domain_verified: false,

    default_currency: "AED",
    currency_symbol: "AED",
    currency_position: "before",
    decimal_separator: ".",
    thousand_separator: ",",
    decimal_places: 2,

    default_locale: "en-AE",
    default_timezone: "Asia/Dubai",
    date_format: "DD/MM/YYYY",
    time_format: "24h",

    email_from_name: "Installtec Operations",
    whatsapp_business_name: "Installtec",
    admin_can_manage_branding: true,
    is_active: true,
    created_at: new Date().toISOString(),
  },
};

export const DEFAULT_ORG_ID = "org_installtec";

// ── USERS / TEAMS ───────────────────────────────────────────
// Seed a Super Admin so the platform has a way in on first boot.
// Admin and operational users are created via the UI (Super Admin → Admin → users).
export const USERS: Record<string, User> = {
  u_root: {
    id: "u_root",
    name: "Platform Super Admin",
    role: "super_admin",
    email: "root@installtec.platform",
    phone: "",
    initials: "PS",
    tint: "violet",
    mgr: null,
    team: null,
    skills: [],
    region: "UAE",
    organization_id: DEFAULT_ORG_ID,
  },
};
export const TEAMS: Record<string, Team> = {};

// Role labels are UI translations of the role enum, not seed data - keep them.
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  md: "Managing Director",
  manager: "Operations Manager",
  sales: "Sales",
  estimator: "Pre-Sales / Estimator",
  lead_worker: "Lead Technician",
  worker: "Technician",
  driver: "Driver",
  subcontractor: "Subcontractor",
  service_support: "Service Support",
  accounts: "Accounts",
};

// ============================================================
// Role visibility tiers
// ------------------------------------------------------------
// Three buckets for separating "who can appear in operational
// views". Used by Team page filters, member pickers, manpower
// reports, etc.
//
//   CORE     — always visible for Installtec today. The day-to-day
//              operational workforce.
//   OPTIONAL — enabled in the codebase but hidden by default for
//              Installtec. When the Access Control panel ships,
//              these become per-org toggleable.
//   PLATFORM — never appear in operational views. super_admin is
//              a cross-tenant technical role for platform support.
//
// Any picker / list that mixes operational users should source its
// allowed-role list from these constants instead of hand-rolling a
// `!== "super_admin"` check.
// ============================================================
export const CORE_OPERATIONAL_ROLES: Role[] = [
  "md", "admin", "manager", "lead_worker", "worker",
  "driver", "accounts", "subcontractor",
];

export const OPTIONAL_ROLES: Role[] = [
  "sales", "estimator", "service_support",
];

export const PLATFORM_ROLES: Role[] = [
  "super_admin",
];

// Convenience: every role that's NOT platform-only. Use this for
// pickers that may need optional-role users (e.g. an Estimator
// selected as Account Owner on a quotation) but must always exclude
// super_admin.
export const ALL_OPERATIONAL_ROLES: Role[] = [
  ...CORE_OPERATIONAL_ROLES,
  ...OPTIONAL_ROLES,
];

// Quick helpers — slightly cheaper than `.includes()` in tight loops.
const CORE_SET     = new Set<Role>(CORE_OPERATIONAL_ROLES);
const PLATFORM_SET = new Set<Role>(PLATFORM_ROLES);
export const isCoreOperationalRole = (r: Role): boolean => CORE_SET.has(r);
export const isPlatformRole        = (r: Role): boolean => PLATFORM_SET.has(r);

// ── CUSTOMERS / SITES / PROJECTS / AMCS / REPAIRS / WORK ORDERS ─
export const CUSTOMERS: Record<string, Customer> = {};
export const SITES: Record<string, Site> = {};
export const PROJECTS: Record<string, Project> = {};
export const AMCS: Record<string, AmcContract> = {};
// Individual AMC quarterly service visits, keyed by service row id.
// Populated by the Growth Plan hydration step; the calendar reads from
// here. The aggregate done/total counts on each AmcContract are kept
// separately and stay in sync as workers complete visits.
export const AMC_SERVICE_SCHEDULE: Record<string, AmcService> = {};
export const REPAIRS: Record<string, RepairTicket> = {};
export const WORK_ORDERS: Record<string, WorkOrder> = {};
// Migration 0022 — per-worker × per-session time entries, keyed by entry id.
// Populated from work_order_time_entries via lib/hydrate. Used by the WO
// detail page (live timer + history), the "Active Work" dashboard widget,
// and the hours-aggregation helpers in lib/create.
export const WORK_ORDER_TIME_ENTRIES: Record<string, WorkOrderTimeEntry> = {};

// Migration 0023 — external sub-contractor directory (no login) +
// per-WO assignments with their own time tracking.
export const SUB_CONTRACTORS: Record<string, SubContractor> = {};
export const WORK_ORDER_SUB_CONTRACTORS: Record<string, WorkOrderSubContractor> = {};

// Migration 0026 — per-day hours log for sub-contractors. Layered on
// top of WORK_ORDER_SUB_CONTRACTORS (the assignment row). Lead Tech /
// Manager / Admin writes via lib/create.logSubContractorHours. The
// db.hoursForSubOnWO / hoursForSub / hoursForWO / totalHoursForSubOnProject
// selectors below all read from here.
export const WORK_ORDER_SUB_CONTRACTOR_HOURS: Record<string, WorkOrderSubContractorHours> = {};

// Phase 8 — AMC free calls (table from migration 0009b).
export const FREE_CALLS: Record<string, FreeCall> = {};

// v1.1.0 — persisted WO checklist tasks (table from migration 0001).
// Replaces the local-state checklist that was being thrown away on
// every refresh. Keyed by task id; sort by position within a WO.
export const WO_TASKS: Record<string, WoTask> = {};

// Phase 11 — quotations (migration 0028).
export const QUOTATIONS: Record<string, Quotation> = {};

// Migration 0034 — AMC documents (optional uploaded paperwork against
// each AMC contract). Binaries live in Supabase Storage; rows here are
// metadata only. Keyed by document id.
export const AMC_DOCUMENTS: Record<string, AmcDocument> = {};

// ── APPROVALS / FEED / NOTIFICATIONS / RISKS ───────────────
export const APPROVALS: Record<string, Approval> = {};
export const REPLACEMENTS: Record<string, ReplacementRequest> = {};
// Migration 0039 — supporting documents attached to a replacement record.
// Binaries live in the 'replacement-documents' Storage bucket; metadata here.
export const REPLACEMENT_DOCUMENTS: Record<string, ReplacementDocument> = {};
// Migration 0038 — material/parts requests raised from a Work Order.
export const MATERIAL_REQUESTS: Record<string, MaterialRequest> = {};
// Migration 0040 — Material Submittal (Design phase activity 1): one
// submittal per project, multiple revisions, items per revision.
export const MATERIAL_SUBMITTALS: Record<string, MaterialSubmittal> = {};
export const MATERIAL_SUBMITTAL_REVISIONS: Record<string, MaterialSubmittalRevision> = {};
export const MATERIAL_ITEMS: Record<string, MaterialItem> = {};
// Migration 0042 — Shop Drawing (Design phase activity 2): one drawing
// per project, multiple revisions, uploaded files per revision.
export const SHOP_DRAWINGS: Record<string, ShopDrawing> = {};
export const SHOP_DRAWING_REVISIONS: Record<string, ShopDrawingRevision> = {};
export const SHOP_DRAWING_FILES: Record<string, ShopDrawingFile> = {};
// Migration 0043 — Job Cost Analysis (Design phase activity 3): one JCA
// per project + an append-only edit-history audit trail.
export const PROJECT_JCA: Record<string, ProjectJca> = {};
export const PROJECT_JCA_HISTORY: Record<string, ProjectJcaHistory> = {};
export const FEED: FeedItem[] = [];
export const NOTIFICATIONS: Notification[] = [];
export const RISKS: Risk[] = [];

// ── COMMS / INVENTORY / ASSETS ─────────────────────────────
export const COMMS: Record<string, CommEntry[]> = {};
export const INVENTORY: InventoryItem[] = [];
export const ASSETS: AssetRecord[] = [];

// ── KPI snapshot (derived in production from queries) ──────
export const KPI_OPS = {
  open_wo: 0, sla_at_risk: 0, sla_pct: 0,
  amc_value_q: 0, amc_growth: 0,
  utilization: 0, util_spark: [] as number[],
  approvals_count: 0, approvals_high: 0,
  rev_month: 0, rev_growth: 0,
  active_projects: 0, projects_at_risk: 0,
};

// ── Helpers ────────────────────────────────────────────────
const unknownUser: User = {
  id: "?", name: "Unknown", initials: "?", tint: "primary",
  role: "worker", email: "", phone: "", mgr: null, team: null, skills: [], region: "UAE",
  organization_id: DEFAULT_ORG_ID,
};

export const db = {
  ORGANIZATIONS, USERS, TEAMS, ROLE_LABELS,
  CUSTOMERS, SITES, PROJECTS, AMCS, AMC_SERVICE_SCHEDULE, REPAIRS, WORK_ORDERS,
  WORK_ORDER_TIME_ENTRIES,
  SUB_CONTRACTORS, WORK_ORDER_SUB_CONTRACTORS, WORK_ORDER_SUB_CONTRACTOR_HOURS,
  FREE_CALLS, QUOTATIONS, WO_TASKS, AMC_DOCUMENTS,
  APPROVALS, REPLACEMENTS, REPLACEMENT_DOCUMENTS, MATERIAL_REQUESTS,
  MATERIAL_SUBMITTALS, MATERIAL_SUBMITTAL_REVISIONS, MATERIAL_ITEMS,
  SHOP_DRAWINGS, SHOP_DRAWING_REVISIONS, SHOP_DRAWING_FILES,
  PROJECT_JCA, PROJECT_JCA_HISTORY,
  FEED, NOTIFICATIONS, RISKS, COMMS, INVENTORY, ASSETS,
  KPI_OPS,
  org: (id?: string | null): Organization | null => (id && ORGANIZATIONS[id]) || null,
  user: (id?: string | null): User => (id && USERS[id]) || unknownUser,
  cust: (id: string) => CUSTOMERS[id] || null,
  site: (id: string) => SITES[id] || null,
  proj: (id: string) => PROJECTS[id] || null,
  amc: (id: string) => AMCS[id] || null,
  wo: (id: string) => WORK_ORDERS[id] || null,
  replacement: (id: string): ReplacementRequest | null => REPLACEMENTS[id] || null,
  // Migration 0038 — material request selectors. Newest first throughout.
  materialRequest: (id: string): MaterialRequest | null => MATERIAL_REQUESTS[id] || null,
  materialRequestsForWO: (woId: string): MaterialRequest[] =>
    Object.values(MATERIAL_REQUESTS)
      .filter(m => m.workOrderId === woId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
  materialRequestsForProject: (projectId: string): MaterialRequest[] =>
    Object.values(MATERIAL_REQUESTS)
      .filter(m => m.projectId === projectId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
  materialRequestsForAmc: (amcId: string): MaterialRequest[] =>
    Object.values(MATERIAL_REQUESTS)
      .filter(m => m.amcContractId === amcId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
  byCustomer: (id: string) => ({
    projects: Object.values(PROJECTS).filter(p => p.customer === id),
    amcs: Object.values(AMCS).filter(a => a.customer === id),
    repairs: Object.values(REPAIRS).filter(r => r.customer === id),
    wos: Object.values(WORK_ORDERS).filter(w => w.customer === id),
  }),
  byProject: (id: string) => ({
    wos: Object.values(WORK_ORDERS).filter(w => w.source.kind === "project" && w.source.id === id),
  }),
  byAmc: (id: string) => ({
    wos: Object.values(WORK_ORDERS).filter(w => w.source.kind === "amc" && w.source.id === id),
  }),
  // Time-tracking selectors (migration 0022). Pure reads off the mirror;
  // helpers in lib/create handle writes + hours aggregation.
  woEntries: (woId: string) =>
    Object.values(WORK_ORDER_TIME_ENTRIES).filter(e => e.workOrderId === woId),
  openEntryFor: (woId: string, userId: string): WorkOrderTimeEntry | null =>
    Object.values(WORK_ORDER_TIME_ENTRIES)
      .find(e => e.workOrderId === woId && e.userId === userId && e.endedAt === null) ?? null,

  // Sub-contractor selectors (migration 0023).
  subContractor: (id: string): SubContractor | null => SUB_CONTRACTORS[id] ?? null,
  activeSubContractors: (): SubContractor[] =>
    Object.values(SUB_CONTRACTORS).filter(s => s.isActive),
  subForWO: (woId: string): WorkOrderSubContractor[] =>
    Object.values(WORK_ORDER_SUB_CONTRACTORS).filter(j => j.workOrderId === woId),
  woAssignmentsForSub: (subId: string): WorkOrderSubContractor[] =>
    Object.values(WORK_ORDER_SUB_CONTRACTORS).filter(j => j.subContractorId === subId),

  // Sub-contractor hours selectors (migration 0026). All four read off
  // the WORK_ORDER_SUB_CONTRACTOR_HOURS mirror — writes go through
  // lib/create.logSubContractorHours / editSubContractorHoursEntry /
  // deleteSubContractorHoursEntry, which keep the mirror in sync.
  hoursForSubOnWO: (woId: string, subId: string): WorkOrderSubContractorHours[] =>
    Object.values(WORK_ORDER_SUB_CONTRACTOR_HOURS)
      .filter(h => h.workOrderId === woId && h.subContractorId === subId),
  hoursForSub: (subId: string): WorkOrderSubContractorHours[] =>
    Object.values(WORK_ORDER_SUB_CONTRACTOR_HOURS).filter(h => h.subContractorId === subId),
  hoursForWO: (woId: string): WorkOrderSubContractorHours[] =>
    Object.values(WORK_ORDER_SUB_CONTRACTOR_HOURS).filter(h => h.workOrderId === woId),
  // Sums all sub-contractor hours for one sub across every WO that
  // belongs to one project. Walks the hours mirror once and uses the
  // WO mirror to resolve project membership — so adding a WO to a
  // project (or moving one) is reflected immediately without a re-hydrate.
  totalHoursForSubOnProject: (subId: string, projectId: string): number => {
    if (!subId || !projectId) return 0;
    let total = 0;
    for (const h of Object.values(WORK_ORDER_SUB_CONTRACTOR_HOURS)) {
      if (h.subContractorId !== subId) continue;
      const w = WORK_ORDERS[h.workOrderId];
      if (!w) continue;
      if (w.source.kind !== "project" || w.source.id !== projectId) continue;
      total += h.hours;
    }
    return total;
  },

  // Phase 8 — free call selectors.
  freeCallsForAmc: (amcId: string): FreeCall[] =>
    Object.values(FREE_CALLS)
      .filter(f => f.amcContractId === amcId)
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),

  // Phase 11 — quotation selectors.
  quotation: (id: string): Quotation | null => QUOTATIONS[id] ?? null,
  quotationsForCustomer: (cid: string): Quotation[] =>
    Object.values(QUOTATIONS).filter(q => q.customerId === cid),

  // v1.1.0 — WO checklist tasks. Sort by position so the list reads in
  // the order the lead/manager put items in. Returns [] if nothing exists.
  tasksForWO: (woId: string): WoTask[] =>
    Object.values(WO_TASKS)
      .filter(t => t.workOrderId === woId)
      .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label)),

  // Migration 0034 — AMC documents for a contract, newest first.
  docsForAmc: (amcId: string): AmcDocument[] =>
    Object.values(AMC_DOCUMENTS)
      .filter(d => d.amcId === amcId)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),

  // Migration 0039 — documents attached to a replacement, newest first.
  docsForReplacement: (rrId: string): ReplacementDocument[] =>
    Object.values(REPLACEMENT_DOCUMENTS)
      .filter(d => d.replacementRequestId === rrId)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),

  // Migration 0040 — Material Submittal selectors.
  submittalForProject: (projectId: string): MaterialSubmittal | null =>
    Object.values(MATERIAL_SUBMITTALS).find(s => s.projectId === projectId) ?? null,
  revisionsForSubmittal: (submittalId: string): MaterialSubmittalRevision[] =>
    Object.values(MATERIAL_SUBMITTAL_REVISIONS)
      .filter(r => r.submittalId === submittalId)
      .sort((a, b) => a.revisionNumber - b.revisionNumber),
  itemsForRevision: (revisionId: string): MaterialItem[] =>
    Object.values(MATERIAL_ITEMS)
      .filter(i => i.revisionId === revisionId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),

  // Migration 0042 — Shop Drawing selectors.
  drawingForProject: (projectId: string): ShopDrawing | null =>
    Object.values(SHOP_DRAWINGS).find(d => d.projectId === projectId) ?? null,
  revisionsForDrawing: (drawingId: string): ShopDrawingRevision[] =>
    Object.values(SHOP_DRAWING_REVISIONS)
      .filter(r => r.drawingId === drawingId)
      .sort((a, b) => a.revisionNumber - b.revisionNumber),
  filesForRevision: (revisionId: string): ShopDrawingFile[] =>
    Object.values(SHOP_DRAWING_FILES)
      .filter(f => f.revisionId === revisionId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),

  // Migration 0043 — JCA selectors.
  jcaForProject: (projectId: string): ProjectJca | null =>
    Object.values(PROJECT_JCA).find(j => j.projectId === projectId) ?? null,
  jcaHistoryForJca: (jcaId: string): ProjectJcaHistory[] =>
    Object.values(PROJECT_JCA_HISTORY)
      .filter(h => h.jcaId === jcaId)
      .sort((a, b) => a.editedAt.localeCompare(b.editedAt)),

  // Slice D — Design-phase readiness check.
  //
  // Used by the PhaseTracker "Move to Material Supply" gate AND by any
  // UI surface that wants to show "what's still missing" before the
  // project can leave Design. The DB trigger added in migration 0044
  // enforces the same rule server-side; this selector is the
  // user-facing mirror of that rule.
  //
  // Complete = Material Submittal has an approved revision
  //          + Shop Drawing has an approved revision
  //          + JCA row exists for the project.
  designReadiness: (projectId: string): DesignReadiness => {
    const submittal = Object.values(MATERIAL_SUBMITTALS).find(s => s.projectId === projectId) ?? null;
    const drawing   = Object.values(SHOP_DRAWINGS).find(d => d.projectId === projectId) ?? null;
    const jca       = Object.values(PROJECT_JCA).find(j => j.projectId === projectId) ?? null;

    const submittalApproved = submittal != null && submittal.approvedRevision != null;
    const drawingApproved   = drawing   != null && drawing.approvedRevision   != null;
    const jcaCreated        = jca != null;

    const missing: string[] = [];
    if (!submittalApproved) {
      missing.push(submittal == null
        ? "Material Submittal — not created"
        : "Material Submittal — no revision approved yet");
    }
    if (!drawingApproved) {
      missing.push(drawing == null
        ? "Shop Drawing — not created"
        : "Shop Drawing — no revision approved yet");
    }
    if (!jcaCreated) {
      missing.push("Job Cost Analysis — not created");
    }

    return {
      submittalApproved,
      drawingApproved,
      jcaCreated,
      isComplete: submittalApproved && drawingApproved && jcaCreated,
      missing,
    };
  },
};

// Shape returned by db.designReadiness. Exposed so the UI can pass it
// between components (AdvancePhaseButton renders the missing-items
// hint; the Design summary cards could surface it too).
export interface DesignReadiness {
  submittalApproved: boolean;
  drawingApproved:   boolean;
  jcaCreated:        boolean;
  isComplete:        boolean;
  /** Human-readable list of what's still missing, ordered M → S → J. */
  missing:           string[];
}
