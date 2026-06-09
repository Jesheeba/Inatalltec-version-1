"use client";
// ============================================================
// Material Requests (migration 0038)
//
// On-site materials/parts procurement. Technicians raise a request from
// a Work Order; managers approve / reject / fulfil. This module owns:
//   • MaterialRequestCard      — one request + inline status actions,
//                                reused on the WO / project / AMC pages
//   • MaterialRequestsSection  — a titled card listing requests, used by
//                                the roll-up sections
//   • MaterialRequestsList     — the global filterable sidebar page
// ============================================================

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can, listScopeFor } from "@/lib/permissions";
import {
  approveMaterialRequest, rejectMaterialRequest, fulfillMaterialRequest,
  MATERIAL_REQUEST_STATUS_LABEL, MATERIAL_REQUEST_STATUS_BADGE,
  MATERIAL_REQUEST_URGENCY_LABEL,
} from "@/lib/create";
import { formatIsoDateTime } from "@/lib/dates";
import type { MaterialRequest, MaterialRequestStatus, MaterialRequestUrgency } from "@/lib/types";
import { CardHead, EmptyState, FilterBar, KPI, PageHeader } from "../shared";

/* ─── small helpers ──────────────────────────────────────── */

function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const URGENCY_CLS: Record<MaterialRequestUrgency, string> = {
  low:    "badge-outline",
  normal: "badge-info",
  high:   "badge-danger",
};

function StatusPill({ status }: { status: MaterialRequestStatus }) {
  return (
    <span className={"badge " + MATERIAL_REQUEST_STATUS_BADGE[status]}>
      {MATERIAL_REQUEST_STATUS_LABEL[status]}
    </span>
  );
}

/* ─── one request card + inline status actions ───────────────
   Self-contained: holds its own action/note/busy state so it can be
   dropped into the list page, the WO detail tab, and the project / AMC
   roll-up sections without each caller re-implementing the workflow. */
