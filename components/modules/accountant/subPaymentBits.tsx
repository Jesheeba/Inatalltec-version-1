"use client";
// ============================================================
// Accountant · Subcontractor-payment shared UI bits (migration 0051).
//
// RecordSubPaymentDialog — pay a subcontractor against their accumulated
// balance, with the method list pulled from configurable Settings (0045).
// Mirrors the invoice / vendor-bill payment dialogs. The amount defaults
// to the current outstanding (when positive); overpayment is allowed
// (advances) per the Slice 3A data-layer decision.
// ============================================================

import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { Modal } from "../../shared";
import { fetchPaymentMethods, type AccountingLookup } from "@/lib/accounting/settings";
import { recordSubContractorPayment, type SubContractorLedger } from "@/lib/accounting/subcontractorPayments";

export function RecordSubPaymentDialog({ sub, onClose, onRecorded }: {
  sub: SubContractorLedger;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { me, fireToast, fmtMoney } = useApp();
  const suggested = sub.outstanding > 0 ? sub.outstanding : 0;
  const [methods, setMethods] = useState<AccountingLookup[]>([]);
  const [amount, setAmount] = useState(String(suggested || ""));
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
    const res = await recordSubContractorPayment(sub.id, {
      amount: amt, paymentDate: date, method: method || undefined,
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
        <div style={{ font: "var(--t-h3)" }}>Pay {sub.name}</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          outstanding <strong>{fmtMoney(sub.outstanding)}</strong>
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
