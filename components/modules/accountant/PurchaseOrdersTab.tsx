"use client";
// ============================================================
// Accountant · Purchase Orders tab (Phase 2, migration 0048).
//
// Master/detail. List → create draft → add line items → submit →
// approve → issue → receive goods (full/partial) → close. Totals and
// received-status are DB-maintained; this UI drives the workflow and
// refetches detail after each change.
//
// The required approval TIER (1-4) is computed from the configurable
// settings thresholds and shown for transparency, but approval is a
// single APPROVE_POS action (multi-signatory enforcement deferred).
//
// Edit rights: MANAGE_POS (create/edit/issue/receive/close/cancel),
// APPROVE_POS (approve). Read for everyone with VIEW_ACCOUNTING.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { CardHead, EmptyState, FilterBar, Modal } from "../../shared";
import {
  fetchPurchaseOrders, fetchPurchaseOrderDetail, createPurchaseOrder, updatePODraft,
  addPOLine, deletePOLine, submitPOForApproval, approvePO, rejectPO, revisePO, issuePO, closePO, cancelPO,
  requiredApprovalTier, outstandingQtyOf,
  type PurchaseOrder, type PODetail, type POStatus,
} from "@/lib/accounting/purchaseOrders";
import { fetchAccountingSettings, SETTINGS_FALLBACK } from "@/lib/accounting/settings";
import { fetchVendors, type Vendor } from "@/lib/accounting/vendors";
import { poStatusBadge, RecordReceiptDialog } from "./poBits";
import { RejectDialog } from "./invoiceBits";   // shared reject dialog
import { ApprovalInbox, type ApprovalInboxItem } from "./ApprovalInbox";

type StatusFilter = "all" | POStatus;

export function PurchaseOrdersTab({ canManage, canApprove }: { canManage: boolean; canApprove: boolean }) {
  const { fmtMoney } = useApp();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    const [p, v] = await Promise.all([fetchPurchaseOrders(), fetchVendors()]);
    setLoading(false);
    if (!p.ok) { setErr(p.error); return; }
    setPos(p.data);
    if (v.ok) setVendors(v.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const vendorName = (id: string): string => vendors.find(v => v.id === id)?.name ?? "—";

  const filtered = useMemo(
    () => (filter === "all" ? pos : pos.filter(p => p.status === filter)),
    [pos, filter],
  );

  // POs awaiting this approver's action (only used when canApprove).
  const pendingApproval = useMemo<ApprovalInboxItem[]>(
    () => pos.filter(p => p.status === "pending_approval").map(p => ({
      id: p.id, code: p.poNumber, party: vendorName(p.vendorId),
      amount: p.total, waitingSince: p.updatedAt,
    })),
    // vendorName closes over `vendors`; recompute when either changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pos, vendors],
  );

  if (selectedId) {
    return (
      <PODetailView id={selectedId} canManage={canManage} canApprove={canApprove} vendorName={vendorName}
        onBack={() => setSelectedId(null)} onChanged={() => { void load(); }} />
    );
  }

  const tabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: pos.length },
    { value: "draft", label: "Draft" },
    { value: "pending_approval", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "issued", label: "Issued" },
    { value: "partially_received", label: "Partial" },
    { value: "received", label: "Received" },
    { value: "closed", label: "Closed" },
    { value: "rejected", label: "Rejected" },
    { value: "cancelled", label: "Cancelled" },
  ];

  // Active vendors are the valid targets for a new PO.
  const activeVendors = vendors.filter(v => v.status === "active");

  return (
    <>
      {canApprove && (
        <ApprovalInbox title="Awaiting your approval" items={pendingApproval}
          storageKey="acct.approvalInbox.pos" onOpen={(id) => setSelectedId(id)} />
      )}

      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FilterBar<StatusFilter> value={filter} onChange={setFilter} options={tabs} />
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm" disabled={activeVendors.length === 0} onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={14} /> New PO
          </button>
        )}
      </div>

      {canManage && activeVendors.length === 0 && !loading && (
        <div className="alert-banner tone-info" style={{ marginBottom: 12 }}>
          <div className="ic"><Icon name="building" size={16} /></div>
          <div className="text"><div className="h">No active vendors</div>
            <div className="d">Add a vendor in the Vendors tab before raising a purchase order.</div></div>
        </div>
      )}

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading purchase orders…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="package" title={pos.length === 0 ? "No purchase orders yet" : "Nothing in this view"}
          sub={canManage && pos.length === 0 ? "Raise the first purchase order." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>PO</th><th>Vendor</th><th className="hide-mobile">Project</th>
                <th className="hide-mobile">Order date</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {filtered.map(po => {
                  const badge = poStatusBadge(po);
                  const proj = po.projectId ? db.proj(po.projectId) : null;
                  return (
                    <tr key={po.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(po.id)}>
                      <td data-th="PO" style={{ fontWeight: 600, font: "var(--t-small)" }}>{po.poNumber}</td>
                      <td data-th="Vendor" style={{ font: "var(--t-small)" }}>{vendorName(po.vendorId)}</td>
                      <td data-th="Project" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{proj?.code ?? "—"}</td>
                      <td data-th="Order date" className="hide-mobile" style={{ font: "var(--t-small)" }}>{po.orderDate}</td>
                      <td data-th="Total" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(po.total)}</td>
                      <td data-th="Status"><span className={"badge " + badge.cls}>{badge.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <CreatePODialog vendors={activeVendors} onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); void load(); setSelectedId(id); }} />
      )}
    </>
  );
}

