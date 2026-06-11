// ============================================================
// Role-based UI permissions for Installtec.
//
// Two surfaces in this file:
//   1. PERMISSIONS — which actions (create/view-all/etc.) each role
//      is allowed to perform.
//   2. listScopeFor — for list pages, returns whether the current
//      user sees "all" rows, just "mine" rows, or the page is "hidden"
//      from them entirely (sidebar gating elsewhere).
//
// Server-side RLS (migration 0016) is the authoritative gate; the
// helpers here mirror those policies in the UI so users don't see
// buttons they'd be 403'd on. Whenever you tighten RLS, update
// PERMISSIONS so the UI stays in sync.
//
// super_admin is intentionally NOT listed in any PERMISSIONS set.
// At sign-in we promote super_admin's effective DB role to 'admin'
// (see app/(app)/layout.tsx), so server-side they pass admin checks.
// Operational UI views still hide super_admin from pickers via the
// CORE_OPERATIONAL_ROLES filter in lib/db.ts.
// ============================================================

import type { Role } from "./types";

export type PermissionAction =
  // Create flows — gate Picker items, "+ New X" buttons, and form
  // render-time checks.
  | "CREATE_PROJECT"
  | "CREATE_AMC"
  | "CREATE_REPAIR"
  | "CREATE_CUSTOMER"
  | "CREATE_SITE"
  | "CREATE_WORK_ORDER"
  | "CREATE_MATERIAL_REQUEST"
  | "MANAGE_MATERIAL_REQUEST"
  | "CREATE_REPLACEMENT"
  | "CREATE_USER"
  | "CREATE_TEAM_MEMBER"
  | "CREATE_QUOTATION"
  | "CREATE_ORGANIZATION"
  // Design phase (migration 0040+). MANAGE_DESIGN = do the work (Material
  // Submittal / Shop Drawing / JCA). VIEW_DESIGN_DOCS = read-only access to
  // Material Submittal + Shop Drawing (Lead Tech sees what they'll build;
  // Sales may discuss with the client). JCA visibility is separate (Accounts).
  | "MANAGE_DESIGN"
  | "VIEW_DESIGN_DOCS"
  // JCA (migration 0043). Internal budget — different audience from the
  // design docs: Accounts can VIEW (billing/finance) but not edit; Sales
  // and Lead Tech are excluded entirely. MANAGE_JCA = edit/create.
  | "MANAGE_JCA"
  | "VIEW_JCA"
  // Accountant module (migration 0045+). Isolated finance area. VIEW_ACCOUNTING
  // gates the whole module (incl. Manager, read-mostly). MANAGE_ACCOUNTING_SETTINGS
  // gates editing the configurable settings (tax, prefixes, terms, aging, payment
  // methods). Phase-specific powers (manage invoices, approve, etc.) get their own
  // actions in later phases.
  | "VIEW_ACCOUNTING"
  | "MANAGE_ACCOUNTING_SETTINGS"
  // Invoices (migration 0046). MANAGE_INVOICES = create/edit drafts, send,
  // record payments, void (Accountant + Admin/MD). APPROVE_INVOICES =
  // approve a submitted invoice (Manager + Admin/MD) — segregation of duties.
  | "MANAGE_INVOICES"
  | "APPROVE_INVOICES"
  // Vendors + Purchase Orders (Phase 2, migrations 0047-0048). MANAGE_VENDORS
  // = maintain the vendor master (Accountant + Admin/MD). MANAGE_POS =
  // create/edit PO drafts, issue, receive goods, close (Accountant + Admin/MD).
  // APPROVE_POS = approve a submitted PO (Manager + Admin/MD) — segregation
  // of duties, mirroring invoices.
  | "MANAGE_VENDORS"
  | "MANAGE_POS"
  | "APPROVE_POS"
  // "View all" gates — when false, the page either hides or scopes
  // its list to rows the user is directly involved in. The page
  // helpers below resolve "what does involved mean" per entity.
  | "VIEW_ALL_PROJECTS"
  | "VIEW_ALL_AMC"
  | "VIEW_ALL_REPAIRS"
  | "VIEW_ALL_CUSTOMERS"
  | "VIEW_ALL_SITES"
  | "VIEW_ALL_WORK_ORDERS";

