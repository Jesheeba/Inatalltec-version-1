"use client";
// ============================================================
// Dashboard module - role-aware
// One <Dashboard /> picks a different layout based on the
// logged-in user's role + scope. (Ported from modules/dashboard.jsx)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db, KPI_OPS, ROLE_LABELS } from "@/lib/db";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  ApprovalCard, CardHead, EmptyState, FeedItem, KPI, PageHeader,
  SignOutButton, StatusBadge, WoCard,
} from "../shared";
import type { CalendarEvent, Project, RepairTicket, WoStatus, WorkOrder } from "@/lib/types";
import {
  activeProjectsForUser, calendarAlertsForUser, getCalendarEvents,
  rangeForDays, rangeForWeek,
  type CalendarAlert,
} from "@/lib/calendar";
import { formatConflictLabel, getWorkerConflictsFor } from "@/lib/conflicts";
import { PhaseBadge } from "../PhaseTracker";
import { AmcPauseAlert } from "../AmcPauseAlert";
import { autoPauseExpiredAmcs } from "@/lib/create";
import {
  formatShortDate as fmtShortDate,
  formatMonthDay as fmtMonthDay,
  formatDateTime as fmtDateTime,
} from "@/lib/dates";
import { navigateTo } from "@/lib/maps";
import {
  updateWorkOrder, WO_STATUS_LABEL,
  REPLACEMENT_STATUS_LABEL, REPLACEMENT_STATUS_BADGE, REPLACEMENT_CONTEXT_LABEL,
  startWorkOrder, completeWorkOrder,
} from "@/lib/create";
import type { ReplacementRequest } from "@/lib/types";
import {
  daysIn, inPeriod, periodFor, spansPeriod,
  TIMEFRAME_KEYS, TIMEFRAME_TAB_LABEL,
  type Timeframe,
} from "@/lib/timeframe";

/* ─── My Projects card ──────────────────────────────────────
   Surface a manager's (or a lead-worker's team's) active projects
   on their home dashboard. Active = planned + in_progress + on_hold;
   completed and cancelled are excluded so the card stays a "what am I
   responsible for today" view. Sorted by due date asc (most urgent
   first), tiebreak by start date desc.
============================================================ */
const ACTIVE_PROJECT_STATUSES = new Set(["planned", "in_progress", "on_hold"]);

function relativeDue(dueAt: string): { label: string; overdue: boolean } {
  if (!dueAt) return { label: "no due date", overdue: false };
  // Compare on date-only so "today" doesn't depend on the time of day.
  const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const dueMs = new Date(dueAt.slice(0, 10)).getTime();
  if (Number.isNaN(dueMs)) return { label: dueAt, overdue: false };
  const days = Math.round((dueMs - todayMs) / 86_400_000);
  if (days === 0) return { label: "due today", overdue: false };
  if (days === 1) return { label: "due tomorrow", overdue: false };
  if (days === -1) return { label: "overdue by 1 day", overdue: true };
  if (days < 0) return { label: `overdue by ${-days} days`, overdue: true };
  if (days < 14) return { label: `in ${days} days`, overdue: false };
  const weeks = Math.round(days / 7);
  if (weeks < 8) return { label: `in ${weeks} weeks`, overdue: false };
  return { label: `in ${Math.round(days / 30)} months`, overdue: false };
}

function MyProjectsCard({ title, projects, seeAllHref, emptyMessage }: {
  title: string;
  projects: Project[];
  seeAllHref: string;
  emptyMessage: string;
}) {
  const { openProject } = useApp();
  const router = useRouter();

  const active = projects.filter(p => ACTIVE_PROJECT_STATUSES.has(p.status as string));
  const sorted = active.slice().sort((a, b) => {
    const aDue = a.dueAt || "9999-12-31";
    const bDue = b.dueAt || "9999-12-31";
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return (b.startedAt || "").localeCompare(a.startedAt || "");
  });
  const visible = sorted.slice(0, 5);
  const total = active.length;

  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <CardHead title={title} sub={total > 0 ? `${total} active · sorted by due date` : undefined} />
      {visible.length === 0 ? (
        <EmptyState icon="briefcase" title={emptyMessage}
          sub="If this is unexpected, speak to your Admin." />
      ) : (
        <>
          <div className="col" style={{ gap: 8 }}>
            {visible.map(p => <MyProjectRow key={p.id} p={p} onClick={() => openProject(p.id)} />)}
          </div>
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => router.push(seeAllHref)}>
              {total > 5 ? `See all my jobs (${total} total)` : "View all"}
              <Icon name="arrowRight" size={12} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function MyProjectRow({ p, onClick }: { p: Project; onClick: () => void }) {
  const cust = db.cust(p.customer);
  const due = relativeDue(p.dueAt);
  return (
    <div onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 12px", borderRadius: "var(--r-md)",
        background: "var(--bg-muted)", border: "1px solid var(--border)",
        cursor: "pointer", minHeight: 44,
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-deep)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ font: "var(--t-body-md)" }}>{p.name}</div>
        <div className="truncate" style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
          {cust?.name ?? "—"} · {p.progress}%
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <StatusBadge state={p.status} />
        <span style={{
          font: "var(--t-micro)",
          color: due.overdue ? "var(--dan-700)" : "var(--ink-mute)",
          fontWeight: due.overdue ? 600 : 500,
        }}>{due.label}</span>
      </div>
    </div>
  );
}