export function MaterialRequestCard({ mr, showWo = true }: { mr: MaterialRequest; showWo?: boolean }) {
  const { role, me, fireToast, bumpData, openWO } = useApp();
  const canManage = can(role, "MANAGE_MATERIAL_REQUEST");
  const [action, setAction] = useState<null | "approve" | "reject" | "fulfill">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const wo = mr.workOrderId ? db.wo(mr.workOrderId) : null;
  const cust = db.cust(mr.customerId);
  const requester = mr.requestedBy ? db.user(mr.requestedBy) : null;
  const pending = mr.status === "pending";

  const open = (a: "approve" | "reject" | "fulfill") => { setAction(a); setNote(""); };

  const run = async () => {
    if (!action) return;
    if (action === "reject" && !note.trim()) { fireToast("A reason is required to reject."); return; }
    setBusy(true);
    const res =
      action === "approve" ? await approveMaterialRequest(mr.id, note || null, me.id)
      : action === "reject" ? await rejectMaterialRequest(mr.id, note, me.id)
      : await fulfillMaterialRequest(mr.id, note || null, me.id);
    setBusy(false);
    if (!res.ok) { fireToast(res.error); return; }
    setAction(null); setNote("");
    fireToast(`${mr.code} ${MATERIAL_REQUEST_STATUS_LABEL[res.mr.status].toLowerCase()}`);
    bumpData();
  };

  // Audit trail line for terminal / decided states.
  const decision =
    mr.status === "rejected" && mr.rejectionReason ? { label: "Rejected", who: mr.rejectedBy, at: mr.rejectedAt, note: mr.rejectionReason }
    : mr.status === "fulfilled" ? { label: "Fulfilled", who: mr.fulfilledBy, at: mr.fulfilledAt, note: mr.fulfillmentNote }
    : mr.status === "approved" ? { label: "Approved", who: mr.approvedBy, at: mr.approvedAt, note: mr.approvalNote }
    : null;

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <span className="numeric" style={{ fontFamily: "var(--font-mono)", font: "var(--t-micro)", color: "var(--ink-mute)" }}>{mr.code}</span>
            <StatusPill status={mr.status} />
            <span className={"badge " + URGENCY_CLS[mr.urgency]}>{MATERIAL_REQUEST_URGENCY_LABEL[mr.urgency]} urgency</span>
            {pending && <span style={{ font: "var(--t-micro)", color: daysSince(mr.requestedAt) >= 3 ? "var(--dan-700)" : "var(--ink-mute)" }}>
              {daysSince(mr.requestedAt)}d pending
            </span>}
          </div>
          <div style={{ font: "var(--t-body-md)", fontWeight: 600, marginTop: 6 }}>
            {mr.quantity} × {mr.itemName}
          </div>
          {mr.notes && (
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>{mr.notes}</div>
          )}
        </div>
      </div>

      <div className="row gap-3" style={{ font: "var(--t-small)", color: "var(--ink-mute)", flexWrap: "wrap", alignItems: "center" }}>
        <span><Icon name="user" size={12} /> {requester?.name ?? "—"}</span>
        <span>{formatIsoDateTime(mr.requestedAt)}</span>
        {cust && <span><Icon name="building" size={12} /> {cust.name}</span>}
        {showWo && wo && (
          <button className="btn btn-ghost btn-sm" onClick={() => openWO(wo.id)}
                  style={{ padding: "2px 6px", font: "var(--t-micro)" }}>
            <Icon name="briefcase" size={11} /> {wo.code} <Icon name="arrowRight" size={11} />
          </button>
        )}
      </div>

      {decision && (
        <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", borderTop: "1px solid var(--divider)", paddingTop: 8 }}>
          <strong style={{ color: "var(--ink)" }}>{decision.label}</strong>
          {decision.who ? ` by ${db.user(decision.who).name}` : ""}
          {decision.at ? ` · ${formatIsoDateTime(decision.at)}` : ""}
          {decision.note ? ` — ${decision.note}` : ""}
        </div>
      )}

      {/* Manager actions — pending → approve/reject; approved → fulfil */}
      {canManage && (mr.status === "pending" || mr.status === "approved") && (
        <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 10 }}>
          {action ? (
            <div className="col gap-2">
              <textarea className="textarea" rows={2} autoFocus
                value={note} onChange={e => setNote(e.target.value)}
                placeholder={action === "reject"
                  ? "Reason for rejection (required) — the technician will see this"
                  : action === "approve" ? "Optional note for procurement"
                  : "Optional note (e.g. delivered to site store)"} />
              <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAction(null)}>Cancel</button>
                <button className={"btn btn-sm " + (action === "reject" ? "btn-danger" : "btn-primary")}
                        disabled={busy} onClick={run}>
                  {busy
                    ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                    : action === "approve" ? <><Icon name="check" size={13} /> Approve</>
                    : action === "reject"  ? <><Icon name="x" size={13} /> Reject</>
                    : <><Icon name="checkCircle" size={13} /> Mark fulfilled</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {mr.status === "pending" && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => open("approve")}><Icon name="check" size={13} /> Approve</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => open("reject")}><Icon name="x" size={13} /> Reject</button>
                </>
              )}
              {mr.status === "approved" && (
                <button className="btn btn-primary btn-sm" onClick={() => open("fulfill")}><Icon name="checkCircle" size={13} /> Mark fulfilled</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── reusable roll-up section (WO / project / AMC pages) ──── */
export function MaterialRequestsSection({
  requests, title = "Material requests", canRequest = false, onRequest, emptyHint,
}: {
  requests: MaterialRequest[];
  title?: string;
  canRequest?: boolean;
  onRequest?: () => void;
  emptyHint?: string;
}) {
  return (
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <CardHead
        title={title}
        sub={requests.length > 0 ? `${requests.length} request${requests.length === 1 ? "" : "s"}` : undefined}
        right={canRequest && onRequest ? (
          <button className="btn btn-primary btn-sm" onClick={onRequest}>
            <Icon name="plus" size={13} /> Request material
          </button>
        ) : undefined}
      />
      {requests.length === 0 ? (
        <EmptyState icon="package" title="No material requests"
          sub={emptyHint ?? "Material requests raised on this work order will appear here."} />
      ) : (
        <div className="col gap-3">
          {requests.map(mr => <MaterialRequestCard key={mr.id} mr={mr} />)}
        </div>
      )}
    </section>
  );
}

/* ─── global list page (sidebar entry) ───────────────────── */
type StatusFilter = "all" | MaterialRequestStatus;

export function MaterialRequestsList() {
  const { role, me, openCreate, dataVersion } = useApp();
  void dataVersion;
  const scope = listScopeFor(role, "material_requests");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  const all = useMemo(() => {
    if (scope === "hidden") return [];
    const everything = Object.values(db.MATERIAL_REQUESTS)
      .slice()
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    if (scope === "all") return everything;
    // "mine": requests I raised, or on WOs I lead / am assigned to.
    return everything.filter(m => {
      if (m.requestedBy === me.id) return true;
      const wo = m.workOrderId ? db.wo(m.workOrderId) : null;
      return !!wo && (wo.assignedLead === me.id || (wo.assigned ?? []).includes(me.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, me.id, dataVersion]);

  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Procurement" title="Material Requests" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Material requests are visible to Operations Managers, Admin, MD, Accounts, and the field staff who raise them." />
      </div>
    );
  }

  const counts = {
    all:       all.length,
    pending:   all.filter(m => m.status === "pending").length,
    approved:  all.filter(m => m.status === "approved").length,
    rejected:  all.filter(m => m.status === "rejected").length,
    fulfilled: all.filter(m => m.status === "fulfilled").length,
  };

  const term = q.trim().toLowerCase();
  const list = all
    .filter(m => filter === "all" || m.status === filter)
    .filter(m => {
      if (!term) return true;
      const cust = db.cust(m.customerId);
      const wo = m.workOrderId ? db.wo(m.workOrderId) : null;
      const requester = m.requestedBy ? db.user(m.requestedBy) : null;
      return [m.code, m.itemName, cust?.name, wo?.code, requester?.name]
        .some(s => s?.toLowerCase().includes(term));
    });

  const canCreate = can(role, "CREATE_MATERIAL_REQUEST");

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Procurement" title="Material Requests"
        sub="Every materials request across all work orders — review, approve, and fulfil."
        right={canCreate
          ? <button className="btn btn-primary" onClick={() => openCreate("material_request")}><Icon name="plus" size={14} /> New request</button>
          : undefined} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Awaiting review" value={counts.pending} sub="pending requests" />
        <KPI label="Approved" value={counts.approved} sub="awaiting fulfilment" />
        <KPI label="Fulfilled" value={counts.fulfilled} sub="delivered" />
        <KPI label="Total" value={counts.all} />
      </div>

      <div className="row between" style={{ gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <FilterBar<StatusFilter> value={filter} onChange={setFilter}
          options={[
            { value: "all",       label: "All",       count: counts.all },
            { value: "pending",   label: "Pending",   count: counts.pending },
            { value: "approved",  label: "Approved",  count: counts.approved },
            { value: "fulfilled", label: "Fulfilled", count: counts.fulfilled },
            { value: "rejected",  label: "Rejected",  count: counts.rejected },
          ]} />
        <input className="input input-sm" style={{ maxWidth: 280 }}
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search material, WO, customer, requester…" />
      </div>

      {list.length === 0 ? (
        <EmptyState icon="package" title="No material requests"
          sub={term || filter !== "all" ? "Try clearing the filters or search." : "Requests raised by technicians on work orders will appear here."} />
      ) : (
        <div className="col gap-3">
          {list.map(mr => <MaterialRequestCard key={mr.id} mr={mr} />)}
        </div>
      )}
    </div>
  );
}
