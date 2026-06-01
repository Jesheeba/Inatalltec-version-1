"use client";
// ============================================================
// Sub-contractors module — directory list + detail (migration 0023).
//
// Two exports:
//   • SubContractors      → list at /sub-contractors
//   • SubContractorDetail → detail at /sub-contractors/[id]
//
// Role gates (mirrors RLS):
//   View / list   → admin / md / manager  (workers don't see them)
//   Create / edit → admin / md / manager
//   Deactivate    → admin / md / manager
//
// The list shows directory + a derived "Active WOs" + "Total Hours"
// column computed from db.WORK_ORDER_SUB_CONTRACTORS — no extra
// queries; all live off the hydrated mirror.
// ============================================================

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import {
  deactivateSubContractor, updateSubContractor, deleteSubContractorHoursEntry,
} from "@/lib/create";
import {
  formatDurationMinutes, formatLongDateTime, formatMonthDay,
} from "@/lib/dates";
import {
  CardHead, EmptyState, FilterBar, KPI, Modal, PageHeader, SignOutButton,
} from "../shared";
import type {
  SubContractor, WorkOrderSubContractorHours,
} from "@/lib/types";

const ALLOWED_ROLES = new Set<string>(["admin", "md", "manager"]);

// ── List page ───────────────────────────────────────────────

