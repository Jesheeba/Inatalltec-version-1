"use client";
// ============================================================
// Accountant · Vendor Payables tab (Phase 2, migration 0050).
//
// Combines the AR-aging-style overview (reused from the Receivables tab)
// with master/detail bill management (reused from the Invoices tab):
//   • AP aging KPIs + configurable buckets + per-vendor outstanding
//   • Bill list (status + vendor filters) → bill detail with payments
//     and the append-only audit history
//   • Record-vendor-payment dialog (methods from Settings)
//   • AP aging CSV export
//
// Source model = manual vendor bills (migration 0050). A payable is a
// bill with an outstanding balance. Edit rights: MANAGE_PAYABLES. Read for
// everyone with VIEW_PAYABLES (Manager is read-only).
//
// Fully responsive: tables use the shared .table (collapses to cards via
// data-th ≤720px), grids are auto-fit, modals are bottom sheets ≤720px.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { CardHead, EmptyState, FilterBar, KPI, Modal } from "../../shared";
import {
  fetchVendorBills, fetchVendorBillDetail, createVendorBill, cancelVendorBill,
  buildApAging, outstandingOf,
  type VendorBill, type VendorBillDetail, type BillStatus, type PayableItem,
} from "@/lib/accounting/payables";
import { fetchAccountingSettings, SETTINGS_FALLBACK } from "@/lib/accounting/settings";
import { fetchVendors, type Vendor } from "@/lib/accounting/vendors";
import { fetchPurchaseOrders, type PurchaseOrder } from "@/lib/accounting/purchaseOrders";
import { billStatusBadge, RecordVendorPaymentDialog } from "./payableBits";

type StatusFilter = "all" | BillStatus;

const todayYmd = () => new Date().toISOString().slice(0, 10);

