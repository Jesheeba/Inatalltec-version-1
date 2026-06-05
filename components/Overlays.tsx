"use client";
// ============================================================
// Overlays - Command Palette, Notification Drawer, Toast,
// WO Slideover, Approval Slideover, Reactivation Modal
// (Ported from prototype/shell.jsx + modules)
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/app-context";
import { db, ROLE_LABELS } from "@/lib/db";
import type { IconName, Role, WoStatus, WorkOrder, WorkOrderSubContractorHours, WorkOrderTimeEntry } from "@/lib/types";
import { CardHead, ChoicePill, EmptyState, Modal, SlideOver, StatusBadge } from "./shared";
import { NotificationDropdown } from "./notifications";
import { navigateTo } from "@/lib/maps";
import {
  updateWorkOrder, WORK_ORDER_STATUSES, WO_STATUS_LABEL,
  REPLACEMENT_STATUS_LABEL, REPLACEMENT_STATUS_BADGE,
  resumeAmc,
  startWorkOrder, completeWorkOrder, markWorkOrderDone,
  deleteSubContractorHoursEntry,
  addWoTask, toggleWoTask, deleteWoTask,
} from "@/lib/create";
import { can } from "@/lib/permissions";
import { getWorkerConflictsFor } from "@/lib/conflicts";
import { formatDurationMinutes, formatLongDateTime, formatMonthDay, formatRelativeDay, formatTimeOfDay } from "@/lib/dates";
import { supabaseBrowser } from "@/lib/supabase/client";

/* ─── Command Palette ───────────────────────────────────── */
export function CommandPalette() {
  const { cmdkOpen, setCmdk, go, followTarget, openWO } = useApp();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cmdkOpen) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setQ(""); setActive(0);
    }
  }, [cmdkOpen]);

  if (!cmdkOpen) return null;

  type Item = { id: string; label: string; kind: string; icon: IconName; meta?: string; type: "nav" | "wo" | "customer" | "amc" };
  const nav: Item[] = ([
    { id: "dashboard", label: "Dashboard", kind: "Page", icon: "dashboard" as IconName },
    { id: "workorders", label: "Work orders", kind: "Page", icon: "briefcase" as IconName },
    { id: "amc", label: "AMC contracts", kind: "Page", icon: "shieldCheck" as IconName },
    { id: "approvals", label: "Approvals", kind: "Page", icon: "inbox" as IconName },
    { id: "scheduling", label: "Scheduling", kind: "Page", icon: "calendar" as IconName },
    { id: "customers", label: "Customers", kind: "Page", icon: "building" as IconName },
    { id: "sites", label: "Sites", kind: "Page", icon: "mapPin" as IconName },
    { id: "repair", label: "Repair tickets", kind: "Page", icon: "wrench" as IconName },
    { id: "inventory", label: "Inventory", kind: "Page", icon: "package" as IconName },
    { id: "projects", label: "Main Contractor Jobs", kind: "Page", icon: "briefcase" as IconName },
    { id: "reports", label: "Reports", kind: "Page", icon: "chartBar" as IconName },
  ] as const).map(x => ({ ...x, type: "nav" as const }));

  const wos: Item[] = Object.values(db.WORK_ORDERS).map(w => ({
    type: "wo", id: w.id, label: w.code + " - " + w.title,
    kind: "Work order", meta: db.cust(w.customer)?.name ?? "-", icon: "briefcase",
  }));
  const customers: Item[] = Object.values(db.CUSTOMERS).map(c => ({
    type: "customer", id: c.id, label: c.name, kind: "Customer", meta: c.tier, icon: "building",
  }));
  const amcs: Item[] = Object.values(db.AMCS).map(a => ({
    type: "amc", id: a.id, label: a.code + " - " + (db.cust(a.customer)?.name ?? "-"),
    kind: "AMC", meta: a.contract_status.replace("_", " "), icon: "shieldCheck",
  }));

  const all = [...nav, ...wos, ...customers, ...amcs];
  const lq = q.toLowerCase().trim();
  const results = lq
    ? all.filter(x => x.label.toLowerCase().includes(lq) || (x.meta || "").toLowerCase().includes(lq)).slice(0, 14)
    : all.slice(0, 12);

  const fire = (item: Item) => {
    setCmdk(false);
    if (item.type === "nav") go(item.id as Parameters<typeof go>[0]);
    else if (item.type === "wo") openWO(item.id);
    else if (item.type === "customer") followTarget({ kind: "customer", id: item.id });
    else if (item.type === "amc") followTarget({ kind: "amc", id: item.id });
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); results[active] && fire(results[active]); }
    if (e.key === "Escape") { setCmdk(false); }
  };

  return (
    <div className="cmdk-back" onClick={() => setCmdk(false)}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} className="cmdk-input" placeholder="Search work orders, customers, AMCs, pages…"
          value={q} onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} />
        <div className="cmdk-list">
          {results.map((item, i) => (
            <div key={item.type + ":" + item.id}
              className={"cmdk-item" + (i === active ? " active" : "")}
              onMouseEnter={() => setActive(i)}
              onClick={() => fire(item)}>
              <Icon name={item.icon} size={16} style={{ color: "var(--ink-mute)" }} />
              <span className="truncate" style={{ flex: 1 }}>{item.label}</span>
              <span className="meta">{item.kind}{item.meta ? " · " + item.meta : ""}</span>
            </div>
          ))}
          {results.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--ink-mute)" }}>No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Notification Drawer (delegates to NotificationDropdown) ─ */
export function NotifDrawer() {
  return <NotificationDropdown />;
}

/* ─── Toast ─────────────────────────────────────────────── */
export function Toast() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;
  return (
    <div onClick={dismissToast} style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 95, background: "var(--ink)", color: "white",
      padding: "12px 18px", borderRadius: "var(--r-pill)",
      boxShadow: "var(--shadow-xl)", font: "var(--t-body-md)",
      display: "flex", alignItems: "center", gap: 10,
      animation: "slideInUp .22s cubic-bezier(.2,.7,.3,1)",
    }}>
      <Icon name="checkCircle" size={16} style={{ color: "var(--pri-300)" }} />
      {toast}
    </div>
  );
}

