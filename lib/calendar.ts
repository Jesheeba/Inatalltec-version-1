// ============================================================
// Growth Plan — calendar aggregation layer.
//
// Reads the in-memory db (projects, AMC service visits, work orders)
// and produces a unified CalendarEvent stream. Pure data layer — no
// React, no rendering. components/modules/GrowthPlan.tsx consumes the
// output to draw month / week / list views and the filter bar.
//
// Role scoping mirrors the rest of the app (lib/permissions.ts + how
// the dashboards already filter by user):
//   admin / md / manager / accounts / sales / service_support /
//   estimator                                  → see everything
//   lead_worker                                → only projects + AMCs
//                                                they lead, plus WOs
//                                                they lead or are
//                                                assigned to
//   worker / driver / subcontractor            → only WOs they are
//                                                assigned to
//
// Field-name notes (vs. what an early spec assumed):
//   • Project uses .customer / .site / .leadTechId
//   • WorkOrder uses .customer / .site / .scheduledStart /
//     .scheduledEnd / .assigned / .assignedLead
//   • AmcService uses .scheduledDate (YYYY-MM-DD) — turned into a
//     local Date at noon to keep the visit on the right day in every
//     timezone the user might land on.
// ============================================================

import { db } from "./db";
import type {
  AmcContract, AmcService, CalendarEvent, CalendarEventKind,
  CalendarFilter, Project, Role, WorkOrder,
} from "./types";

// ── Color tokens ──────────────────────────────────────────
// Hex literals (not CSS vars) — the calendar paints inline styles on
// many event chips at once and `var(--…)` would lose us the ability to
// blend / alpha-shift in JS. These match the design tokens used in
// status badges elsewhere so the visual language stays consistent.
export const CAL_COLORS = {
  project:           "#3B82F6", // blue
  amc_visit:         "#10B981", // green
  amc_visit_done:    "#059669", // deeper green for completed
  work_order:        "#F59E0B", // amber/orange
  work_order_high:   "#EF4444", // red for high-priority
  work_order_done:   "#9CA3AF", // grey for done/closed/cancelled
  free_call:         "#EA580C", // deep orange — auto-created WOs from AMC free calls
} as const;

/**
 * Pick a color for an event based on kind + status. Caller may further
 * fade it with CSS opacity for past events; this returns the raw hex.
 */
export function getEventColor(kind: CalendarEventKind, status?: string, priority?: string): string {
  if (kind === "work_order") {
    if (status === "done" || status === "closed" || status === "cancelled") return CAL_COLORS.work_order_done;
    if (priority && priority.toLowerCase() === "high")                       return CAL_COLORS.work_order_high;
    return CAL_COLORS.work_order;
  }
  if (kind === "amc_visit") {
    if (status === "completed") return CAL_COLORS.amc_visit_done;
    return CAL_COLORS.amc_visit;
  }
  return CAL_COLORS.project;
}

// ── Role scoping ──────────────────────────────────────────
const SEES_EVERYTHING: ReadonlySet<Role> = new Set<Role>([
  "admin", "md", "manager", "accounts", "sales", "service_support", "estimator",
]);
const FIELD_ROLES: ReadonlySet<Role> = new Set<Role>([
  "worker", "driver", "subcontractor",
]);

export function canSeeAllCalendar(role: Role): boolean { return SEES_EVERYTHING.has(role); }
export function isLeadOnlyCalendar(role: Role): boolean { return role === "lead_worker"; }
export function isFieldOnlyCalendar(role: Role): boolean { return FIELD_ROLES.has(role); }

// ── Mappers ───────────────────────────────────────────────

/**
 * Project → CalendarEvent. A project's bar spans started_at → due_at.
 * If due_at is missing we render a 1-day event at started_at (the spec
 * calls this out under edge cases). If started_at is missing too the
 * project is unrenderable as a calendar event and we return null.
 */
