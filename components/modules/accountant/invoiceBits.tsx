"use client";
// ============================================================
// Accountant · Invoice shared UI bits.
//
// Small pieces reused by the Invoices and Receivables tabs:
//   • invoiceStatusBadge — status pill, with DERIVED "overdue" display
//     (the stored status is never 'overdue'; we compute it for sent /
//     partially-paid invoices past their due date — see migration 0046).
//   • RecordPaymentDialog — modal to record a payment against an invoice,
//     with the method list pulled from configurable Settings (0045).
// ============================================================

import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { Modal } from "../../shared";
import { fetchPaymentMethods, type AccountingLookup } from "@/lib/accounting/settings";
import { recordInvoicePayment, outstandingOf, type Invoice } from "@/lib/accounting/invoices";

const todayMs = () => new Date(new Date().toISOString().slice(0, 10)).getTime();

export function isInvoiceOverdue(inv: Invoice): boolean {
  if (inv.status !== "sent" && inv.status !== "partially_paid") return false;
  if (!inv.dueDate) return false;
  return new Date(inv.dueDate).getTime() < todayMs();
}

export function invoiceStatusBadge(inv: Invoice): { label: string; cls: string } {
  if (isInvoiceOverdue(inv)) {
    return { label: inv.status === "partially_paid" ? "Overdue · partial" : "Overdue", cls: "badge-danger" };
  }
  switch (inv.status) {
    case "draft":            return { label: "Draft", cls: "badge-outline" };
    case "pending_approval": return { label: "Pending approval", cls: "badge-warning" };
    case "approved":         return { label: "Approved", cls: "badge-info" };
    case "sent":             return { label: "Sent", cls: "badge-primary" };
    case "partially_paid":   return { label: "Partially paid", cls: "badge-warning" };
    case "paid":             return { label: "Paid", cls: "badge-success" };
    case "overdue":          return { label: "Overdue", cls: "badge-danger" };
    case "rejected":         return { label: "Rejected", cls: "badge-danger" };
    case "cancelled":        return { label: "Cancelled", cls: "badge-outline" };
    default:                 return { label: inv.status, cls: "badge-outline" };
  }
}

export function RecordPaymentDialog({ invoice, onClose, onRecorded }: {
  invoice: Invoice;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { me, fireToast, fmtMoney } = useApp();
  const outstanding = outstandingOf(invoice);
  const [methods, setMethods] = useState<AccountingLookup[]>([]);
  const [amount, setAmount] = useState(String(outstanding || ""));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchPaymentMethods();
      if (res.ok) {
        const active = res.data.filter(m => m.isActive);
        setMethods(active);
        if (active.length) setMethod(active[0].code);
      }
    })();
  }, []);

  const submit = async () => {
    setErr(null);
    const amt = Number(amount);
    if (!(amt > 0)) { setErr("Enter an amount greater than zero."); return; }
    setBusy(true);
    const res = await recordInvoicePayment(invoice.id, {
      amount: amt, receivedAt: date, method: method || undefined,
      reference: reference || undefined, notes: notes || undefined,
    }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Payment recorded");
    onRecorded();
    onClose();
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Record payment</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {invoice.invoiceNumber} · outstanding <strong>{fmtMoney(outstanding)}</strong>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Amount</label>
            <input className="input numeric" type="number" min={0} step="any" value={amount}
              onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Date received</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Method</label>
            <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
              {methods.length === 0 && <option value="">—</option>}
              {methods.map(m => <option key={m.id} value={m.code}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Reference (optional)</label>
          <input className="input" value={reference} onChange={e => setReference(e.target.value)}
            placeholder="Cheque no. / transaction id" />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Notes (optional)</label>
          <textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} /> Record payment
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Shared reject dialog ────────────────────────────────────
// Domain-agnostic: captures a required reason and calls onConfirm, which
// returns the data layer's AcctResult-shaped value. Reused by the Invoices
// and Purchase Orders tabs (an approver sending a submitted doc back).
export function RejectDialog({ title, subtitle, onClose, onConfirm, onDone }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) { setErr("Please enter a reason for the rejection."); return; }
    setBusy(true); setErr(null);
    const res = await onConfirm(reason.trim());
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Failed to reject."); return; }
    onDone();
    onClose();
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>{title}</div>
        {subtitle && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{subtitle}</div>}
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Reason<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <textarea className="textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} autoFocus
            placeholder="Explain what needs to change before this can be approved" />
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-danger" onClick={submit} disabled={busy || !reason.trim()}>
            <Icon name="x" size={14} /> Reject
          </button>
        </div>
      </div>
    </Modal>
  );
}
