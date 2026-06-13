// ============================================================
// Phase 2 — Material Supply data layer.
//
// Pure helpers for the project_materials and project_material_history
// tables (migration 0201). Mirrors the shape of lib/notifications.ts:
//   • COLUMN constants — keep server SELECT lists and client mappers
//     in lock-step.
//   • Row mappers — DB shape → UI shape (lib/types.ts).
//   • Pure compute helpers — progress summary, phase-gate readiness.
//
// Selectors that traverse the in-memory mirror live in lib/db.ts
// (materialsForProject / materialHistoryForMaterial), consistent with
// how every other Phase 1 / 0040-0043 selector is exposed. The
// computational utilities here operate on already-resolved arrays
// so the same logic can serve any caller (UI, reports, the future
// MS-C phase-advance button).
// ============================================================

import type {
  ProjectMaterial,
  ProjectMaterialHistory,
  ProjectMaterialStatus,
} from "../types";

// ── Columns ─────────────────────────────────────────────────
export const PROJECT_MATERIAL_COLUMNS =
  "id, project_id, source_material_item_id, description, model_number, " +
  "quantity_planned, status, po_line_item_id, " +
  "quantity_received_warehouse, quantity_delivered_site, notes, " +
  "last_action_by, created_by, created_at, updated_at";

export const PROJECT_MATERIAL_HISTORY_COLUMNS =
  "id, material_id, action, detail, from_status, to_status, " +
  "qty_delta, changed_by, changed_at";

// ── Row mappers (DB row → UI shape) ─────────────────────────
export function mapProjectMaterialRow(row: Record<string, unknown>): ProjectMaterial {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    sourceMaterialItemId: (row.source_material_item_id as string | null) ?? null,
    description: (row.description as string) ?? "",
    modelNumber: (row.model_number as string | null) ?? null,
    quantityPlanned: Number(row.quantity_planned ?? 0),
    status: ((row.status as ProjectMaterialStatus) ?? "not_ordered"),
    poLineItemId: (row.po_line_item_id as string | null) ?? null,
    quantityReceivedWarehouse: Number(row.quantity_received_warehouse ?? 0),
    quantityDeliveredSite: Number(row.quantity_delivered_site ?? 0),
    notes: (row.notes as string | null) ?? null,
    lastActionBy: (row.last_action_by as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function mapProjectMaterialHistoryRow(
  row: Record<string, unknown>,
): ProjectMaterialHistory {
  return {
    id: row.id as string,
    materialId: row.material_id as string,
    action: (row.action as string) ?? "",
    detail: (row.detail as string | null) ?? null,
    fromStatus: (row.from_status as ProjectMaterialStatus | null) ?? null,
    toStatus: (row.to_status as ProjectMaterialStatus | null) ?? null,
    qtyDelta: row.qty_delta == null ? null : Number(row.qty_delta),
    changedBy: (row.changed_by as string | null) ?? null,
    changedAt: (row.changed_at as string) ?? "",
  };
}

// ── Status metadata (used by the MS-B UI) ───────────────────
// Centralizing the label / order / tone here lets the UI pick a chip
// or pill style without re-declaring the enum mapping at the render
// site. Order matches the natural workflow (not_ordered → … → site)
// so progress strips render correctly.
export const PROJECT_MATERIAL_STATUSES: readonly ProjectMaterialStatus[] = [
  "not_ordered",
  "ordered",
  "received_at_warehouse",
  "delivered_to_site",
  "cancelled",
  "issue",
] as const;

export const PROJECT_MATERIAL_STATUS_LABEL: Record<ProjectMaterialStatus, string> = {
  not_ordered: "Not ordered",
  ordered: "Ordered",
  received_at_warehouse: "Received (warehouse)",
  delivered_to_site: "Delivered to site",
  cancelled: "Cancelled",
  issue: "Issue",
};

// ── Progress + readiness helpers ────────────────────────────
export interface MaterialSupplyProgress {
  total: number;
  notOrdered: number;
  ordered: number;
  receivedWarehouse: number;
  deliveredSite: number;
  cancelled: number;
  issue: number;
  /** Percent of materials in 'delivered_to_site' state. 0 when total = 0. */
  percentDelivered: number;
}

export function computeMaterialSupplyProgress(
  materials: readonly ProjectMaterial[],
): MaterialSupplyProgress {
  const total = materials.length;
  let notOrdered = 0;
  let ordered = 0;
  let receivedWarehouse = 0;
  let deliveredSite = 0;
  let cancelled = 0;
  let issue = 0;
  for (const m of materials) {
    switch (m.status) {
      case "not_ordered":           notOrdered++;        break;
      case "ordered":               ordered++;           break;
      case "received_at_warehouse": receivedWarehouse++; break;
      case "delivered_to_site":     deliveredSite++;     break;
      case "cancelled":             cancelled++;         break;
      case "issue":                 issue++;             break;
    }
  }
  const percentDelivered =
    total === 0 ? 0 : Math.round((deliveredSite / total) * 100);
  return {
    total, notOrdered, ordered, receivedWarehouse,
    deliveredSite, cancelled, issue, percentDelivered,
  };
}

// Mirror of fn_check_material_supply_gate (migration 0201). The DB
// trigger is the authoritative check; this is the user-facing mirror
// used to disable the "Advance to Installation" button in MS-C and
// to render a "what's pending" hint. Empty materials list passes
// (defensive no-op — matches the trigger's behaviour).
export function isReadyForInstallation(
  materials: readonly ProjectMaterial[],
): boolean {
  if (materials.length === 0) return true;
  return materials.every(
    m => m.status === "delivered_to_site" || m.status === "cancelled",
  );
}

// Lists the items still blocking the phase advance. Empty array means
// the gate passes. Used by the MS-C hint panel.
export function pendingMaterialsForGate(
  materials: readonly ProjectMaterial[],
): ProjectMaterial[] {
  return materials.filter(
    m => m.status !== "delivered_to_site" && m.status !== "cancelled",
  );
}