export function projectToCalendarEvent(p: Project): CalendarEvent | null {
  if (!p.startedAt) return null;
  const start = parseDateOnly(p.startedAt);
  if (!start) return null;
  // dueAt is "" when unset (lib/hydrate.ts:122 maps to empty string).
  const end = p.dueAt ? parseDateOnly(p.dueAt) : null;
  const customer = db.cust(p.customer);
  const site = db.site(p.site);
  const lead = p.leadTechId ? db.user(p.leadTechId) : null;
  // Title format: "<CODE> · <NAME>" so the bar is unambiguous even when
  // the project's name field accidentally matches the customer name (an
  // operations-data quality issue Yusuf flagged — Bug 2, round 4). If
  // code is missing we fall back to name alone rather than show an
  // orphan separator.
  const title = p.code && p.name
    ? `${p.code} · ${p.name}`
    : (p.name || p.code || "Untitled project");
  return {
    id:           `project:${p.id}`,
    kind:         "project",
    title,
    startsAt:     start,
    endsAt:       end,
    customerId:   p.customer || undefined,
    customerName: customer?.name,
    siteId:       p.site || undefined,
    siteName:     site?.name,
    leadTechId:   p.leadTechId || undefined,
    leadTechName: lead?.name,
    // Project has no per-event assignees beyond the lead tech — keep the
    // assigneeIds list empty so the "mine" filter relies on leadTechId.
    assigneeIds:  [],
    status:       p.status,
    color:        getEventColor("project", p.status),
    source:       { table: "projects", id: p.id },
    metadata:     { code: p.code, progress: p.progress, stage: p.stage },
  };
}

/**
 * AMC scheduled visit → CalendarEvent. The visit itself is a 1-day
 * event on scheduled_date. If the visit has a linked work_order we
 * still render the AMC event (the WO will render as its own event,
 * coloured differently).
 */
export function amcServiceToCalendarEvent(s: AmcService): CalendarEvent | null {
  const start = parseDateOnly(s.scheduledDate);
  if (!start) return null;
  const amc: AmcContract | null = db.amc(s.amcContractId);
  const customer = amc ? db.cust(amc.customer) : null;
  const site = amc ? db.site(amc.site) : null;
  const lead = amc?.leadTechId ? db.user(amc.leadTechId) : null;
  const code = amc?.code ?? "AMC";
  return {
    id:           `amc_visit:${s.id}`,
    kind:         "amc_visit",
    title:        `${code} · Service ${s.serviceNumber}`,
    startsAt:     start,
    endsAt:       start,                       // single-day
    customerId:   amc?.customer || undefined,
    customerName: customer?.name,
    siteId:       amc?.site || undefined,
    siteName:     site?.name,
    leadTechId:   amc?.leadTechId || undefined,
    leadTechName: lead?.name,
    assigneeIds:  [],
    status:       s.status,
    color:        getEventColor("amc_visit", s.status),
    source:       { table: "amc_contracts", id: s.amcContractId },
    metadata:     {
      amcServiceId:  s.id,
      serviceNumber: s.serviceNumber,
      completedAt:   s.completedAt,
      workOrderId:   s.workOrderId,
    },
  };
}

/**
 * WorkOrder → CalendarEvent. scheduledStart/End are timestamptz so we
 * parse them straight (timezone preserved by the browser).
 */
export function workOrderToCalendarEvent(w: WorkOrder): CalendarEvent | null {
  if (!w.scheduledStart) return null;
  const start = parseTimestamp(w.scheduledStart);
  if (!start) return null;
  const end = w.scheduledEnd ? parseTimestamp(w.scheduledEnd) : null;
  const customer = db.cust(w.customer);
  const site = db.site(w.site);
  const lead = w.assignedLead ? db.user(w.assignedLead) : null;
  // v1.0.1 Phase C — free-call WOs are auto-created by createFreeCall
  // with the title prefix "Free call:" and source=amc. Detect either
  // signal so the calendar surfaces them with a distinct deep-orange
  // bar and a 📞 prefix — they still participate in WO conflict
  // detection because kind stays "work_order".
  const isFreeCall = w.title?.startsWith("Free call:") === true
    || (w.source?.kind === "amc" && w.title?.toLowerCase().includes("free call"));
  // Match the project/AMC title format ("<CODE> · <NAME>") so WOs read
  // consistently across all three event types in the bars + popovers.
  const baseTitle = w.code && w.title
    ? `${w.code} · ${w.title}`
    : (w.title || w.code || "Untitled work order");
  const woTitle = isFreeCall ? `📞 ${baseTitle}` : baseTitle;
  const color = isFreeCall
    && w.status !== "done" && w.status !== "closed" && w.status !== "cancelled"
    ? CAL_COLORS.free_call
    : getEventColor("work_order", w.status, w.priority);
  return {
    id:           `work_order:${w.id}`,
    kind:         "work_order",
    title:        woTitle,
    startsAt:     start,
    endsAt:       end,
    customerId:   w.customer || undefined,
    customerName: customer?.name,
    siteId:       w.site || undefined,
    siteName:     site?.name,
    leadTechId:   w.assignedLead || undefined,
    leadTechName: lead?.name,
    assigneeIds:  w.assigned ?? [],
    status:       w.status,
    color,
    source:       { table: "work_orders", id: w.id },
    metadata:     { code: w.code, type: w.type, priority: w.priority, isFreeCall },
  };
}