/* ─── Create dialog ──────────────────────────────────────── */
function CreatePODialog({ vendors, onClose, onCreated }: {
  vendors: Vendor[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { me, fireToast } = useApp();
  const [vendorId, setVendorId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const projects = useMemo(() => Object.values(db.PROJECTS), []);

  const submit = async () => {
    setErr(null);
    if (!vendorId) { setErr("Pick a vendor."); return; }
    setBusy(true);
    const res = await createPurchaseOrder({
      vendorId, projectId: projectId || null,
      orderDate, expectedDate: expectedDate || undefined, description: description || undefined,
    }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`Purchase order ${res.data.poNumber} created`);
    onCreated(res.data.id);
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>New purchase order</div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Vendor<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
            <option value="">— Select —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorCode} · {v.name}</option>)}
          </select>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Project (optional)</label>
          <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">— None —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Order date</label>
            <input className="input" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Expected date (optional)</label>
            <input className="input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Description (optional)</label>
          <textarea className="textarea" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !vendorId}>
            <Icon name="plus" size={14} /> Create draft
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Detail / editor ────────────────────────────────────── */
function PODetailView({ id, canManage, canApprove, vendorName, onBack, onChanged }: {
  id: string; canManage: boolean; canApprove: boolean;
  vendorName: (id: string) => string; onBack: () => void; onChanged: () => void;
}) {
  const { fmtMoney, me } = useApp();
  const [detail, setDetail] = useState<PODetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [defaultTax, setDefaultTax] = useState(0);
  const [thresholds, setThresholds] = useState({
    t1: SETTINGS_FALLBACK.poApprovalThreshold1,
    t2: SETTINGS_FALLBACK.poApprovalThreshold2,
    t3: SETTINGS_FALLBACK.poApprovalThreshold3,
  });
  const [adding, setAdding] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    const [d, s] = await Promise.all([fetchPurchaseOrderDetail(id), fetchAccountingSettings()]);
    setLoading(false);
    if (!d.ok) { setErr(d.error); return; }
    setDetail(d.data);
    if (s.ok) {
      setDefaultTax(s.data.defaultTaxRatePct);
      setThresholds({ t1: s.data.poApprovalThreshold1, t2: s.data.poApprovalThreshold2, t3: s.data.poApprovalThreshold3 });
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr(null); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Something went wrong"); return false; }
    await load(); onChanged();
    return true;
  };

  if (loading) return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading purchase order…</div>;
  if (!detail) return <EmptyState icon="alertCircle" title="Couldn't load purchase order" sub={err ?? undefined} />;

  const { po, lines, receipts, history } = detail;
  const badge = poStatusBadge(po);
  const proj = po.projectId ? db.proj(po.projectId) : null;
  const isDraft = po.status === "draft";
  const editable = canManage && isDraft;
  const tier = requiredApprovalTier(po.total, thresholds);

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
        <Icon name="chevronLeft" size={14} /> All purchase orders
      </button>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {/* Header */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ font: "var(--t-h3)", fontWeight: 700 }}>{po.poNumber}</span>
              <span className={"badge " + badge.cls}>{badge.label}</span>
            </div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
              {vendorName(po.vendorId)}{proj ? ` · ${proj.code} ${proj.name}` : ""}
            </div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>
              Ordered {po.orderDate}{po.expectedDate ? ` · expected ${po.expectedDate}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</div>
            <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700 }}>{fmtMoney(po.total)}</div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              Requires <strong>Tier {tier.tier}</strong> approval
            </div>
          </div>
        </div>

        {/* Rejection notice */}
        {po.rejectionReason && (po.status === "rejected" || po.status === "draft") && (
          <div className="alert-banner tone-danger" style={{ marginTop: 14 }}>
            <div className="ic"><Icon name="alertTriangle" size={16} /></div>
            <div className="text">
              <div className="h">{po.status === "rejected" ? "Rejected by approver" : "Returned — revise & resubmit"}</div>
              <div className="d">{po.rejectionReason}</div>
            </div>
          </div>
        )}

        {/* Approval tier hint */}
        {(po.status === "draft" || po.status === "pending_approval") && (
          <div className="alert-banner tone-info" style={{ marginTop: 14 }}>
            <div className="ic"><Icon name="shieldCheck" size={16} /></div>
            <div className="text"><div className="h">Approval policy · Tier {tier.tier} ({tier.label} AED)</div>
              <div className="d">Policy expects: {tier.approvers}. A single approval advances the PO for now (multi-signatory deferred).</div></div>
          </div>
        )}

        {/* Actions */}
        <div className="row gap-2" style={{ marginTop: 16, flexWrap: "wrap" }}>
          {editable && (
            <button className="btn btn-primary" disabled={busy || po.total <= 0}
              onClick={() => run(() => submitPOForApproval(po.id, me.id))}>
              <Icon name="arrowRight" size={14} /> Submit for approval
            </button>
          )}
          {po.status === "pending_approval" && canApprove && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => approvePO(po.id, me.id))}>
              <Icon name="check" size={14} /> Approve
            </button>
          )}
          {po.status === "pending_approval" && canApprove && (
            <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => setShowReject(true)}>
              <Icon name="x" size={14} /> Reject
            </button>
          )}
          {po.status === "rejected" && canManage && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => revisePO(po.id, me.id))}>
              <Icon name="pen" size={14} /> Revise
            </button>
          )}
          {po.status === "approved" && canManage && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => issuePO(po.id, me.id))}>
              <Icon name="mail" size={14} /> Issue to vendor
            </button>
          )}
          {(po.status === "issued" || po.status === "partially_received") && canManage && (
            <button className="btn btn-primary" disabled={busy} onClick={() => setShowReceive(true)}>
              <Icon name="package" size={14} /> Receive goods
            </button>
          )}
          {(po.status === "issued" || po.status === "partially_received" || po.status === "received") && canManage && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => closePO(po.id, me.id))}>
              <Icon name="check" size={14} /> Close
            </button>
          )}
          {canManage && (po.status === "draft" || po.status === "pending_approval" || po.status === "approved" || po.status === "rejected") && (
            <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => run(() => cancelPO(po.id, me.id))}>
              <Icon name="x" size={14} /> Cancel
            </button>
          )}
        </div>
      </section>

      {/* Draft: edit details */}
      {editable && <DraftDetailsEditor po={po} busy={busy} onSave={(patch) => run(() => updatePODraft(po.id, patch, me.id))} />}

      {/* Line items */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title={`Line items · ${lines.length}`}
          sub={editable ? "Quantity × rate (+ tax) — totals recompute automatically" : undefined}
          right={editable ? (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setAdding(a => !a)}>
              <Icon name="plus" size={13} /> Add line
            </button>
          ) : undefined} />

        {editable && adding && (
          <AddLineForm busy={busy} defaultTax={defaultTax}
            onCancel={() => setAdding(false)}
            onSave={async (input) => { const ok = await run(() => addPOLine(po.id, input)); if (ok) setAdding(false); }} />
        )}

        {lines.length === 0 ? (
          <EmptyState icon="package" title="No line items"
            sub={editable ? "Add the first line to build the PO." : undefined} />
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }} className="hide-mobile">Received</th>
                  <th style={{ textAlign: "right" }}>Rate</th>
                  <th style={{ textAlign: "right" }} className="hide-mobile">Tax %</th>
                  <th style={{ textAlign: "right" }}>Line total</th>
                  {editable && <th style={{ width: 44 }}></th>}
                </tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td data-th="Description" style={{ font: "var(--t-small)" }}>{l.description}</td>
                      <td data-th="Qty" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{l.quantity}</td>
                      <td data-th="Received" className="numeric hide-mobile" style={{ textAlign: "right", font: "var(--t-small)",
                        color: l.quantityReceived >= l.quantity && l.quantity > 0 ? "var(--suc-700)" : "var(--ink-mute)" }}>
                        {l.quantityReceived}
                      </td>
                      <td data-th="Rate" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.rate)}</td>
                      <td data-th="Tax %" className="numeric hide-mobile" style={{ textAlign: "right", font: "var(--t-small)" }}>{l.taxPct}%</td>
                      <td data-th="Line total" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.lineTotal)}</td>
                      {editable && (
                        <td data-th="">
                          <button className="btn btn-ghost btn-sm" disabled={busy} aria-label="Remove"
                            onClick={() => run(() => deletePOLine(l.id))}>
                            <Icon name="trash" size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Totals strip */}
        <div className="col gap-1" style={{ marginTop: 12, alignItems: "flex-end", font: "var(--t-small)" }}>
          <div>Subtotal: <strong className="numeric">{fmtMoney(po.subtotal)}</strong></div>
          <div>Tax: <strong className="numeric">{fmtMoney(po.taxAmount)}</strong></div>
          <div style={{ font: "var(--t-body-md)" }}>Total: <strong className="numeric">{fmtMoney(po.total)}</strong></div>
        </div>
      </section>

      {/* Receipts */}
      {receipts.length > 0 && (
        <section className="card card-pad" style={{ marginBottom: 16 }}>
          <CardHead title={`Receipts · ${receipts.length}`} sub="Goods received against this PO" />
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr>
                  <th>Date</th><th>Line</th><th className="hide-mobile">Reference</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                </tr></thead>
                <tbody>
                  {receipts.map(r => {
                    const line = lines.find(l => l.id === r.poLineId);
                    return (
                      <tr key={r.id}>
                        <td data-th="Date" style={{ font: "var(--t-small)" }}>{r.receivedAt}</td>
                        <td data-th="Line" style={{ font: "var(--t-small)" }}>{line?.description ?? "—"}</td>
                        <td data-th="Reference" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{r.reference ?? "—"}</td>
                        <td data-th="Qty" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{r.quantity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Audit history (visible only to audit roles — RLS returns [] otherwise) */}
      {history.length > 0 && (
        <section className="card card-pad">
          <CardHead title="Audit history" sub="Immutable record of every status change" />
          <div className="col gap-2" style={{ marginTop: 4 }}>
            {history.map(h => (
              <div key={h.id} className="row" style={{ alignItems: "center", gap: 10, padding: "8px 10px",
                border: "1px solid var(--border)", borderRadius: "var(--r-md)", flexWrap: "wrap" }}>
                <Icon name="clock" size={13} />
                <span style={{ font: "var(--t-small)", fontWeight: 600 }}>{h.detail ?? h.action}</span>
                <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginLeft: "auto" }}>{h.changedAt.slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {showReceive && (
        <RecordReceiptDialog po={po} lines={lines} onClose={() => setShowReceive(false)}
          onRecorded={() => { void load(); onChanged(); }} />
      )}

      {showReject && (
        <RejectDialog title="Reject purchase order" subtitle={`${po.poNumber} → back to the accountant`}
          onClose={() => setShowReject(false)}
          onConfirm={(reason) => rejectPO(po.id, me.id, reason)}
          onDone={() => { void load(); onChanged(); }} />
      )}
    </>
  );
}

/* ─── Draft header editor ────────────────────────────────── */
function DraftDetailsEditor({ po, busy, onSave }: {
  po: PurchaseOrder; busy: boolean;
  onSave: (patch: { orderDate?: string; expectedDate?: string | null; description?: string; notes?: string }) => void;
}) {
  const [orderDate, setOrderDate] = useState(po.orderDate);
  const [expectedDate, setExpectedDate] = useState(po.expectedDate ?? "");
  const [description, setDescription] = useState(po.description ?? "");
  const [notes, setNotes] = useState(po.notes ?? "");
  const dirty = orderDate !== po.orderDate || (expectedDate || "") !== (po.expectedDate ?? "")
    || description !== (po.description ?? "") || notes !== (po.notes ?? "");

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <CardHead title="Details" sub="Editable while the PO is a draft" />
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Order date</label>
          <input className="input" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Expected date</label>
          <input className="input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
        </div>
      </div>
      <div className="col" style={{ gap: 4, marginTop: 12 }}>
        <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Description</label>
        <textarea className="textarea" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="col" style={{ gap: 4, marginTop: 12 }}>
        <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Notes</label>
        <textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      {dirty && (
        <div className="row gap-2" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" disabled={busy}
            onClick={() => onSave({ orderDate, expectedDate: expectedDate || null, description, notes })}>
            <Icon name="check" size={13} /> Save details
          </button>
        </div>
      )}
    </section>
  );
}

/* ─── Add-line form ──────────────────────────────────────── */
function AddLineForm({ busy, defaultTax, onSave, onCancel }: {
  busy: boolean; defaultTax: number;
  onSave: (input: { description: string; quantity: number; rate: number; taxPct: number }) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [rate, setRate] = useState("0");
  const [taxPct, setTaxPct] = useState(String(defaultTax));

  return (
    <div className="card" style={{ padding: 14, margin: "12px 0", background: "var(--bg-muted)" }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Description *</label>
          <input className="input input-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 4-core armoured cable" />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Quantity</label>
          <input className="input input-sm numeric" type="number" min={0} step="any" value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Rate</label>
          <input className="input input-sm numeric" type="number" min={0} step="any" value={rate} onChange={e => setRate(e.target.value)} />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Tax %</label>
          <input className="input input-sm numeric" type="number" min={0} step="any" value={taxPct} onChange={e => setTaxPct(e.target.value)} />
        </div>
      </div>
      <div className="row gap-2" style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !description.trim()}
          onClick={() => onSave({ description, quantity: Number(quantity) || 0, rate: Number(rate) || 0, taxPct: Number(taxPct) || 0 })}>
          Add line
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
