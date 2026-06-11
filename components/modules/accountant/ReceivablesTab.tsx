"use client";
// ============================================================
// Accountant · Receivables tab (Phase 1, migration 0046).
//
// Pure derived view over invoices: AR aging into the CONFIGURABLE
// buckets from Settings (0045), a per-customer outstanding summary, and
// inline payment entry (reuses RecordPaymentDialog). No new schema —
// receivables = sent / partially-paid invoices with a balance.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { CardHead, EmptyState, KPI } from "../../shared";
import {
  fetchInvoices, buildAging, type Invoice, type ReceivableItem,
} from "@/lib/accounting/invoices";
import { fetchAccountingSettings, SETTINGS_FALLBACK } from "@/lib/accounting/settings";
import { RecordPaymentDialog } from "./invoiceBits";

export function ReceivablesTab({ canManage }: { canManage: boolean }) {
  const { fmtMoney } = useApp();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bounds, setBounds] = useState({ b1: SETTINGS_FALLBACK.agingBucket1Days, b2: SETTINGS_FALLBACK.agingBucket2Days, b3: SETTINGS_FALLBACK.agingBucket3Days });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const [inv, s] = await Promise.all([fetchInvoices(), fetchAccountingSettings()]);
    setLoading(false);
    if (!inv.ok) { setErr(inv.error); return; }
    setInvoices(inv.data);
    if (s.ok) setBounds({ b1: s.data.agingBucket1Days, b2: s.data.agingBucket2Days, b3: s.data.agingBucket3Days });
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const aging = useMemo(() => buildAging(invoices, bounds), [invoices, bounds]);

  // Per-customer outstanding rollup.
  const byCustomer = useMemo(() => {
    const map = new Map<string, { name: string; outstanding: number; count: number }>();
    for (const it of aging.items) {
      const key = it.invoice.customerId;
      const cur = map.get(key) ?? { name: db.cust(key)?.name ?? "Unknown customer", outstanding: 0, count: 0 };
      cur.outstanding += it.outstanding; cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
  }, [aging]);

  const overdueAmount = aging.items.filter(i => i.daysPastDue > 0).reduce((sum, i) => sum + i.outstanding, 0);

  if (loading) return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading receivables…</div>;
  if (err) return <EmptyState icon="alertCircle" title="Couldn't load receivables" sub={err} />;

  return (
    <>
      {/* Headline KPIs */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Total outstanding" value={fmtMoney(aging.totalOutstanding, { compact: true })}
          sub={`${aging.items.length} open invoice${aging.items.length === 1 ? "" : "s"}`} />
        <KPI label="Overdue" value={fmtMoney(overdueAmount, { compact: true })} sub="Past due date" />
        <KPI label="Customers owing" value={byCustomer.length} sub="With an open balance" />
      </div>

      {/* Aging buckets */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="AR aging" sub="Buckets come from Settings — edit them there, not in code" />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {aging.buckets.map((b, i) => (
            <div key={i} style={{ padding: 14, borderRadius: "var(--r-md)", border: "1px solid var(--border)",
              background: i === 0 ? "var(--bg-muted)" : i >= 2 ? "var(--dan-50)" : "var(--bg-muted)" }}>
              <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{b.label}</div>
              <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700, marginTop: 4, overflowWrap: "anywhere",
                color: i >= 2 && b.amount > 0 ? "var(--dan-700)" : undefined }}>{fmtMoney(b.amount, { compact: true })}</div>
              <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>{b.count} invoice{b.count === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
      </section>

      {aging.items.length === 0 ? (
        <EmptyState icon="check" title="Nothing outstanding" sub="Every sent invoice is fully paid." />
      ) : (
        <>
          {/* Customer outstanding */}
          <section className="card card-pad" style={{ marginBottom: 16 }}>
            <CardHead title={`Customer outstanding · ${byCustomer.length}`} sub="Open balance grouped by customer" />
            <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead><tr>
                    <th>Customer</th>
                    <th style={{ textAlign: "right" }}>Open invoices</th>
                    <th style={{ textAlign: "right" }}>Outstanding</th>
                  </tr></thead>
                  <tbody>
                    {byCustomer.map((c, i) => (
                      <tr key={i}>
                        <td data-th="Customer" style={{ font: "var(--t-small)" }}>{c.name}</td>
                        <td data-th="Open invoices" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{c.count}</td>
                        <td data-th="Outstanding" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(c.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Outstanding invoices */}
          <section className="card card-pad">
            <CardHead title={`Outstanding invoices · ${aging.items.length}`} sub="Sorted by days past due" />
            <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead><tr>
                    <th>Invoice</th><th>Customer</th><th className="hide-mobile">Due</th>
                    <th style={{ textAlign: "right" }}>Outstanding</th>
                    <th style={{ textAlign: "right" }}>Days late</th>
                    {canManage && <th style={{ width: 130 }}>Action</th>}
                  </tr></thead>
                  <tbody>
                    {aging.items.map((it: ReceivableItem) => {
                      const cust = db.cust(it.invoice.customerId);
                      const late = it.daysPastDue > 0;
                      return (
                        <tr key={it.invoice.id}>
                          <td data-th="Invoice" style={{ fontWeight: 600, font: "var(--t-small)" }}>{it.invoice.invoiceNumber}</td>
                          <td data-th="Customer" style={{ font: "var(--t-small)" }}>{cust?.name ?? "—"}</td>
                          <td data-th="Due" className="hide-mobile" style={{ font: "var(--t-small)" }}>{it.invoice.dueDate ?? "—"}</td>
                          <td data-th="Outstanding" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(it.outstanding)}</td>
                          <td data-th="Days late" className="numeric" style={{ textAlign: "right", font: "var(--t-small)",
                            color: late ? "var(--dan-700)" : undefined, fontWeight: late ? 600 : 400 }}>
                            {late ? it.daysPastDue : "—"}
                          </td>
                          {canManage && (
                            <td data-th="Action">
                              <button className="btn btn-ghost btn-sm" onClick={() => setPayTarget(it.invoice)}>
                                Record payment <Icon name="arrowRight" size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {payTarget && (
        <RecordPaymentDialog invoice={payTarget} onClose={() => setPayTarget(null)}
          onRecorded={() => { setPayTarget(null); void load(); }} />
      )}
    </>
  );
}