// ── Aggregation ───────────────────────────────────────────

export interface CalendarScope {
  role: Role;
  userId: string;
  rangeStart: Date;
  rangeEnd: Date;
  filter: CalendarFilter;
}

/**
 * Resolve every event the current user should see in the chosen range,
 * with the chosen filter applied. Pure read — no mutation of db state.
 *
 * Order of operations:
 *   1) gather raw events from each source the user's role allows
 *   2) restrict to those that overlap [rangeStart, rangeEnd]
 *   3) apply the chip filter (all / project / amc_visit / work_order /
 *      mine)
 *   4) sort chronologically
 */
export function getCalendarEvents(scope: CalendarScope): CalendarEvent[] {
  const { role, userId, rangeStart, rangeEnd, filter } = scope;
  const out: CalendarEvent[] = [];

  // [CALENDAR DEBUG] — temporary diagnostic for the AMC-visits-zero bug.
  // Confirms: (1) hydration populated the mirror, (2) what dates are in
  // the mirror, (3) what range the calendar is filtering against. Safe
  // to delete once verified — no production code depends on it.
  if (typeof window !== "undefined" && (window as unknown as { __CAL_DEBUG?: boolean }).__CAL_DEBUG !== false) {
    const amcRows = Object.values(db.AMC_SERVICE_SCHEDULE);
    // eslint-disable-next-line no-console
    console.log("[CALENDAR DEBUG]", {
      role,
      userId,
      rangeStart: rangeStart.toISOString(),
      rangeEnd:   rangeEnd.toISOString(),
      amcServiceScheduleCount: amcRows.length,
      firstAmcService: amcRows[0] ?? null,
      projectsCount:  Object.keys(db.PROJECTS).length,
      workOrdersCount: Object.keys(db.WORK_ORDERS).length,
    });
  }

  // ---- role-scoped raw events ----
  if (canSeeAllCalendar(role)) {
    for (const p of Object.values(db.PROJECTS)) {
      const e = projectToCalendarEvent(p);
      if (e) out.push(e);
    }
    for (const s of Object.values(db.AMC_SERVICE_SCHEDULE)) {
      const e = amcServiceToCalendarEvent(s);
      if (e) out.push(e);
    }
    for (const w of Object.values(db.WORK_ORDERS)) {
      const e = workOrderToCalendarEvent(w);
      if (e) out.push(e);
    }
  } else if (isLeadOnlyCalendar(role)) {
    // Lead Techs see projects + AMCs they lead and WOs they touch.
    for (const p of Object.values(db.PROJECTS)) {
      if (p.leadTechId !== userId) continue;
      const e = projectToCalendarEvent(p);
      if (e) out.push(e);
    }
    const myAmcIds = new Set(
      Object.values(db.AMCS).filter(a => a.leadTechId === userId).map(a => a.id),
    );
    for (const s of Object.values(db.AMC_SERVICE_SCHEDULE)) {
      if (!myAmcIds.has(s.amcContractId)) continue;
      const e = amcServiceToCalendarEvent(s);
      if (e) out.push(e);
    }
    for (const w of Object.values(db.WORK_ORDERS)) {
      const mine = w.assignedLead === userId || (w.assigned ?? []).includes(userId);
      if (!mine) continue;
      const e = workOrderToCalendarEvent(w);
      if (e) out.push(e);
    }
  } else if (isFieldOnlyCalendar(role)) {
    // Workers / drivers / subcontractors — WOs only.
    for (const w of Object.values(db.WORK_ORDERS)) {
      if (!(w.assigned ?? []).includes(userId) && w.assignedLead !== userId) continue;
      const e = workOrderToCalendarEvent(w);
      if (e) out.push(e);
    }
  }
  // super_admin: not expected to land here (no nav entry) — falls through to empty.

  // ---- range filter ----
  const inRange = out.filter(e => eventOverlapsRange(e, rangeStart, rangeEnd));

  // ---- chip filter ----
  const filtered = inRange.filter(e => matchesFilter(e, filter, userId));

  // ---- sort: earliest first; for events on the same day, multi-day
  //     events surface above point events (so bars sit above chips).
  filtered.sort((a, b) => {
    const d = a.startsAt.getTime() - b.startsAt.getTime();
    if (d !== 0) return d;
    const aSpan = (a.endsAt?.getTime() ?? a.startsAt.getTime()) - a.startsAt.getTime();
    const bSpan = (b.endsAt?.getTime() ?? b.startsAt.getTime()) - b.startsAt.getTime();
    return bSpan - aSpan;
  });

  return filtered;
}

