"use client";
// ============================================================
// Accountant · Purchase-order shared UI bits (Phase 2, migration 0048).
//
// Reused by the Purchase Orders tab:
//   • poStatusBadge — status pill with workflow-appropriate colours.
//   • RecordReceiptDialog — modal to receive goods (full or partial)
//     against a single PO line; the DB trigger rolls quantity_received
//     and flips the header to partially_received / received.
// ============================================================

import { useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { Modal } from "../../shared";
import {
  recordPOReceipt, outstandingQtyOf,
  type PurchaseOrder, type POLineItem,
} from "@/lib/accounting/purchaseOrders";

const PO_BADGE: Record<string, { label: string; cls: string }> = {
  draft:              { label: "Draft", cls: "badge-outline" },
  pending_approval:   { label: "Pending approval", cls: "badge-warning" },
  approved:           { label: "Approved", cls: "badge-info" },
  issued:             { label: "Issued", cls: "badge-primary" },
  partially_received: { label: "Partially received", cls: "badge-warning" },
  received:           { label: "Received", cls: "badge-success" },
  closed:             { label: "Closed", cls: "badge-outline" },
  rejected:           { label: "Rejected", cls: "badge-danger" },
  cancelled:          { label: "Cancelled", cls: "badge-outline" },
};

export function poStatusBadge(po: PurchaseOrder): { label: string; cls: string } {
  return PO_BADGE[po.status] ?? { label: po.status, cls: "badge-outline" };
}

export function RecordReceiptDialog({ po, lines, onClose, onRecorded }: {
  po: PurchaseOrder;
  lines: POLineItem[];
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { me, fireToast } = useApp();
  // Only lines that still have an outstanding (un-received) quantity.
  const receivable = lines.filter(l => outstandingQtyOf(l) > 0);
  const [lineId, setLineId] = useState(receivable[0]?.id ?? "");
  const selected = receivable.find(l => l.id === lineId);
  const outstanding = selected ? outstandingQtyOf(selected) : 0;
  const [quantity, setQuantity] = useState(String(outstanding || ""));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickLine = (id: string) => {
    setLineId(id);
    const l = receivable.find(x => x.id === id);
    setQuantity(l ? String(outstandingQtyOf(l)) : "");
  };

  const submit = async () => {
    setErr(null);
    if (!lineId) { setErr("Pick a line to receive against."); return; }
    const qty = Number(quantity);
    if (!(qty > 0)) { setErr("Enter a quantity greater than zero."); return; }
    setBusy(true);
    const res = await recordPOReceipt(po.id, {
      poLineId: lineId, quantity: qty, receivedAt: date,
      reference: reference || undefined, notes: notes || undefined,
    }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Receipt recorded");
    onRecorded();
    onClose();
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Receive goods</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{po.poNumber}</div>

        {receivable.length === 0 ? (
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
            Every line on this PO has been fully received.
          </div>
        ) : (
          <>
            <div className="col" style={{ gap: 4 }}>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Line item</label>
              <select className="input" value={lineId} onChange={e => pickLine(e.target.value)}>
                {receivable.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.description} · outstanding {outstandingQtyOf(l)} of {l.quantity}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <div className="col" style={{ gap: 4 }}>
                <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Quantity received</label>
                <input className="input numeric" type="number" min={0} step="any" value={quantity}
                  onChange={e => setQuantity(e.target.value)} autoFocus />
                <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>Outstanding: {outstanding}</div>
              </div>
              <div className="col" style={{ gap: 4 }}>
                <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Date received</label>
                <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Delivery note / reference (optional)</label>
              <input className="input" value={reference} onChange={e => setReference(e.target.value)} />
            </div>
            <div className="col" style={{ gap: 4 }}>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Notes (optional)</label>
              <textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </>
        )}

        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          {receivable.length > 0 && (
            <button className="btn btn-primary" onClick={submit} disabled={busy || !lineId}>
              <Icon name="check" size={14} /> Record receipt
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
