"use client";
// ============================================================
// Accountant · Invoices tab (Phase 1, migration 0046).
//
// Master/detail. List → create draft → add line items → submit →
// approve → send → record payments → void. Totals are DB-maintained;
// this UI just drives the status workflow and refetches detail after
// each change (DB is the source of truth for money).
//
// Edit rights: MANAGE_INVOICES (create/edit/send/pay/void),
// APPROVE_INVOICES (approve). Read for everyone with VIEW_ACCOUNTING.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { CardHead, EmptyState, FilterBar, Modal } from "../../shared";
import {
  fetchInvoices, fetchInvoiceDetail, createInvoice, updateInvoiceDraft,
  addInvoiceLine, deleteInvoiceLine, submitInvoiceForApproval, approveInvoice,
  sendInvoice, rejectInvoice, reviseInvoice, voidInvoice, outstandingOf,
  type Invoice, type InvoiceDetail, type InvoiceStatus,
} from "@/lib/accounting/invoices";
import { fetchAccountingSettings } from "@/lib/accounting/settings";
import { invoiceStatusBadge, RecordPaymentDialog, RejectDialog } from "./invoiceBits";

type StatusFilter = "all" | InvoiceStatus;

export function InvoicesTab({ canManage, canApprove }: { canManage: boolean; canApprove: boolean }) {
  const { fmtMoney } = useApp();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    const res = await fetchInvoices();
    setLoading(false);
    if (!res.ok) { setErr(res.error); return; }
    setInvoices(res.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(
    () => (filter === "all" ? invoices : invoices.filter(i => i.status === filter)),
    [invoices, filter],
  );

  if (selectedId) {
    return (
      <InvoiceDetail id={selectedId} canManage={canManage} canApprove={canApprove}
        onBack={() => setSelectedId(null)}
        onChanged={() => { void load(); }} />
    );
  }

  const tabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: invoices.length },
    { value: "draft", label: "Draft" },
    { value: "pending_approval", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "sent", label: "Sent" },
    { value: "partially_paid", label: "Partial" },
    { value: "paid", label: "Paid" },
    { value: "rejected", label: "Rejected" },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FilterBar<StatusFilter> value={filter} onChange={setFilter} options={tabs} />
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={14} /> New invoice
          </button>
        )}
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading invoices…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="receipt" title={invoices.length === 0 ? "No invoices yet" : "Nothing in this view"}
          sub={canManage && invoices.length === 0 ? "Create the first project invoice." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Invoice</th><th>Customer</th><th className="hide-mobile">Project</th>
                <th className="hide-mobile">Due</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Outstanding</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {filtered.map(inv => {
                  const badge = invoiceStatusBadge(inv);
                  const cust = db.cust(inv.customerId);
                  const proj = inv.projectId ? db.proj(inv.projectId) : null;
                  return (
                    <tr key={inv.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(inv.id)}>
                      <td data-th="Invoice" style={{ fontWeight: 600, font: "var(--t-small)" }}>{inv.invoiceNumber}</td>
                      <td data-th="Customer" style={{ font: "var(--t-small)" }}>{cust?.name ?? "—"}</td>
                      <td data-th="Project" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{proj?.code ?? "—"}</td>
                      <td data-th="Due" className="hide-mobile" style={{ font: "var(--t-small)" }}>{inv.dueDate ?? "—"}</td>
                      <td data-th="Total" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(inv.total)}</td>
                      <td data-th="Outstanding" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(outstandingOf(inv))}</td>
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
        <CreateInvoiceDialog onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); void load(); setSelectedId(id); }} />
      )}
    </>
  );
}