function matchesFilter(e: CalendarEvent, filter: CalendarFilter, userId: string): boolean {
  if (filter === "all") return true;
  if (filter === "project")    return e.kind === "project";
  if (filter === "amc_visit")  return e.kind === "amc_visit";
  if (filter === "work_order") return e.kind === "work_order";
  // "mine" — events where current user is the lead OR an assignee.
  return e.leadTechId === userId || e.assigneeIds.includes(userId);
}

/**
 * Returns true if event's date span intersects [start, end]. A null
 * endsAt is treated as "1-day at startsAt" (per edge case 1).
 */
export function eventOverlapsRange(e: CalendarEvent, start: Date, end: Date): boolean {
  const s = e.startsAt.getTime();
  const eEnd = (e.endsAt ?? e.startsAt).getTime();
  return s <= end.getTime() && eEnd >= start.getTime();
}

// ── View shaping helpers ──────────────────────────────────

/**
 * Bucket events by day key (YYYY-MM-DD in local time). Multi-day events
 * appear in every day they touch — the month/week renderer relies on
 * this to draw bars in each cell the event covers.
 */
export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const m = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const days = daysCovered(e);
    for (const key of days) {
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
  }
  return m;
}

/**
 * Bucket events by ISO week number (year * 100 + week). Used by the
 * week view header strip. A multi-day event lives in the first week it
 * touches; multi-week events are extremely rare in this domain (a job
 * spanning months is the exception, not the norm, and renders fine via
 * the month bar logic).
 */
export function groupEventsByWeek(events: CalendarEvent[]): Map<number, CalendarEvent[]> {
  const m = new Map<number, CalendarEvent[]>();
  for (const e of events) {
    const w = isoWeekKey(e.startsAt);
    const list = m.get(w) ?? [];
    list.push(e);
    m.set(w, list);
  }
  return m;
}

/**
 * "10:30" for events with a time component, or "—" for date-only.
 * Multi-day events show their start time at the front of the range.
 */
export function formatEventTime(e: CalendarEvent): string {
  // Date-only events (projects, AMC visits) have midnight starts — treat
  // them as "all day" rather than showing 00:00.
  if (e.startsAt.getHours() === 0 && e.startsAt.getMinutes() === 0
      && (e.endsAt === null || (e.endsAt.getHours() === 0 && e.endsAt.getMinutes() === 0))) {
    return "all day";
  }
  const s = fmtTime(e.startsAt);
  if (!e.endsAt) return s;
  const sameDay = isSameLocalDay(e.startsAt, e.endsAt);
  return sameDay ? `${s}–${fmtTime(e.endsAt)}` : `${s} →`;
}