export function SubContractors() {
  const { role, openCreate, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!ALLOWED_ROLES.has(role)) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Workforce" title="Sub-contractors" right={<SignOutButton />} />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Sub-contractor profiles are managed by Operations Manager / Admin / MD." />
      </div>
    );
  }

  type FilterT = "active" | "all" | "inactive";
  const [filter, setFilter] = useState<FilterT>("active");
  const [q, setQ] = useState("");

  const all = useMemo(
    () => Object.values(db.SUB_CONTRACTORS).sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    ),
    [dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const counts = {
    active:   all.filter(s => s.isActive).length,
    inactive: all.filter(s => !s.isActive).length,
    all:      all.length,
  };

  let list = all;
  if (filter === "active")   list = list.filter(s => s.isActive);
  if (filter === "inactive") list = list.filter(s => !s.isActive);
  if (q.trim()) {
    const lq = q.toLowerCase();
    list = list.filter(s =>
      s.name.toLowerCase().includes(lq)
      || (s.company ?? "").toLowerCase().includes(lq)
      || (s.phone ?? "").toLowerCase().includes(lq)
      || (s.emiratesId ?? "").toLowerCase().includes(lq)
    );
  }

  // Total tracked hours across all closed sessions for each sub.
  const hoursBySub = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of Object.values(db.WORK_ORDER_SUB_CONTRACTORS)) {
      const cur = map.get(j.subContractorId) ?? 0;
      map.set(j.subContractorId, cur + (j.durationMinutes || 0));
    }
    return map;
  }, [dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active WOs (started, not completed) per sub.
  const activeWosBySub = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of Object.values(db.WORK_ORDER_SUB_CONTRACTORS)) {
      if (j.startedAt && !j.completedAt) {
        map.set(j.subContractorId, (map.get(j.subContractorId) ?? 0) + 1);
      }
    }
    return map;
  }, [dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalActiveHours = useMemo(() => {
    let m = 0;
    for (const j of Object.values(db.WORK_ORDER_SUB_CONTRACTORS)) m += j.durationMinutes || 0;
    return m;
  }, [dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="main-pad">
      <PageHeader
        eyebrow="Workforce"
        title="Sub-contractors"
        sub="External contractor directory · hours tracked · HR compliance fields"
        right={
          <div className="row gap-2">
            <button className="btn btn-primary" onClick={() => openCreate("sub_contractor")}>
              <Icon name="plus" size={14} /> Add sub-contractor
            </button>
            <SignOutButton />
          </div>
        } />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active profiles" value={counts.active} />
        <KPI label="Inactive" value={counts.inactive} />
        <KPI label="Total tracked hours" value={formatDurationMinutes(totalActiveHours)}
          sub="Across all sub-contractor sessions" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm" placeholder="Search name, company, phone, Emirates ID…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <FilterBar<FilterT> value={filter} onChange={setFilter} options={[
            { value: "active",   label: "Active",   count: counts.active },
            { value: "inactive", label: "Inactive", count: counts.inactive },
            { value: "all",      label: "All",      count: counts.all },
          ]} />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon="users" title="No sub-contractors match"
          sub="Try a different filter, clear the search, or add a new profile." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hide-mobile">Company</th>
                  <th className="hide-mobile" style={{ width: 160 }}>Phone</th>
                  <th className="hide-mobile" style={{ width: 180 }}>Emirates ID</th>
                  <th className="hide-mobile" style={{ width: 100 }}>Active WOs</th>
                  <th className="hide-mobile" style={{ width: 120 }}>Hours</th>
                  <th style={{ width: 100 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map(s => (
                  <tr key={s.id}
                    onClick={() => router.push(`/sub-contractors/${s.id}`)}
                    style={{ cursor: "pointer" }}>
                    <td data-th="Name">
                      <div style={{ font: "var(--t-body-md)" }}>{s.name}</div>
                      <div className="show-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                        {s.company ?? "Independent"}
                      </div>
                    </td>
                    <td data-th="Company" className="hide-mobile">
                      {s.company ?? <span style={{ color: "var(--ink-quiet)" }}>Independent</span>}
                    </td>
                    <td data-th="Phone" className="hide-mobile numeric"
                        style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                      {s.phone ?? "—"}
                    </td>
                    <td data-th="Emirates ID" className="hide-mobile numeric"
                        style={{ font: "var(--t-small)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
                      {s.emiratesId ?? "—"}
                    </td>
                    <td data-th="Active WOs" className="hide-mobile numeric"
                        style={{ font: "var(--t-small)" }}>
                      {activeWosBySub.get(s.id) ?? 0}
                    </td>
                    <td data-th="Hours" className="hide-mobile numeric"
                        style={{ font: "var(--t-small)" }}>
                      {formatDurationMinutes(hoursBySub.get(s.id) ?? 0)}
                    </td>
                    <td data-th="Status">
                      {s.isActive
                        ? <span className="badge badge-success">Active</span>
                        : <span className="badge badge-outline">Inactive</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail page ─────────────────────────────────────────────

export function SubContractorDetail({ id }: { id: string }) {
  const { role, me, openWO, openProject, openCreate, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  const [editingProfile, setEditingProfile] = useState(false);
  const [showFullNotes,  setShowFullNotes]  = useState(false);
  const [historyLimit,   setHistoryLimit]   = useState(50);

  if (!ALLOWED_ROLES.has(role)) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Workforce" title="Sub-contractor" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Sub-contractor profiles are managed by Operations Manager / Admin / MD." />
      </div>
    );
  }

  const sub = db.subContractor(id);
  if (!sub) {
    return (
      <div className="main-pad">
        <EmptyState icon="alertCircle" title="Sub-contractor not found"
          action={<button className="btn btn-primary" onClick={() => router.push("/sub-contractors")}>Back to list</button>} />
      </div>
    );
  }

  // ── Phase 5D.1 data layer ────────────────────────────────
  // All hours flow from the new work_order_sub_contractor_hours table
  // (migration 0026), surfaced via db.hoursForSub. The old
  // work_order_sub_contractors.duration_minutes column is no longer
  // consulted on this page — it was only ever written by the unused
  // start/complete helpers from Phase 5D and would now under-count
  // every sub by ~100%.
  const entries = useMemo(
    () => db.hoursForSub(id),
    [id, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totalHours = useMemo(
    () => entries.reduce((s, e) => s + e.hours, 0),
    [entries],
  );

  // Distinct PROJECT count (AMC visits / repair jobs aren't projects).
  const activeProjectCount = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const wo = db.wo(e.workOrderId);
      if (wo?.source.kind === "project") set.add(wo.source.id);
    }
    return set.size;
  }, [entries]);

  // Hours-by-source grouping. Projects each get their own group; AMC
  // visits and repair jobs roll up into a single "AMC visits" /
  // "Repair jobs" bucket each. WOs that have been deleted out from
  // under the entries fall into "Removed work orders" so the totals
  // still reconcile against `totalHours`.
  type Group = {
    key: string;
    kind: "project" | "amc" | "repair" | "unknown";
    label: string;
    code?: string;
    projectId?: string;
    totalHours: number;
    entryCount: number;
  };
  const groups = useMemo<Group[]>(() => {
    const projects = new Map<string, Group>();
    let amcHours = 0, amcCount = 0;
    let repairHours = 0, repairCount = 0;
    let unknownHours = 0, unknownCount = 0;
    for (const e of entries) {
      const wo = db.wo(e.workOrderId);
      if (!wo) {
        unknownHours += e.hours;
        unknownCount += 1;
        continue;
      }
      if (wo.source.kind === "project") {
        const pid = wo.source.id;
        const cur = projects.get(pid);
        if (cur) {
          cur.totalHours += e.hours;
          cur.entryCount += 1;
        } else {
          const p = db.proj(pid);
          projects.set(pid, {
            key: "p:" + pid, kind: "project",
            label: p?.name ?? "Removed project",
            code: p?.code, projectId: pid,
            totalHours: e.hours, entryCount: 1,
          });
        }
      } else if (wo.source.kind === "amc") {
        amcHours += e.hours; amcCount += 1;
      } else if (wo.source.kind === "repair") {
        repairHours += e.hours; repairCount += 1;
      }
    }
    const out: Group[] = Array.from(projects.values())
      .sort((a, b) => b.totalHours - a.totalHours);
    if (amcCount > 0) {
      out.push({ key: "amc", kind: "amc", label: "AMC visits",
        totalHours: amcHours, entryCount: amcCount });
    }
    if (repairCount > 0) {
      out.push({ key: "repair", kind: "repair", label: "Repair jobs",
        totalHours: repairHours, entryCount: repairCount });
    }
    if (unknownCount > 0) {
      out.push({ key: "unknown", kind: "unknown", label: "Removed work orders",
        totalHours: unknownHours, entryCount: unknownCount });
    }
    return out;
  }, [entries]);

  // Newest first. Tie-break by loggedAt for multi-entry-per-day cases.
  const sortedHistory = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? 1 : -1;
      return a.loggedAt < b.loggedAt ? 1 : -1;
    });
  }, [entries]);
  const visibleHistory = sortedHistory.slice(0, historyLimit);
  const hasMore = sortedHistory.length > historyLimit;

  // Mirrors RLS wosh_write USING. Detail page is already gated to
  // admin/md/manager via ALLOWED_ROLES, so isStaff is always true
  // here — the lead_worker branch is dead defence-in-depth in case
  // the gate is ever relaxed.
  const isStaff = role === "admin" || role === "md" || role === "manager";
  const canTouchEntry = (loggedBy: string | null) =>
    isStaff || (role === "lead_worker" && loggedBy === me.id);

  const onDeactivate = async () => {
    if (!confirm(`Deactivate ${sub.name}? They'll stay on existing assignments but won't appear in the picker for new work orders.`)) return;
    const res = await deactivateSubContractor(id);
    if (!res.ok) { fireToast(res.error); return; }
    bumpData();
    fireToast(`${sub.name} deactivated`);
  };

  const onReactivate = async () => {
    const res = await updateSubContractor(id, { is_active: true });
    if (!res.ok) { fireToast(res.error); return; }
    bumpData();
    fireToast(`${sub.name} reactivated`);
  };

  const onEditEntry = (e: WorkOrderSubContractorHours) => {
    const wo = db.wo(e.workOrderId);
    const assignment = db.subForWO(e.workOrderId).find(a => a.subContractorId === id);
    openCreate("sub_hours", {
      wo_id: e.workOrderId, sub_id: id,
      sub_name: sub.name, wo_code: wo?.code ?? "",
      assigned_at: assignment?.assignedAt ?? "",
      entry_id: e.id,
      hours: e.hours,
      entry_date: e.entryDate,
      notes: e.notes ?? "",
    });
  };

  const onDeleteEntry = async (e: WorkOrderSubContractorHours) => {
    if (!confirm("Delete this hours entry? This cannot be undone.")) return;
    const res = await deleteSubContractorHoursEntry(e.id);
    if (!res.ok) { fireToast(`Couldn't delete: ${res.error}`); return; }
    fireToast("Hours entry deleted");
    bumpData();
  };

  const NOTES_PREVIEW = 160;
  const notesLong = (sub.notes?.length ?? 0) > NOTES_PREVIEW;

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => router.push("/sub-contractors")}
           style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All sub-contractors
        </a>
      </div>

      {/* ── A. Identity card ─────────────────────────────── */}
      <section className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="row between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ font: "var(--t-h2)" }}>{sub.name}</div>
            <div style={{ font: "var(--t-body)", color: "var(--ink-mute)", marginTop: 2 }}>
              {sub.company ?? "Independent contractor"}
            </div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 4 }}>
              Added {formatLongDateTime(new Date(sub.createdAt))}
            </div>
          </div>
          <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {sub.isActive
              ? <span className="badge badge-success">Active</span>
              : <span className="badge badge-outline">Inactive</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingProfile(true)}>
              <Icon name="pen" size={14} /> Edit profile
            </button>
            {sub.isActive
              ? <button className="btn btn-ghost btn-sm" onClick={onDeactivate}>
                  <Icon name="x" size={14} /> Deactivate
                </button>
              : <button className="btn btn-ghost btn-sm" onClick={onReactivate}>
                  <Icon name="refresh" size={14} /> Reactivate
                </button>}
          </div>
        </div>

        <div style={{
          display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}>
          <DetailRow label="Phone">
            {sub.phone
              ? <a href={`tel:${sub.phone.replace(/\s+/g, "")}`}
                   style={{ font: "var(--t-small)", color: "var(--pri-700)", textDecoration: "none" }}>
                  {sub.phone}
                </a>
              : <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Not provided</span>}
          </DetailRow>
          <DetailRow label="Emirates ID">
            <span style={{ font: "var(--t-small)", fontFamily: "var(--font-mono)" }}>
              {sub.emiratesId ?? "—"}
            </span>
          </DetailRow>
          <DetailRow label="Company">
            <span style={{ font: "var(--t-small)" }}>{sub.company ?? "Independent"}</span>
          </DetailRow>
        </div>

        {sub.notes && (
          <div style={{
            marginTop: 14, padding: 12, borderRadius: "var(--r-md)",
            background: "var(--bg-muted)", border: "1px solid var(--border)",
          }}>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>Notes</div>
            <div style={{ font: "var(--t-small)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {notesLong && !showFullNotes
                ? <>{sub.notes.slice(0, NOTES_PREVIEW)}…{" "}
                    <button className="btn-link" type="button" onClick={() => setShowFullNotes(true)}
                            style={{ font: "var(--t-small)", color: "var(--pri-700)", cursor: "pointer", background: "none", border: "none", padding: 0 }}>
                      Show notes
                    </button>
                  </>
                : sub.notes}
              {notesLong && showFullNotes && <>{" "}
                <button className="btn-link" type="button" onClick={() => setShowFullNotes(false)}
                        style={{ font: "var(--t-small)", color: "var(--pri-700)", cursor: "pointer", background: "none", border: "none", padding: 0 }}>
                  Show less
                </button></>}
            </div>
          </div>
        )}
      </section>

      {/* ── B. Hours headline KPIs ───────────────────────── */}
      <div style={{
        display: "grid", gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        marginBottom: 20,
      }}>
        <KPI accent="primary" label="Total hours" value={`${totalHours.toFixed(1)} hrs`}
             sub={`Logged across ${entries.length} session${entries.length === 1 ? "" : "s"}`} />
        <KPI label="Active projects" value={activeProjectCount}
             sub={activeProjectCount === 1 ? "Distinct project" : "Distinct projects"} />
        <KPI label="Total entries" value={entries.length}
             sub={entries.length === 1 ? "Hours row logged" : "Hours rows logged"} />
      </div>

      {/* ── C. Hours by project ───────────────────────────── */}
      <section className="card card-pad" style={{ marginBottom: 20 }}>
        <CardHead title={`Hours by project · ${groups.length}`}
          sub="Click a project to drill into its work orders" />
        {groups.length === 0 ? (
          <EmptyState icon="clock" title="No hours logged yet"
            sub="Hours will appear here once they're logged from the WO Crew section." />
        ) : (
          <div className="col gap-2">
            {groups.map(g => (
              <button key={g.key}
                onClick={() => g.kind === "project" && g.projectId ? openProject(g.projectId) : undefined}
                disabled={g.kind !== "project" || !g.projectId}
                style={{
                  all: "unset",
                  cursor: g.kind === "project" && g.projectId ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: "var(--r-md)",
                  background: "var(--bg-muted)", border: "1px solid var(--border)",
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                    {g.kind !== "project" && (
                      <span className="badge badge-outline" style={{ font: "var(--t-micro)" }}>
                        {g.kind === "amc" ? "AMC" : g.kind === "repair" ? "Repair" : "Removed"}
                      </span>
                    )}
                    <span className="truncate" style={{ font: "var(--t-body-md)" }}>{g.label}</span>
                  </div>
                  {g.code && (
                    <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                      {g.code}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="numeric" style={{ font: "var(--t-body-md)", fontWeight: 600 }}>
                    {g.totalHours.toFixed(1)} hrs
                  </div>
                  <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                    {g.entryCount} {g.entryCount === 1 ? "entry" : "entries"}
                  </div>
                </div>
                {g.kind === "project" && g.projectId && (
                  <Icon name="chevronRight" size={14} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── D. Work history (full receipts) ───────────────── */}
      <section className="card card-pad">
        <CardHead title={`Work history · ${entries.length}`}
          sub="Every hours entry, newest first" />
        {entries.length === 0 ? (
          <EmptyState icon="clock" title="No hours logged yet"
            sub="Hours show up here as soon as the Lead Tech logs them on a WO." />
        ) : (
          <>
            <div className="col gap-1">
              {visibleHistory.map(e => {
                const wo = db.wo(e.workOrderId);
                const projectName = wo?.source.kind === "project"
                  ? db.proj(wo.source.id)?.name ?? "Removed project"
                  : wo?.source.kind === "amc" ? "AMC visit"
                  : wo?.source.kind === "repair" ? "Repair job"
                  : "—";
                return (
                  <div key={e.id} className="row gap-2"
                       style={{
                         alignItems: "center", padding: "10px 12px",
                         borderRadius: "var(--r-md)",
                         borderBottom: "1px solid var(--border)",
                       }}>
                    <span className="numeric" style={{
                      font: "var(--t-small)", color: "var(--ink-mute)",
                      flexShrink: 0, minWidth: 60,
                    }}>
                      {formatEntryDate(e.entryDate)}
                    </span>
                    <button onClick={() => wo && openWO(wo.id)}
                            disabled={!wo}
                            style={{
                              all: "unset", flex: 1, minWidth: 0,
                              cursor: wo ? "pointer" : "default",
                            }}>
                      <div className="truncate" style={{ font: "var(--t-small)", fontWeight: 600 }}>
                        {wo?.code ?? "—"} · {wo?.title ?? "Removed work order"}
                      </div>
                      <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                        {projectName}
                        {e.notes ? ` · "${e.notes}"` : ""}
                      </div>
                    </button>
                    <span className="numeric" style={{
                      font: "var(--t-small)", fontWeight: 600,
                      flexShrink: 0, minWidth: 60, textAlign: "right",
                    }}>
                      {e.hours.toFixed(1)} hrs
                    </span>
                    {canTouchEntry(e.loggedBy) && (
                      <>
                        <button className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => onEditEntry(e)} aria-label="Edit entry">
                          <Icon name="pen" size={12} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => onDeleteEntry(e)} aria-label="Delete entry">
                          <Icon name="trash" size={12} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {hasMore && (
              <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => setHistoryLimit(n => n + 50)}>
                  Load more · {sortedHistory.length - visibleHistory.length} remaining
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {editingProfile && (
        <EditProfileModal sub={sub}
          onClose={() => setEditingProfile(false)}
          onSaved={() => { setEditingProfile(false); bumpData(); }} />
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="col gap-1">
      <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </span>
      <div style={{ wordBreak: "break-word" }}>{children}</div>
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

// Inline edit modal — avoids touching CreateModals.tsx (which is
// protected for this phase) and the existing SubContractorForm there
// (create-only). Same updateSubContractor() backend either way.
function EditProfileModal({ sub, onClose, onSaved }: {
  sub: SubContractor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { fireToast } = useApp();
  const [f, setF] = useState({
    name:        sub.name,
    phone:       sub.phone ?? "",
    emirates_id: sub.emiratesId ?? "",
    company:     sub.company ?? "",
    notes:       sub.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { setErr("Name is required."); return; }
    setBusy(true);
    setErr(null);
    const res = await updateSubContractor(sub.id, {
      name:        f.name,
      phone:       f.phone || null,
      emirates_id: f.emirates_id || null,
      company:     f.company || null,
      notes:       f.notes || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${res.sub.name} updated`);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} lg>
      <form onSubmit={submit}>
        <div className="form-hero">
          <div className="form-hero-icon"><Icon name="users" size={22} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="form-hero-title">Edit sub-contractor</div>
            <div className="form-hero-sub">Update {sub.name}'s profile</div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="form-body">
          <div className="section">
            <div className="section-title">Identity</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label className="field-label">Name<span className="req">*</span></label>
                <input className="input" required value={f.name}
                  onChange={e => setF({ ...f, name: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label">Company</label>
                <input className="input" value={f.company}
                  onChange={e => setF({ ...f, company: e.target.value })}
                  placeholder="Leave blank if independent" />
              </div>
            </div>
          </div>
          <div className="section">
            <div className="section-title">Contact &amp; compliance</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label className="field-label">Phone</label>
                <input className="input" type="tel" value={f.phone}
                  onChange={e => setF({ ...f, phone: e.target.value })}
                  placeholder="+971 50 123 4567" />
              </div>
              <div className="field">
                <label className="field-label">Emirates ID</label>
                <input className="input" value={f.emirates_id}
                  onChange={e => setF({ ...f, emirates_id: e.target.value })}
                  placeholder="784-1990-1234567-1" />
              </div>
              <div className="field">
                <label className="field-label">Notes</label>
                <textarea className="textarea" rows={3} value={f.notes}
                  onChange={e => setF({ ...f, notes: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        {err && (
          <div className="form-error">
            <Icon name="alertCircle" size={14} /> {err}
          </div>
        )}

        <div className="form-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy
              ? <><Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
              : <><Icon name="check" size={14} /> Save changes</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
