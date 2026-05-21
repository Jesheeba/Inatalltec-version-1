"use client";
// ============================================================
// Replacement Requests module — list + detail.
//
// Lifecycle (migration 0017):
//   requested → approved → pending_confirmation → completed
//                    ↓
//               rejected (terminal)
//                    ↓
//              cancelled (any non-terminal state)
//
// Lead Technician is the gatekeeper at TWO points:
//   1. Approve / Reject when status = requested
//   2. Confirm / Send back when status = pending_confirmation
//
// Workers raise from the field; managers see everything; accounts can
// view (for future invoicing). All writes go through lib/create.ts
// helpers — those handle optimistic-concurrency via .eq("status", ...)
// so two simultaneous approvals don't overwrite each other.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import {
  approveReplacement, cancelReplacement, confirmReplacement,
  markReplacementInstalled, rejectReplacement, sendBackReplacement,
  REPLACEMENT_STATUSES, REPLACEMENT_STATUS_LABEL, REPLACEMENT_STATUS_BADGE,
  REPLACEMENT_CONTEXT_LABEL,
} from "@/lib/create";
import type { ReplacementContext, ReplacementRequest, ReplacementStatus } from "@/lib/types";
import {
  CardHead, EmptyState, FilterBar, KPI, Modal, PageHeader,
} from "../shared";

/* ─── List ─────────────────────────────────────────────── */

type StatusFilter = "all" | ReplacementStatus;
const STATUS_FILTERS: StatusFilter[] = ["all", ...REPLACEMENT_STATUSES];
type ContextFilter = "all" | ReplacementContext;

