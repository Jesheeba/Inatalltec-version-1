"use client";
// ============================================================
// Accountant · Expenses — shared bits (Phase 5).
// Status badge, the create/edit form (mandatory receipt + camera capture),
// reject + mark-paid dialogs, the recurring-template form, and a receipt
// opener. UAE/VAT assumptions are surfaced inline.
// ============================================================

import { useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { Modal } from "../../shared";
import type { AccountingLookup } from "@/lib/accounting/settings";
import type { Vendor } from "@/lib/accounting/vendors";
import {
  createExpense, updateExpense, replaceReceipt, submitExpense,
  rejectExpense, markExpensePaid, getReceiptUrl,
  createRecurringExpense, updateRecurringExpense,
  EXPENSE_STATUS_LABEL,
  type Expense, type ExpenseStatus, type ExpenseInput,
  type RecurringExpense, type RecurringFrequency,
} from "@/lib/accounting/expenses";

const EXP_BADGE: Record<ExpenseStatus, string> = {
  draft: "badge-outline", pending_approval: "badge-warning", approved: "badge-info",
  paid: "badge-success", rejected: "badge-danger",
};
export function ExpenseBadge({ status }: { status: ExpenseStatus }) {
  return <span className={"badge " + EXP_BADGE[status]}>{EXPENSE_STATUS_LABEL[status]}</span>;
}

const labelStyle = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;
const cols2 = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" } as const;
const num = (v: string) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

/* ─── Receipt opener ──────────────────────────────────────── */
export function ReceiptButton({ path, label = "Receipt" }: { path: string | null; label?: string }) {
  const { fireToast } = useApp();
  const [busy, setBusy] = useState(false);
  if (!path) return <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>No receipt</span>;
  const open = async () => {
    setBusy(true);
    const res = await getReceiptUrl(path);
    setBusy(false);
    if (!res.ok) { fireToast(res.error); return; }
    window.open(res.data, "_blank", "noopener");
  };
  return (
    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={open}>
      <Icon name="paperclip" size={13} /> {label}
    </button>
  );
}

/* ─── Create / edit ───────────────────────────────────────── */
export function ExpenseFormDialog({ expense, categories, vendors, paymentMethods, taxRatePct, threshold, onClose, onSaved }: {
  expense?: Expense;
  categories: AccountingLookup[];
  vendors: Vendor[];
  paymentMethods: AccountingLookup[];
  taxRatePct: number;
  threshold: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { me, fireToast, fmtMoney } = useApp();
  const isEdit = !!expense;
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? new Date().toISOString().slice(0, 10));
  const [categoryCode, setCategoryCode] = useState(expense?.categoryCode ?? (categories[0]?.code ?? ""));
  const [vendorId, setVendorId] = useState(expense?.vendorId ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(String(expense?.amount ?? ""));
  const [vatIncluded, setVatIncluded] = useState(expense?.vatIncluded ?? false);
  const [vatAmount, setVatAmount] = useState(String(expense?.vatAmount ?? "0"));
  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amt = num(amount);
  const vat = num(vatAmount);
  const total = vatIncluded ? amt : amt + vat;
  const autoVat = () => {
    const r = taxRatePct / 100;
    setVatAmount((vatIncluded ? (amt * r) / (1 + r) : amt * r).toFixed(2));
  };

  const build = (): ExpenseInput => ({
    expenseDate, categoryCode, vendorId: vendorId || null, description,
    amount: amt, vatIncluded, vatAmount: vat, paymentMethod, notes,
  });

  const persist = async (submit: boolean) => {
    setErr(null);
    if (!description.trim()) { setErr("Description is required."); return; }
    if (!isEdit && !file) { setErr("A receipt is required."); return; }
    setBusy(true);
    let targetId = expense?.id ?? "";
    if (isEdit) {
      const up = await updateExpense(expense!.id, build(), me.id);
      if (!up.ok) { setBusy(false); setErr(up.error); return; }
      if (file) {
        const rr = await replaceReceipt(expense!.id, file, me.id);
        if (!rr.ok) { setBusy(false); setErr(rr.error); return; }
      }
    } else {
      const cr = await createExpense(build(), file!, me.id);
      if (!cr.ok) { setBusy(false); setErr(cr.error); return; }
      targetId = cr.data.id;
    }
    if (submit) {
      const sub = await submitExpense(targetId, me.id);
      setBusy(false);
      if (!sub.ok) { setErr(sub.error); return; }
      fireToast(sub.data.status === "approved" ? "Expense auto-approved" : "Sent for approval");
      onSaved();
      return;
    }
    setBusy(false);
    fireToast(isEdit ? "Expense updated" : "Draft saved");
    onSaved();
  };

  const overThreshold = total > threshold;

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>{isEdit ? `Edit ${expense!.expenseNumber}` : "New expense"}</div>

        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Date</label>
            <input className="input" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Category</label>
            <select className="input" value={categoryCode} onChange={e => setCategoryCode(e.target.value)}>
              <option value="">—</option>
              {categories.map(c => <option key={c.id} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Vendor <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>
            <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
              <option value="">—</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>

        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Description<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <input className="input" value={description} onChange={e => setDescription(e.target.value)} autoFocus />
        </div>

        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Amount (AED)</label>
            <input className="input numeric" type="number" min={0} step="any" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>VAT amount (AED)</label>
            <div className="row gap-1" style={{ alignItems: "center" }}>
              <input className="input numeric" type="number" min={0} step="any" value={vatAmount} onChange={e => setVatAmount(e.target.value)} style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={autoVat} title={`Apply ${taxRatePct}%`}>Auto</button>
            </div>
          </div>
          <div className="col" style={{ gap: 4, justifyContent: "flex-end" }}>
            <label className="row gap-1" style={{ alignItems: "center", font: "var(--t-small)" }}>
              <input type="checkbox" checked={vatIncluded} onChange={e => setVatIncluded(e.target.checked)} />
              Amount already includes VAT
            </label>
          </div>
        </div>
        <div className="row between" style={{ font: "var(--t-body-md)" }}>
          <span style={{ color: "var(--ink-mute)" }}>Total</span>
          <strong className="numeric">{fmtMoney(total)}</strong>
        </div>

        {/* Receipt */}
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>
            Receipt {isEdit ? "(leave empty to keep current)" : <span style={{ color: "var(--dan-700)" }}>*</span>}
          </label>
          <input className="input" type="file" accept="image/*,application/pdf" capture="environment"
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>
            Photo or PDF, up to 10 MB. {isEdit && expense?.receiptName ? `Current: ${expense.receiptName}` : "On mobile this opens the camera."}
          </div>
        </div>

        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Payment method <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>
          <select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="">—</option>
            {paymentMethods.map(m => <option key={m.id} value={m.code}>{m.label}</option>)}
          </select>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Notes <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="alert-banner tone-info">
          <div className="ic"><Icon name="alertCircle" size={16} /></div>
          <div className="text">
            <div className="d">{overThreshold
              ? `Above the ${fmtMoney(threshold)} threshold — submitting routes this for Manager/MD approval.`
              : `At or below the ${fmtMoney(threshold)} threshold — submitting auto-approves it.`}</div>
          </div>
        </div>

        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-ghost" onClick={() => persist(false)} disabled={busy}>Save draft</button>
          <button className="btn btn-primary" onClick={() => persist(true)} disabled={busy}>
            <Icon name="check" size={14} /> Save &amp; submit
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Reject ──────────────────────────────────────────────── */
export function RejectExpenseDialog({ expense, onClose, onDone }: {
  expense: Expense; onClose: () => void; onDone: () => void;
}) {
  const { me, fireToast } = useApp();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await rejectExpense(expense.id, reason, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Expense rejected");
    onDone();
  };
  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Reject {expense.expenseNumber}</div>
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Reason<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <textarea className="textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-danger" onClick={submit} disabled={busy || !reason.trim()}>Reject</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Mark paid ───────────────────────────────────────────── */
export function MarkExpensePaidDialog({ expense, paymentMethods, onClose, onDone }: {
  expense: Expense; paymentMethods: AccountingLookup[]; onClose: () => void; onDone: () => void;
}) {
  const { me, fireToast, fmtMoney } = useApp();
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(expense.paymentMethod ?? (paymentMethods[0]?.code ?? ""));
  const [reference, setReference] = useState(expense.paymentReference ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await markExpensePaid(expense.id, { paidDate, method, reference }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${expense.expenseNumber} marked paid`);
    onDone();
  };
  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Pay {expense.expenseNumber}</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{fmtMoney(expense.total)} · {expense.description}</div>
        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Payment date<span style={{ color: "var(--dan-700)" }}>*</span></label>
            <input className="input" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Method</label>
            <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
              <option value="">—</option>
              {paymentMethods.map(m => <option key={m.id} value={m.code}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Reference <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>
          <input className="input" value={reference} onChange={e => setReference(e.target.value)} />
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !paidDate}>
            <Icon name="check" size={14} /> Confirm paid
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Recurring template form ─────────────────────────────── */
export function RecurringFormDialog({ template, categories, vendors, onClose, onSaved }: {
  template?: RecurringExpense;
  categories: AccountingLookup[];
  vendors: Vendor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { me, fireToast } = useApp();
  const isEdit = !!template;
  const [categoryCode, setCategoryCode] = useState(template?.categoryCode ?? (categories[0]?.code ?? ""));
  const [vendorId, setVendorId] = useState(template?.vendorId ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [baseAmount, setBaseAmount] = useState(String(template?.baseAmount ?? ""));
  const [vatIncluded, setVatIncluded] = useState(template?.vatIncluded ?? false);
  const [frequency, setFrequency] = useState<RecurringFrequency>(template?.frequency ?? "monthly");
  const [nextDueDate, setNextDueDate] = useState(template?.nextDueDate ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!description.trim()) { setErr("Description is required."); return; }
    setBusy(true);
    const payload = { categoryCode, vendorId: vendorId || null, description, baseAmount: num(baseAmount), vatIncluded, frequency, nextDueDate, notes };
    const res = isEdit ? await updateRecurringExpense(template!.id, payload) : await createRecurringExpense(payload, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(isEdit ? "Template updated" : "Recurring template created");
    onSaved();
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>{isEdit ? "Edit template" : "New recurring expense"}</div>
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Description<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <input className="input" value={description} onChange={e => setDescription(e.target.value)} autoFocus />
        </div>
        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Category</label>
            <select className="input" value={categoryCode} onChange={e => setCategoryCode(e.target.value)}>
              <option value="">—</option>
              {categories.map(c => <option key={c.id} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Vendor <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>
            <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
              <option value="">—</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Base amount (AED)</label>
            <input className="input numeric" type="number" min={0} step="any" value={baseAmount} onChange={e => setBaseAmount(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Frequency</label>
            <select className="input" value={frequency} onChange={e => setFrequency(e.target.value as RecurringFrequency)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Next due date</label>
            <input className="input" type="date" value={nextDueDate} onChange={e => setNextDueDate(e.target.value)} />
          </div>
        </div>
        <label className="row gap-1" style={{ alignItems: "center", font: "var(--t-small)" }}>
          <input type="checkbox" checked={vatIncluded} onChange={e => setVatIncluded(e.target.checked)} /> Base amount includes VAT
        </label>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>
          When due, this generates a <strong>draft</strong> expense — attach its receipt before submitting.
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} /> {isEdit ? "Save template" : "Create template"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