/* ─── Create dialog ──────────────────────────────────────── */
function CreateInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { me, fireToast } = useApp();
  const customers = useMemo(() => Object.values(db.CUSTOMERS), []);
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const projects = useMemo(
    () => Object.values(db.PROJECTS).filter(p => p.customer === customerId),
    [customerId],
  );

  const submit = async () => {
    setErr(null);
    if (!customerId) { setErr("Pick a customer."); return; }
    setBusy(true);
    const res = await createInvoice({
      customerId, projectId: projectId || null,
      invoiceDate, dueDate: dueDate || undefined, description: description || undefined,
    }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`Invoice ${res.data.invoiceNumber} created`);
    onCreated(res.data.id);
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>New invoice</div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Customer<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <select className="input" value={customerId} onChange={e => { setCustomerId(e.target.value); setProjectId(""); }}>
            <option value="">— Select —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Project (optional)</label>
          <select className="input" value={projectId} disabled={!customerId} onChange={e => setProjectId(e.target.value)}>
            <option value="">— None —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Invoice date</label>
            <input className="input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Due date (optional)</label>
            <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>Blank → uses the configured payment terms.</div>
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Description (optional)</label>
          <textarea className="textarea" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !customerId}>
            <Icon name="plus" size={14} /> Create draft
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Detail / editor ────────────────────────────────────── */
function InvoiceDetail({ id, canManage, canApprove, onBack, onChanged }: {
  id: string; canManage: boolean; canApprove: boolean; onBack: () => void; onChanged: () => void;
}) {
  const { fmtMoney, me, fireToast } = useApp();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [defaultTax, setDefaultTax] = useState(0);
  const [showPay, setShowPay] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    const [d, s] = await Promise.all([fetchInvoiceDetail(id), fetchAccountingSettings()]);
    setLoading(false);
    if (!d.ok) { setErr(d.error); return; }
    setDetail(d.data);
    if (s.ok) setDefaultTax(s.data.defaultTaxRatePct);
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

  if (loading) return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading invoice…</div>;
  if (!detail) return <EmptyState icon="alertCircle" title="Couldn't load invoice" sub={err ?? undefined} />;

  const { invoice: inv, lines, payments } = detail;
  const badge = invoiceStatusBadge(inv);
  const cust = db.cust(inv.customerId);
  const proj = inv.projectId ? db.proj(inv.projectId) : null;
  const isDraft = inv.status === "draft";
  const outstanding = outstandingOf(inv);
  const editable = canManage && isDraft;

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
        <Icon name="chevronLeft" size={14} /> All invoices
      </button>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {/* Header */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ font: "var(--t-h3)", fontWeight: 700 }}>{inv.invoiceNumber}</span>
              <span className={"badge " + badge.cls}>{badge.label}</span>
            </div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
              {cust?.name ?? "—"}{proj ? ` · ${proj.code} ${proj.name}` : ""}
            </div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>
              Issued {inv.invoiceDate}{inv.dueDate ? ` · due ${inv.dueDate}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</div>
            <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700 }}>{fmtMoney(inv.total)}</div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              paid {fmtMoney(inv.amountPaid)} · outstanding <strong>{fmtMoney(outstanding)}</strong>
            </div>
          </div>
        </div>

        {/* Rejection notice */}
        {inv.rejectionReason && (inv.status === "rejected" || inv.status === "draft") && (
          <div className="alert-banner tone-danger" style={{ marginTop: 14 }}>
            <div className="ic"><Icon name="alertTriangle" size={16} /></div>
            <div className="text">
              <div className="h">{inv.status === "rejected" ? "Rejected by approver" : "Returned — revise & resubmit"}</div>
              <div className="d">{inv.rejectionReason}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="row gap-2" style={{ marginTop: 16, flexWrap: "wrap" }}>
          {editable && (
            <button className="btn btn-primary" disabled={busy || inv.total <= 0}
              onClick={() => run(() => submitInvoiceForApproval(inv.id))}>
              <Icon name="arrowRight" size={14} /> Submit for approval
            </button>
          )}
          {inv.status === "pending_approval" && canApprove && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => approveInvoice(inv.id, me.id))}>
              <Icon name="check" size={14} /> Approve
            </button>
          )}
          {inv.status === "pending_approval" && canApprove && (
            <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => setShowReject(true)}>
              <Icon name="x" size={14} /> Reject
            </button>
          )}
          {inv.status === "rejected" && canManage && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => reviseInvoice(inv.id))}>
              <Icon name="pen" size={14} /> Revise
            </button>
          )}
          {inv.status === "approved" && canManage && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => sendInvoice(inv.id))}>
              <Icon name="mail" size={14} /> Send to customer
            </button>
          )}
          {(inv.status === "sent" || inv.status === "partially_paid") && canManage && (
            <button className="btn btn-primary" disabled={busy} onClick={() => setShowPay(true)}>
              <Icon name="banknote" size={14} /> Record payment
            </button>
          )}
          {/* PDF / email are planned for a later phase — surfaced honestly. */}
          {inv.status !== "draft" && (
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => fireToast("PDF download & email delivery are planned for a later phase.")}>
              <Icon name="fileText" size={14} /> PDF
            </button>
          )}
          {canManage && inv.status !== "paid" && inv.status !== "cancelled" && (
            <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => run(() => voidInvoice(inv.id))}>
              <Icon name="x" size={14} /> Void
            </button>
          )}
        </div>
      </section>

      {/* Draft: edit details */}
      {editable && <DraftDetailsEditor inv={inv} busy={busy} onSave={(patch) => run(() => updateInvoiceDraft(inv.id, patch))} />}

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
            onSave={async (input) => { const ok = await run(() => addInvoiceLine(inv.id, input)); if (ok) setAdding(false); }} />
        )}

        {lines.length === 0 ? (
          <EmptyState icon="receipt" title="No line items"
            sub={editable ? "Add the first line to build the invoice." : undefined} />
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
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
                      <td data-th="Rate" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.rate)}</td>
                      <td data-th="Tax %" className="numeric hide-mobile" style={{ textAlign: "right", font: "var(--t-small)" }}>{l.taxPct}%</td>
                      <td data-th="Line total" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.lineTotal)}</td>
                      {editable && (
                        <td data-th="">
                          <button className="btn btn-ghost btn-sm" disabled={busy} aria-label="Remove"
                            onClick={() => run(() => deleteInvoiceLine(l.id))}>
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
          <div>Subtotal: <strong className="numeric">{fmtMoney(inv.subtotal)}</strong></div>
          <div>Tax: <strong className="numeric">{fmtMoney(inv.taxAmount)}</strong></div>
          <div style={{ font: "var(--t-body-md)" }}>Total: <strong className="numeric">{fmtMoney(inv.total)}</strong></div>
        </div>
      </section>

      {/* Payments */}
      {payments.length > 0 && (
        <section className="card card-pad">
          <CardHead title={`Payments · ${payments.length}`} sub="Receipts recorded against this invoice" />
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr>
                  <th>Date</th><th>Method</th><th className="hide-mobile">Reference</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td data-th="Date" style={{ font: "var(--t-small)" }}>{p.receivedAt}</td>
                      <td data-th="Method" style={{ font: "var(--t-small)" }}>{p.method ?? "—"}</td>
                      <td data-th="Reference" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{p.reference ?? "—"}</td>
                      <td data-th="Amount" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {showPay && (
        <RecordPaymentDialog invoice={inv} onClose={() => setShowPay(false)}
          onRecorded={() => { void load(); onChanged(); }} />
      )}

      {showReject && (
        <RejectDialog title="Reject invoice" subtitle={`${inv.invoiceNumber} → back to the accountant`}
          onClose={() => setShowReject(false)}
          onConfirm={(reason) => rejectInvoice(inv.id, me.id, reason)}
          onDone={() => { void load(); onChanged(); }} />
      )}
    </>
  );
}

/* ─── Draft header editor ────────────────────────────────── */
function DraftDetailsEditor({ inv, busy, onSave }: {
  inv: Invoice; busy: boolean;
  onSave: (patch: { invoiceDate?: string; dueDate?: string | null; description?: string; notes?: string }) => void;
}) {
  const [invoiceDate, setInvoiceDate] = useState(inv.invoiceDate);
  const [dueDate, setDueDate] = useState(inv.dueDate ?? "");
  const [description, setDescription] = useState(inv.description ?? "");
  const [notes, setNotes] = useState(inv.notes ?? "");
  const dirty = invoiceDate !== inv.invoiceDate || (dueDate || "") !== (inv.dueDate ?? "")
    || description !== (inv.description ?? "") || notes !== (inv.notes ?? "");

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <CardHead title="Details" sub="Editable while the invoice is a draft" />
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Invoice date</label>
          <input className="input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Due date</label>
          <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
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
            onClick={() => onSave({ invoiceDate, dueDate: dueDate || null, description, notes })}>
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
          <input className="input input-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Dahua 2MP IP Camera" />
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
