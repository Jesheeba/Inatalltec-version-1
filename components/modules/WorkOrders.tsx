"use client";
// ============================================================
// Work Orders module - list (table + cards views) with filter chips.
// (Ported from modules/workorders.jsx)
// ============================================================

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can, listScopeFor } from "@/lib/permissions";
import type { WorkOrder } from "@/lib/types";
import {
  EmptyState, FilterBar, PageHeader, StatusBadge, WoCard,
} from "../shared";

export function WorkOrders() {
  const { openWO, go, openCreate, role, me } = useApp();
  // "in_progress" is the new chip from Phase C — strictly WOs with
  // status='in_progress' (the boss's "currently being worked on" view).
  // Note: distinct from "live" which also includes waiting_material.
  type FilterT = "all" | "today" | "live" | "in_progress" | "scheduled" | "closed";
  const [filter, setFilter] = useState<FilterT>("all");
  const [view, setView] = useState<"list" | "cards">("list");
  const [q, setQ] = useState("");
  const scope = listScopeFor(role, "workorders");
  // The Assigned column shows the crew. Workers/drivers/subcontractors only
  // see their own WOs and don't need a who-else-is-on-it column.
  const showAssignedColumn = scope === "all" || role === "lead_worker";

  // Role-scoped WO list:
  //   - "all"  → every WO
  //   - "mine" for lead_worker → WOs they're lead on, assigned to, or that
  //               belong to a project they manage
  //   - "mine" for worker/driver/subcontractor → WOs they're personally
  //               assigned to (in work_order_assignments)
  const all = useMemo(() => {
    const everything = Object.values(db.WORK_ORDERS);
    if (scope === "all") return everything;
    if (scope === "hidden") return [];
    if (role === "lead_worker") {
      const myProjectIds = new Set(
        Object.values(db.PROJECTS).filter(p => p.manager === me.id).map(p => p.id)
      );
      return everything.filter(w =>
        w.assignedLead === me.id ||
        (w.assigned ?? []).includes(me.id) ||
        (w.source.kind === "project" && myProjectIds.has(w.source.id))
      );
    }
    // worker / driver / subcontractor
    return everything.filter(w => (w.assigned ?? []).includes(me.id));
  }, [scope, role, me.id]);
  // Migration 0014 lowercase wo_status. "Live" surfaces actively-in-progress
  // crews; "scheduled" is everything queued (open or assigned to a crew);
  // "closed" covers terminal states (done, closed, cancelled).
  const counts = {
    all: all.length,
    today: all.filter(w => w.scheduledStart.startsWith("2025-05-16")).length,
    live: all.filter(w => w.status === "in_progress" || w.status === "waiting_material").length,
    in_progress: all.filter(w => w.status === "in_progress").length,
    scheduled: all.filter(w => w.status === "open" || w.status === "assigned").length,
    closed: all.filter(w => w.status === "done" || w.status === "closed" || w.status === "cancelled" || w.status === "pending_confirmation").length,
  };

  let list = all;
  if (filter === "today") list = list.filter(w => w.scheduledStart.startsWith("2025-05-16"));
  if (filter === "live") list = list.filter(w => w.status === "in_progress" || w.status === "waiting_material");
  if (filter === "in_progress") list = list.filter(w => w.status === "in_progress");
  if (filter === "scheduled") list = list.filter(w => w.status === "open" || w.status === "assigned");
  if (filter === "closed") list = list.filter(w => w.status === "done" || w.status === "closed" || w.status === "cancelled" || w.status === "pending_confirmation");
  if (q.trim()) {
    const lq = q.toLowerCase();
    list = list.filter(w =>
      w.code.toLowerCase().includes(lq) ||
      w.title.toLowerCase().includes(lq) ||
      (db.cust(w.customer)?.name ?? "").toLowerCase().includes(lq));
  }

  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="The execution layer" title="Work orders" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Work orders are visible to roles with field-execution responsibilities." />
      </div>
    );
  }

  return (
    <div className="main-pad">
      <PageHeader
        eyebrow="The execution layer"
        title="Work orders"
        sub="Every field activity - jobs, AMC services, repair visits, deliveries, surveys - runs through here."
        right={
          <div className="row gap-2">
            <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => go("scheduling")}>
              <Icon name="calendar" size={14} /> Schedule view
            </button>
            {can(role, "CREATE_WORK_ORDER") && (
              <button className="btn btn-primary" onClick={() => openCreate("workorder")}><Icon name="plus" size={14} /> New work order</button>
            )}
          </div>
        }
      />

      <div className="card card-pad" style={{ padding: 16, marginBottom: 16 }}>
        <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm" placeholder="Search by code, title, customer…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="seg hide-mobile">
            <button data-on={String(view === "list")} onClick={() => setView("list")}><Icon name="list" size={14} /> List</button>
            <button data-on={String(view === "cards")} onClick={() => setView("cards")}><Icon name="grid" size={14} /> Cards</button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <FilterBar<FilterT> value={filter} onChange={setFilter} options={[
            { value: "all", label: "All", count: counts.all },
            { value: "today", label: "Today", count: counts.today },
            { value: "live", label: "Live", count: counts.live },
            { value: "in_progress", label: "In Progress", count: counts.in_progress },
            { value: "scheduled", label: "Scheduled", count: counts.scheduled },
            { value: "closed", label: "Completed", count: counts.closed },
          ]} />
        </div>
      </div>

      {list.length === 0 ? (
        Object.keys(db.WORK_ORDERS).length === 0 ? (
          <EmptyState icon="briefcase" title="No work orders yet"
            sub="Click + Create on the top bar to schedule your first one." />
        ) : (
          <EmptyState icon="briefcase" title="No work orders match"
            sub="Try a different filter or clear the search." />
        )
      ) : view === "list" ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Code</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th>Title</th>
                  <th className="hide-mobile">Customer</th>
                  <th className="hide-mobile" style={{ width: 140 }}>Window</th>
                  {showAssignedColumn && <th className="hide-mobile" style={{ width: 130 }}>Assigned</th>}
                  <th className="hide-mobile" style={{ width: 110 }}>Duration</th>
                  <th style={{ width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map(wo => <WoTableRow key={wo.id} wo={wo} showAssigned={showAssignedColumn} onClick={() => openWO(wo.id)} />)}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {list.map(wo => <WoCard key={wo.id} wo={wo} onClick={() => openWO(wo.id)} />)}
        </div>
      )}
    </div>
  );
}