/* ─── My Open Work Orders ───────────────────────────────────
   For workers / lead techs / drivers. Lists non-terminal WOs assigned
   to the current user (status not in done/closed/cancelled). Each row
   surfaces a one-tap status transition appropriate to the current state:
     - open / assigned                → "Start" (→ in_progress)
     - in_progress                    → "Mark Done" (→ pending_confirmation)
     - waiting_material               → "Resume" (→ in_progress)
     - pending_confirmation           → no action — waiting on lead
============================================================ */
function MyOpenWorkOrders({
  openWOs, onOpen, onQuickAction,
}: {
  openWOs: WorkOrder[];
  onOpen: (id: string) => void;
  onQuickAction: (wo: WorkOrder, next: WoStatus) => void;
}) {
  const { me } = useApp();
  if (openWOs.length === 0) return null;
  const ordered = [...openWOs].sort((a, b) =>
    (a.scheduledStart || "").localeCompare(b.scheduledStart || "")
  );

  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <CardHead title={"My open work orders · " + openWOs.length}
        sub="Tap a card to open; use the quick action to move it forward" />
      <div className="col" style={{ gap: 8 }}>
        {ordered.map(wo => {
          const action = quickAction(wo.status);
          // Fix 3 — surface schedule conflicts where this worker has
          // another active WO overlapping THIS one's window. We pass
          // wo.id as the exclude so the WO doesn't conflict with itself.
          const conflicts = getWorkerConflictsFor(
            me.id, wo.scheduledStart, wo.scheduledEnd, wo.id,
          );
          return (
            <div key={wo.id} className="row gap-3"
              style={{
                padding: 12, borderRadius: "var(--r-md)",
                background: "var(--bg-muted)",
                border: conflicts.length > 0 ? "1px solid var(--warn-100)" : "1px solid var(--border)",
                alignItems: "center",
              }}>
              <div onClick={() => onOpen(wo.id)} role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(wo.id); } }}
                style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <div className="row gap-2" style={{ alignItems: "center" }}>
                  <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{wo.code}</span>
                  <StatusBadge state={wo.status} />
                  {conflicts.length > 0 && (
                    <span className="badge badge-warning"
                      title={conflicts.map(formatConflictLabel).join("\n")}>
                      <Icon name="alertTriangle" size={11} /> Time conflict
                    </span>
                  )}
                </div>
                <div className="truncate" style={{ font: "var(--t-body-md)", marginTop: 4 }}>{wo.title}</div>
                <div className="truncate" style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
                  {(db.cust(wo.customer)?.name ?? "—")} · {(db.site(wo.site)?.name ?? "—")}
                </div>
                {conflicts.length > 0 && (
                  <div style={{ font: "var(--t-micro)", color: "var(--warn-700)", marginTop: 4 }}>
                    Overlaps with {conflicts.map(c => c.code).join(", ")}
                  </div>
                )}
              </div>
              {action && (
                <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}
                  onClick={() => onQuickAction(wo, action.next)}>
                  <Icon name={action.icon} size={12} /> {action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function quickAction(status: WoStatus): { label: string; icon: "play" | "check" | "refresh"; next: WoStatus } | null {
  if (status === "open" || status === "assigned")  return { label: "Start",     icon: "play",    next: "in_progress" };
  if (status === "in_progress")                    return { label: "Mark Done", icon: "check",   next: "pending_confirmation" };
  if (status === "waiting_material")               return { label: "Resume",    icon: "refresh", next: "in_progress" };
  return null;
}

/* ─── Replacement-request widgets (dashboard cards) ────────
   - MyReplacementRequests   → for any worker / lead, lists RRs they requested.
   - LeadPendingApproval     → lead_worker, status='requested' RRs in their scope.
   - LeadPendingConfirmation → lead_worker, status='pending_confirmation' in scope.

   "In scope" = any RR whose linked work_order is one this user is the lead on
   OR is assigned to. Managers see everything via the /replacements page; these
   widgets exist for the daily action queue on the field-side dashboard.
============================================================ */
function MyReplacementRequests({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const mine = Object.values(db.REPLACEMENTS)
    .filter(r => r.requestedBy === userId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .slice(0, 5);
  const total = Object.values(db.REPLACEMENTS).filter(r => r.requestedBy === userId).length;
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <CardHead title={"My replacement requests · " + total}
        sub="Latest 5 — track approval, install, and confirmation" />
      {mine.length === 0 ? (
        <EmptyState icon="package" title="No replacement requests yet"
          sub="Open a work order and tap Request Replacement when you spot something on-site." />
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {mine.map(r => <RrCompactRow key={r.id} r={r} onClick={() => onOpen(r.id)} />)}
        </div>
      )}
    </section>
  );
}

function LeadPendingApproval({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const inScope = (r: ReplacementRequest) => leadHasScope(r, userId);
  const queue = Object.values(db.REPLACEMENTS)
    .filter(r => r.status === "requested" && inScope(r) && r.requestedBy !== userId)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <CardHead title={"Pending my approval · " + queue.length}
        sub="Workers waiting on your call" />
      {queue.length === 0 ? (
        <EmptyState icon="check" title="Nothing waiting for approval"
          sub="Good work — your queue is clear." />
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {queue.map(r => <RrCompactRow key={r.id} r={r} onClick={() => onOpen(r.id)} />)}
        </div>
      )}
    </section>
  );
}

function LeadPendingConfirmation({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const inScope = (r: ReplacementRequest) => leadHasScope(r, userId);
  const queue = Object.values(db.REPLACEMENTS)
    .filter(r => r.status === "pending_confirmation" && inScope(r))
    .sort((a, b) => (a.installedAt || "").localeCompare(b.installedAt || ""));
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <CardHead title={"Pending my confirmation · " + queue.length}
        sub="Worker installed — you confirm to complete" />
      {queue.length === 0 ? (
        <EmptyState icon="check" title="Nothing waiting for confirmation" />
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {queue.map(r => <RrCompactRow key={r.id} r={r} onClick={() => onOpen(r.id)} />)}
        </div>
      )}
    </section>
  );
}

// Lead Tech "scope" — RRs whose linked WO they lead or are assigned to.
// We deliberately scope by WO membership, not by project ownership, because
// the spec is field-action-oriented: the Lead Tech on the WO is the one who
// approves. If their managed project has a WO they're NOT on, another lead's
// queue gets it.
function leadHasScope(r: ReplacementRequest, userId: string): boolean {
  if (!r.workOrderId) return false;
  const wo = db.wo(r.workOrderId);
  if (!wo) return false;
  return wo.assignedLead === userId || (wo.assigned ?? []).includes(userId);
}

function RrCompactRow({ r, onClick }: { r: ReplacementRequest; onClick: () => void }) {
  const requester = r.requestedBy ? db.user(r.requestedBy) : null;
  return (
    <div onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="row gap-3" style={{
        padding: 12, borderRadius: "var(--r-md)",
        background: "var(--bg-muted)", border: "1px solid var(--border)",
        cursor: "pointer",
      }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: "var(--bg-elev)", color: "var(--ink-mute)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name="package" size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>{r.code}</span>
          <span className={"badge " + REPLACEMENT_STATUS_BADGE[r.status]}>
            {REPLACEMENT_STATUS_LABEL[r.status]}
          </span>
        </div>
        <div className="truncate" style={{ font: "var(--t-body-md)", marginTop: 4 }} title={r.itemName}>
          {r.itemName} <span style={{ color: "var(--ink-mute)" }}>· {r.quantity}x</span>
        </div>
        <div className="truncate" style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
          {REPLACEMENT_CONTEXT_LABEL[r.context]}{requester ? " · by " + requester.name : ""}
        </div>
      </div>
    </div>
  );
}

/* ─── Growth Plan widgets ──────────────────────────────────
   Four small widgets that surface Growth Plan signals on every
   operational dashboard. Each is role-scoped via lib/calendar.ts
   helpers so the same component renders correctly for an admin,
   a lead tech, or a field worker without per-dashboard branches.

   - CriticalAlertsWidget: red banner; renders nothing when empty.
   - ActiveProjectsWidget: horizontal scrollable strip at the top.
   - UpcomingThisWeekWidget: this-week event list (manager/admin).
   - Next3DaysWidget: next-72h event list (field).
============================================================ */

/**
 * Fires the autoPauseExpiredAmcs() sweep once on dashboard mount for
 * any role with write access to AMC contracts. The DB enforces the
 * actual gate (amc_write RLS, md/admin/manager) — this client check
 * just avoids an obviously-going-to-fail RPC for other roles.
 *
 * Silent operation: only logs to console if anything was paused, so
 * field users (worker / driver / lead_worker) see no toast noise.
 */
function useAutoPauseExpiredAmcs(role: string) {
  useEffect(() => {
    const canRun = role === "md" || role === "admin" || role === "manager";
    if (!canRun) return;
    let cancelled = false;
    (async () => {
      const res = await autoPauseExpiredAmcs();
      if (cancelled) return;
      if (res.ok && res.paused > 0) {
        // eslint-disable-next-line no-console
        console.info(`[auto-pause] flipped ${res.paused} AMC contract(s) to paused (payment overdue)`);
      }
    })();
    return () => { cancelled = true; };
  }, [role]);
}

function CriticalAlertsWidget() {
  const { me, role, openProject, openAmc, openWO, dataVersion } = useApp();
  void dataVersion;
  const alerts = useMemo(() => calendarAlertsForUser(role, me.id), [role, me.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  if (alerts.length === 0) return null;
  const followAlert = (a: CalendarAlert) => {
    if (a.target.kind === "project") openProject(a.target.id);
    else if (a.target.kind === "amc") openAmc(a.target.id);
    else openWO(a.target.id);
  };
  const KIND_ICON: Record<CalendarAlert["kind"], "alertTriangle" | "shieldCheck" | "clock"> = {
    project_overdue: "alertTriangle",
    amc_no_wo:       "shieldCheck",
    wo_stale:        "clock",
  };
  return (
    <section style={{
      marginBottom: 20,
      background: "var(--dan-50)",
      border: "1px solid var(--dan-100)",
      borderRadius: "var(--r-md)",
      padding: 14,
    }}>
      <div className="row gap-2" style={{ marginBottom: 10, alignItems: "center" }}>
        <Icon name="alertTriangle" size={16} style={{ color: "var(--dan-700)" }} />
        <span style={{ font: "var(--t-body-md)", fontWeight: 600, color: "var(--dan-700)" }}>
          Critical alerts · {alerts.length}
        </span>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {alerts.slice(0, 5).map(a => (
          <button key={a.id} onClick={() => followAlert(a)}
            style={{
              all: "unset", cursor: "pointer", display: "flex", gap: 10, alignItems: "center",
              padding: "8px 10px", borderRadius: "var(--r-sm)",
              background: "rgba(255,255,255,0.7)", minHeight: 44,
            }}>
            <Icon name={KIND_ICON[a.kind]} size={14} style={{ color: "var(--dan-700)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="truncate" style={{ font: "var(--t-small)", fontWeight: 600, color: "var(--ink)" }}>
                {a.title}
              </div>
              <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                {a.detail}
              </div>
            </div>
            <Icon name="chevronRight" size={12} style={{ color: "var(--ink-quiet)", flexShrink: 0 }} />
          </button>
        ))}
        {alerts.length > 5 && (
          <div style={{ font: "var(--t-micro)", color: "var(--dan-700)", padding: "4px 10px" }}>
            +{alerts.length - 5} more
          </div>
        )}
      </div>
    </section>
  );
}

function ActiveProjectsWidget() {
  const { me, role, openProject, openGrowthPlan, dataVersion } = useApp();
  void dataVersion;
  const projects = useMemo(() => activeProjectsForUser(role, me.id), [role, me.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <CardHead
        title={`Active projects · ${projects.length}`}
        sub={projects.length > 0 ? "Tap a card to open" : undefined}
        right={projects.length > 0 ? (
          <button className="btn btn-ghost btn-sm" onClick={() => openGrowthPlan("3months")}>
            Open Growth Plan <Icon name="arrowRight" size={12} />
          </button>
        ) : undefined}
      />
      {projects.length === 0 ? (
        <EmptyState icon="briefcase" title="No active projects"
          sub="Start one from + Create." />
      ) : (
        <div style={{
          display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6,
          scrollSnapType: "x mandatory",
        }}>
          {projects.map(p => (
            <ActiveProjectCard key={p.id} p={p} onClick={() => openProject(p.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ActiveProjectCard({ p, onClick }: { p: Project; onClick: () => void }) {
  const cust = db.cust(p.customer);
  const lead = p.leadTechId ? db.user(p.leadTechId) : null;
  return (
    <button onClick={onClick}
      style={{
        all: "unset", cursor: "pointer",
        flex: "0 0 240px", scrollSnapAlign: "start",
        padding: 14, borderRadius: "var(--r-md)",
        background: "var(--bg-muted)", border: "1px solid var(--border)",
        display: "flex", flexDirection: "column", gap: 8, minHeight: 110,
      }}>
      <div className="row between">
        <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
          {p.code}
        </span>
        <StatusBadge state={p.status} />
      </div>
      <div className="truncate" style={{ font: "var(--t-body-md)", fontWeight: 500 }}>
        {p.name}
      </div>
      <div className="truncate" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
        {cust?.name ?? "Unknown"}
      </div>
      {p.currentPhase && (
        <div><PhaseBadge phase={p.currentPhase} size="sm" /></div>
      )}
      {lead && (
        <div className="row gap-2" style={{ alignItems: "center", marginTop: "auto" }}>
          <span className={"avatar avatar-sm avatar-" + (lead.tint || "primary")}>{lead.initials}</span>
          <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }} className="truncate">
            {lead.name}
          </span>
        </div>
      )}
    </button>
  );
}

function UpcomingEventRow({ e, onClick }: { e: CalendarEvent; onClick: () => void }) {
  // Stable English formatter — avoids SSR/CSR locale drift that causes
  // React hydration mismatches (Node defaults en-US, browser uses the
  // user's locale). See lib/dates.ts for rationale.
  const date = fmtShortDate(e.startsAt);
  return (
    <button onClick={onClick}
      style={{
        all: "unset", cursor: "pointer", display: "flex", gap: 10, alignItems: "center",
        padding: "8px 10px", borderRadius: "var(--r-sm)", minHeight: 44,
      }}
      onMouseEnter={ev => (ev.currentTarget as HTMLButtonElement).style.background = "var(--bg-muted)"}
      onMouseLeave={ev => (ev.currentTarget as HTMLButtonElement).style.background = "transparent"}>
      <span style={{
        width: 8, height: 8, borderRadius: 999, background: e.color, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ font: "var(--t-small)", fontWeight: 500 }}>
          {e.title}
        </div>
        <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
          {date}{e.customerName ? ` · ${e.customerName}` : ""}
        </div>
      </div>
    </button>
  );
}

function UpcomingThisWeekWidget() {
  const { me, role, openProject, openAmc, openWO, openGrowthPlan, dataVersion } = useApp();
  void dataVersion;
  const events = useMemo(() => {
    const r = rangeForWeek(new Date());
    return getCalendarEvents({ role, userId: me.id, rangeStart: r.start, rangeEnd: r.end, filter: "all" });
  }, [role, me.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = events.slice(0, 5);
  const followEvent = (e: CalendarEvent) => {
    if (e.source.table === "projects")       openProject(e.source.id);
    else if (e.source.table === "amc_contracts") openAmc(e.source.id);
    else                                          openWO(e.source.id);
  };
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <CardHead
        title="Upcoming this week"
        sub={events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : undefined}
        right={(
          <button className="btn btn-ghost btn-sm" onClick={() => openGrowthPlan("week")}>
            View all <Icon name="arrowRight" size={12} />
          </button>
        )}
      />
      {visible.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing scheduled this week"
          sub="Use Growth Plan to see what's coming next." />
      ) : (
        <div className="col" style={{ gap: 4 }}>
          {visible.map(e => <UpcomingEventRow key={e.id} e={e} onClick={() => followEvent(e)} />)}
        </div>
      )}
    </section>
  );
}

// ─── Active Work widget (migration 0022) ──────────────────
// Count-only summary of currently-active work orders. No per-WO ticker,
// no setInterval, no per-second updates — just a static "N work orders
// in progress" line that clicks through to the filtered WO list.
//
// "scope='all'" → counts unique WOs across the team (manager view).
// "scope='mine'" → counts WOs where the current user has an open entry
//                  (worker view).
function ActiveWorkWidget({ scope }: { scope: "all" | "mine" }) {
  const { me, go, dataVersion } = useApp();
  void dataVersion;
  const activeWoCount = useMemo(() => {
    const woIds = new Set<string>();
    for (const e of Object.values(db.WORK_ORDER_TIME_ENTRIES)) {
      if (e.endedAt !== null) continue;
      if (scope === "mine" && e.userId !== me.id) continue;
      woIds.add(e.workOrderId);
    }
    return woIds.size;
  }, [me.id, scope, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  if (activeWoCount === 0) return null;
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <button onClick={() => go("workorders")}
        style={{
          all: "unset", cursor: "pointer", display: "flex",
          alignItems: "center", gap: 12, width: "100%",
        }}>
        <span className="dot dot-success" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>
            {activeWoCount} work order{activeWoCount === 1 ? "" : "s"} in progress
          </div>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginTop: 2 }}>
            {scope === "mine" ? "You're on the clock" : "Currently being worked on"}
          </div>
        </div>
        <Icon name="arrowRight" size={14} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
      </button>
    </section>
  );
}

// Total tracked minutes across all WOs whose scheduledStart falls inside
// [start, end]. Used for the Manager dashboard's "Hours this week" KPI.
// Uses the trigger-computed durationMinutes on the WO itself so it includes
// every worker (not just whatever entries the current role can see).
function totalTrackedMinutes(start: Date, end: Date): number {
  let minutes = 0;
  const startMs = start.getTime();
  const endMs   = end.getTime();
  for (const w of Object.values(db.WORK_ORDERS)) {
    if (!w.scheduledStart) continue;
    const t = new Date(w.scheduledStart).getTime();
    if (Number.isNaN(t) || t < startMs || t > endMs) continue;
    minutes += w.durationMinutes;
  }
  return minutes;
}

function Next3DaysWidget() {
  const { me, role, openWO, openAmc, openProject, openGrowthPlan, dataVersion } = useApp();
  void dataVersion;
  const events = useMemo(() => {
    const r = rangeForDays(new Date(), 3);
    return getCalendarEvents({ role, userId: me.id, rangeStart: r.start, rangeEnd: r.end, filter: "mine" });
  }, [role, me.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const followEvent = (e: CalendarEvent) => {
    if (e.source.table === "projects")       openProject(e.source.id);
    else if (e.source.table === "amc_contracts") openAmc(e.source.id);
    else                                          openWO(e.source.id);
  };
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <CardHead
        title="Next 3 days"
        sub={events.length > 0 ? `${events.length} item${events.length === 1 ? "" : "s"} on your plate` : undefined}
        right={(
          <button className="btn btn-ghost btn-sm" onClick={() => openGrowthPlan("week")}>
            Open Growth Plan <Icon name="arrowRight" size={12} />
          </button>
        )}
      />
      {events.length === 0 ? (
        <EmptyState icon="check" title="Nothing scheduled"
          sub="If you have nothing scheduled, take it easy." />
      ) : (
        <div className="col" style={{ gap: 4 }}>
          {events.map(e => <UpcomingEventRow key={e.id} e={e} onClick={() => followEvent(e)} />)}
        </div>
      )}
    </section>
  );
}

export function Dashboard() {
  const { role, go } = useApp();
  if (role === "super_admin") {
    // Super Admin doesn't have an operational dashboard - bounce them to Organizations.
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Platform" title="Super Admin"
          sub="Manage organizations, admins, and platform-wide settings."
          right={<SignOutButton />} />
        <EmptyState icon="building" title="Welcome, Super Admin"
          sub="You sit above all tenants. Start by reviewing your organizations or creating a new one."
          action={<button className="btn btn-primary" onClick={() => go("organizations")}><Icon name="arrowRight" size={14} /> Go to Organizations</button>} />
      </div>
    );
  }
  if (role === "worker" || role === "lead_worker" || role === "driver" || role === "subcontractor") return <FieldDashboard />;
  // Admin + MD share the same dashboard now: System Admin KPIs on top,
  // Operational Overview below (see OperationalOverview / AdminDashboard).
  // The legacy MdDashboard with the strategic revenue/compliance charts
  // is kept in this file for reference but is no longer rendered — flag
  // for follow-up if those charts need to come back.
  if (role === "md" || role === "admin") return <AdminDashboard />;
  if (role === "service_support") return <SupportDashboard />;
  if (role === "accounts") return <AccountsDashboard />;
  if (role === "sales") return <SalesDashboard />;
  return <ManagerDashboard />;
}

/* ─── Manager / default Ops dashboard ───────────────────── */
function ManagerDashboard() {
  const { me, role, openApproval, openWO, followTarget, go, fmtMoney, dataVersion } = useApp();
  void dataVersion;
  useAutoPauseExpiredAmcs(role);
  const [feedFilter, setFeedFilter] = useState<"all" | "check" | "sla">("all");
  const [timeframe, setTimeframe] = useState<Timeframe>("today");
  const period = useMemo(() => periodFor(timeframe), [timeframe]);

  const feed = feedFilter === "all"
    ? db.FEED
    : feedFilter === "sla"
      ? db.FEED.filter(f => f.tag === "warning" || f.tag === "danger")
      : db.FEED.filter(f => f.kind === "check-in");
  const approvals = Object.values(db.APPROVALS).slice(0, 3);
  const todayWOs = Object.values(db.WORK_ORDERS)
    .filter(w => w.scheduledStart.startsWith("2025-05-16"))
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));

  // ── Period-scoped data ──────────────────────────────────
  // Every WO whose scheduledStart falls in the chosen period. The KPIs
  // below all derive from this set, so flipping the chip re-computes
  // everything in one render. dataVersion is read above so a create or
  // status change repaints the dashboard.
  const wosInPeriod = useMemo(
    () => Object.values(db.WORK_ORDERS).filter(w => inPeriod(w.scheduledStart, period)),
    [period],
  );
  const openInPeriod = useMemo(
    () => wosInPeriod.filter(w =>
      w.status !== "done" && w.status !== "closed" && w.status !== "cancelled"
    ),
    [wosInPeriod],
  );
  const slaAtRisk = useMemo(
    () => openInPeriod.filter(w => w.slaMin != null && w.slaMin > 0 && w.elapsedMin > w.slaMin * 0.85).length,
    [openInPeriod],
  );
  const slaCompliance = openInPeriod.length === 0
    ? 100
    : Math.round(100 - (slaAtRisk / openInPeriod.length) * 100);

  // AMC revenue — annualised contract value prorated to the period.
  // Real cash collected lives in amc_payments (not hydrated here); the
  // prorated number is the right scale for a manager-level KPI.
  const annualAmcValue = useMemo(
    () => Object.values(db.AMCS)
      .filter(a => a.contract_status === "active")
      .reduce((sum, a) => sum + (a.value || 0), 0),
    [],
  );
  const amcRevenuePeriod = Math.round(annualAmcValue * (daysIn(period) / 365));

  // Technician utilisation — scheduled-hours in period ÷ available-hours.
  // Available = field-staff headcount × 8h × days in period.
  const fieldStaffCount = useMemo(
    () => Object.values(db.USERS).filter(u =>
      u.role === "worker" || u.role === "lead_worker" || u.role === "driver"
    ).length,
    [],
  );
  const scheduledHours = useMemo(
    () => wosInPeriod.reduce((sum, w) => {
      const s = new Date(w.scheduledStart).getTime();
      const e = new Date(w.scheduledEnd).getTime();
      if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return sum;
      return sum + (e - s) / 3_600_000;
    }, 0),
    [wosInPeriod],
  );
  const availableHours = fieldStaffCount * 8 * daysIn(period);
  const utilization = availableHours > 0
    ? Math.min(100, Math.round((scheduledHours / availableHours) * 100))
    : 0;

  // My MC jobs that overlap the period (long-running installs span
  // months — using overlap rather than "starts/ends in" keeps them
  // visible on shorter chips).
  const myProjectsInPeriod = useMemo(
    () => Object.values(db.PROJECTS).filter(p =>
      p.manager === me.id && spansPeriod(p.startedAt, p.dueAt, period)
    ),
    [me.id, period],
  );

  return (
    <div className="main-pad">
      <PageHeader
        eyebrow={"Thursday · 16 May · 09:42 GST"}
        title={"Morning, " + me.name.split(" ")[0] + "."}
        sub={<><span style={{ color: "var(--ink)", fontWeight: 600 }}>4 decisions</span> waiting · 1 SLA at risk · DAMAC AMC-091 cleared payment overnight.</>}
        right={
          <div className="row gap-2">
            <div className="seg hide-mobile">
              {TIMEFRAME_KEYS.map(tf => (
                <button key={tf}
                  data-on={String(timeframe === tf)}
                  onClick={() => setTimeframe(tf)}>
                  {TIMEFRAME_TAB_LABEL[tf]}
                </button>
              ))}
            </div>
            <SignOutButton />
          </div>
        }
      />

      <AmcPauseAlert />
      <CriticalAlertsWidget />
      <ActiveProjectsWidget />
      <ActiveWorkWidget scope="all" />
      <UpcomingThisWeekWidget />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 24 }}>
        <KPI label={"Open work orders · " + period.shortLabel} value={openInPeriod.length} accent="primary">
          <div className="row gap-2" style={{ marginTop: 6 }}>
            <span className={"badge " + (slaAtRisk > 0 ? "badge-warning" : "badge-outline")}>
              <span className={"dot " + (slaAtRisk > 0 ? "dot-warning" : "dot")} /> {slaAtRisk} over SLA
            </span>
          </div>
        </KPI>
        <KPI label="SLA compliance" value={slaCompliance + "%"}>
          <div className={"progress " + (slaCompliance >= 85 ? "progress-success" : "progress-warning")} style={{ marginTop: 8 }}>
            <div style={{ width: slaCompliance + "%" }} />
          </div>
        </KPI>
        <KPI label={"Hours tracked · " + period.shortLabel}
          value={Math.round(totalTrackedMinutes(period.start, period.end) / 60) + "h"}
          sub="Worker time logged via Start/Done" />
        <KPI label={"AMC revenue · " + period.label}
          value={fmtMoney(amcRevenuePeriod, { compact: true })}
          sub={`Prorated from ${fmtMoney(annualAmcValue, { compact: true })} annual`} />
        <KPI label={"Technician utilisation · " + period.shortLabel}
          value={utilization + "%"}
          sub={`${Math.round(scheduledHours)}h scheduled / ${availableHours}h available`} />
      </div>

      <MyProjectsCard
        title={"My Main Contractor jobs · " + period.label}
        projects={myProjectsInPeriod}
        seeAllHref="/projects?manager=me&status=active"
        emptyMessage={`No Main Contractor jobs active ${period.label.toLowerCase()}`}
      />

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }}>
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row between" style={{ padding: "18px 20px 8px" }}>
            <div>
              <div className="row gap-2" style={{ font: "var(--t-h3)" }}>
                <span className="dot dot-success dot-pulse" /> Live operations feed
              </div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Scoped to your jobs · auto-refresh</div>
            </div>
            <div className="seg">
              <button data-on={String(feedFilter === "all")} onClick={() => setFeedFilter("all")}>All</button>
              <button data-on={String(feedFilter === "check")} onClick={() => setFeedFilter("check")}>Check-ins</button>
              <button data-on={String(feedFilter === "sla")} onClick={() => setFeedFilter("sla")}>SLA</button>
            </div>
          </div>
          <div style={{ padding: "0 8px 12px" }}>
            {feed.map(f => <FeedItem key={f.id} item={f} onClick={() => followTarget(f.target)} />)}
          </div>
        </section>

        <div className="col" style={{ gap: 20 }}>
          <section className="card card-pad">
            <CardHead title={"Approvals · " + approvals.length} sub="Routed to you"
              right={<a onClick={() => go("approvals")} style={{ font: "var(--t-small)", color: "var(--pri-700)", cursor: "pointer", fontWeight: 500 }}>See all</a>} />
            <div className="col gap-2">
              {approvals.map(a => <ApprovalCard key={a.id} ap={a} onClick={() => openApproval(a.id)} />)}
            </div>
          </section>

          <section className="card card-pad">
            <CardHead title="Forecasted risks" sub="3-week horizon" right={<span className="badge badge-outline">Auto</span>} />
            <div className="col" style={{ gap: 10 }}>
              {db.RISKS.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: r.severity === "danger" ? "var(--dan-100)" : r.severity === "warning" ? "var(--warn-100)" : "var(--info-100)",
                    color: r.severity === "danger" ? "var(--dan-700)" : r.severity === "warning" ? "var(--warn-700)" : "var(--info-700)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name={r.kind === "Material" ? "package" : r.kind === "Manpower" ? "users" : r.kind === "AMC" ? "shieldCheck" : "alertCircle"} size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "var(--t-body-md)" }}>{r.label}</div>
                    <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <CardHead title={"Today's schedule · " + todayWOs.length + " work orders"} sub="Tap any card to see the work order"
          right={<button className="btn btn-ghost btn-sm" onClick={() => go("scheduling")}><Icon name="calendar" size={14} /> Open calendar</button>} />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {todayWOs.map(wo => <WoCard key={wo.id} wo={wo} compact onClick={() => openWO(wo.id)} />)}
        </div>
      </section>
    </div>
  );
}

/* ─── Field worker dashboard ────────────────────────────── */
function FieldDashboard() {
  const { me, role, openWO, openReplacement, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const myWOs = Object.values(db.WORK_ORDERS).filter(w =>
    w.assigned && w.assigned.includes(me.id) && w.scheduledStart.startsWith("2025-05-16"));
  const upcoming = Object.values(db.WORK_ORDERS).filter(w =>
    w.assigned && w.assigned.includes(me.id) && w.scheduledStart > "2025-05-16");
  // Migration 0014: "live" now means actively in-progress (we surface
  // waiting_material separately if we ever want a pause indicator).
  const live = myWOs.find(w => w.status === "in_progress");
  const liveSite = live ? db.site(live.site) : null;
  // All of my non-terminal WOs across the calendar — what the user actually
  // needs to act on right now (regardless of date).
  const myOpenAll = Object.values(db.WORK_ORDERS).filter(w =>
    w.assigned && w.assigned.includes(me.id) &&
    w.status !== "closed" && w.status !== "cancelled" && w.status !== "done"
  );

  const startNavigation = () => {
    if (!liveSite) return;
    const ok = navigateTo({ name: liveSite.name, area: liveSite.area });
    if (ok) fireToast(`Opening Google Maps - ${liveSite.name}`);
    else fireToast("Site location unavailable");
  };

  return (
    <div className="main-pad">
      <PageHeader
        eyebrow={"Thursday · 16 May"}
        title={"My day, " + me.name.split(" ")[0]}
        sub={`${myWOs.length} work orders · est. 7h 30m on site`}
        right={<SignOutButton />}
      />

      <CriticalAlertsWidget />
      <ActiveProjectsWidget />
      <Next3DaysWidget />

      {live && (
        <div className="card card-accent card-pad" style={{ marginBottom: 16 }}>
          <div className="row gap-2" style={{ marginBottom: 6 }}>
            <span className="dot dot-primary dot-pulse" />
            <span style={{ font: "var(--t-micro)", color: "var(--pri-700)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Live</span>
          </div>
          <div style={{ font: "var(--t-h3)" }}>{live.title}</div>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
            {(db.site(live.site)?.name ?? "-")} · {live.scheduledStart && live.scheduledEnd
              ? live.scheduledStart.split("T")[1].slice(0, 5) + " – " + live.scheduledEnd.split("T")[1].slice(0, 5)
              : "-"}
          </div>
          <div className="row gap-2" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => openWO(live.id)}>Continue work <Icon name="arrowRight" size={14} /></button>
            <button className="btn btn-ghost" onClick={startNavigation} disabled={!liveSite}>
              <Icon name="navigation" size={14} /> Navigate
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", marginBottom: 24 }}>
        <KPI label="Today" value={myWOs.length} sub="work orders" />
        <KPI label="This week" value="12" sub="est. 38h" />
        <KPI label="Pending leave" value="0" sub="all clear" />
      </div>

      {role === "lead_worker" && (
        <MyProjectsCard
          title="My Main Contractor jobs"
          projects={Object.values(db.PROJECTS).filter(p => p.leadTechId === me.id)}
          seeAllHref={`/projects?status=active`}
          emptyMessage="No Main Contractor jobs assigned to you yet"
        />
      )}

      <ActiveWorkWidget scope="mine" />

      <MyOpenWorkOrders openWOs={myOpenAll} onOpen={openWO}
        onQuickAction={async (wo, next) => {
          // The dashboard quick-action was the user-facing Start/Done
          // button most of the team uses. Previously it only flipped
          // wo.status, never created a work_order_time_entries row —
          // so the boss's "we have no time tracking" was literally
          // true even though the schema/triggers/helpers all worked.
          // Wired up below to call startWorkOrder / completeWorkOrder
          // alongside the status flip.
          const prev = wo.status;

          // ── Transition INTO in_progress → create a time entry first ──
          // Covers: assigned/open/waiting_material → in_progress
          // startWorkOrder already attempts the status flip best-effort
          // (succeeds for md/admin/manager/lead_worker via wo_write;
          // silently no-ops for regular workers — which is the existing
          // RLS contract). We DON'T also call updateWorkOrder here so
          // we don't double-fire the status flip.
          if (next === "in_progress" && prev !== "in_progress") {
            const r = await startWorkOrder(wo.id, me.id);
            if (!r.ok) { fireToast(`Couldn't start: ${r.error}`); return; }
            bumpData();
            fireToast(`${wo.code} started`);
            return;
          }

          // ── Transition OUT OF in_progress → close own entry first ──
          // Covers: in_progress → pending_confirmation / done
          if (prev === "in_progress"
              && (next === "pending_confirmation" || next === "done")) {
            const r1 = await completeWorkOrder(wo.id, me.id);
            if (!r1.ok) { fireToast(`Couldn't close timer: ${r1.error}`); return; }
            // Now flip status. Optimistic mirror update + revert on fail.
            db.WORK_ORDERS[wo.id] = { ...wo, status: next };
            bumpData();
            const r2 = await updateWorkOrder(wo.id, { status: next });
            if (!r2.ok) {
              db.WORK_ORDERS[wo.id] = { ...wo, status: prev };
              bumpData();
              fireToast(`Timer closed but couldn't update status: ${r2.error}`);
              return;
            }
            fireToast(`${wo.code} → ${WO_STATUS_LABEL[next]}`);
            return;
          }

          // ── Default fallback ──
          // Status-only transitions that aren't tied to a clock-in/out
          // (none in `quickAction` today, but defensive for future
          // additions like "Cancel" / "Block on material").
          db.WORK_ORDERS[wo.id] = { ...wo, status: next };
          bumpData();
          const res = await updateWorkOrder(wo.id, { status: next });
          if (!res.ok) {
            db.WORK_ORDERS[wo.id] = { ...wo, status: prev };
            bumpData();
            fireToast(`Couldn't update: ${res.error}`);
            return;
          }
          fireToast(`${wo.code} → ${WO_STATUS_LABEL[next]}`);
        }} />

      <MyReplacementRequests userId={me.id} onOpen={openReplacement} />
      {role === "lead_worker" && (
        <>
          <LeadPendingApproval userId={me.id} onOpen={openReplacement} />
          <LeadPendingConfirmation userId={me.id} onOpen={openReplacement} />
        </>
      )}

      <h3 style={{ font: "var(--t-h2)", margin: "0 0 12px" }}>Next up</h3>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {myWOs.filter(w => w.status !== "in_progress").map(wo => (
          <WoCard key={wo.id} wo={wo} onClick={() => openWO(wo.id)} />
        ))}
      </div>

      {upcoming.length > 0 && (
        <>
          <h3 style={{ font: "var(--t-h2)", margin: "24px 0 12px" }}>Upcoming</h3>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {upcoming.map(wo => <WoCard key={wo.id} wo={wo} compact onClick={() => openWO(wo.id)} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── MD strategic dashboard ────────────────────────────── */
function ComplianceRow({ label, sub, ok, warn }: { label: string; sub: string; ok?: boolean; warn?: boolean }) {
  return (
    <div className="row gap-3" style={{ padding: "10px 12px", background: "var(--bg-muted)", borderRadius: "var(--r-md)" }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: warn ? "var(--warn-100)" : "var(--suc-100)",
        color: warn ? "var(--warn-700)" : "var(--suc-700)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name={warn ? "alertCircle" : "shieldCheck"} size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ font: "var(--t-body-md)" }}>{label}</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{sub}</div>
      </div>
    </div>
  );
}

function MdDashboard() {
  const { me, openApproval, fmtMoney } = useApp();
  return (
    <div className="main-pad">
      <PageHeader
        eyebrow="Strategic overview · Q2 2025"
        title={"Good morning, " + me.name.split(" ")[0]}
        sub="14 active jobs · 42 AMCs live · 6 countries"
        right={<SignOutButton />}
      />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 24 }}>
        <KPI accent="primary" label="MTD revenue" value={fmtMoney(1_280_000, { compact: true })} sub="8.2% vs LM" trend="up" />
        <KPI label="AMC base" value={fmtMoney(1_840_000, { compact: true })} sub="42 contracts · 78% renewal rate" />
        <KPI accent="violet" label="Job pipeline" value={fmtMoney(14_200_000, { compact: true })} sub="11 quotes in review" />
        <KPI label="DSO" value="48 days" sub="↑ 4d vs target" trend="down" />
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
        <section className="card card-pad">
          <CardHead title="Revenue by stream" sub="Last 6 months" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 220, padding: "12px 0" }}>
            {[
              { m: "Dec", proj: 720, amc: 280, rep: 140 },
              { m: "Jan", proj: 880, amc: 320, rep: 110 },
              { m: "Feb", proj: 940, amc: 360, rep: 180 },
              { m: "Mar", proj: 1020, amc: 380, rep: 140 },
              { m: "Apr", proj: 1140, amc: 420, rep: 160 },
              { m: "May", proj: 1280, amc: 482, rep: 190 },
            ].map((b, i) => {
              const max = 2000;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: "100%", maxWidth: 56, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 3 }}>
                    <div style={{ background: "var(--pri-500)", height: (b.proj / max) * 100 + "%", borderRadius: "6px 6px 0 0" }} />
                    <div style={{ background: "var(--sec-500)", height: (b.amc / max) * 100 + "%" }} />
                    <div style={{ background: "var(--acc-500)", height: (b.rep / max) * 100 + "%" }} />
                  </div>
                  <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{b.m}</div>
                </div>
              );
            })}
          </div>
          <div className="row gap-3" style={{ marginTop: 8, font: "var(--t-small)", color: "var(--ink-mute)" }}>
            <span><span className="dot dot-primary" /> Main Contractor</span>
            <span><span className="dot" style={{ background: "var(--sec-500)" }} /> AMC</span>
            <span><span className="dot" style={{ background: "var(--acc-500)" }} /> Repair</span>
          </div>
        </section>

        <section className="card card-pad">
          <CardHead title="High-value escalations" sub="MD-level only" />
          <div className="col gap-2">
            {(() => {
              // These two IDs come from the prototype mock seed. After switching
              // to live Supabase data, they may not exist - render whatever does.
              const escalations = ["ap_439", "ap_438"]
                .map(id => db.APPROVALS[id])
                .filter((a): a is NonNullable<typeof a> => Boolean(a));
              if (escalations.length === 0) {
                return <EmptyState icon="inbox" title="No escalations" sub="MD-level approvals will surface here." />;
              }
              return escalations.map(a => (
                <ApprovalCard key={a.id} ap={a} onClick={() => openApproval(a.id)} />
              ));
            })()}
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", marginTop: 20 }}>
        <section className="card card-pad">
          <CardHead title="Country revenue split" />
          <div className="col" style={{ gap: 10 }}>
            {[
              { c: "UAE", v: 1820, pct: 71, color: "var(--pri-500)" },
              { c: "KSA", v: 380, pct: 15, color: "var(--sec-500)" },
              { c: "Ethiopia", v: 180, pct: 7, color: "var(--acc-500)" },
              { c: "India", v: 120, pct: 5, color: "var(--info-500)" },
              { c: "Uganda", v: 60, pct: 2, color: "var(--warn-500)" },
            ].map(r => (
              <div key={r.c}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ font: "var(--t-small)" }}>{r.c}</span>
                  <span className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{fmtMoney(r.v * 1000, { compact: true })} · {r.pct}%</span>
                </div>
                <div className="progress"><div style={{ width: r.pct + "%", background: r.color }} /></div>
              </div>
            ))}
          </div>
        </section>
        <section className="card card-pad">
          <CardHead title="Compliance" />
          <div className="col" style={{ gap: 10 }}>
            <ComplianceRow label="SIRA registration" sub="Renews 23 Jun · 38 days" ok />
            <ComplianceRow label="Trade license" sub="Renews 14 Sep" ok />
            <ComplianceRow label="3 staff visas" sub="2 expiring within 60 days" warn />
            <ComplianceRow label="Insurance" sub="Auto-renew · valid" ok />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Service Support dashboard ─────────────────────────── */
function RepairRow({ t, onClick }: { t: RepairTicket; onClick?: () => void }) {
  const c = db.cust(t.customer);
  return (
    <div className="card card-hover" style={{ padding: 14 }} onClick={onClick}>
      <div className="row between">
        <div className="row gap-2">
          <span className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>{t.code}</span>
          <StatusBadge state={t.state} />
          {t.flagged && <span className="badge badge-danger">{t.flagged}</span>}
        </div>
        <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{t.openedAt}</span>
      </div>
      <div style={{ font: "var(--t-body-md)", marginTop: 6 }}>{t.title}</div>
      <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{c?.name ?? "-"}</div>
    </div>
  );
}

function SupportDashboard() {
  const { go } = useApp();
  const tickets = Object.values(db.REPAIRS);
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Service desk" title="Repair queue"
        sub={tickets.filter(t => t.state !== "Resolved").length + " open tickets · 2 SLA at risk"}
        right={<SignOutButton />} />
      <CriticalAlertsWidget />
      <ActiveProjectsWidget />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 24 }}>
        <KPI accent="primary" label="Open tickets" value={tickets.filter(t => t.state !== "Resolved").length} />
        <KPI label="SLA at risk" value="2" sub="next breach in 12m" trend="down" />
        <KPI label="Avg resolution" value="3.2h" />
        <KPI label="Repeat-failure flags" value="1" sub="CAM-B-204" />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="row between" style={{ padding: 16 }}>
          <h3 style={{ font: "var(--t-h3)", margin: 0 }}>All tickets</h3>
          <button className="btn btn-primary btn-sm" onClick={() => go("repair")}>Open repair module</button>
        </div>
        <div style={{ padding: 12 }}>
          <div className="col gap-2">
            {tickets.map(t => <RepairRow key={t.id} t={t} onClick={() => go("repair")} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Accounts dashboard ────────────────────────────────── */
function AccountsDashboard() {
  const { fmtMoney } = useApp();
  // Note: accounts role can't auto-pause (RLS rejects), so no
  // useAutoPauseExpiredAmcs hook here — they only consume the alert.
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Finance" title="Accounts overview" sub="Invoicing, payments, AMC billing" right={<SignOutButton />} />
      <AmcPauseAlert />
      <CriticalAlertsWidget />
      <ActiveProjectsWidget />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 24 }}>
        <KPI accent="primary" label="Outstanding AR" value={fmtMoney(2_840_000, { compact: true })} sub="48d DSO" trend="down" />
        <KPI label="MTD invoiced" value={fmtMoney(1_280_000, { compact: true })} sub="8.2% vs LM" trend="up" />
        <KPI label="AMC due billing" value="11" sub={fmtMoney(384_000, { compact: true })} />
        <KPI label="Approval queue" value="4" />
      </div>
      <EmptyState icon="receipt" title="Accountant module — Coming soon"
        sub="AR aging, payment reconciliation against AMC contracts, free-call to invoice conversion, and the AMC reactivation queue will be available in the next release." />
    </div>
  );
}

/* ─── Sales dashboard ───────────────────────────────────── */
function SalesDashboard() {
  const { fmtMoney } = useApp();
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Sales" title="My pipeline" sub={`11 quotes in flight · ${fmtMoney(14_200_000, { compact: true })} pipeline`} right={<SignOutButton />} />
      <CriticalAlertsWidget />
      <ActiveProjectsWidget />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 24 }}>
        <KPI accent="primary" label="Open quotations" value="11" sub={fmtMoney(14_200_000, { compact: true })} />
        <KPI label="AMC renewals · 60d" value="11" sub={`${fmtMoney(384_000, { compact: true })} possible`} />
        <KPI label="Win rate (TTM)" value="62%" trend="up" />
        <KPI label="Lead aging" value="5" sub="leads >14 days" trend="down" />
      </div>
      <EmptyState icon="trendingUp" title="Sales workspace — Coming soon"
        sub="Pipeline, quotation tracking, AMC renewal queue, lead aging, and your communication timeline will be available in the next release." />
    </div>
  );
}

/* ─── Operational Overview ──────────────────────────────────
   Slotted into the Admin/MD dashboard below the System Admin
   section so the org's top-level decision-makers can see what's
   actually moving in field ops without role-switching to Manager.
   Owns its own timeframe state (same Today/Week/Month/Quarter
   chip as ManagerDashboard, shares lib/timeframe helpers).
============================================================ */
interface HistoryEvent {
  source: "wo" | "amc" | "project";
  id: string;
  entityId: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  changedAt: string;
}

interface ScheduleRow {
  id: string;
  amc_contract_id: string;
  service_number: number;
  scheduled_date: string;
  status: "scheduled" | "in_progress" | "completed" | "skipped" | "overdue";
}

function OperationalOverview() {
  const { go, openWO, openProject, openAmc, dataVersion } = useApp();
  void dataVersion;
  const [timeframe, setTimeframe] = useState<Timeframe>("today");
  const period = useMemo(() => periodFor(timeframe), [timeframe]);

  // ── KPI tile 1 — Active Projects (overlap with period) ──
  const projectsActive = useMemo(() => {
    const all = Object.values(db.PROJECTS);
    return all.filter(p =>
      (p.status === "planned" || p.status === "in_progress" || p.status === "on_hold")
      && spansPeriod(p.startedAt, p.dueAt, period)
    );
  }, [period]);
  const projBreakdown = {
    planned:     projectsActive.filter(p => p.status === "planned").length,
    in_progress: projectsActive.filter(p => p.status === "in_progress").length,
    on_hold:     projectsActive.filter(p => p.status === "on_hold").length,
  };

  // ── KPI tile 2 — Live AMC contracts ──
  const liveAmcs = useMemo(
    () => Object.values(db.AMCS).filter(a => a.contract_status === "active"),
    [],
  );

  // ── KPI tile 3 — Open Work Orders in period ──
  const wosInPeriod = useMemo(
    () => Object.values(db.WORK_ORDERS).filter(w => inPeriod(w.scheduledStart, period)),
    [period],
  );
  const openWosInPeriod = useMemo(
    () => wosInPeriod.filter(w =>
      w.status === "open" || w.status === "assigned" ||
      w.status === "in_progress" || w.status === "waiting_material" ||
      w.status === "pending_confirmation"
    ),
    [wosInPeriod],
  );
  const woBreakdown = {
    in_progress: openWosInPeriod.filter(w => w.status === "in_progress").length,
    pending:     openWosInPeriod.filter(w => w.status === "open" || w.status === "assigned").length,
  };

  // ── KPI tile 4 — Pending Replacement actions (Sub-Step 2)
  //    Replaces the interim "Pending approvals" reading. Counts RRs
  //    awaiting either Lead-Tech approval OR Lead-Tech confirmation —
  //    these are the two human-gated stages of the lifecycle.
  const pendingReplacements = useMemo(
    () => Object.values(db.REPLACEMENTS).filter(r =>
      r.status === "requested" || r.status === "pending_confirmation"
    ),
    [],
  );

  // ── Activity feed (fetch from 3 history tables in parallel) ──
  const [feed, setFeed] = useState<HistoryEvent[] | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFeedError(null);
      try {
        const supa = supabaseBrowser();
        const [wo, amc, proj] = await Promise.all([
          supa.from("work_order_status_history")
            .select("id, work_order_id, old_status, new_status, changed_by, changed_at")
            .order("changed_at", { ascending: false }).limit(20),
          supa.from("amc_status_history")
            .select("id, amc_contract_id, old_status, new_status, changed_by, changed_at")
            .order("changed_at", { ascending: false }).limit(20),
          supa.from("project_status_history")
            .select("id, project_id, old_status, new_status, changed_by, changed_at")
            .order("changed_at", { ascending: false }).limit(20),
        ]);
        if (cancelled) return;
        const events: HistoryEvent[] = [
          ...((wo.data ?? []) as Array<{ id: string; work_order_id: string; old_status: string | null; new_status: string; changed_by: string | null; changed_at: string }>)
            .map(r => ({ source: "wo" as const, id: r.id, entityId: r.work_order_id, oldStatus: r.old_status, newStatus: r.new_status, changedBy: r.changed_by, changedAt: r.changed_at })),
          ...((amc.data ?? []) as Array<{ id: string; amc_contract_id: string; old_status: string | null; new_status: string; changed_by: string | null; changed_at: string }>)
            .map(r => ({ source: "amc" as const, id: r.id, entityId: r.amc_contract_id, oldStatus: r.old_status, newStatus: r.new_status, changedBy: r.changed_by, changedAt: r.changed_at })),
          ...((proj.data ?? []) as Array<{ id: string; project_id: string; old_status: string | null; new_status: string; changed_by: string | null; changed_at: string }>)
            .map(r => ({ source: "project" as const, id: r.id, entityId: r.project_id, oldStatus: r.old_status, newStatus: r.new_status, changedBy: r.changed_by, changedAt: r.changed_at })),
        ];
        events.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
        setFeed(events.slice(0, 10));
      } catch (e) {
        if (!cancelled) {
          setFeedError((e as Error).message || "Couldn't load activity feed");
          setFeed([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [dataVersion]);

  // ── Upcoming AMC services in period ──
  const [upcomingAmc, setUpcomingAmc] = useState<ScheduleRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const startIso = period.start.toISOString().slice(0, 10);
      const endIso   = period.end.toISOString().slice(0, 10);
      const { data, error } = await supabaseBrowser()
        .from("amc_service_schedule")
        .select("id, amc_contract_id, service_number, scheduled_date, status")
        .gte("scheduled_date", startIso)
        .lte("scheduled_date", endIso)
        .in("status", ["scheduled", "in_progress", "overdue"])
        .order("scheduled_date", { ascending: true })
        .limit(20);
      if (cancelled) return;
      if (error) { setUpcomingAmc([]); return; }
      setUpcomingAmc((data ?? []) as ScheduleRow[]);
    })();
    return () => { cancelled = true; };
  }, [period, dataVersion]);

  // ── Upcoming project due dates in period ──
  // Note: migration 0001 milestones table has no due_date column, so this
  // sub-list uses project.dueAt instead. See report for follow-up.
  const upcomingProjects = useMemo(
    () => Object.values(db.PROJECTS)
      .filter(p => inPeriod(p.dueAt, period))
      .sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""))
      .slice(0, 5),
    [period],
  );

  // ── Upcoming scheduled WOs in period (non-terminal) ──
  const upcomingWos = useMemo(
    () => wosInPeriod
      .filter(w =>
        w.status !== "done" && w.status !== "closed" && w.status !== "cancelled"
      )
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
      .slice(0, 5),
    [wosInPeriod],
  );

  return (
    <section style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--divider)" }}>
      <div className="row between" style={{ flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ font: "var(--t-h3)", color: "var(--ink)" }}>Operational Overview</div>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
            Live view of projects, contracts, and field work · {period.label.toLowerCase()}
          </div>
        </div>
        <div className="seg hide-mobile">
          {TIMEFRAME_KEYS.map(tf => (
            <button key={tf}
              data-on={String(timeframe === tf)}
              onClick={() => setTimeframe(tf)}>
              {TIMEFRAME_TAB_LABEL[tf]}
            </button>
          ))}
        </div>
      </div>

      <UpcomingThisWeekWidget />

      {/* ── KPI tiles ── */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 24 }}>
        <ClickableKpi onClick={() => go("projects")}
          label="Active projects"
          value={projectsActive.length}
          sub={`${projBreakdown.planned} planned · ${projBreakdown.in_progress} in progress · ${projBreakdown.on_hold} on hold`}
          accent="primary" />
        <ClickableKpi onClick={() => go("amc")}
          label="Live AMC contracts"
          value={liveAmcs.length}
          sub={liveAmcs.length > 0 ? "Tap to open contracts" : "No active contracts"} />
        <ClickableKpi onClick={() => go("workorders")}
          label={"Open work orders · " + period.shortLabel}
          value={openWosInPeriod.length}
          sub={`${woBreakdown.in_progress} in progress · ${woBreakdown.pending} pending`} />
        <ClickableKpi onClick={() => go("replacements", { status: "requested" })}
          label="Replacement actions"
          value={pendingReplacements.length}
          sub={pendingReplacements.length > 0 ? "Awaiting Lead Tech approval / confirmation" : "Queue clear"} />
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
        {/* ── Recent activity ── */}
        <section className="card card-pad">
          <CardHead title="Recent activity" sub="Latest changes across the system" />
          {feed === null ? (
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>
          ) : feedError ? (
            <div style={{ font: "var(--t-small)", color: "var(--dan-700)", padding: 8 }}>{feedError}</div>
          ) : feed.length === 0 ? (
            <EmptyState icon="inbox" title="No recent activity yet"
              sub="Status changes across work orders, AMCs, and projects will appear here." />
          ) : (
            <div className="col" style={{ gap: 6 }}>
              {feed.map(e => (
                <ActivityRow key={e.source + ":" + e.id} ev={e}
                  onOpen={() => {
                    if (e.source === "wo")       openWO(e.entityId);
                    else if (e.source === "amc") openAmc(e.entityId);
                    else                          openProject(e.entityId);
                  }} />
              ))}
            </div>
          )}
        </section>

        {/* ── Upcoming events (3 sub-lists) ── */}
        <section className="card card-pad">
          <CardHead title={"Upcoming · " + period.label.toLowerCase()}
            sub="AMC services, project milestones, scheduled work" />
          <div className="col" style={{ gap: 16 }}>
            <UpcomingSubList
              title="AMC services"
              icon="shieldCheck"
              loading={upcomingAmc === null}
              empty="No AMC services scheduled"
              items={(upcomingAmc ?? []).slice(0, 5).map(s => {
                const a = db.amc(s.amc_contract_id);
                return {
                  key: s.id,
                  primary: (a?.code ?? "—") + " · Q" + s.service_number,
                  secondary: (a ? db.cust(a.customer)?.name ?? "—" : "—"),
                  trailing: formatShortDate(s.scheduled_date),
                  onClick: a ? () => openAmc(a.id) : undefined,
                };
              })}
              moreCount={(upcomingAmc ?? []).length > 5 ? (upcomingAmc ?? []).length - 5 : 0}
              onMore={() => go("amc")} />

            <UpcomingSubList
              title="Project milestones"
              icon="briefcase"
              loading={false}
              empty="No project milestones due"
              items={upcomingProjects.map(p => ({
                key: p.id,
                primary: p.name,
                secondary: p.code + " · " + (db.cust(p.customer)?.name ?? "—"),
                trailing: formatShortDate(p.dueAt),
                onClick: () => openProject(p.id),
              }))}
              moreCount={0}
              onMore={() => go("projects")} />

            <UpcomingSubList
              title="Work orders"
              icon="package"
              loading={false}
              empty="No work orders scheduled"
              items={upcomingWos.map(w => ({
                key: w.id,
                primary: w.title,
                secondary: w.code + " · " + (db.cust(w.customer)?.name ?? "—"),
                trailing: formatShortDateTime(w.scheduledStart),
                onClick: () => openWO(w.id),
              }))}
              moreCount={wosInPeriod.filter(w =>
                w.status !== "done" && w.status !== "closed" && w.status !== "cancelled"
              ).length > 5
                ? wosInPeriod.filter(w =>
                    w.status !== "done" && w.status !== "closed" && w.status !== "cancelled"
                  ).length - 5
                : 0}
              onMore={() => go("workorders")} />
          </div>
        </section>
      </div>
    </section>
  );
}

function ClickableKpi({ onClick, label, value, sub, accent }: {
  onClick: () => void;
  label: string;
  value: number;
  sub: string;
  accent?: "primary" | "violet";
}) {
  return (
    <div onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{ cursor: "pointer" }}>
      <KPI label={label} value={value} sub={sub} accent={accent} />
    </div>
  );
}

function ActivityRow({ ev, onOpen }: { ev: HistoryEvent; onOpen: () => void }) {
  const actor = ev.changedBy ? db.user(ev.changedBy) : null;
  const meta = (() => {
    if (ev.source === "wo") {
      const w = db.wo(ev.entityId);
      return { icon: "briefcase" as const, label: "work order", code: w?.code ?? "—" };
    }
    if (ev.source === "amc") {
      const a = db.amc(ev.entityId);
      return { icon: "shieldCheck" as const, label: "AMC", code: a?.code ?? "—" };
    }
    const p = db.proj(ev.entityId);
    return { icon: "layers" as const, label: "project", code: p?.code ?? "—" };
  })();
  const phrase = ev.oldStatus
    ? `changed ${meta.label} ${meta.code} to ${ev.newStatus.replace(/_/g, " ")}`
    : `created ${meta.label} ${meta.code} as ${ev.newStatus.replace(/_/g, " ")}`;
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="row gap-3"
      style={{
        padding: "8px 10px", borderRadius: "var(--r-md)",
        cursor: "pointer", minHeight: 44,
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: "var(--bg-muted)", color: "var(--ink-mute)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name={meta.icon} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ font: "var(--t-small)" }} title={`${actor?.name ?? "Unknown user"} ${phrase}`}>
          <span style={{ fontWeight: 600 }}>{actor?.name ?? "Unknown user"}</span> {phrase}
        </div>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>
          {formatRelativeTime(ev.changedAt)}
        </div>
      </div>
    </div>
  );
}

interface UpcomingItem {
  key: string;
  primary: string;
  secondary: string;
  trailing: string;
  onClick?: () => void;
}

function UpcomingSubList({ title, icon, loading, empty, items, moreCount, onMore }: {
  title: string;
  icon: "shieldCheck" | "briefcase" | "package";
  loading: boolean;
  empty: string;
  items: UpcomingItem[];
  moreCount: number;
  onMore: () => void;
}) {
  return (
    <div>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
        <Icon name={icon} size={14} style={{ color: "var(--ink-mute)" }} />
        <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{title}</span>
      </div>
      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 6 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 6 }}>{empty}</div>
      ) : (
        <div className="col" style={{ gap: 4 }}>
          {items.map(it => (
            <div key={it.key} onClick={it.onClick}
              role={it.onClick ? "button" : undefined}
              tabIndex={it.onClick ? 0 : undefined}
              onKeyDown={e => {
                if (it.onClick && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  it.onClick();
                }
              }}
              className="row gap-3"
              style={{
                padding: "6px 8px", borderRadius: "var(--r-sm)",
                cursor: it.onClick ? "pointer" : "default", minHeight: 36,
              }}
              onMouseEnter={e => { if (it.onClick) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"; }}
              onMouseLeave={e => { if (it.onClick) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="truncate" style={{ font: "var(--t-small)", fontWeight: 500 }}>{it.primary}</div>
                <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{it.secondary}</div>
              </div>
              <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", flexShrink: 0 }}>{it.trailing}</span>
            </div>
          ))}
          {moreCount > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, alignSelf: "flex-start" }}
              onClick={onMore}>
              View all ({moreCount} more) <Icon name="arrowRight" size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const m = Math.round(diffMs / 60_000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7)   return `${d}d ago`;
  return fmtMonthDay(new Date(iso));
}

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso : iso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return iso;
  return fmtMonthDay(d);
}

function formatShortDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtDateTime(d);
}

/* ─── Admin dashboard ───────────────────────────────────── */
function AdminDashboard() {
  const { go, openCreate, role } = useApp();
  useAutoPauseExpiredAmcs(role);
  const users = Object.values(db.USERS);
  // Operational Overview is for admin + md only. super_admin is a platform
  // role — they get the platform-only welcome card (handled by the role
  // dispatcher above), so they never reach this component.
  const showOperationalOverview = role === "admin" || role === "md";
  return (
    <div className="main-pad">
      <PageHeader eyebrow="System administration" title="Installtec OS"
        sub="Users, roles, permissions, approval chains, audit log"
        right={
          <button className="btn btn-primary" onClick={() => openCreate("user")}><Icon name="plus" size={14} /> New user</button>
        } />
      <AmcPauseAlert />
      <CriticalAlertsWidget />
      <ActiveProjectsWidget />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 24 }}>
        <KPI accent="primary" label="Active users" value={users.filter(u => u.role !== "subcontractor").length} sub="across 11 roles" />
        <KPI label="Approval chains" value="8" sub="all active" />
        <KPI label="2FA enabled" value="9 / 12" sub="3 pending" trend="down" />
        <KPI label="Audit events (24h)" value="148" />
      </div>
      {role === "super_admin" && (
        <section className="card card-pad">
          <CardHead title="Recently added" right={<button className="btn btn-ghost btn-sm" onClick={() => go("admin")}>Manage users</button>} />
          <div className="col gap-2">
            {users.slice(0, 5).map(u => (
              <div key={u.id} className="row gap-3" style={{ padding: "10px 12px", borderRadius: "var(--r-md)" }}>
                <span className={"avatar avatar-md avatar-" + (u.tint || "primary")}>{u.initials}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "var(--t-body-md)" }}>{u.name}</div>
                  <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{ROLE_LABELS[u.role]} · {u.email}</div>
                </div>
                <span className="badge badge-success"><span className="dot dot-success" /> Active</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {showOperationalOverview && <OperationalOverview />}
    </div>
  );
}
