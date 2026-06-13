// ============================================================
// Phase 4 — Testing & Commissioning data layer.
//
// Pure helpers for the snagging_items, snagging_photos,
// zone_acceptances, acceptance_certificates and tc_history tables
// (migration 0203). Mirrors lib/projects/installation.ts:
//   • COLUMN constants — keep server SELECT lists and client mappers
//     in lock-step.
//   • Row mappers — DB shape → UI shape (lib/types.ts).
//   • Status / severity metadata — labels for the UI.
//   • Pure compute helpers — progress summary, handover-gate readiness.
//
// "Required zones" for the handover gate are the distinct non-empty
// zones from the project's installation_tasks — the areas where work
// happened. The UI computes that set from db.tasksForProject and passes
// it in, so this module stays free of cross-table queries and matches
// the DB trigger fn_check_tc_gate exactly.
// ============================================================

import type {
  AcceptanceCertificate,
  SnaggingItem,
  SnaggingPhoto,
  SnaggingSeverity,
  SnaggingStatus,
  TcHistory,
  ZoneAcceptance,
} from "../types";

// ── Columns ─────────────────────────────────────────────────
export const SNAGGING_ITEM_COLUMNS =
  "id, project_id, zone, description, severity, status, assigned_to, " +
  "reported_by, completed_by, completed_at, notes, last_action_by, " +
  "created_by, created_at, updated_at";

export const SNAGGING_PHOTO_COLUMNS =
  "id, snagging_item_id, storage_path, caption, uploaded_by, uploaded_at";

export const ZONE_ACCEPTANCE_COLUMNS =
  "id, project_id, zone, customer_name, customer_email, notes, " +
  "signed_at, signed_by_user_id, created_at, updated_at";

export const ACCEPTANCE_CERTIFICATE_COLUMNS =
  "id, project_id, certificate_number, issued_to, scope_summary, " +
  "generated_by, generated_at, created_at";

export const TC_HISTORY_COLUMNS =
  "id, project_id, entity_kind, entity_id, action, detail, " +
  "from_status, to_status, changed_by, changed_at";