function WoTableRow({ wo, onClick, showAssigned = true }: { wo: WorkOrder; onClick?: () => void; showAssigned?: boolean }) {
  // Customer / site rows may be missing if the work order references a
  // deleted row, or if hydration filtered them out. Fall back to "-"
  // instead of crashing the whole table.
  const cust = db.cust(wo.customer);
  const site = db.site(wo.site);
  const custLabel = cust?.name ?? "-";
  const siteLabel = site?.name ?? "-";
  const subtitle = [cust?.name, site?.name].filter(Boolean).join(" · ") || "-";
  const time = wo.scheduledStart && wo.scheduledEnd
    ? wo.scheduledStart.split("T")[1].slice(0, 5) + " – " + wo.scheduledEnd.split("T")[1].slice(0, 5)
    : "-";
  const typeMap: Record<string, string> = {
    AMC: "badge-primary", PROJECT: "badge-info", REPAIR: "badge-warning",
    DELIVERY: "badge-outline", SURVEY: "badge-violet",
  };
  return (
    <tr onClick={onClick}>
      <td data-th="Code" className="numeric" style={{ fontFamily: "var(--font-mono)", font: "var(--t-small)", color: "var(--ink-mute)" }}>{wo.code}</td>
      <td data-th="Type"><span className={"badge " + (typeMap[wo.type] || "")}>{wo.type}</span></td>
      <td data-th="Title">
        <div style={{ font: "var(--t-body-md)", color: "var(--ink)" }}>{wo.title}</div>
        <div className="show-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{subtitle}</div>
      </td>
      <td data-th="Customer" className="hide-mobile">
        <div style={{ font: "var(--t-small)" }}>{custLabel}</div>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{siteLabel}</div>
      </td>
      <td data-th="Window" className="hide-mobile numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{time}</td>
      {showAssigned && (
        <td data-th="Assigned" className="hide-mobile">
          <div className="avatar-stack">
            {(wo.assigned || []).slice(0, 3).map(uid => {
              const u = db.user(uid);
              return <span key={uid} className={"avatar avatar-sm avatar-" + (u?.tint || "primary")}>{u?.initials ?? "?"}</span>;
            })}
          </div>
        </td>
      )}
      <td data-th="Duration" className="hide-mobile numeric"
          style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
        {wo.durationMinutes > 0 ? formatDuration(wo.durationMinutes) : "-"}
        {wo.actualWorkersCount > 1 && (
          <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>
            {wo.actualWorkersCount} workers
          </div>
        )}
      </td>
      <td data-th="Status"><StatusBadge state={wo.status} /></td>
    </tr>
  );
}

/** "1h 30m" style. Pure presentation — duplicated locally to avoid
 *  cross-file imports for a one-liner used only here. */
function formatDuration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "-";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
