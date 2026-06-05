// ============================================================
// Worker schedule conflict detection.
//
// Looks across the in-memory db.WORK_ORDERS for any active WO whose
// time window overlaps a candidate window for a given worker. Used by
// the Work Order creation/edit form to warn the Lead Tech before they
// double-book someone, and by the field dashboard to surface conflicts
// on the worker's own task list.
//
// Behaviour:
//   • Terminal WOs (done / closed / cancelled) never raise a conflict —
//     they're history, not load.
//   • A worker counts as on a WO if they're the assignedLead OR appear
//     in the additional-assignees array (work_order_assignments).
//   • The check is informational only — the Lead Tech can still
//     override. The UI is responsible for surfacing the warning.
//
// Pure read-only helper. No mutation, no async. Safe to call on every
// keystroke in the form. Scans db.WORK_ORDERS (typically a few hundred
// rows) so cost is O(n) per call — fine without memoisation.
// ============================================================

import { db } from "./db";
import { formatMonthDay } from "./dates";

export interface WorkerConflict {
  workOrderId:    string;
  code:           string;
  title:          string;
  scheduledStart: string;  // ISO timestamp
  scheduledEnd:   string;  // ISO timestamp
  /** Lead role on the conflicting WO, useful for the Lead Tech warning copy. */
  isLead:         boolean;
}

/**
 * Every active WO that overlaps [windowStart, windowEnd] for the given
 * worker. Pass excludeWoId when editing an existing WO so it doesn't
 * conflict with itself.
 *
 * Window inputs accept anything `new Date()` understands — ISO strings,
 * datetime-local strings, etc. Returns [] for invalid or zero-length
 * windows.
 */
export function getWorkerConflictsFor(
  workerId:     string,
  windowStart:  string,
  windowEnd:    string,
  excludeWoId?: string,
): WorkerConflict[] {
  if (!workerId || !windowStart || !windowEnd) return [];
  const start = new Date(windowStart).getTime();
  const end   = new Date(windowEnd).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return [];

  const out: WorkerConflict[] = [];
  for (const w of Object.values(db.WORK_ORDERS)) {
    if (excludeWoId && w.id === excludeWoId) continue;
    if (w.status === "cancelled" || w.status === "done" || w.status === "closed") continue;
    const isLead     = w.assignedLead === workerId;
    const isAssigned = (w.assigned ?? []).includes(workerId);
    if (!isLead && !isAssigned) continue;

    const wStart = new Date(w.scheduledStart).getTime();
    const wEnd   = new Date(w.scheduledEnd).getTime();
    if (Number.isNaN(wStart) || Number.isNaN(wEnd)) continue;
    // Standard half-open interval overlap: [wStart, wEnd) ∩ [start, end)
    // is non-empty iff wStart < end AND wEnd > start.
    if (wStart < end && wEnd > start) {
      out.push({
        workOrderId:    w.id,
        code:           w.code,
        title:          w.title,
        scheduledStart: w.scheduledStart,
        scheduledEnd:   w.scheduledEnd,
        isLead,
      });
    }
  }
  // Earliest conflict first — the form warning typically shows just the
  // first one, so this is the most informative order.
  out.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  return out;
}

/** Yes/no convenience over getWorkerConflictsFor. */
export function hasWorkerConflict(
  workerId:     string,
  windowStart:  string,
  windowEnd:    string,
  excludeWoId?: string,
): boolean {
  return getWorkerConflictsFor(workerId, windowStart, windowEnd, excludeWoId).length > 0;
}

/**
 * Sub-contractor variant: every active WO that overlaps [windowStart, windowEnd]
 * for the given sub-contractor. Reads the WORK_ORDER_SUB_CONTRACTORS join
 * mirror (migration 0023) instead of WO.assignedLead / assigned[]. Same
 * overlap rules, same terminal-status filter as the worker variant — so the
 * UI can treat the returned shape interchangeably.
 */
export function getSubContractorConflictsFor(
  subId:        string,
  windowStart:  string,
  windowEnd:    string,
  excludeWoId?: string,
): WorkerConflict[] {
  if (!subId || !windowStart || !windowEnd) return [];
  const start = new Date(windowStart).getTime();
  const end   = new Date(windowEnd).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return [];

  const out: WorkerConflict[] = [];
  for (const j of db.woAssignmentsForSub(subId)) {
    if (excludeWoId && j.workOrderId === excludeWoId) continue;
    const w = db.WORK_ORDERS[j.workOrderId];
    if (!w) continue;
    if (w.status === "cancelled" || w.status === "done" || w.status === "closed") continue;
    const wStart = new Date(w.scheduledStart).getTime();
    const wEnd   = new Date(w.scheduledEnd).getTime();
    if (Number.isNaN(wStart) || Number.isNaN(wEnd)) continue;
    if (wStart < end && wEnd > start) {
      out.push({
        workOrderId:    w.id,
        code:           w.code,
        title:          w.title,
        scheduledStart: w.scheduledStart,
        scheduledEnd:   w.scheduledEnd,
        isLead:         false,
      });
    }
  }
  out.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  return out;
}

/**
 * Format a conflict for inline display: "WO-1234 · 11:00–13:00 on May 21".
 * Keeps the formatting consistent between the create-form warning and
 * the dashboard badge so users learn one shape.
 */
export function formatConflictLabel(c: WorkerConflict): string {
  const s = new Date(c.scheduledStart);
  const e = new Date(c.scheduledEnd);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return c.code;
  const sameDay = s.toDateString() === e.toDateString();
  const time = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (d: Date) => formatMonthDay(d);
  if (sameDay) return `${c.code} · ${time(s)}–${time(e)} on ${day(s)}`;
  return `${c.code} · ${day(s)} ${time(s)} → ${day(e)} ${time(e)}`;
}