export function ReplacementsList() {
  const { role, me, openCreate, openReplacement, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  const search = useSearchParams();

  const initialStatus = (search?.get("status") as StatusFilter) || "all";
  const initialContext = (search?.get("context") as ContextFilter) || "all";
  const [status, setStatus] = useState<StatusFilter>(
    STATUS_FILTERS.includes(initialStatus) ? initialStatus : "all"
  );
  const [contextFilter, setContextFilter] = useState<ContextFilter>(initialContext);
  const [q, setQ] = useState("");

  // Role-scoped scope (matches the RLS rr_read policy so the UI shows
  // exactly what the DB would return):
  //   - managers / admin / md / accounts → all
  //   - lead_worker → all that match their lead/assignment OR everything
  //                   (RLS already broad for leads — keep UI broad too)
  //   - worker / driver / sub → only ones they touched OR are assigned to
  //                              the linked WO
  const visible = useMemo(() => {
    const all = Object.values(db.REPLACEMENTS);
    const broad = role === "admin" || role === "md" || role === "manager"
      || role === "accounts" || role === "lead_worker";
    if (broad) return all;
    // narrow set: requester / approver / installer / confirmer OR
    // assigned to the linked WO
    const myWoIds = new Set(
      Object.values(db.WORK_ORDERS)
        .filter(w => (w.assigned ?? []).includes(me.id))
        .map(w => w.id)
    );
    return all.filter(r =>
      r.requestedBy === me.id ||
      r.approvedBy === me.id ||
      r.installedBy === me.id ||
      r.confirmedBy === me.id ||
      (r.workOrderId !== null && myWoIds.has(r.workOrderId))
    );
  }, [role, me.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: visible.length,
      requested: 0, approved: 0, rejected: 0,
      in_progress: 0, pending_confirmation: 0, completed: 0, cancelled: 0,
    };
    for (const r of visible) c[r.status]++;
    return c;
  }, [visible]);

  const filtered = useMemo(() => {
    let list = visible;
    if (status !== "all") list = list.filter(r => r.status === status);
    if (contextFilter !== "all") list = list.filter(r => r.context === contextFilter);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(r =>
        r.code.toLowerCase().includes(needle) ||
        r.itemName.toLowerCase().includes(needle) ||
        (db.cust(r.customerId)?.name ?? "").toLowerCase().includes(needle)
      );
    }
    return list;
  }, [visible, status, contextFilter, q]);

  const setStatusFilter = (next: StatusFilter) => {
    setStatus(next);
    const params = new URLSearchParams(search?.toString() ?? "");
    if (next === "all") params.delete("status"); else params.set("status", next);
    const qs = params.toString();
    router.replace(qs ? `/replacements?${qs}` : "/replacements");
  };
  const setContextDropdown = (next: ContextFilter) => {
    setContextFilter(next);
    const params = new URLSearchParams(search?.toString() ?? "");
    if (next === "all") params.delete("context"); else params.set("context", next);
    const qs = params.toString();
    router.replace(qs ? `/replacements?${qs}` : "/replacements");
  };

  // "+ New Request" is available to anyone who can create one (driver and
  // most office roles excluded — see CREATE_REPLACEMENT in permissions.ts).
  const canRequest = role === "admin" || role === "md" || role === "manager"
    || role === "lead_worker" || role === "worker" || role === "subcontractor";

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Field operations" title="Replacements"
        sub="Track all part replacements across projects, AMC, and repair work"
        right={canRequest
          ? <button className="btn btn-primary" onClick={() => openCreate("replacement_request")}>
              <Icon name="plus" size={14} /> New request
            </button>
          : undefined} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Total" value={counts.all} />
        <KPI label="Awaiting approval" value={counts.requested} sub={counts.requested > 0 ? "Lead Tech action" : "Queue clear"} />
        <KPI label="Awaiting confirmation" value={counts.pending_confirmation} sub={counts.pending_confirmation > 0 ? "Lead Tech action" : "Queue clear"} />
        <KPI label="Completed" value={counts.completed} sub="lifetime" />
      </div>

      <div className="card card-pad" style={{ padding: 14, marginBottom: 16 }}>
        <FilterBar<StatusFilter> value={status} onChange={setStatusFilter}
          options={STATUS_FILTERS.map(s => ({
            value: s,
            label: s === "all" ? "All" : REPLACEMENT_STATUS_LABEL[s],
            count: counts[s],
          }))} />
        <div className="row gap-3" style={{ flexWrap: "wrap", marginTop: 12 }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm"
              placeholder="Search code, item, or customer…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className="input input-sm" style={{ maxWidth: 240 }}
            value={contextFilter}
            onChange={e => setContextDropdown(e.target.value as ContextFilter)}
            aria-label="Filter by context">
            <option value="all">All contexts</option>
            <option value="main_contractor">{REPLACEMENT_CONTEXT_LABEL.main_contractor}</option>
            <option value="amc_free_call">{REPLACEMENT_CONTEXT_LABEL.amc_free_call}</option>
            <option value="amc_scheduled">{REPLACEMENT_CONTEXT_LABEL.amc_scheduled}</option>
            <option value="repair">{REPLACEMENT_CONTEXT_LABEL.repair}</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="package"
          title={visible.length === 0 ? "No replacement requests yet" : "No replacements match"}
          sub={visible.length === 0
            ? "Workers can request from any active work order."
            : "Try clearing the filters or searching for a different term."}
          action={visible.length === 0 && canRequest
            ? <button className="btn btn-primary" onClick={() => openCreate("replacement_request")}>
                <Icon name="plus" size={14} /> New request
              </button>
            : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Code</th>
                  <th>Item</th>
                  <th className="hide-mobile" style={{ width: 60 }}>Qty</th>
                  <th className="hide-mobile">Customer</th>
                  <th className="hide-mobile" style={{ width: 150 }}>Context</th>
                  <th style={{ width: 160 }}>Status</th>
                  <th className="hide-mobile" style={{ width: 140 }}>Requested by</th>
                  <th className="hide-mobile" style={{ width: 100 }}>When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => <RrRow key={r.id} r={r} onClick={() => openReplacement(r.id)} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RrRow({ r, onClick }: { r: ReplacementRequest; onClick: () => void }) {
  const cust = db.cust(r.customerId);
  const requester = r.requestedBy ? db.user(r.requestedBy) : null;
  return (
    <tr onClick={onClick}>
      <td data-th="Code" className="numeric" style={{ fontFamily: "var(--font-mono)", font: "var(--t-small)", color: "var(--ink-mute)" }}>
        {r.code || "—"}
      </td>
      <td data-th="Item">
        <div className="truncate" style={{ font: "var(--t-body-md)", maxWidth: 320 }} title={r.itemName}>{r.itemName}</div>
        {r.reason && (
          <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", maxWidth: 320 }} title={r.reason}>
            {r.reason}
          </div>
        )}
      </td>
      <td data-th="Qty" className="hide-mobile numeric">{r.quantity}</td>
      <td data-th="Customer" className="hide-mobile" style={{ font: "var(--t-small)" }}>{cust?.name ?? "—"}</td>
      <td data-th="Context" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
        {REPLACEMENT_CONTEXT_LABEL[r.context]}
      </td>
      <td data-th="Status">
        <span className={"badge " + REPLACEMENT_STATUS_BADGE[r.status]}>
          {REPLACEMENT_STATUS_LABEL[r.status]}
        </span>
      </td>
      <td data-th="Requested by" className="hide-mobile" style={{ font: "var(--t-small)" }}>
        {requester?.name ?? "—"}
      </td>
      <td data-th="When" className="hide-mobile numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
        {formatRelative(r.requestedAt)}
      </td>
    </tr>
  );
}

/* ─── Detail ───────────────────────────────────────────── */

export function ReplacementDetail({ id }: { id: string }) {
  const { go, openWO, openProject, openAmc, openCustomer, role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const r = db.replacement(id);
  if (!r) {
    return (
      <EmptyState icon="alertCircle" title="Replacement not found"
        action={<button className="btn btn-primary" onClick={() => go("replacements")}>Back to replacements</button>} />
    );
  }
  const cust = db.cust(r.customerId);
  const site = r.siteId ? db.site(r.siteId) : null;
  const wo = r.workOrderId ? db.wo(r.workOrderId) : null;

  // Modal state for the action flows. One modal slot, mode picks the action.
  const [modalMode, setModalMode] = useState<null | "approve" | "reject" | "install" | "confirm" | "sendback" | "cancel">(null);
  const closeModal = () => setModalMode(null);

  const isLead = role === "admin" || role === "md" || role === "manager" || role === "lead_worker";
  const isRequester = r.requestedBy === me.id;
  const isSelfRequest = isRequester && isLead;  // Lead Tech requested it themselves

  // Action visibility, per spec:
  //   - requested + lead+ + NOT self  → Approve / Reject
  //   - requested + requester         → Cancel (own request)
  //   - approved + requester          → Mark Installed
  //   - pending_confirmation + lead+  → Confirm / Send back
  //   - completed / rejected / cancelled → no actions
  const canApprove   = r.status === "requested" && isLead && !isSelfRequest;
  const canReject    = r.status === "requested" && isLead && !isSelfRequest;
  const canCancel    = r.status !== "completed" && r.status !== "cancelled"
                       && (isLead || (isRequester && r.status === "requested"));
  const canInstall   = r.status === "approved" && isRequester;
  const canConfirm   = r.status === "pending_confirmation" && isLead;
  const canSendBack  = r.status === "pending_confirmation" && isLead;

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => go("replacements")}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All replacements
        </a>
      </div>
      <PageHeader
        eyebrow={"Replacement · " + (r.code || "—")}
        title={r.itemName + " · " + r.quantity + "x"}
        sub={REPLACEMENT_CONTEXT_LABEL[r.context] + (cust ? " · " + cust.name : "")}
        right={
          <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className={"badge " + REPLACEMENT_STATUS_BADGE[r.status]} style={{ fontWeight: 600 }}>
              {REPLACEMENT_STATUS_LABEL[r.status]}
            </span>
            {canApprove && (
              <button className="btn btn-primary" onClick={() => setModalMode("approve")}>
                <Icon name="check" size={14} /> Approve
              </button>
            )}
            {canReject && (
              <button className="btn btn-ghost" onClick={() => setModalMode("reject")}>
                <Icon name="x" size={14} /> Reject
              </button>
            )}
            {canInstall && (
              <button className="btn btn-primary" onClick={() => setModalMode("install")}>
                <Icon name="check" size={14} /> Mark installed
              </button>
            )}
            {canConfirm && (
              <button className="btn btn-primary" onClick={() => setModalMode("confirm")}>
                <Icon name="check" size={14} /> Confirm
              </button>
            )}
            {canSendBack && (
              <button className="btn btn-ghost" onClick={() => setModalMode("sendback")}>
                <Icon name="refresh" size={14} /> Send back
              </button>
            )}
            {canCancel && (
              <button className="btn btn-ghost" onClick={() => setModalMode("cancel")}>
                <Icon name="x" size={14} /> Cancel
              </button>
            )}
            {isSelfRequest && r.status === "requested" && (
              <span className="badge badge-warning" title="Lead Techs cannot approve their own requests">
                Self-request · needs another Lead
              </span>
            )}
          </div>
        }
      />

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
        <section className="card card-pad">
          <CardHead title="Lifecycle" sub="Every stage with actor and timestamp" />
          <Timeline r={r} />
        </section>

        <section className="card card-pad">
          <CardHead title="Linked entities" sub="Where this replacement was raised" />
          <div className="col gap-3">
            <KvLink k="Work order" code={wo?.code ?? null} text={wo?.title ?? null}
              onClick={wo ? () => openWO(wo.id) : null} />
            {r.projectId && (() => {
              const p = db.proj(r.projectId);
              return <KvLink k="Project" code={p?.code ?? null} text={p?.name ?? null}
                onClick={p ? () => openProject(p.id) : null} />;
            })()}
            {r.amcContractId && (() => {
              const a = db.amc(r.amcContractId);
              return <KvLink k="AMC contract" code={a?.code ?? null} text={null}
                onClick={a ? () => openAmc(a.id) : null} />;
            })()}
            {r.repairTicketId && (() => {
              const rep = db.REPAIRS[r.repairTicketId];
              return <KvLink k="Repair ticket" code={rep?.code ?? null} text={rep?.title ?? null}
                onClick={null} />;
            })()}
            <KvLink k="Customer" code={null} text={cust?.name ?? "—"}
              onClick={cust ? () => openCustomer(cust.id) : null} />
            <KvLink k="Site" code={null} text={site?.name ?? "—"} onClick={null} />
            <KvLink k="Context" code={null} text={REPLACEMENT_CONTEXT_LABEL[r.context]} onClick={null} />
          </div>
        </section>
      </div>

      {modalMode && (
        <ActionModal
          mode={modalMode}
          rr={r}
          meId={me.id}
          onClose={closeModal}
          onDone={() => { closeModal(); bumpData(); }}
          fireToast={fireToast}
        />
      )}
    </div>
  );
}

function KvLink({ k, code, text, onClick }: { k: string; code: string | null; text: string | null; onClick: (() => void) | null }) {
  return (
    <div className="row between" style={{ gap: 10 }}>
      <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{k}</span>
      <span style={{ font: "var(--t-body-md)", textAlign: "right" }}>
        {onClick ? (
          <a onClick={onClick}
            style={{ cursor: "pointer", color: "var(--pri-700)" }}>
            {[code, text].filter(Boolean).join(" · ") || "—"}
          </a>
        ) : (
          [code, text].filter(Boolean).join(" · ") || "—"
        )}
      </span>
    </div>
  );
}

function Timeline({ r }: { r: ReplacementRequest }) {
  // Build the rows that have actually happened — undefined stages are skipped.
  const rows: { label: string; who: string | null; at: string | null; note: string | null; icon: "plus" | "check" | "x" | "refresh" }[] = [];
  rows.push({
    label: "Requested",
    who: r.requestedBy ? db.user(r.requestedBy).name : "—",
    at: r.requestedAt, note: r.reason, icon: "plus",
  });
  if (r.approvedAt) rows.push({
    label: "Approved",
    who: r.approvedBy ? db.user(r.approvedBy).name : "—",
    at: r.approvedAt, note: r.approvalNote, icon: "check",
  });
  if (r.installedAt) rows.push({
    label: "Marked installed",
    who: r.installedBy ? db.user(r.installedBy).name : "—",
    at: r.installedAt, note: r.installationNote, icon: "check",
  });
  if (r.confirmedAt) rows.push({
    label: "Confirmed (completed)",
    who: r.confirmedBy ? db.user(r.confirmedBy).name : "—",
    at: r.confirmedAt, note: r.confirmationNote, icon: "check",
  });
  if (r.rejectedAt) rows.push({
    label: "Rejected",
    who: r.rejectedBy ? db.user(r.rejectedBy).name : "—",
    at: r.rejectedAt, note: r.rejectionReason, icon: "x",
  });
  if (r.status === "cancelled" && !r.rejectedAt) rows.push({
    label: "Cancelled",
    who: "—",
    at: r.updatedAt, note: r.rejectionReason, icon: "x",
  });

  return (
    <div className="col" style={{ gap: 10 }}>
      {rows.map((row, i) => (
        <div key={i} className="row gap-3" style={{
          padding: 12, background: "var(--bg-muted)",
          borderRadius: "var(--r-md)", border: "1px solid var(--border)",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: row.icon === "x" ? "var(--dan-100)" : "var(--suc-100)",
            color: row.icon === "x" ? "var(--dan-700)" : "var(--suc-700)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Icon name={row.icon} size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "var(--t-body-md)" }}>
              <strong>{row.label}</strong>
              <span style={{ color: "var(--ink-mute)" }}> · by {row.who ?? "—"}</span>
            </div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>
              {row.at ? formatFull(row.at) : "—"}
            </div>
            {row.note && (
              <div style={{ font: "var(--t-small)", color: "var(--ink-soft)", marginTop: 6 }}>
                "{row.note}"
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type ActionMode = "approve" | "reject" | "install" | "confirm" | "sendback" | "cancel";

function ActionModal({ mode, rr, meId, onClose, onDone, fireToast }: {
  mode: ActionMode;
  rr: ReplacementRequest;
  meId: string;
  onClose: () => void;
  onDone: () => void;
  fireToast: (msg: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const config: Record<ActionMode, { title: string; sub: string; cta: string; noteRequired: boolean; placeholder: string }> = {
    approve:  { title: "Approve replacement",        sub: "Worker can install once approved.", cta: "Approve",      noteRequired: false, placeholder: "Optional note for the requester" },
    reject:   { title: "Reject replacement",         sub: "Worker will see this reason.",      cta: "Reject",       noteRequired: true,  placeholder: "Why are you rejecting? (required)" },
    install:  { title: "Mark replacement installed", sub: "Lead Tech will confirm next.",      cta: "Mark installed", noteRequired: false, placeholder: "Optional installation note" },
    confirm:  { title: "Confirm replacement",        sub: "Completes the lifecycle.",          cta: "Confirm",      noteRequired: false, placeholder: "Optional confirmation note" },
    sendback: { title: "Send back to worker",        sub: "Worker will need to redo it.",      cta: "Send back",    noteRequired: true,  placeholder: "Why is this being sent back? (required)" },
    cancel:   { title: "Cancel replacement",         sub: "This cannot be undone.",            cta: "Cancel request", noteRequired: true,  placeholder: "Why are you cancelling? (required)" },
  };
  const c = config[mode];

  const submit = async () => {
    setErr(null);
    const trimmed = text.trim();
    if (c.noteRequired && !trimmed) { setErr("This action requires a note."); return; }
    setBusy(true);
    const res = await (async () => {
      switch (mode) {
        case "approve":  return approveReplacement(rr.id, trimmed || null, meId);
        case "reject":   return rejectReplacement(rr.id, trimmed, meId);
        case "install":  return markReplacementInstalled(rr.id, trimmed || null, meId);
        case "confirm":  return confirmReplacement(rr.id, trimmed || null, meId);
        case "sendback": return sendBackReplacement(rr.id, trimmed);
        case "cancel":   return cancelReplacement(rr.id, trimmed, rr.status);
      }
    })();
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${rr.code} · ${REPLACEMENT_STATUS_LABEL[res.rr.status]}`);
    onDone();
  };

  return (
    <Modal open onClose={onClose}>
      <div style={{ padding: 20 }}>
        <div className="row gap-2" style={{ marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: "var(--pri-100)", color: "var(--pri-700)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name="package" size={16} />
          </div>
          <div>
            <div style={{ font: "var(--t-h3)" }}>{c.title}</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{c.sub}</div>
          </div>
        </div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", margin: "10px 0 4px" }}>
          <span className="numeric" style={{ fontFamily: "var(--font-mono)" }}>{rr.code}</span>
          {" · "}{rr.itemName} ({rr.quantity}x)
        </div>
        <textarea className="textarea" rows={3}
          value={text} onChange={e => setText(e.target.value)}
          placeholder={c.placeholder}
          style={{ marginTop: 10 }} />
        {err && (
          <div className="form-error" style={{ marginTop: 8 }}>
            <Icon name="alertCircle" size={14} /> {err}
          </div>
        )}
        <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy
              ? <><Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
              : <><Icon name="check" size={14} /> {c.cta}</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── helpers ──────────────────────────────────────────── */
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7)  return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