/** Excel-safe CSV download (BOM + RFC-4180 escaping). Self-contained so
 *  the accountant module stays isolated from other modules' helpers. */
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const str = String(v);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function PayablesTab({ canManage }: { canManage: boolean }) {
  const { fmtMoney } = useApp();
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [bounds, setBounds] = useState({
    b1: SETTINGS_FALLBACK.agingBucket1Days, b2: SETTINGS_FALLBACK.agingBucket2Days, b3: SETTINGS_FALLBACK.agingBucket3Days,
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [vendorFilter, setVendorFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    const [b, v, s, p] = await Promise.all([
      fetchVendorBills(), fetchVendors(), fetchAccountingSettings(), fetchPurchaseOrders(),
    ]);
    setLoading(false);
    if (!b.ok) { setErr(b.error); return; }
    setBills(b.data);
    if (v.ok) setVendors(v.data);
    if (p.ok) setPos(p.data);
    if (s.ok) setBounds({ b1: s.data.agingBucket1Days, b2: s.data.agingBucket2Days, b3: s.data.agingBucket3Days });
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const vendorName = (id: string): string => vendors.find(v => v.id === id)?.name ?? "—";
  const poNumber = (id: string | null): string | null => (id ? pos.find(p => p.id === id)?.poNumber ?? null : null);

  const aging = useMemo(() => buildApAging(bills, bounds), [bills, bounds]);

  const byVendor = useMemo(() => {
    const map = new Map<string, { id: string; name: string; outstanding: number; count: number }>();
    for (const it of aging.items) {
      const key = it.bill.vendorId;
      const cur = map.get(key) ?? { id: key, name: vendorName(key), outstanding: 0, count: 0 };
      cur.outstanding += it.outstanding; cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aging, vendors]);

  const overdueAmount = aging.items.filter(i => i.daysPastDue > 0).reduce((sum, i) => sum + i.outstanding, 0);

  const filteredBills = useMemo(() => bills.filter(b => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (vendorFilter && b.vendorId !== vendorFilter) return false;
    return true;
  }), [bills, statusFilter, vendorFilter]);

  if (selectedId) {
    return (
      <BillDetailView id={selectedId} canManage={canManage} vendorName={vendorName} poNumber={poNumber}
        onBack={() => setSelectedId(null)} onChanged={() => { void load(); }} />
    );
  }

  const exportAging = () => {
    downloadCsv(
      `ap-aging-${todayYmd()}.csv`,
      ["Bill #", "Vendor", "Vendor Inv #", "Bill date", "Due date", "Total", "Outstanding", "Days past due", "Bucket"],
      aging.items.map((it: PayableItem) => [
        it.bill.billNumber, vendorName(it.bill.vendorId), it.bill.vendorInvoiceNumber ?? "",
        it.bill.billDate, it.bill.dueDate ?? "", it.bill.total.toFixed(2), it.outstanding.toFixed(2),
        it.daysPastDue, aging.buckets[it.bucketIndex].label,
      ]),
    );
  };

  const statusTabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: bills.length },
    { value: "unpaid", label: "Unpaid" },
    { value: "partial_paid", label: "Partial" },
    { value: "paid", label: "Paid" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const activeVendors = vendors.filter(v => v.status === "active");

  if (loading) return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading payables…</div>;
  if (err) return <EmptyState icon="alertCircle" title="Couldn't load payables" sub={err} />;

  return (
    <>
      {/* Headline KPIs */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Total payable" value={fmtMoney(aging.totalOutstanding, { compact: true })}
          sub={`${aging.items.length} open bill${aging.items.length === 1 ? "" : "s"}`} />
        <KPI label="Overdue" value={fmtMoney(overdueAmount, { compact: true })} sub="Past due date" />
        <KPI label="Vendors owed" value={byVendor.length} sub="With an open balance" />
      </div>

      {/* AP aging buckets */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="AP aging" sub="Buckets come from Settings — edit them there, not in code" />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {aging.buckets.map((b, i) => (
            <div key={i} style={{ padding: 14, borderRadius: "var(--r-md)", border: "1px solid var(--border)",
              background: i >= 2 ? "var(--dan-50)" : "var(--bg-muted)" }}>
              <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{b.label}</div>
              <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700, marginTop: 4, overflowWrap: "anywhere",
                color: i >= 2 && b.amount > 0 ? "var(--dan-700)" : undefined }}>{fmtMoney(b.amount, { compact: true })}</div>
              <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>{b.count} bill{b.count === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Per-vendor outstanding */}
      {byVendor.length > 0 && (
        <section className="card card-pad" style={{ marginBottom: 16 }}>
          <CardHead title={`Vendor outstanding · ${byVendor.length}`} sub="Open balance by vendor — tap a row to see their unpaid bills" />
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr>
                  <th>Vendor</th>
                  <th style={{ textAlign: "right" }}>Open bills</th>
                  <th style={{ textAlign: "right" }}>Outstanding</th>
                </tr></thead>
                <tbody>
                  {byVendor.map(v => (
                    <tr key={v.id} style={{ cursor: "pointer" }}
                      onClick={() => { setVendorFilter(v.id); setStatusFilter("unpaid"); }}>
                      <td data-th="Vendor" style={{ font: "var(--t-small)", fontWeight: 600 }}>{v.name}</td>
                      <td data-th="Open bills" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{v.count}</td>
                      <td data-th="Outstanding" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(v.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Bill list controls */}
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FilterBar<StatusFilter> value={statusFilter} onChange={setStatusFilter} options={statusTabs} />
        </div>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" disabled={aging.items.length === 0} onClick={exportAging}>
            <Icon name="fileText" size={14} /> Export AP aging
          </button>
          {canManage && (
            <button className="btn btn-primary btn-sm" disabled={activeVendors.length === 0} onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={14} /> New bill
            </button>
          )}
        </div>
      </div>

      {vendorFilter && (
        <div className="row gap-2" style={{ marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge badge-info">Vendor: {vendorName(vendorFilter)}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setVendorFilter("")}>
            <Icon name="x" size={12} /> Clear vendor filter
          </button>
        </div>
      )}

      {canManage && activeVendors.length === 0 && (
        <div className="alert-banner tone-info" style={{ marginBottom: 12 }}>
          <div className="ic"><Icon name="building" size={16} /></div>
          <div className="text"><div className="h">No active vendors</div>
            <div className="d">Add a vendor in the Vendors tab before recording a bill.</div></div>
        </div>
      )}

      {filteredBills.length === 0 ? (
        <EmptyState icon="receipt" title={bills.length === 0 ? "No vendor bills yet" : "Nothing in this view"}
          sub={canManage && bills.length === 0 ? "Record the first vendor bill." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Bill</th><th>Vendor</th><th className="hide-mobile">Vendor inv #</th>
                <th className="hide-mobile">Due</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Outstanding</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {filteredBills.map(bill => {
                  const badge = billStatusBadge(bill);
                  return (
                    <tr key={bill.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(bill.id)}>
                      <td data-th="Bill" style={{ fontWeight: 600, font: "var(--t-small)" }}>{bill.billNumber}</td>
                      <td data-th="Vendor" style={{ font: "var(--t-small)" }}>{vendorName(bill.vendorId)}</td>
                      <td data-th="Vendor inv #" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{bill.vendorInvoiceNumber ?? "—"}</td>
                      <td data-th="Due" className="hide-mobile" style={{ font: "var(--t-small)" }}>{bill.dueDate ?? "—"}</td>
                      <td data-th="Total" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(bill.total)}</td>
                      <td data-th="Outstanding" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(outstandingOf(bill))}</td>
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
        <CreateBillDialog vendors={activeVendors} pos={pos} onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); void load(); setSelectedId(id); }} />
      )}
    </>
  );
}

/* ─── Create dialog ──────────────────────────────────────── */
function CreateBillDialog({ vendors, pos, onClose, onCreated }: {
  vendors: Vendor[]; pos: PurchaseOrder[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { me, fireToast, fmtMoney } = useApp();
  const [vendorId, setVendorId] = useState("");
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [poId, setPoId] = useState("");
  const [billDate, setBillDate] = useState(todayYmd());
  const [dueDate, setDueDate] = useState("");
  const [subtotal, setSubtotal] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // POs are optional context; only the chosen vendor's POs are linkable.
  const vendorPos = useMemo(() => pos.filter(p => p.vendorId === vendorId), [pos, vendorId]);
  const total = (Number(subtotal) || 0) + (Number(taxAmount) || 0);

  const submit = async () => {
    setErr(null);
    if (!vendorId) { setErr("Pick a vendor."); return; }
    if (!vendorInvoiceNumber.trim()) { setErr("Enter the vendor's invoice number."); return; }
    if (total <= 0) { setErr("Bill total must be greater than zero."); return; }
    setBusy(true);
    const linkedPo = poId ? pos.find(p => p.id === poId) : null;
    const res = await createVendorBill({
      vendorId, vendorInvoiceNumber, poId: poId || null,
      projectId: linkedPo?.projectId ?? null,
      billDate, dueDate: dueDate || undefined,
      subtotal: Number(subtotal) || 0, taxAmount: Number(taxAmount) || 0,
      notes: notes || undefined,
    }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`Bill ${res.data.billNumber} recorded`);
    onCreated(res.data.id);
  };

  const label = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>New vendor bill</div>

        <div className="col" style={{ gap: 4 }}>
          <label style={label}>Vendor<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <select className="input" value={vendorId} onChange={e => { setVendorId(e.target.value); setPoId(""); }}>
            <option value="">— Select —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorCode} · {v.name}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Vendor invoice #<span style={{ color: "var(--dan-700)" }}>*</span></label>
            <input className="input" value={vendorInvoiceNumber} onChange={e => setVendorInvoiceNumber(e.target.value)}
              placeholder="From the vendor's invoice" />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Link to PO (optional)</label>
            <select className="input" value={poId} disabled={!vendorId} onChange={e => setPoId(e.target.value)}>
              <option value="">— None —</option>
              {vendorPos.map(p => <option key={p.id} value={p.id}>{p.poNumber}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Bill date</label>
            <input className="input" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Due date (optional)</label>
            <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>Blank → uses the vendor's payment terms.</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Subtotal</label>
            <input className="input numeric" type="number" min={0} step="any" value={subtotal} onChange={e => setSubtotal(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Tax amount</label>
            <input className="input numeric" type="number" min={0} step="any" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} />
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>Enter the VAT from the vendor's invoice.</div>
          </div>
        </div>

        <div className="row between" style={{ font: "var(--t-body-md)" }}>
          <span style={{ color: "var(--ink-mute)" }}>Total</span>
          <strong className="numeric">{fmtMoney(total)}</strong>
        </div>

        <div className="col" style={{ gap: 4 }}>
          <label style={label}>Notes (optional)</label>
          <textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !vendorId || !vendorInvoiceNumber.trim() || total <= 0}>
            <Icon name="plus" size={14} /> Record bill
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Detail ─────────────────────────────────────────────── */
function BillDetailView({ id, canManage, vendorName, poNumber, onBack, onChanged }: {
  id: string; canManage: boolean;
  vendorName: (id: string) => string; poNumber: (id: string | null) => string | null;
  onBack: () => void; onChanged: () => void;
}) {
  const { fmtMoney, me } = useApp();
  const [detail, setDetail] = useState<VendorBillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    const d = await fetchVendorBillDetail(id);
    setLoading(false);
    if (!d.ok) { setErr(d.error); return; }
    setDetail(d.data);
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

  if (loading) return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading bill…</div>;
  if (!detail) return <EmptyState icon="alertCircle" title="Couldn't load bill" sub={err ?? undefined} />;

  const { bill, payments, history } = detail;
  const badge = billStatusBadge(bill);
  const outstanding = outstandingOf(bill);
  const linkedPo = poNumber(bill.poId);
  const proj = bill.projectId ? db.proj(bill.projectId) : null;

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
        <Icon name="chevronLeft" size={14} /> All bills
      </button>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {/* Header */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ font: "var(--t-h3)", fontWeight: 700 }}>{bill.billNumber}</span>
              <span className={"badge " + badge.cls}>{badge.label}</span>
            </div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
              {vendorName(bill.vendorId)}{bill.vendorInvoiceNumber ? ` · vendor inv ${bill.vendorInvoiceNumber}` : ""}
            </div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>
              Billed {bill.billDate}{bill.dueDate ? ` · due ${bill.dueDate}` : ""}
              {linkedPo ? ` · PO ${linkedPo}` : ""}{proj ? ` · ${proj.code}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</div>
            <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700 }}>{fmtMoney(bill.total)}</div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              paid {fmtMoney(bill.amountPaid)} · outstanding <strong>{fmtMoney(outstanding)}</strong>
            </div>
          </div>
        </div>

        {/* Actions */}
        {canManage && (bill.status === "unpaid" || bill.status === "partial_paid") && (
          <div className="row gap-2" style={{ marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => setShowPay(true)}>
              <Icon name="banknote" size={14} /> Record payment
            </button>
            {bill.status === "unpaid" && (
              <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => run(() => cancelVendorBill(bill.id, me.id))}>
                <Icon name="x" size={14} /> Cancel bill
              </button>
            )}
          </div>
        )}
      </section>

      {/* Amounts */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Amounts" sub="As recorded from the vendor's invoice" />
        <div className="col gap-1" style={{ alignItems: "flex-end", font: "var(--t-small)" }}>
          <div>Subtotal: <strong className="numeric">{fmtMoney(bill.subtotal)}</strong></div>
          <div>Tax: <strong className="numeric">{fmtMoney(bill.taxAmount)}</strong></div>
          <div style={{ font: "var(--t-body-md)" }}>Total: <strong className="numeric">{fmtMoney(bill.total)}</strong></div>
        </div>
        {bill.notes && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 10 }}>{bill.notes}</div>}
      </section>

      {/* Payments */}
      {payments.length > 0 && (
        <section className="card card-pad" style={{ marginBottom: 16 }}>
          <CardHead title={`Payments · ${payments.length}`} sub="Payments made against this bill" />
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
                      <td data-th="Date" style={{ font: "var(--t-small)" }}>{p.paidAt}</td>
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

      {/* Audit history (RLS returns [] for non-audit roles) */}
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

      {showPay && (
        <RecordVendorPaymentDialog bill={bill} onClose={() => setShowPay(false)}
          onRecorded={() => { void load(); onChanged(); }} />
      )}
    </>
  );
}