export const PERMISSIONS: Record<PermissionAction, Role[]> = {
  // ── Creates ───────────────────────────────────────────────
  CREATE_PROJECT:           ["admin", "md", "manager"],
  CREATE_AMC:               ["admin", "md", "manager"],
  CREATE_REPAIR:            ["admin", "md", "manager"],
  CREATE_CUSTOMER:          ["admin", "md", "manager", "sales"],
  CREATE_SITE:              ["admin", "md", "manager", "lead_worker"],
  CREATE_WORK_ORDER:        ["admin", "md", "manager", "lead_worker"],
  // Field-execution staff raise material requests from the WO they're on
  // (migration 0038 widened this from the original manager-only set so
  // technicians + subcontractors can request from the field).
  CREATE_MATERIAL_REQUEST:  ["admin", "md", "manager", "lead_worker", "worker", "subcontractor"],
  // Approve / reject / fulfil a material request — operational decision,
  // restricted to the management roles who own the contract terms.
  MANAGE_MATERIAL_REQUEST:  ["admin", "md", "manager"],
  // Drivers explicitly excluded — they don't do replacements (spec).
  // Sales / Accounts / Service Support also excluded (not field-execution roles).
  CREATE_REPLACEMENT:       ["admin", "md", "manager", "lead_worker", "worker", "subcontractor"],
  // Full system-user creation (any role, incl. office/admin staff) — admin only.
  CREATE_USER:              ["admin"],
  // Adding field-execution staff (worker / lead / driver / subcontractor) to the
  // Team roster. Lead Technicians assign work orders, so they need to be able to
  // onboard the subcontractors and crew they assign. Office/admin roles cannot be
  // minted through this path — that stays CREATE_USER (admin only).
  CREATE_TEAM_MEMBER:       ["admin", "md", "manager", "lead_worker"],
  CREATE_QUOTATION:         ["admin", "md", "manager", "sales"],
  CREATE_ORGANIZATION:      [], // super_admin only — handled separately
  // Design phase. Edit = Ops Manager / Admin / MD. Read = those + Lead Tech
  // (sees what they'll build) + Sales (client discussion). Accounts is NOT
  // here — they get JCA-only visibility via a separate gate in a later slice.
  MANAGE_DESIGN:            ["admin", "md", "manager"],
  VIEW_DESIGN_DOCS:         ["admin", "md", "manager", "lead_worker", "sales"],
  // JCA — edit = OM/Admin/MD; view adds Accounts (read-only). Sales /
  // Lead Tech / Workers see nothing.
  MANAGE_JCA:               ["admin", "md", "manager"],
  VIEW_JCA:                 ["admin", "md", "manager", "accounts"],
  // Accountant module. View = the finance audience (Manager sees it read-mostly);
  // settings editing = Accountant + Admin/MD (Manager is view-only on config).
  VIEW_ACCOUNTING:          ["admin", "md", "manager", "accounts"],
  MANAGE_ACCOUNTING_SETTINGS: ["admin", "md", "accounts"],
  // Invoices: Accountant does the work; Manager (+ Admin/MD) approves.
  MANAGE_INVOICES:          ["admin", "md", "accounts"],
  APPROVE_INVOICES:         ["admin", "md", "manager"],
  // Vendors + POs: Accountant does the work; Manager (+ Admin/MD) approves POs.
  MANAGE_VENDORS:           ["admin", "md", "accounts"],
  MANAGE_POS:               ["admin", "md", "accounts"],
  APPROVE_POS:              ["admin", "md", "manager"],

  // ── View-all gates ───────────────────────────────────────
  VIEW_ALL_PROJECTS:        ["admin", "md", "manager"],
  VIEW_ALL_AMC:             ["admin", "md", "manager", "accounts"],
  VIEW_ALL_REPAIRS:         ["admin", "md", "manager", "service_support"],
  VIEW_ALL_CUSTOMERS:       ["admin", "md", "manager", "sales", "service_support"],
  VIEW_ALL_SITES:           ["admin", "md", "manager", "lead_worker"],
  VIEW_ALL_WORK_ORDERS:     ["admin", "md", "manager"],
};