export function isMultiDay(e: CalendarEvent): boolean {
  if (!e.endsAt) return false;
  return !isSameLocalDay(e.startsAt, e.endsAt);
}

export function eventsOverlapping(a: CalendarEvent, b: CalendarEvent): boolean {
  const aEnd = (a.endsAt ?? a.startsAt).getTime();
  const bEnd = (b.endsAt ?? b.startsAt).getTime();
  return a.startsAt.getTime() < bEnd && b.startsAt.getTime() < aEnd;
}

// ── Internal date utilities ───────────────────────────────

/**
 * Parse "YYYY-MM-DD" into a local Date at noon. Noon (not midnight)
 * because the user's local timezone offset never crosses ±14h, so a
 * noon anchor keeps the date stable regardless of where they are. If
 * we anchored at midnight UTC, anyone east of UTC would see the
 * previous day in the calendar grid.
 */
function parseDateOnly(s: string): Date | null {
  if (!s) return null;
  const ymd = s.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimestamp(s: string): Date | null {
  if (!s) return null;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

function fmtTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function daysCovered(e: CalendarEvent): string[] {
  const out: string[] = [];
  const start = startOfDay(e.startsAt);
  const end = startOfDay(e.endsAt ?? e.startsAt);
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    out.push(dayKey(new Date(t)));
  }
  return out;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Cheap ordering key. Not a real ISO week number — just monotonic by
 * (year, week-of-year) so it sorts correctly across a year boundary.
 */
function isoWeekKey(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diffDays = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  const week = Math.floor((diffDays + start.getDay()) / 7);
  return d.getFullYear() * 100 + week;
}

// ── Range helpers (used by the GrowthPlan UI) ─────────────

export function rangeForMonth(anchor: Date): { start: Date; end: Date } {
  // Calendar grid covers from the Monday of the first week shown to
  // the Sunday of the last week shown — six weeks max, so the grid is
  // always the same shape regardless of month length.
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = startOfDay(first);
  // Monday-anchored, matches lib/timeframe.ts week()
  const shiftToMon = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - shiftToMon);
  const end = startOfDay(last);
  const shiftToSun = (7 - ((end.getDay() + 6) % 7) - 1 + 7) % 7;
  end.setDate(end.getDate() + shiftToSun);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function rangeForWeek(anchor: Date): { start: Date; end: Date } {
  const start = startOfDay(anchor);
  const shiftToMon = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - shiftToMon);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function rangeForDays(anchor: Date, days: number): { start: Date; end: Date } {
  const start = startOfDay(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function shiftMonths(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + delta);
  return out;
}

export function shiftDays(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + delta);
  return out;
}

// ── Dashboard widget helpers ──────────────────────────────

/**
 * Active projects (planned + in_progress + on_hold), scoped to the
 * user's role. Same filter as the existing MyProjectsCard widget but
 * exposed as a helper so the Growth Plan widget renders consistently
 * across every dashboard variant.
 */
const ACTIVE_PROJECT_STATUSES = new Set(["planned", "in_progress", "on_hold"]);

export function activeProjectsForUser(role: Role, userId: string): Project[] {
  const all = Object.values(db.PROJECTS).filter(p => ACTIVE_PROJECT_STATUSES.has(p.status));
  if (canSeeAllCalendar(role)) return sortByDue(all);
  if (isLeadOnlyCalendar(role)) return sortByDue(all.filter(p => p.leadTechId === userId));
  // Field roles don't own projects directly — surface ones tied to a WO
  // they're on, since "active projects" is the dashboard's banner row.
  const myProjectIds = new Set<string>();
  for (const w of Object.values(db.WORK_ORDERS)) {
    if (w.source.kind !== "project") continue;
    const mine = (w.assigned ?? []).includes(userId) || w.assignedLead === userId;
    if (mine) myProjectIds.add(w.source.id);
  }
  return sortByDue(all.filter(p => myProjectIds.has(p.id)));
}

function sortByDue(ps: Project[]): Project[] {
  return ps.slice().sort((a, b) => {
    const aDue = a.dueAt || "9999-12-31";
    const bDue = b.dueAt || "9999-12-31";
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return (b.startedAt || "").localeCompare(a.startedAt || "");
  });
}

/**
 * Critical alerts surfaced as a red banner at the top of each
 * dashboard. Returns an empty list when there's nothing to flag — the
 * widget then doesn't render at all.
 *
 * Sources:
 *   • Projects past their due_at and still active
 *   • AMC services scheduled today with no work_order_id
 *   • WOs in_progress where elapsed_min > 24h worth of minutes (best
 *     proxy we have for "no updates in 24h" without a real activity
 *     timestamp — flagged in known limitations)
 */
export interface CalendarAlert {
  id: string;
  kind: "project_overdue" | "amc_no_wo" | "wo_stale";
  title: string;
  detail: string;
  target: { kind: "project" | "amc" | "wo"; id: string };
}

export function calendarAlertsForUser(role: Role, userId: string): CalendarAlert[] {
  const today = startOfDay(new Date());
  const out: CalendarAlert[] = [];

  // 1) Overdue projects
  for (const p of Object.values(db.PROJECTS)) {
    if (!ACTIVE_PROJECT_STATUSES.has(p.status)) continue;
    if (!p.dueAt) continue;
    const due = parseDateOnly(p.dueAt);
    if (!due || due.getTime() >= today.getTime()) continue;
    if (!projectVisibleTo(p, role, userId)) continue;
    const daysOver = Math.round((today.getTime() - due.getTime()) / 86_400_000);
    out.push({
      id:     `alert:project_overdue:${p.id}`,
      kind:   "project_overdue",
      title:  `${p.code} overdue`,
      detail: `${p.name} · ${daysOver} day${daysOver === 1 ? "" : "s"} past due`,
      target: { kind: "project", id: p.id },
    });
  }

  // 2) AMC services scheduled today without a linked WO
  const todayKey = dayKey(today);
  for (const s of Object.values(db.AMC_SERVICE_SCHEDULE)) {
    if (s.scheduledDate !== todayKey) continue;
    if (s.workOrderId) continue;
    if (s.status === "completed" || s.status === "skipped") continue;
    const amc = db.amc(s.amcContractId);
    if (!amc) continue;
    if (!amcVisibleTo(amc, role, userId)) continue;
    out.push({
      id:     `alert:amc_no_wo:${s.id}`,
      kind:   "amc_no_wo",
      title:  `${amc.code} · Service ${s.serviceNumber} today`,
      detail: "Scheduled today but no work order raised yet",
      target: { kind: "amc", id: amc.id },
    });
  }

  // 3) WOs in_progress with elapsed > 24h
  const STALE_MIN = 24 * 60;
  for (const w of Object.values(db.WORK_ORDERS)) {
    if (w.status !== "in_progress") continue;
    if (w.elapsedMin <= STALE_MIN) continue;
    if (!woVisibleTo(w, role, userId)) continue;
    const hours = Math.round(w.elapsedMin / 60);
    out.push({
      id:     `alert:wo_stale:${w.id}`,
      kind:   "wo_stale",
      title:  `${w.code} stalled`,
      detail: `${w.title} · ${hours}h in progress without close-out`,
      target: { kind: "wo", id: w.id },
    });
  }

  return out;
}

function projectVisibleTo(p: Project, role: Role, userId: string): boolean {
  if (canSeeAllCalendar(role)) return true;
  if (isLeadOnlyCalendar(role)) return p.leadTechId === userId;
  return false; // field roles don't see overdue project alerts at the project level
}

function amcVisibleTo(a: AmcContract, role: Role, userId: string): boolean {
  if (canSeeAllCalendar(role)) return true;
  if (isLeadOnlyCalendar(role)) return a.leadTechId === userId;
  return false;
}

function woVisibleTo(w: WorkOrder, role: Role, userId: string): boolean {
  if (canSeeAllCalendar(role)) return true;
  if (isLeadOnlyCalendar(role)) return w.assignedLead === userId || (w.assigned ?? []).includes(userId);
  if (isFieldOnlyCalendar(role)) return (w.assigned ?? []).includes(userId) || w.assignedLead === userId;
  return false;
}
