"use client";
// ============================================================
// Accountant · Vendor-payable shared UI bits (Phase 2, migration 0050).
//
// Reused by the Vendor Payables tab:
//   • billStatusBadge — status pill (with DERIVED "overdue" display for
//     open bills past their due date — the stored status is never overdue).
//   • RecordVendorPaymentDialog — modal to pay a bill, with the method
//     list pulled from configurable Settings (0045). Mirrors the invoice
//     RecordPaymentDialog.
// ============================================================

import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { Modal } from "../../shared";
import { fetchPaymentMethods, type AccountingLookup } from "@/lib/accounting/settings";
import { recordVendorPayment, outstandingOf, type VendorBill } from "@/lib/accounting/payables";

const todayMs = () => new Date(new Date().toISOString().slice(0, 10)).getTime();

export function isBillOverdue(bill: VendorBill): boolean {
  if (bill.status !== "unpaid" && bill.status !== "partial_paid") return false;
  if (!bill.dueDate) return false;
  return new Date(bill.dueDate).getTime() < todayMs();
}

export function billStatusBadge(bill: VendorBill): { label: string; cls: string } {
  if (isBillOverdue(bill)) {
    return { label: bill.status === "partial_paid" ? "Overdue · partial" : "Overdue", cls: "badge-danger" };
  }
  switch (bill.status) {
    case "unpaid":       return { label: "Unpaid", cls: "badge-warning" };
    case "partial_paid": return { label: "Partially paid", cls: "badge-info" };
    case "paid":         return { label: "Paid", cls: "badge-success" };
    case "cancelled":    return { label: "Cancelled", cls: "badge-outline" };
    default:             return { label: bill.status, cls: "badge-outline" };
  }
}

export function RecordVendorPaymentDialog({ bill, onClose, onRecorded }: {
  bill: VendorBill;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { me, fireToast, fmtMoney } = useApp();
  const outstanding = outstandingOf(bill);
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
    const res = await recordVendorPayment(bill.id, {
      amount: amt, paidAt: date, method: method || undefined,
      reference: reference || undefined, notes: notes || undefined,
    }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Vendor payment recorded");
    onRecorded();
    onClose();
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Record vendor payment</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {bill.billNumber} · outstanding <strong>{fmtMoney(outstanding)}</strong>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Amount</label>
            <input className="input numeric" type="number" min={0} step="any" value={amount}
              onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Date paid</label>
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