/**
 * Allow-list check. Returns true when the role appears in the action's
 * permission set. super_admin is always treated as "yes" because it's
 * promoted to admin at the DB layer.
 */
export function can(role: Role, action: PermissionAction): boolean {
  if (role === "super_admin") return true;
  return PERMISSIONS[action].includes(role);
}

/**
 * Returns true when the role has at least one CREATE permission. Used
 * by the topbar to hide the "+ Create" button when the user can't
 * create anything via the picker.
 */
export function canCreateAnything(role: Role): boolean {
  if (role === "super_admin") return false; // platform role, separate flow
  return (
    can(role, "CREATE_PROJECT") ||
    can(role, "CREATE_AMC") ||
    can(role, "CREATE_REPAIR") ||
    can(role, "CREATE_CUSTOMER") ||
    can(role, "CREATE_SITE") ||
    can(role, "CREATE_WORK_ORDER") ||
    can(role, "CREATE_MATERIAL_REQUEST") ||
    can(role, "CREATE_USER") ||
    can(role, "CREATE_TEAM_MEMBER") ||
    can(role, "CREATE_QUOTATION")
  );
}

// ============================================================
// List-page scoping
// ============================================================
// Each list page resolves visibility into one of three buckets:
//   - "all"    : show everything (manager+admin view)
//   - "mine"   : show only rows the user is involved in
//                (lead_worker projects/amcs/repairs they have WOs on,
//                 worker/driver WOs assigned to them, etc.)
//   - "hidden" : the page should refuse to render (sidebar already
//                hides it; defense-in-depth for direct-URL access)
// ============================================================
export type ListScope = "all" | "mine" | "hidden";

export type ListEntity =
  | "projects" | "amc" | "repairs" | "customers" | "sites" | "workorders"
  | "material_requests";

export function listScopeFor(role: Role, entity: ListEntity): ListScope {
  // super_admin sees everything (platform-level admin).
  if (role === "super_admin") return "all";

  switch (entity) {
    case "projects":
      // accounts gets the full list so they can open any project and reach
      // the JCA card (migration 0043). They still don't see the Material
      // Submittal / Shop Drawing cards — VIEW_DESIGN_DOCS excludes them.
      if (role === "admin" || role === "md" || role === "manager" || role === "accounts") return "all";
      if (role === "lead_worker") return "mine";
      // workers / drivers / subcontractors / sales / etc.
      return "hidden";

    case "amc":
      if (role === "admin" || role === "md" || role === "manager" || role === "accounts") return "all";
      if (role === "lead_worker") return "mine";
      return "hidden";

    case "repairs":
      if (role === "admin" || role === "md" || role === "manager" || role === "service_support") return "all";
      if (role === "lead_worker") return "mine";
      return "hidden";

    case "customers":
      if (role === "admin" || role === "md" || role === "manager" || role === "sales" || role === "service_support") return "all";
      return "hidden";

    case "sites":
      if (role === "admin" || role === "md" || role === "manager" || role === "lead_worker") return "all";
      if (role === "worker" || role === "driver") return "mine";
      return "hidden";

    case "workorders":
      if (role === "admin" || role === "md" || role === "manager") return "all";
      // lead_worker sees their crew's WOs + their own assignments — for
      // the list filter, "mine" semantics include both (WO involvement
      // is computed in the list page by union of assigned_lead, member
      // of work_order_assignments, and project they manage).
      if (role === "lead_worker") return "mine";
      if (role === "worker" || role === "driver" || role === "subcontractor") return "mine";
      return "hidden";

    case "material_requests":
      // Managers/admin run the procurement review; accounts gets a
      // read-only all-view for budgeting. Field staff see the ones they
      // raised or are assigned to (computed in the list page).
      if (role === "admin" || role === "md" || role === "manager" || role === "accounts") return "all";
      if (role === "lead_worker" || role === "worker" || role === "subcontractor") return "mine";
      return "hidden";
  }
}