/* ─── WO Slideover ──────────────────────────────────────── */
function DetailField({ icon, label, value, sub, onClick }:
  { icon: IconName; label: string; value: React.ReactNode; sub?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 5 }}>
        <Icon name={icon} size={12} /> {label}
      </div>
      <div style={{ font: "var(--t-body-md)", marginTop: 3 }} className="truncate">
        {value} {onClick && <Icon name="externalLink" size={11} style={{ color: "var(--ink-quiet)", marginLeft: 4, verticalAlign: "middle" }} />}
      </div>
      {sub && <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
function ThreadMsg({ who, t, body }: { who: string; t: string; body: string }) {
  const u = db.user(who);
  return (
    <div className="row gap-3" style={{ alignItems: "flex-start" }}>
      <span className={"avatar avatar-sm avatar-" + (u.tint || "primary")}>{u.initials}</span>
      <div style={{ flex: 1 }}>
        <div className="row gap-2">
          <span style={{ font: "var(--t-small)", fontWeight: 600 }}>{u.name}</span>
          <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{t}</span>
        </div>
        <div style={{ font: "var(--t-body)", color: "var(--ink-soft)", marginTop: 3 }}>{body}</div>
      </div>
    </div>
  );
}
function sourceLabel(src: { kind: string; id: string }) {
  if (!src) return "-";
  if (src.kind === "project") { const p = db.proj(src.id); return p ? p.code + " · Main Contractor Job" : "Main Contractor Job"; }
  if (src.kind === "amc") { const a = db.amc(src.id); return a ? a.code + " · AMC" : "AMC"; }
  if (src.kind === "repair") { const r = db.REPAIRS[src.id]; return r ? r.code + " · Repair" : "Repair"; }
  return src.kind;
}

// Pill colour tokens per wo_status. Fed to ChoicePill so the trigger badge
// background tracks the StatusBadge styling in shared.tsx.
const WO_STATUS_PILL_CLS: Record<WoStatus, string> = {
  open:                 "badge-info",
  assigned:             "badge-outline",
  in_progress:          "badge-primary",
  waiting_material:     "badge-warning",
  pending_confirmation: "badge-violet",
  done:                 "badge-success",
  closed:               "badge-outline",
  cancelled:            "badge-danger",
};

// ─── Time-tracking panel (migration 0022) ─────────────────
//
// Static display only — no live ticker, no setInterval, no per-second
// re-renders. Stores started-at / ended-at timestamps and renders
// pre-calculated durations (trigger-computed on the server). Three
// visual states:
//
//   State 1 — "Not started":          Start Work CTA only.
//   State 2 — "Started, in progress":  static "Started at HH:MM by …"
//                                       + Mark Done.
//   State 3 — "Completed":             totals + per-worker history.
//
// The "Mark WO Done" button only shows for md/admin/manager/lead_worker
// — those are the roles wo_write covers, so the UPDATE will actually
// land. It also closes any open timers on this WO (manager-override).
// ============================================================

function TimeTrackingPanel({ wo }: { wo: WorkOrder }) {
  const { me, role, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;

  const onCrew = wo.assignedLead === me.id || (wo.assigned ?? []).includes(me.id);
  const canCloseWo = role === "md" || role === "admin" || role === "manager"
                  || role === "lead_worker";

  const myOpenEntry = db.openEntryFor(wo.id, me.id);
  const entries = useMemo(
    () => db.woEntries(wo.id).sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [wo.id, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const openEntries = entries.filter(e => e.endedAt === null);
  const closedEntries = entries.filter(e => e.endedAt !== null);

  // "Completed" = WO marked done by manager OR every entry is closed
  // AND at least one entry existed. (A WO with status='done' but no
  // entries shows the "Completed (no time logged)" sub-state.)
  const woIsTerminal = wo.status === "done" || wo.status === "closed" || wo.status === "cancelled";
  const completed = woIsTerminal && openEntries.length === 0;
  const inProgress = openEntries.length > 0;

  const [busy, setBusy] = useState<"start" | "done" | "close" | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneNote, setDoneNote] = useState("");

  const onStart = async () => {
    setBusy("start");
    const res = await startWorkOrder(wo.id, me.id);
    setBusy(null);
    if (!res.ok) { fireToast(res.error); return; }
    bumpData();
    fireToast("Started");
  };

  const onSubmitDone = async () => {
    setBusy("done");
    const res = await completeWorkOrder(wo.id, me.id, doneNote);
    setBusy(null);
    if (!res.ok) { fireToast(res.error); return; }
    setDoneOpen(false);
    setDoneNote("");
    bumpData();
    fireToast(res.entry
      ? `Logged ${formatDurationMinutes(res.entry.durationMinutes)}`
      : "Nothing to close");
  };

  const onMarkWoDone = async () => {
    if (!confirm("Mark this work order as Done? This closes any open timers.")) return;
    setBusy("close");
    const res = await markWorkOrderDone(wo.id);
    setBusy(null);
    if (!res.ok) { fireToast(res.error); return; }
    bumpData();
    fireToast(`${wo.code} marked done`);
  };

  // Hide entirely for users with no relationship to this WO.
  if (!onCrew && !canCloseWo) return null;

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="row between" style={{ alignItems: "center", marginBottom: 14 }}>
        <div style={{ font: "var(--t-h3)" }}>Time tracking</div>
        {completed && (
          <span className="badge badge-success" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="check" size={11} /> Completed
          </span>
        )}
      </div>

      {/* ── STATE 1: not started ───────────────────────────── */}
      {!inProgress && !completed && entries.length === 0 && (
        <>
          <div className="row gap-2" style={{ alignItems: "center", marginBottom: 14 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 999,
              background: "transparent", border: "1.5px solid var(--ink-quiet)",
              flexShrink: 0,
            }} />
            <span style={{ font: "var(--t-body)", color: "var(--ink-mute)" }}>
              Not started
            </span>
          </div>
          {onCrew && (
            <button className="btn btn-primary" disabled={busy !== null} onClick={onStart}>
              {busy === "start"
                ? <><Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} /> Starting…</>
                : <><Icon name="play" size={14} /> Start Work</>}
            </button>
          )}
        </>
      )}

      {/* ── STATE 2: in progress ───────────────────────────── */}
      {inProgress && (
        <>
          {openEntries.length === 1 ? (
            <ActiveSingleLine entry={openEntries[0]} />
          ) : (
            <ActiveMultiLine entries={openEntries} />
          )}
          <div className="row gap-2" style={{ marginTop: 14, flexWrap: "wrap" }}>
            {onCrew && myOpenEntry && (
              <button className="btn btn-primary" disabled={busy !== null}
                onClick={() => setDoneOpen(true)}>
                <Icon name="check" size={14} /> Mark Done
              </button>
            )}
            {onCrew && !myOpenEntry && (
              <button className="btn btn-primary" disabled={busy !== null} onClick={onStart}>
                {busy === "start"
                  ? <><Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} /> Starting…</>
                  : <><Icon name="play" size={14} /> Start Work</>}
              </button>
            )}
            {canCloseWo && (
              <button className="btn btn-ghost" disabled={busy !== null} onClick={onMarkWoDone}>
                {busy === "close"
                  ? <><Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} /> Closing…</>
                  : <><Icon name="checkCircle" size={14} /> Mark WO Done</>}
              </button>
            )}
          </div>
        </>
      )}

      {/* ── STATE 3: completed, or post-session ───────────── */}
      {!inProgress && closedEntries.length > 0 && (
        <CompletedSummary wo={wo} entries={closedEntries} />
      )}

      {/* If WO is terminal but no entries logged at all */}
      {completed && entries.length === 0 && (
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <Icon name="info" size={14} style={{ color: "var(--ink-mute)" }} />
          <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
            No time logged on this work order.
          </span>
        </div>
      )}

      {/* Mark Done modal — note capture only, no live elapsed display. */}
      {doneOpen && (
        <div role="dialog" aria-modal="true"
          onClick={() => { if (busy === null) setDoneOpen(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.42)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, zIndex: 1000,
          }}>
          <form onClick={ev => ev.stopPropagation()}
            onSubmit={ev => { ev.preventDefault(); onSubmitDone(); }}
            style={{
              background: "var(--bg-elev)", borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: 460,
              padding: 20, display: "flex", flexDirection: "column", gap: 14,
            }}>
            <div>
              <div style={{ font: "var(--t-h3)" }}>Close your timer</div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
                Add a note if anything useful happened in this session (optional).
              </div>
            </div>
            <textarea className="textarea" rows={3}
              value={doneNote} onChange={ev => setDoneNote(ev.target.value)}
              placeholder="e.g. Completed rack termination; cleanup tomorrow."
              autoFocus />
            <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost"
                onClick={() => setDoneOpen(false)} disabled={busy !== null}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy !== null}>
                {busy === "done"
                  ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                  : <><Icon name="check" size={13} /> Done</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

/** Single active worker — one-line "Started at HH:MM today by Name". */
function ActiveSingleLine({ entry }: { entry: WorkOrderTimeEntry }) {
  const user = entry.userId ? db.user(entry.userId) : null;
  const d = new Date(entry.startedAt);
  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      <span className="dot dot-success" style={{ flexShrink: 0 }} />
      <span style={{ font: "var(--t-body)" }}>
        Started at <strong>{formatTimeOfDay(d)}</strong> {formatRelativeDay(d)}
        {user?.name ? <> by <strong>{user.name}</strong></> : null}
      </span>
    </div>
  );
}

/** Multiple active workers — header + one row per open entry. */
function ActiveMultiLine({ entries }: { entries: WorkOrderTimeEntry[] }) {
  return (
    <div>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
        <span className="dot dot-success" style={{ flexShrink: 0 }} />
        <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>
          {entries.length} workers active
        </span>
      </div>
      <div className="col gap-1" style={{ paddingLeft: 18 }}>
        {entries.map(e => {
          const user = e.userId ? db.user(e.userId) : null;
          const d = new Date(e.startedAt);
          return (
            <div key={e.id} style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
              <strong style={{ color: "var(--ink)" }}>{user?.name ?? "Removed user"}</strong>
              {" — started "}{formatTimeOfDay(d)} {formatRelativeDay(d)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Completed display: totals + per-worker entry breakdown. */
function CompletedSummary({ wo, entries }: { wo: WorkOrder; entries: WorkOrderTimeEntry[] }) {
  return (
    <div>
      <div className="row gap-3" style={{ alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                        textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            Duration
          </div>
          <div className="numeric" style={{ font: "var(--t-h3)", marginTop: 2 }}>
            {formatDurationMinutes(wo.durationMinutes)}
          </div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--divider)" }} />
        <div>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                        textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            Workers
          </div>
          <div className="numeric" style={{ font: "var(--t-h3)", marginTop: 2 }}>
            {wo.actualWorkersCount || entries.length}
          </div>
        </div>
      </div>

      <div style={{
        font: "var(--t-micro)", color: "var(--ink-mute)",
        textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
        marginBottom: 8,
      }}>
        Worker entries
      </div>
      <div className="col gap-2">
        {entries.map(e => <CompletedEntryRow key={e.id} e={e} />)}
      </div>
    </div>
  );
}

function CompletedEntryRow({ e }: { e: WorkOrderTimeEntry }) {
  const user = e.userId ? db.user(e.userId) : null;
  const start = new Date(e.startedAt);
  const end = e.endedAt ? new Date(e.endedAt) : null;
  return (
    <div className="row gap-3" style={{
      padding: "10px 12px", borderRadius: "var(--r-md)",
      background: "var(--bg-muted)", border: "1px solid var(--border)",
      alignItems: "center",
    }}>
      <span className={"avatar avatar-sm avatar-" + (user?.tint || "primary")}>
        {user?.initials ?? "?"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ font: "var(--t-body-md)" }}>
          {user?.name ?? "Removed user"}
        </div>
        <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
          {formatTimeOfDay(start)} → {end ? formatTimeOfDay(end) : "—"}
          {" · "}{formatRelativeDay(start)}
          {e.note ? ` · ${e.note}` : ""}
        </div>
      </div>
      <span className="numeric" style={{
        font: "var(--t-small)", fontWeight: 600, flexShrink: 0,
      }}>
        {formatDurationMinutes(e.durationMinutes)}
      </span>
    </div>
  );
}

// ─── Sub-contractor crew rows (migrations 0023 + 0026) ────
//
// Renders inside the WO slideover Crew section, beneath the regular
// staff rows. Each row shows the sub-contractor's name + company,
// a "+ Log Hours" button (permission-gated), and an inline list of
// previously-logged entries with edit/delete actions per row.
//
// Permission model — must mirror RLS wosh_write (migration 0026):
//   canLog (= INSERT visibility):
//     admin/md/manager always.
//     lead_worker only when wo.assignedLead === me.id.
//   canTouchEntry(entry) (= UPDATE/DELETE visibility):
//     admin/md/manager always.
//     lead_worker only when canLog AND entry.loggedBy === me.id.
// (The hard backstop is RLS — these gates just keep buttons honest.)
function SubContractorRows({ wo }: { wo: WorkOrder }) {
  const { dataVersion, role, me, openCreate, fireToast, bumpData } = useApp();
  void dataVersion;
  const assignments = db.subForWO(wo.id);
  if (assignments.length === 0) return null;

  const isStaff = role === "admin" || role === "md" || role === "manager";
  const isOwnLead = role === "lead_worker" && wo.assignedLead === me.id;
  const canLog = isStaff || isOwnLead;

  return (
    <>
      {assignments.map(j => {
        const s = db.subContractor(j.subContractorId);
        const subName = s?.name ?? "Removed sub-contractor";
        const entries = db.hoursForSubOnWO(wo.id, j.subContractorId);
        return (
          <div key={j.id} className="col gap-2"
               style={{ padding: "8px 10px", borderRadius: "var(--r-md)" }}>
            <div className="row gap-3" style={{ alignItems: "center" }}>
              <span style={{
                width: 36, height: 36, borderRadius: 999, flexShrink: 0,
                background: "var(--bg-muted)", display: "flex",
                alignItems: "center", justifyContent: "center",
                color: "var(--ink-mute)",
              }}>
                <Icon name="user" size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row gap-2" style={{ alignItems: "center" }}>
                  <span className="badge badge-outline" style={{ font: "var(--t-micro)" }}>Sub</span>
                  <span className="truncate" style={{ font: "var(--t-body-md)" }}>{subName}</span>
                </div>
                <div className="truncate" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                  {s?.company ?? "Independent"}
                  {s?.phone ? ` · ${s.phone}` : ""}
                </div>
              </div>
              {canLog && s && (
                <button className="btn btn-primary btn-sm"
                  onClick={() => openCreate("sub_hours", {
                    wo_id: wo.id, sub_id: s.id,
                    sub_name: s.name, wo_code: wo.code,
                    assigned_at: j.assignedAt,
                  })}>
                  <Icon name="plus" size={14} /> Log Hours
                </button>
              )}
            </div>
            <SubHoursList
              entries={entries}
              canTouchEntry={(loggedBy) => isStaff || (isOwnLead && loggedBy === me.id)}
              onEdit={(entry) => {
                if (!s) return;
                openCreate("sub_hours", {
                  wo_id: wo.id, sub_id: s.id,
                  sub_name: s.name, wo_code: wo.code,
                  assigned_at: j.assignedAt,
                  entry_id: entry.id,
                  hours: entry.hours,
                  entry_date: entry.entryDate,
                  notes: entry.notes ?? "",
                });
              }}
              onDelete={async (entry) => {
                if (!confirm("Delete this hours entry? This cannot be undone.")) return;
                const res = await deleteSubContractorHoursEntry(entry.id);
                if (!res.ok) { fireToast(`Couldn't delete: ${res.error}`); return; }
                fireToast("Hours entry deleted");
                bumpData();
              }}
            />
          </div>
        );
      })}
    </>
  );
}

// Renders the per-sub list of logged hours below the sub's identity row.
// Pure presentational — the parent decides which actions are visible.
function SubHoursList({
  entries, canTouchEntry, onEdit, onDelete,
}: {
  entries: WorkOrderSubContractorHours[];
  canTouchEntry: (loggedBy: string | null) => boolean;
  onEdit: (entry: WorkOrderSubContractorHours) => void;
  onDelete: (entry: WorkOrderSubContractorHours) => void;
}) {
  if (entries.length === 0) return null;
  // Newest first — entryDate desc, then loggedAt desc to break ties when
  // a lead logs two sessions on the same day.
  const sorted = [...entries].sort((a, b) => {
    if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? 1 : -1;
    return a.loggedAt < b.loggedAt ? 1 : -1;
  });
  const totalHours = sorted.reduce((sum, e) => sum + e.hours, 0);
  const distinctDays = new Set(sorted.map(e => e.entryDate)).size;
  return (
    <div className="col gap-1" style={{
      marginLeft: 48, paddingTop: 4, paddingBottom: 4,
      borderLeft: "2px solid var(--border)", paddingLeft: 12,
    }}>
      {sorted.map(e => (
        <div key={e.id} className="row gap-2"
             style={{ alignItems: "center", font: "var(--t-small)" }}>
          <span className="numeric" style={{ color: "var(--ink-mute)", flexShrink: 0, minWidth: 56 }}>
            {formatEntryDate(e.entryDate)}
          </span>
          <span className="numeric" style={{ fontWeight: 600, flexShrink: 0, minWidth: 60 }}>
            {e.hours.toFixed(1)} hrs
          </span>
          {e.notes && (
            <span className="truncate" style={{ flex: 1, color: "var(--ink-mute)", fontStyle: "italic" }}>
              {`"${e.notes}"`}
            </span>
          )}
          {!e.notes && <span style={{ flex: 1 }} />}
          {canTouchEntry(e.loggedBy) && (
            <>
              <button className="btn btn-ghost btn-icon btn-sm"
                onClick={() => onEdit(e)}
                aria-label="Edit entry">
                <Icon name="pen" size={12} />
              </button>
              <button className="btn btn-ghost btn-icon btn-sm"
                onClick={() => onDelete(e)}
                aria-label="Delete entry">
                <Icon name="trash" size={12} />
              </button>
            </>
          )}
        </div>
      ))}
      <div style={{
        font: "var(--t-small)", color: "var(--ink-mute)", fontWeight: 600,
        marginTop: 4, paddingTop: 4, borderTop: "1px dashed var(--border)",
      }}>
        Total: {totalHours.toFixed(1)} hrs across {distinctDays} {distinctDays === 1 ? "day" : "days"}
      </div>
    </div>
  );
}

// Stable date-only formatter — anchor at noon to dodge timezone
// wraparound for the date-only entry_date column.
function formatEntryDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  return formatMonthDay(new Date(y, m - 1, d, 12, 0, 0));
}

export function WoSlideover() {
  const { slideover, setSlideover, fireToast, followTarget, bumpData, dataVersion, role, me, openCreate, openReplacement } = useApp();
  const woId = slideover?.kind === "wo" ? slideover.id : null;
  const wo = woId ? db.wo(woId) : null;
  void dataVersion;
  const [tab, setTab] = useState<"overview" | "tasks" | "materials" | "replacements" | "thread" | "audit">("overview");
  const [historyTick, setHistoryTick] = useState(0);
  const [newTaskLabel, setNewTaskLabel] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [crewBusy, setCrewBusy] = useState(false);

  useEffect(() => {
    if (wo) { setTab("overview"); setNewTaskLabel(""); setShowAddCrew(false); }
  }, [wo?.id]);

  if (!wo) return null;
  // Related rows may be missing (deleted, RLS-filtered, or never set).
  // Keep them nullable and fall back at every render site.
  const cust = db.cust(wo.customer);
  const site = db.site(wo.site);
  const custName = cust?.name ?? "-";
  const siteName = site?.name ?? "-";
  const siteArea = site?.area ?? "";
  // v1.1.0 — read tasks from the persisted mirror, not from wo.tasks.
  const tasks = db.tasksForWO(wo.id);
  const doneCount = tasks.filter(t => t.done).length;
  const totalTasks = tasks.length;
  // v1.1.0 — task edit gate widened to every role that touches WOs in
  // day-to-day flow. Sales / Estimator / Sub-contractor / Super Admin
  // stay read-only. Mirrored in 0029 RLS so the DB doesn't reject the
  // INSERT/UPDATE/DELETE from these roles.
  const TASK_EDIT_ROLES: ReadonlySet<Role> = new Set<Role>([
    "admin", "md", "manager", "lead_worker", "worker", "driver", "accounts", "service_support",
  ]);
  const canEditTasks = TASK_EDIT_ROLES.has(role);
  // v1.1.0 — Crew reassign: same gate as the create modal. Admin/MD/
  // manager/lead_worker can add or remove crew on an existing WO.
  const canEditCrew = can(role, "CREATE_WORK_ORDER");

  const typeMap: Record<string, string> = {
    AMC: "badge-primary", PROJECT: "badge-info", REPAIR: "badge-warning",
    DELIVERY: "badge-outline", SURVEY: "badge-violet",
  };
  const onClose = () => setSlideover(null);

  return (
    <SlideOver open onClose={onClose}
      title={wo.title}
      sub={<span className="numeric" style={{ fontFamily: "var(--font-mono)" }}>{wo.code} · {wo.type}</span>}
      foot={
        <>
          <button className="btn btn-soft" onClick={onClose}>Close</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost"><Icon name="messageCircle" size={14} /> Message team</button>
        </>
      }
    >
      <div className="card card-accent card-pad" style={{ marginBottom: 16 }}>
        <div className="row between gap-3" style={{ flexWrap: "wrap" }}>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <span className={"badge " + (typeMap[wo.type] || "")} style={{ fontWeight: 600 }}>{wo.type}</span>
            <ChoicePill<WoStatus>
              ariaLabel="Work order status"
              value={wo.status}
              options={WORK_ORDER_STATUSES.map(s => ({
                value: s, label: WO_STATUS_LABEL[s], cls: WO_STATUS_PILL_CLS[s],
              }))}
              onChange={async (next) => {
                if (next === wo.status) return;
                const prev = wo.status;
                // Optimistic mirror update so the pill flips immediately.
                db.WORK_ORDERS[wo.id] = { ...wo, status: next };
                bumpData();
                const res = await updateWorkOrder(wo.id, { status: next });
                if (!res.ok) {
                  db.WORK_ORDERS[wo.id] = { ...wo, status: prev };
                  bumpData();
                  fireToast(`Couldn't update status: ${res.error}`);
                  return;
                }
                fireToast(`Status → ${WO_STATUS_LABEL[next]}`);
                setHistoryTick(t => t + 1);
              }}
            />
            {wo.priority === "High" && <span className="badge badge-danger">High priority</span>}
          </div>
          <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>SLA target {wo.slaMin || "-"}m</span>
        </div>
        <div style={{ font: "var(--t-h2)", marginTop: 10 }}>{wo.title}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginTop: 14 }}>
          <DetailField icon="building" label="Customer" value={custName} onClick={() => followTarget({ kind: "customer", id: wo.customer })} />
          <DetailField icon="mapPin" label="Site" value={siteName} sub={siteArea} />
          <DetailField icon="clock" label="Window"
            value={wo.scheduledStart && wo.scheduledEnd
              ? wo.scheduledStart.split("T")[1].slice(0, 5) + " – " + wo.scheduledEnd.split("T")[1].slice(0, 5)
              : "-"} sub="Today" />
          <DetailField icon="layers" label="Source" value={sourceLabel(wo.source)} onClick={() => followTarget(wo.source)} />
        </div>

        {wo.slaMin && (
          <div style={{ marginTop: 16 }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>SLA</span>
              <span className="numeric" style={{ font: "var(--t-small)", color: wo.elapsedMin > wo.slaMin * 0.85 ? "var(--warn-700)" : "var(--ink-mute)" }}>
                {wo.elapsedMin}m elapsed · {Math.max(0, wo.slaMin - wo.elapsedMin)}m remaining
              </span>
            </div>
            <div className={"progress" + (wo.elapsedMin > wo.slaMin * 0.85 ? " progress-warning" : " progress-success")}>
              <div style={{ width: Math.min(100, (wo.elapsedMin / wo.slaMin) * 100) + "%" }} />
            </div>
          </div>
        )}
      </div>

      {wo.flagged && (
        <div style={{ padding: "12px 14px", background: "var(--dan-50)", color: "var(--dan-700)", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Icon name="alertTriangle" size={16} /> <span style={{ font: "var(--t-body-md)" }}>{wo.flagged}</span>
        </div>
      )}

      <div className="seg seg-block" style={{ marginBottom: 16 }}>
        <button data-on={String(tab === "overview")} onClick={() => setTab("overview")}>Overview</button>
        <button data-on={String(tab === "tasks")} onClick={() => setTab("tasks")}>Tasks {totalTasks ? <span style={{ opacity: 0.6 }}>· {doneCount}/{totalTasks}</span> : null}</button>
        <button data-on={String(tab === "materials")} onClick={() => setTab("materials")}>Materials</button>
        <button data-on={String(tab === "replacements")} onClick={() => setTab("replacements")}>Replacements</button>
        <button data-on={String(tab === "thread")} onClick={() => setTab("thread")}>Thread</button>
        <button data-on={String(tab === "audit")} onClick={() => setTab("audit")}>Audit</button>
      </div>

      {tab === "overview" && (
        <div className="col gap-4">
          <TimeTrackingPanel wo={wo} />
          <section className="card card-pad">
            <CardHead title="Crew"
              right={canEditCrew ? (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => setShowAddCrew(v => !v)}
                  disabled={crewBusy}>
                  <Icon name={showAddCrew ? "x" : "plus"} size={13} />
                  {showAddCrew ? " Cancel" : " Add worker"}
                </button>
              ) : undefined} />
            <div className="col gap-2">
              {(wo.assigned || []).map(uid => {
                const u = db.user(uid);
                const isLead = uid === wo.assignedLead;
                return (
                  <div key={uid} className="row gap-3" style={{ padding: "8px 10px", borderRadius: "var(--r-md)" }}>
                    <span className={"avatar avatar-" + (u.tint || "primary")}>{u.initials}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{ font: "var(--t-body-md)" }}>{u.name}</div>
                      <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{ROLE_LABELS[u.role]}</div>
                    </div>
                    {isLead && <span className="badge badge-primary">Lead</span>}
                    {canEditCrew && !isLead && (
                      <button className="btn btn-ghost btn-icon btn-sm"
                        title="Remove from crew"
                        disabled={crewBusy}
                        onClick={async () => {
                          setCrewBusy(true);
                          const prev = wo.assigned ?? [];
                          const next = prev.filter(x => x !== uid);
                          // Optimistic mirror update so the row disappears
                          // immediately; revert if updateWorkOrder fails.
                          db.WORK_ORDERS[wo.id] = { ...wo, assigned: next };
                          bumpData();
                          const r = await updateWorkOrder(wo.id, { assigned: next });
                          if (!r.ok) {
                            db.WORK_ORDERS[wo.id] = { ...wo, assigned: prev };
                            bumpData();
                            fireToast(`Couldn't remove ${u.name}: ${r.error}`);
                          } else {
                            fireToast(`${u.name} removed from crew`);
                          }
                          setCrewBusy(false);
                        }}>
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              {showAddCrew && canEditCrew && (
                <CrewPicker
                  wo={wo}
                  busy={crewBusy}
                  onAdd={async (uid) => {
                    setCrewBusy(true);
                    const u = db.user(uid);
                    const prev = wo.assigned ?? [];
                    if (prev.includes(uid)) { setCrewBusy(false); setShowAddCrew(false); return; }
                    const next = [...prev, uid];
                    db.WORK_ORDERS[wo.id] = { ...wo, assigned: next };
                    bumpData();
                    const r = await updateWorkOrder(wo.id, { assigned: next });
                    if (!r.ok) {
                      db.WORK_ORDERS[wo.id] = { ...wo, assigned: prev };
                      bumpData();
                      fireToast(`Couldn't add ${u.name}: ${r.error}`);
                    } else {
                      fireToast(`${u.name} added to crew`);
                      setShowAddCrew(false);
                    }
                    setCrewBusy(false);
                  }}
                />
              )}
              <SubContractorRows wo={wo} />
            </div>
          </section>

          <section className="card card-pad">
            <CardHead title="Location" right={
              <button className="btn btn-ghost btn-sm" disabled={!site} onClick={() => {
                if (!site) return;
                const ok = navigateTo({ name: site.name, area: site.area });
                if (ok) fireToast(`Opening Google Maps - ${site.name}`);
              }}>
                <Icon name="navigation" size={14} /> Navigate
              </button>
            } />
            <div style={{
              height: 140, borderRadius: "var(--r-md)",
              background: "linear-gradient(160deg, var(--bg-muted), var(--bg-deep))",
              position: "relative", overflow: "hidden", border: "1px solid var(--border)",
            }}>
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 300 140" preserveAspectRatio="none">
                <path d="M 40 110 Q 100 90 150 70 T 240 40" stroke="var(--pri-500)" strokeWidth="2" fill="none" strokeDasharray="5 6" strokeLinecap="round" opacity="0.7" />
              </svg>
              <div style={{ position: "absolute", left: "70%", top: "32%", transform: "translate(-50%, -100%)" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50% 50% 50% 0", background: "var(--pri-500)", transform: "rotate(-45deg)", boxShadow: "0 6px 14px color-mix(in srgb, var(--pri-500) 35%, transparent)" }} />
              </div>
              <div style={{ position: "absolute", left: "22%", top: "78%", width: 12, height: 12, borderRadius: "50%", background: "var(--info-500)", border: "3px solid white", transform: "translate(-50%,-50%)", boxShadow: "0 0 0 6px color-mix(in srgb, var(--info-500) 25%, transparent)" }} />
            </div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 10 }}>{site?.access ?? "-"}</div>
          </section>
        </div>
      )}

      {tab === "tasks" && (
        <section className="card card-pad">
          <CardHead title="Service checklist" sub={`${doneCount} of ${totalTasks} complete`} />
          {totalTasks > 0 && (
            <div className="progress progress-success" style={{ marginBottom: 16 }}>
              <div style={{ width: (doneCount / totalTasks) * 100 + "%" }} />
            </div>
          )}
          {totalTasks === 0 ? (
            <EmptyState icon="list" title="No tasks defined"
              sub={canEditTasks
                ? "Add the first checklist item below — it'll save and sync to anyone else viewing this WO."
                : "Tasks will appear here once the lead or manager adds them."} />
          ) : (
            <div className="col gap-2">
              {tasks.map(t => (
                <div key={t.id} className="row gap-3"
                  style={{
                    padding: "12px 14px", borderRadius: "var(--r-md)",
                    background: t.done ? "var(--bg-muted)" : "var(--bg-elev)",
                    border: "1px solid var(--border)",
                    opacity: t.done ? 0.7 : 1,
                  }}>
                  <div
                    onClick={async () => {
                      if (!canEditTasks) return;
                      const nextDone = !t.done;
                      bumpData();
                      const r = await toggleWoTask(t.id, nextDone);
                      if (!r.ok) {
                        fireToast(`Couldn't update task: ${r.error}`);
                      }
                      bumpData();
                    }}
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: t.done ? "var(--pri-500)" : "transparent",
                      border: t.done ? "none" : "1.5px solid var(--border-strong)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", flexShrink: 0,
                      cursor: canEditTasks ? "pointer" : "default",
                    }}>
                    {t.done && <Icon name="check" size={14} strokeWidth={2.5} />}
                  </div>
                  <span style={{ flex: 1, font: "var(--t-body-md)", textDecoration: t.done ? "line-through" : "none" }}>{t.label}</span>
                  {t.count && <span className="badge">{t.count}</span>}
                  {canEditTasks && (
                    <button className="btn btn-ghost btn-icon btn-sm"
                      title="Delete task"
                      onClick={async () => {
                        const r = await deleteWoTask(t.id);
                        if (!r.ok) { fireToast(`Couldn't delete: ${r.error}`); return; }
                        bumpData();
                      }}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEditTasks && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const label = newTaskLabel.trim();
                if (!label || taskBusy) return;
                setTaskBusy(true);
                const r = await addWoTask(wo.id, label);
                setTaskBusy(false);
                if (!r.ok) { fireToast(`Couldn't add task: ${r.error}`); return; }
                setNewTaskLabel("");
                bumpData();
              }}
              className="row gap-2"
              style={{ marginTop: 16, alignItems: "center" }}>
              <input className="input" placeholder="Add a checklist item…"
                value={newTaskLabel}
                onChange={e => setNewTaskLabel(e.target.value)}
                style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" type="submit"
                disabled={taskBusy || !newTaskLabel.trim()}>
                <Icon name="plus" size={13} /> {taskBusy ? "Adding…" : "Add"}
              </button>
            </form>
          )}
        </section>
      )}

      {tab === "materials" && (
        <section className="card card-pad">
          <CardHead title="Materials allocated" right={<button className="btn btn-ghost btn-sm"><Icon name="plus" size={14} /> Request more</button>} />
          {(!wo.materials || wo.materials.length === 0) ? (
            <EmptyState icon="package" title="No materials allocated" sub="This work order doesn't require materials from stock." />
          ) : (
            <div className="col gap-2">
              {wo.materials.map((m, i) => (
                <div key={i} className="row gap-3" style={{ padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-muted)" }}>
                  <Icon name="package" size={16} style={{ color: "var(--ink-mute)" }} />
                  <span style={{ flex: 1, font: "var(--t-body)" }}>{m}</span>
                  <span className="badge badge-success"><Icon name="check" size={11} /> Ready</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "replacements" && (
        <WoReplacementsTab
          woId={wo.id}
          assignedToMe={(wo.assigned ?? []).includes(me.id) || wo.assignedLead === me.id}
          role={role}
          onOpenReplacement={openReplacement}
          onRequestNew={() => openCreate("replacement_request", { work_order_id: wo.id })}
        />
      )}

      {tab === "thread" && (
        <section className="card card-pad">
          <CardHead title="Internal thread · 2 messages" />
          <div className="col" style={{ gap: 14 }}>
            <ThreadMsg who="u_rashid" t="8:14" body="Customer rep on site from 9:30. Use rear loading bay." />
            <ThreadMsg who="u_arvind" t="9:18" body="Confirmed. Loading materials now, ETA on site 9:40." />
          </div>
          <textarea className="textarea" placeholder="Reply to thread…" style={{ marginTop: 16 }} />
          <div className="row gap-2" style={{ marginTop: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm"><Icon name="paperclip" size={14} /> Attach</button>
            <button className="btn btn-primary btn-sm">Send</button>
          </div>
        </section>
      )}

      {tab === "audit" && (
        <WoStatusHistory woId={wo.id} reloadKey={historyTick + dataVersion} />
      )}
    </SlideOver>
  );
}

/* ─── Crew picker (v1.1.0) ───────────────────────────────
   Inline list of unassigned workers + drivers shown in the
   Overview tab when the lead/manager clicks "+ Add worker".
   Conflicted techs (those with an overlapping active WO at
   this WO's time window) are greyed + disabled — same shape
   as the Phase A picker in the create modal.
============================================================ */
function CrewPicker({ wo, busy, onAdd }: {
  wo: WorkOrder;
  busy: boolean;
  onAdd: (uid: string) => void;
}) {
  const candidates = useMemo(() => {
    const taken = new Set(wo.assigned ?? []);
    return Object.values(db.USERS)
      .filter(u => (u.role === "worker" || u.role === "driver"))
      .filter(u => !taken.has(u.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [wo.assigned]);

  const conflicts = useMemo(() => {
    const map: Record<string, ReturnType<typeof getWorkerConflictsFor>> = {};
    if (!wo.scheduledStart || !wo.scheduledEnd) return map;
    for (const u of candidates) {
      map[u.id] = getWorkerConflictsFor(u.id, wo.scheduledStart, wo.scheduledEnd, wo.id);
    }
    return map;
  }, [candidates, wo.scheduledStart, wo.scheduledEnd, wo.id]);

  if (candidates.length === 0) {
    return (
      <div style={{
        padding: 12, borderRadius: "var(--r-md)",
        background: "var(--bg-muted)", border: "1px dashed var(--border)",
        font: "var(--t-small)", color: "var(--ink-mute)",
      }}>
        Every technician and driver is already on this crew.
      </div>
    );
  }

  return (
    <div style={{
      maxHeight: 220, overflowY: "auto",
      border: "1px solid var(--border)", borderRadius: "var(--r-md)",
      padding: 6, background: "var(--bg-elev)",
    }}>
      {candidates.map(u => {
        const cs = conflicts[u.id] ?? [];
        const hasConflict = cs.length > 0;
        const first = cs[0];
        const busySub = first
          ? `Busy: ${first.code} ${first.scheduledStart.slice(11, 16)}-${first.scheduledEnd.slice(11, 16)}${cs.length > 1 ? ` +${cs.length - 1} more` : ""}`
          : "";
        const disabled = hasConflict || busy;
        return (
          <button key={u.id} type="button"
            disabled={disabled}
            onClick={() => onAdd(u.id)}
            title={hasConflict ? `Time conflict: ${cs.map(c => c.code).join(", ")}` : undefined}
            style={{
              all: "unset", display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: "var(--r-sm)",
              width: "100%", boxSizing: "border-box",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
              minHeight: 44,
            }}>
            <span className={"avatar avatar-sm avatar-" + (u.tint || "primary")}>{u.initials}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="truncate" style={{
                font: "var(--t-body-md)",
                textDecoration: hasConflict ? "line-through" : undefined,
              }}>{u.name}</div>
              <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                {ROLE_LABELS[u.role]}
              </div>
              {hasConflict && (
                <div className="truncate" style={{
                  font: "var(--t-micro)", color: "var(--warn-700)", marginTop: 2,
                }}>{busySub}</div>
              )}
            </div>
            {hasConflict && <Icon name="alertTriangle" size={14} style={{ color: "var(--warn-700)" }} />}
          </button>
        );
      })}
    </div>
  );
}

/* ─── WO status history ──────────────────────────────────
   Reads work_order_status_history (migration 0014). RLS lets
   anyone who can see the parent WO see its audit trail.
============================================================ */
interface WoHistoryRow {
  id: string;
  old_status: WoStatus | null;
  new_status: WoStatus;
  changed_by: string | null;
  changed_at: string;
}

function WoStatusHistory({ woId, reloadKey }: { woId: string; reloadKey: number }) {
  const [rows, setRows] = useState<WoHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const { data, error } = await supabaseBrowser()
        .from("work_order_status_history")
        .select("id, old_status, new_status, changed_by, changed_at")
        .eq("work_order_id", woId)
        .order("changed_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) { setError(error.message); setRows([]); return; }
      setRows((data ?? []) as WoHistoryRow[]);
    })();
    return () => { cancelled = true; };
  }, [woId, reloadKey]);

  const visible = useMemo(() => rows ?? [], [rows]);

  return (
    <section className="card card-pad">
      <CardHead title="Status history" sub="Every status change with actor and timestamp" />
      {rows === null ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>
      ) : error ? (
        <div style={{ font: "var(--t-small)", color: "var(--dan-700)", padding: 8 }}>Couldn't load history: {error}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon="clock" title="No changes yet"
          sub="Change the status above — every change is recorded here." />
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {visible.map(r => <WoHistoryEntry key={r.id} row={r} />)}
        </div>
      )}
    </section>
  );
}

function WoHistoryEntry({ row }: { row: WoHistoryRow }) {
  const actor = row.changed_by ? db.user(row.changed_by) : null;
  const when = (() => {
    const d = new Date(row.changed_at);
    if (Number.isNaN(d.getTime())) return row.changed_at;
    return formatLongDateTime(d);
  })();
  return (
    <div className="row gap-3" style={{
      padding: 10, background: "var(--bg-muted)",
      borderRadius: "var(--r-md)", border: "1px solid var(--border)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--bg-elev)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon name="clock" size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--t-body-md)" }}>
          Status <span style={{ color: "var(--ink-mute)" }}>
            {row.old_status ? WO_STATUS_LABEL[row.old_status] : "—"}
          </span> → <strong>{WO_STATUS_LABEL[row.new_status]}</strong>
        </div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
          {actor ? actor.name : "Unknown user"} · {when}
        </div>
      </div>
    </div>
  );
}

/* ─── Approval Slideover ────────────────────────────────── */
function labelForTarget(target: { kind: string; id: string } | null | undefined) {
  if (!target) return null;
  switch (target.kind) {
    case "amc": { const a = db.amc(target.id); return a ? { icon: "shieldCheck" as IconName, title: a.code, sub: db.cust(a.customer)?.name ?? "-" } : null; }
    case "project": { const p = db.proj(target.id); return p ? { icon: "briefcase" as IconName, title: p.code + " · " + p.name, sub: db.cust(p.customer)?.name ?? "-" } : null; }
    case "wo": { const w = db.wo(target.id); return w ? { icon: "briefcase" as IconName, title: w.code + " · " + w.title, sub: db.cust(w.customer)?.name ?? "-" } : null; }
    case "repair": { const r = db.REPAIRS[target.id]; return r ? { icon: "wrench" as IconName, title: r.code + " · " + r.title, sub: db.cust(r.customer)?.name ?? "-" } : null; }
    case "user": { const u = db.user(target.id); return { icon: "user" as IconName, title: u.name, sub: ROLE_LABELS[u.role] }; }
  }
  return null;
}

export function ApprovalSlideover() {
  const { slideover, setSlideover, fireToast, followTarget, fmtMoney } = useApp();
  const apId = slideover?.kind === "approval" ? slideover.id : null;
  const ap = apId ? db.APPROVALS[apId] : null;
  if (!ap) return null;

  const requester = ap.requester === "system"
    ? { name: "System", initials: "SY", tint: "primary" as const, role: "admin" as const }
    : db.user(ap.requester);
  const target = labelForTarget(ap.target);
  const onClose = () => setSlideover(null);

  return (
    <SlideOver open onClose={onClose} title={ap.kind}
      sub={<span style={{ fontFamily: "var(--font-mono)" }}>{ap.code}</span>}
      foot={
        <>
          <button className="btn btn-soft" onClick={onClose}>Close</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-danger" onClick={() => { fireToast("Approval rejected · " + ap.code); onClose(); }}>
            Reject
          </button>
          <button className="btn btn-primary" onClick={() => { fireToast("Approved " + ap.code); onClose(); }}>
            <Icon name="check" size={14} /> Approve
          </button>
        </>
      }
    >
      <div className="card card-accent card-pad" style={{ marginBottom: 16 }}>
        <div className="row between gap-3">
          <div className="row gap-2">
            <span className="badge badge-primary">{ap.kind}</span>
            {ap.priority === "high" && <span className="badge badge-danger">High priority</span>}
          </div>
          <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>opened {ap.openedAt}</span>
        </div>
        <div style={{ font: "var(--t-h3)", marginTop: 10 }}>{ap.context}</div>
        {ap.amount != null && (
          <div className="numeric" style={{ font: "600 28px/1.1 var(--font-display)", color: "var(--ink)", marginTop: 8 }}>
            {fmtMoney(ap.amount)}
          </div>
        )}
      </div>

      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Requester" />
        <div className="row gap-3" style={{ padding: "10px 0" }}>
          <span className={"avatar avatar-md avatar-" + (requester.tint || "primary")}>{requester.initials}</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: "var(--t-body-md)" }}>{requester.name}</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
              {ap.requester === "system" ? "Automated trigger" : ROLE_LABELS[requester.role]}
            </div>
          </div>
        </div>
        {ap.notes && (
          <div style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--r-md)", font: "var(--t-small)", color: "var(--ink-soft)" }}>
            {ap.notes}
          </div>
        )}
      </section>

      {target && (
        <section className="card card-pad" style={{ marginBottom: 16 }}>
          <CardHead title="Linked entity" />
          <div onClick={() => followTarget(ap.target)} className="row gap-3"
            style={{ padding: 10, borderRadius: "var(--r-md)", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ""}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--bg-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={target.icon} size={16} style={{ color: "var(--ink-mute)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "var(--t-body-md)" }}>{target.title}</div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{target.sub}</div>
            </div>
            <Icon name="chevronRight" size={14} style={{ color: "var(--ink-quiet)" }} />
          </div>
        </section>
      )}

      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Approval chain" sub="Admin-configured · dynamically resolved" />
        <div className="col gap-2">
          {ap.chain.map(step => {
            const u = db.user(step.user);
            return (
              <div key={step.step} className="row gap-3"
                style={{
                  padding: 12, borderRadius: "var(--r-md)",
                  background: step.state === "approved" ? "var(--suc-50)" : step.state === "pending" ? "var(--pri-50)" : "var(--bg-muted)",
                  border: "1px solid " + (step.state === "approved" ? "var(--suc-100)" : step.state === "pending" ? "var(--pri-200)" : "var(--border)"),
                  opacity: step.state === "queued" ? 0.7 : 1,
                }}>
                <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", fontWeight: 600, width: 24 }}>0{step.step}</span>
                <span className={"avatar avatar-md avatar-" + (u.tint || "primary")}>{u.initials}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "var(--t-body-md)" }}>{u.name}</div>
                  <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", textTransform: "capitalize" }}>{step.role.replace("_", " ")}</div>
                </div>
                <div>
                  {step.state === "approved" && <span className="badge badge-success"><Icon name="check" size={11} /> Approved · {step.at}</span>}
                  {step.state === "pending" && <span className="badge badge-primary"><span className="dot dot-primary dot-pulse" /> Pending</span>}
                  {step.state === "queued" && <span className="badge badge-outline">Queued</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card card-pad">
        <CardHead title="Comment" sub="Optional note attached to your decision" />
        <textarea className="textarea" placeholder="Why are you approving / rejecting this?" />
      </section>
    </SlideOver>
  );
}

/* ─── Reactivation Modal (AMC) ──────────────────────────── */
function KvRow({ k, v, good, warn }: { k: string; v: React.ReactNode; good?: boolean; warn?: boolean }) {
  return (
    <div className="row between" style={{ padding: "6px 0" }}>
      <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{k}</span>
      <span className="numeric" style={{ font: "var(--t-body-md)", color: good ? "var(--suc-700)" : warn ? "var(--warn-700)" : "var(--ink)", fontWeight: 600 }}>
        {good && <Icon name="check" size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />}
        {v}
      </span>
    </div>
  );
}
function Effect({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="row gap-3" style={{ padding: "10px 12px", background: "var(--bg-muted)", borderRadius: "var(--r-sm)" }}>
      <Icon name={icon} size={15} style={{ color: "var(--pri-600)" }} />
      <span style={{ font: "var(--t-small)", color: "var(--ink-soft)" }}>{text}</span>
    </div>
  );
}

export function ReactivationModal() {
  const { modal, setModal, fireToast, fmtMoney, bumpData, me } = useApp();
  const [stage, setStage] = useState<"review" | "approving" | "done">("review");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setStage("review"); setErr(null); }, [modal]);
  if (!modal || modal.kind !== "reactivation") return null;
  const c = db.amc(modal.data.id);
  if (!c) return null;

  const approve = async () => {
    setStage("approving");
    setErr(null);
    const res = await resumeAmc(c.id, me.id);
    if (!res.ok) {
      setErr(res.error);
      setStage("review");
      return;
    }
    bumpData();
    setStage("done");
  };
  const close = () => {
    setModal(null);
    // Use the actual contract code, never the prototype hardcode. Toast
    // auto-dismisses via fireToast's 3.5s timer (lib/app-context.tsx).
    if (stage === "done") fireToast(`${c.code} reactivated · service schedule unlocked`);
  };

  return (
    <Modal open onClose={close}>
      {stage !== "done" && (
        <>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--pri-100)", color: "var(--pri-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="refresh" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "var(--t-h3)" }}>Approve AMC reactivation</div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{c.code} · {db.cust(c.customer)?.name ?? "-"}</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={close}><Icon name="x" size={16} /></button>
          </div>
          <div style={{ padding: 22 }}>
            <div className="card card-pad" style={{ background: "var(--bg-muted)", border: "none", padding: 16, marginBottom: 16 }}>
              <KvRow k="Contract value" v={fmtMoney(c.value)} />
              <KvRow k="Payment received" v={fmtMoney(c.value) + " · today"} good />
              <KvRow k="Days overdue" v={c.overdueDays + " days"} warn />
              <KvRow k="Next service" v={c.nextDue || "—"} />
            </div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>
              Reactivation effects
            </div>
            <div className="col gap-2">
              <Effect icon="checkCircle" text="Contract → ACTIVE" />
              <Effect icon="calendar" text="3 remaining quarterly services restored to schedule" />
              <Effect icon="bell" text="Customer notified via WhatsApp + email" />
              <Effect icon="fileText" text="Audit log entry under your name" />
            </div>
            <textarea className="textarea" placeholder="Optional note to customer & team…" style={{ marginTop: 16 }} />
            {err && (
              <div style={{
                marginTop: 12, padding: "10px 12px",
                background: "var(--dan-50)", color: "var(--dan-700)",
                borderRadius: "var(--r-md)", font: "var(--t-small)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Icon name="alertCircle" size={14} /> {err}
              </div>
            )}
          </div>
          <div style={{ padding: "14px 22px", borderTop: "1px solid var(--divider)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={close}>Reject & block</button>
            <button className="btn btn-primary" onClick={approve} disabled={stage === "approving"}>
              {stage === "approving"
                ? <><Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} /> Reactivating…</>
                : <><Icon name="check" size={14} /> Approve reactivation</>}
            </button>
          </div>
        </>
      )}
      {stage === "done" && (
        <div style={{ padding: 44, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px", background: "var(--suc-100)", color: "var(--suc-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="check" size={32} strokeWidth={2.5} />
          </div>
          <div style={{ font: "var(--t-h2)" }}>Contract reactivated</div>
          <div style={{ font: "var(--t-body)", color: "var(--ink-mute)", marginTop: 8, maxWidth: 340, margin: "8px auto 0" }}>
            {c.code} is active. Pending services are unlocked and can be dispatched.
          </div>
          <button onClick={close} className="btn btn-primary btn-lg" style={{ marginTop: 22 }}>Done</button>
        </div>
      )}
    </Modal>
  );
}

/* ─── Replacements tab inside WoSlideover ───────────────
   Lists replacement_requests linked to this WO. Workers /
   Lead Techs / Subcontractors who are part of the crew can
   raise a new request from here. Managers/Admins can too.
   Drivers cannot (per spec — they don't do replacements).
============================================================ */
function WoReplacementsTab({
  woId, assignedToMe, role, onOpenReplacement, onRequestNew,
}: {
  woId: string;
  assignedToMe: boolean;
  role: Role;
  onOpenReplacement: (id: string) => void;
  onRequestNew: () => void;
}) {
  // Filtered from the in-memory mirror so a freshly created RR
  // (via openCreate → bumpData) shows up immediately.
  const rrs = Object.values(db.REPLACEMENTS).filter(r => r.workOrderId === woId);

  const isManager  = role === "admin" || role === "md" || role === "manager";
  const isLead     = role === "lead_worker";
  const isWorker   = role === "worker" || role === "subcontractor";
  const canRequest = isManager || ((isLead || isWorker) && assignedToMe);

  return (
    <section className="card card-pad">
      <CardHead
        title={"Replacements · " + rrs.length}
        sub="Parts the crew has requested or installed on this WO"
        right={canRequest
          ? <button className="btn btn-primary btn-sm" onClick={onRequestNew}>
              <Icon name="plus" size={12} /> Request replacement
            </button>
          : undefined}
      />
      {rrs.length === 0 ? (
        <EmptyState icon="package" title="No replacement requests yet"
          sub={canRequest
            ? "If you discover something on-site that needs replacing, raise it here."
            : "Workers and Lead Techs raise replacement requests from this tab."} />
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {rrs.map(r => {
            const requester = r.requestedBy ? db.user(r.requestedBy) : null;
            return (
              <div key={r.id} onClick={() => onOpenReplacement(r.id)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenReplacement(r.id); } }}
                className="row gap-3"
                style={{
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
                    <span className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>{r.code}</span>
                    <span className={"badge " + REPLACEMENT_STATUS_BADGE[r.status]}>
                      {REPLACEMENT_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <div className="truncate" style={{ font: "var(--t-body-md)", marginTop: 4 }} title={r.itemName}>
                    {r.itemName} <span style={{ color: "var(--ink-mute)" }}>· {r.quantity}x</span>
                  </div>
                  <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
                    Requested by {requester?.name ?? "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
