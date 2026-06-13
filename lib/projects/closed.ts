// ============================================================
// Phase 7 — Closed data layer.
//
// Pure helpers for the closure_checklist, closure_summary and
// closure_history tables (migration 0206). Mirrors the other phase
// data layers.
// ============================================================

import type {
  ClosureChecklistItem,
  ClosureHistory,
  ClosureSummary,
} from "../types";

// ── Columns ─────────────────────────────────────────────────
export const CLOSURE_CHECKLIST_COLUMNS =
  "id, project_id, item, is_completed, completed_at, completed_by, " +
  "sort_order, last_action_by, created_at, updated_at";

export const CLOSURE_SUMMARY_COLUMNS =
  "id, project_id, final_total_cost, total_invoiced, total_received, " +
  "total_paid_out, notes, closed_by, closed_at, created_at, updated_at";

export const CLOSURE_HISTORY_COLUMNS =
  "id, project_id, entity_kind, entity_id, action, detail, changed_by, changed_at";

// ── Row mappers ─────────────────────────────────────────────
export function mapClosureChecklistRow(row: Record<string, unknown>): ClosureChecklistItem {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    item: (row.item as string) ?? "",
    isCompleted: Boolean(row.is_completed),
    completedAt: (row.completed_at as string | null) ?? null,
    completedBy: (row.completed_by as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    lastActionBy: (row.last_action_by as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function mapClosureSummaryRow(row: Record<string, unknown>): ClosureSummary {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    finalTotalCost: Number(row.final_total_cost ?? 0),
    totalInvoiced: Number(row.total_invoiced ?? 0),
    totalReceived: Number(row.total_received ?? 0),
    totalPaidOut: Number(row.total_paid_out ?? 0),
    notes: (row.notes as string | null) ?? null,
    closedBy: (row.closed_by as string | null) ?? null,
    closedAt: (row.closed_at as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function mapClosureHistoryRow(row: Record<string, unknown>): ClosureHistory {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    entityKind: (row.entity_kind as string) ?? "",
    entityId: (row.entity_id as string | null) ?? null,
    action: (row.action as string) ?? "",
    detail: (row.detail as string | null) ?? null,
    changedBy: (row.changed_by as string | null) ?? null,
    changedAt: (row.changed_at as string) ?? "",
  };
}

// ── Progress ────────────────────────────────────────────────
export interface ClosureProgress {
  total: number;
  completed: number;
  percentComplete: number;
}

export function computeClosureProgress(checklist: readonly ClosureChecklistItem[]): ClosureProgress {
  const total = checklist.length;
  const completed = checklist.filter(c => c.isCompleted).length;
  return {
    total,
    completed,
    percentComplete: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
