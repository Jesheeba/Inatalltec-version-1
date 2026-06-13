// ============================================================
// Phase 6 — DLP (Defects Liability Period) data layer.
//
// Pure helpers for the dlp_tickets, dlp_ticket_photos and dlp_history
// tables (migration 0205). Mirrors lib/projects/tc.ts.
//
// The DLP window is DERIVED (not stored): start = handoverCompletedAt,
// end = start + dlpDurationMonths. computeDlpWindow + isReadyForClosed
// mirror the DB gate fn_check_dlp_gate.
// ============================================================

import type {
  DlpHistory,
  DlpTicket,
  DlpTicketPhoto,
  DlpTicketStatus,
  SnaggingSeverity,
} from "../types";

// ── Columns ─────────────────────────────────────────────────
export const DLP_TICKET_COLUMNS =
  "id, project_id, description, severity, status, assigned_to, reported_by, " +
  "reported_at, resolution_notes, resolved_by, resolved_at, last_action_by, " +
  "created_by, created_at, updated_at";

export const DLP_TICKET_PHOTO_COLUMNS =
  "id, ticket_id, storage_path, caption, uploaded_by, uploaded_at";

export const DLP_HISTORY_COLUMNS =
  "id, project_id, ticket_id, action, detail, from_status, to_status, changed_by, changed_at";

// ── Row mappers ─────────────────────────────────────────────
export function mapDlpTicketRow(row: Record<string, unknown>): DlpTicket {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    description: (row.description as string) ?? "",
    severity: ((row.severity as SnaggingSeverity) ?? "medium"),
    status: ((row.status as DlpTicketStatus) ?? "open"),
    assignedTo: (row.assigned_to as string | null) ?? null,
    reportedBy: (row.reported_by as string | null) ?? null,
    reportedAt: (row.reported_at as string) ?? "",
    resolutionNotes: (row.resolution_notes as string | null) ?? null,
    resolvedBy: (row.resolved_by as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    lastActionBy: (row.last_action_by as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function mapDlpTicketPhotoRow(row: Record<string, unknown>): DlpTicketPhoto {
  return {
    id: row.id as string,
    ticketId: row.ticket_id as string,
    storagePath: (row.storage_path as string) ?? "",
    caption: (row.caption as string | null) ?? null,
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    uploadedAt: (row.uploaded_at as string) ?? "",
  };
}

export function mapDlpHistoryRow(row: Record<string, unknown>): DlpHistory {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    ticketId: (row.ticket_id as string | null) ?? null,
    action: (row.action as string) ?? "",
    detail: (row.detail as string | null) ?? null,
    fromStatus: (row.from_status as DlpTicketStatus | null) ?? null,
    toStatus: (row.to_status as DlpTicketStatus | null) ?? null,
    changedBy: (row.changed_by as string | null) ?? null,
    changedAt: (row.changed_at as string) ?? "",
  };
}

// ── Status metadata ─────────────────────────────────────────
export const DLP_TICKET_STATUSES: readonly DlpTicketStatus[] = [
  "open",
  "in_progress",
  "fixed",
  "verified",
  "closed",
] as const;

export const DLP_TICKET_STATUS_LABEL: Record<DlpTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  fixed: "Fixed",
  verified: "Verified",
  closed: "Closed",
};

// A ticket blocks closure while it is anything other than 'closed'.
export function isOpenDlpTicket(t: DlpTicket): boolean {
  return t.status !== "closed";
}

// ── DLP window (derived) ────────────────────────────────────
export interface DlpWindow {
  started: boolean;
  startDate: Date | null;
  endDate: Date | null;
  totalDays: number;
  elapsedDays: number;
  daysRemaining: number;
  expired: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeDlpWindow(
  handoverCompletedAt: string | null,
  durationMonths: number,
  now: Date = new Date(),
): DlpWindow {
  if (!handoverCompletedAt) {
    return { started: false, startDate: null, endDate: null, totalDays: 0, elapsedDays: 0, daysRemaining: 0, expired: false };
  }
  const start = new Date(handoverCompletedAt);
  if (Number.isNaN(start.getTime())) {
    return { started: false, startDate: null, endDate: null, totalDays: 0, elapsedDays: 0, daysRemaining: 0, expired: false };
  }
  const end = new Date(start);
  end.setMonth(end.getMonth() + (durationMonths || 12));
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY));
  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY));
  const expired = now.getTime() >= end.getTime();
  return { started: true, startDate: start, endDate: end, totalDays, elapsedDays, daysRemaining, expired };
}

// ── Ticket progress ─────────────────────────────────────────
export interface DlpProgress {
  total: number;
  open: number;
  inProgress: number;
  fixed: number;
  verified: number;
  closed: number;
  /** open + in_progress + fixed + verified — everything not yet closed. */
  unresolved: number;
}

export function computeDlpProgress(tickets: readonly DlpTicket[]): DlpProgress {
  let open = 0, inProgress = 0, fixed = 0, verified = 0, closed = 0;
  for (const t of tickets) {
    switch (t.status) {
      case "open":        open++;       break;
      case "in_progress": inProgress++; break;
      case "fixed":       fixed++;      break;
      case "verified":    verified++;   break;
      case "closed":      closed++;     break;
    }
  }
  return { total: tickets.length, open, inProgress, fixed, verified, closed, unresolved: tickets.length - closed };
}

// Mirror of fn_check_dlp_gate (migration 0205). Ready to close when
// handover is done, the DLP window has expired, AND every ticket is
// closed. The DB trigger is authoritative.
export function isReadyForClosed(
  handoverCompletedAt: string | null,
  durationMonths: number,
  tickets: readonly DlpTicket[],
  now: Date = new Date(),
): boolean {
  if (!handoverCompletedAt) return false;
  const w = computeDlpWindow(handoverCompletedAt, durationMonths, now);
  return w.expired && !tickets.some(isOpenDlpTicket);
}

export interface DlpClosePending {
  handoverDone: boolean;
  periodActive: boolean;
  endDate: Date | null;
  daysRemaining: number;
  openTickets: DlpTicket[];
}

export function pendingForClosed(
  handoverCompletedAt: string | null,
  durationMonths: number,
  tickets: readonly DlpTicket[],
  now: Date = new Date(),
): DlpClosePending {
  const w = computeDlpWindow(handoverCompletedAt, durationMonths, now);
  return {
    handoverDone: !!handoverCompletedAt,
    periodActive: w.started && !w.expired,
    endDate: w.endDate,
    daysRemaining: w.daysRemaining,
    openTickets: tickets.filter(isOpenDlpTicket),
  };
}