// ── Row mappers (DB row → UI shape) ─────────────────────────
export function mapSnaggingItemRow(row: Record<string, unknown>): SnaggingItem {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    zone: (row.zone as string | null) ?? null,
    description: (row.description as string) ?? "",
    severity: ((row.severity as SnaggingSeverity) ?? "medium"),
    status: ((row.status as SnaggingStatus) ?? "open"),
    assignedTo: (row.assigned_to as string | null) ?? null,
    reportedBy: (row.reported_by as string | null) ?? null,
    completedBy: (row.completed_by as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    lastActionBy: (row.last_action_by as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function mapSnaggingPhotoRow(row: Record<string, unknown>): SnaggingPhoto {
  return {
    id: row.id as string,
    snaggingItemId: row.snagging_item_id as string,
    storagePath: (row.storage_path as string) ?? "",
    caption: (row.caption as string | null) ?? null,
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    uploadedAt: (row.uploaded_at as string) ?? "",
  };
}

export function mapZoneAcceptanceRow(row: Record<string, unknown>): ZoneAcceptance {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    zone: (row.zone as string) ?? "",
    customerName: (row.customer_name as string) ?? "",
    customerEmail: (row.customer_email as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    signedAt: (row.signed_at as string) ?? "",
    signedByUserId: (row.signed_by_user_id as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function mapAcceptanceCertificateRow(row: Record<string, unknown>): AcceptanceCertificate {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    certificateNumber: (row.certificate_number as string | null) ?? null,
    issuedTo: (row.issued_to as string | null) ?? null,
    scopeSummary: (row.scope_summary as string | null) ?? null,
    generatedBy: (row.generated_by as string | null) ?? null,
    generatedAt: (row.generated_at as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
  };
}

export function mapTcHistoryRow(row: Record<string, unknown>): TcHistory {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    entityKind: (row.entity_kind as string) ?? "",
    entityId: (row.entity_id as string | null) ?? null,
    action: (row.action as string) ?? "",
    detail: (row.detail as string | null) ?? null,
    fromStatus: (row.from_status as SnaggingStatus | null) ?? null,
    toStatus: (row.to_status as SnaggingStatus | null) ?? null,
    changedBy: (row.changed_by as string | null) ?? null,
    changedAt: (row.changed_at as string) ?? "",
  };
}

// ── Status / severity metadata (used by the UI) ─────────────
export const SNAGGING_STATUSES: readonly SnaggingStatus[] = [
  "open",
  "in_progress",
  "fixed",
  "verified",
] as const;

export const SNAGGING_STATUS_LABEL: Record<SnaggingStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  fixed: "Fixed",
  verified: "Verified",
};

export const SNAGGING_SEVERITIES: readonly SnaggingSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const SNAGGING_SEVERITY_LABEL: Record<SnaggingSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

// A snag still blocks handover while it is open or in-progress.
export function isBlockingSnag(s: SnaggingItem): boolean {
  return s.status === "open" || s.status === "in_progress";
}

// ── Zone helpers ────────────────────────────────────────────
// Case-insensitive zone matching mirrors the DB gate (lower(trim(zone))).
export function normalizeZone(z: string | null | undefined): string {
  return (z ?? "").trim().toLowerCase();
}

/** Distinct, trimmed, non-empty zone names from a list (first-seen order). */
export function distinctZones(zones: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const z of zones) {
    const trimmed = (z ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Set of normalized zone names that have a customer acceptance. */
export function signedZoneSet(acceptances: readonly ZoneAcceptance[]): Set<string> {
  return new Set(acceptances.map(a => normalizeZone(a.zone)));
}

// ── Progress + readiness helpers ────────────────────────────
export interface TcProgress {
  totalZones: number;
  signedZones: number;
  /** Percent of zones with a customer sign-off. 0 when there are none. */
  percentSigned: number;
  totalSnags: number;
  openSnags: number;
  inProgressSnags: number;
  fixedSnags: number;
  verifiedSnags: number;
  /** open + in_progress — the snags that block handover. */
  blockingSnags: number;
}

export function computeTcProgress(
  zones: readonly string[],
  acceptances: readonly ZoneAcceptance[],
  snags: readonly SnaggingItem[],
): TcProgress {
  const signed = signedZoneSet(acceptances);
  const distinct = distinctZones(zones);
  const signedZones = distinct.filter(z => signed.has(normalizeZone(z))).length;

  let open = 0, inProgress = 0, fixed = 0, verified = 0;
  for (const s of snags) {
    switch (s.status) {
      case "open":        open++;       break;
      case "in_progress": inProgress++; break;
      case "fixed":       fixed++;      break;
      case "verified":    verified++;   break;
    }
  }
  const totalZones = distinct.length;
  return {
    totalZones,
    signedZones,
    percentSigned: totalZones === 0 ? 0 : Math.round((signedZones / totalZones) * 100),
    totalSnags: snags.length,
    openSnags: open,
    inProgressSnags: inProgress,
    fixedSnags: fixed,
    verifiedSnags: verified,
    blockingSnags: open + inProgress,
  };
}

/** Zones (from the required set) that still lack a customer sign-off. */
export function unsignedZones(
  requiredZones: readonly string[],
  acceptances: readonly ZoneAcceptance[],
): string[] {
  const signed = signedZoneSet(acceptances);
  return distinctZones(requiredZones).filter(z => !signed.has(normalizeZone(z)));
}

// Mirror of fn_check_tc_gate (migration 0203). Ready when every required
// (installation) zone is signed AND no snag is open/in-progress. The DB
// trigger is authoritative; this is the user-facing mirror used to
// disable the "Advance to Handover" button and render the hint panel.
export function isReadyForHandover(
  requiredZones: readonly string[],
  acceptances: readonly ZoneAcceptance[],
  snags: readonly SnaggingItem[],
): boolean {
  return unsignedZones(requiredZones, acceptances).length === 0
    && !snags.some(isBlockingSnag);
}

export interface TcGatePending {
  unsignedZones: string[];
  blockingSnags: SnaggingItem[];
}

// Lists what's still blocking the handover advance, by category.
export function pendingItemsForGate(
  requiredZones: readonly string[],
  acceptances: readonly ZoneAcceptance[],
  snags: readonly SnaggingItem[],
): TcGatePending {
  return {
    unsignedZones: unsignedZones(requiredZones, acceptances),
    blockingSnags: snags.filter(isBlockingSnag),
  };
}
