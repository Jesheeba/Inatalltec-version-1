"use client";
// ============================================================
// Accountant · Monthly View (Phase 7) — the default landing tab.
//
// Cross-module monthly dashboard: KPI + outstanding rows, collapsible
// activity sections (each links into its source tab), and the four reports
// (Status, CNL placeholder, P&L, Cash Flow) + a Print Monthly Statement —
// all print-friendly (browser → PDF) with CSV export. Fully responsive.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { CardHead, EmptyState, KPI, Modal } from "../../shared";
import {
  getMonthlyData, getMonthlyKPIs, monthRange,
  generateStatusReport, generateCNLReport, generatePnL, generateCashFlow,
  type MonthlyData, type Bucket, type Report,
} from "@/lib/accounting/monthly";
import { printReport, reportToCsv } from "./reportPrint";

type AccTabKey = "invoices" | "receivables" | "payables" | "expenses" | "subpay" | "payroll";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function MonthlyView({ onOpenTab }: { onOpenTab?: (tab: AccTabKey) => void }) {
  const { fmtMoney, currentOrg } = useApp();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  const companyName = currentOrg?.display_name || "Company";
  const range = monthRange(year, month);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true); setErr(null);
      const res = await getMonthlyData(year, month);
      if (!live) return;
      setLoading(false);
      if (!res.ok) { setErr(res.error); setData(null); return; }
      setData(res.data);
    })();
    return () => { live = false; };
  }, [year, month]);

  const kpis = useMemo(() => (data ? getMonthlyKPIs(data) : null), [data]);

  const step = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };
  const toggle = (k: string) => setOpenKeys(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });

  const activity: { key: string; title: string; bucket: Bucket; tab: AccTabKey }[] = data ? [
    { key: "inv", title: "Invoices issued", bucket: data.invoices, tab: "invoices" },
    { key: "rcv", title: "Payments received", bucket: data.receipts, tab: "receivables" },
    { key: "bill", title: "Vendor bills recorded", bucket: data.vendorBills, tab: "payables" },
    { key: "exp", title: "Expenses recorded", bucket: data.expensesRecorded, tab: "expenses" },
    { key: "sub", title: "Subcontractor payments", bucket: data.subPayments, tab: "subpay" },
    { key: "pay", title: "Payroll runs", bucket: data.payrollRuns, tab: "payroll" },
  ] : [];

  const monthlyStatement = (): Report => {
    const r = data ? generateStatusReport(data) : null;
    return r ? { ...r, title: "Monthly Statement" } : { kind: "statement", title: "Monthly Statement", period: range.label, sections: [] };
  };

  return (
    <>
      {/* Month nav */}
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" aria-label="Previous month" onClick={() => step(-1)} style={{ minHeight: 40 }}><Icon name="chevronLeft" size={16} /></button>
          <div style={{ font: "var(--t-h3)", minWidth: 150, textAlign: "center" }}>{range.label}</div>
          <button className="btn btn-ghost btn-sm" aria-label="Next month" onClick={() => step(1)} style={{ minHeight: 40 }}><Icon name="chevronRight" size={16} /></button>
        </div>
        <button className="btn btn-primary btn-sm" disabled={!data} onClick={() => { if (data && !printReport(monthlyStatement(), companyName)) {/* popup blocked */} }}>
          <Icon name="fileText" size={14} /> Print Monthly Statement
        </button>
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}
      {loading || !data || !kpis ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading {range.label}…</div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 16 }}>
            <KPI accent="primary" label="Invoiced" value={fmtMoney(kpis.invoicedTotal, { compact: true })} sub={`${kpis.invoicedCount} invoice(s)`} />
            <KPI accent="violet" label="Received" value={fmtMoney(kpis.receivedTotal, { compact: true })} sub={`${kpis.receivedCount} receipt(s)`} />
            <KPI accent="peach" label="Spent" value={fmtMoney(kpis.spentTotal, { compact: true })} sub="Bills + exp + sub + payroll" />
            <KPI label="Net cash" value={fmtMoney(kpis.netCash, { compact: true })} sub="Received − spent" />
          </div>

          {/* Outstanding row */}
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
            <KPI label="Customer outstanding" value={fmtMoney(kpis.outstanding.customer, { compact: true })} sub="AR open" />
            <KPI label="Vendor outstanding" value={fmtMoney(kpis.outstanding.vendor, { compact: true })} sub="AP open" />
            <KPI label="Subcontractor outstanding" value={fmtMoney(kpis.outstanding.subcontractor, { compact: true })} sub="Owed to subs" />
          </div>

          {/* Reports */}
          <div className="row gap-2" style={{ flexWrap: "wrap", marginBottom: 20 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setReport(generateStatusReport(data))}><Icon name="fileText" size={14} /> Status Report</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setReport(generateCNLReport(data))}><Icon name="fileText" size={14} /> CNL Report</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setReport(generatePnL(data))}><Icon name="chartBar" size={14} /> P&amp;L Summary</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setReport(generateCashFlow(data, null))}><Icon name="chartLine" size={14} /> Cash Flow</button>
          </div>

          {/* Activity */}
          <CardHead title="Activity this month" sub="Tap a section to expand; open the source tab for detail" />
          <div className="col gap-2" style={{ marginTop: 8 }}>
            {activity.map(a => {
              const open = openKeys.has(a.key);
              return (
                <div key={a.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <button onClick={() => toggle(a.key)} className="row between"
                    style={{ width: "100%", alignItems: "center", gap: 10, padding: "12px 14px", minHeight: 52,
                      background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <span className="row gap-2" style={{ alignItems: "center", minWidth: 0 }}>
                      <Icon name={open ? "chevronUp" : "chevronDown"} size={15} />
                      <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{a.title}</span>
                      <span className="badge badge-outline">{a.bucket.count}</span>
                    </span>
                    <strong className="numeric" style={{ font: "var(--t-body-md)" }}>{fmtMoney(a.bucket.total)}</strong>
                  </button>
                  {open && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "8px 14px 14px" }}>
                      {a.bucket.rows.length === 0 ? (
                        <div style={{ font: "var(--t-small)", color: "var(--ink-quiet)" }}>Nothing this month.</div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className="table">
                            <thead><tr><th>Ref</th><th>Date</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                            <tbody>
                              {a.bucket.rows.slice(0, 25).map(r => (
                                <tr key={r.id}>
                                  <td data-th="Ref" style={{ font: "var(--t-small)", fontWeight: 600 }}>{r.ref}{r.party && a.tab === "invoices" ? ` · ${db.cust(r.party)?.name ?? ""}` : ""}</td>
                                  <td data-th="Date" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{r.date}</td>
                                  <td data-th="Amount" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(r.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {a.bucket.rows.length > 25 && <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 6 }}>+{a.bucket.rows.length - 25} more</div>}
                        </div>
                      )}
                      {onOpenTab && (
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => onOpenTab(a.tab)}>
                          Open in tab <Icon name="arrowRight" size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {report && <ReportModal report={report} companyName={companyName} onClose={() => setReport(null)} />}
    </>
  );
}

/* ─── On-screen report (print + CSV) ──────────────────────── */
function ReportModal({ report, companyName, onClose }: { report: Report; companyName: string; onClose: () => void }) {
  const { fmtMoney, fireToast } = useApp();
  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <div style={{ font: "var(--t-h3)" }}>{report.title}</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{report.period}</div>
          </div>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => downloadText(`${report.kind}_${report.period}.csv`, reportToCsv(report))}><Icon name="arrowDown" size={14} /> CSV</button>
            <button className="btn btn-primary btn-sm" onClick={() => { if (!printReport(report, companyName)) fireToast("Allow pop-ups to print"); }}><Icon name="fileText" size={14} /> Print</button>
          </div>
        </div>

        {report.banner && (
          <div className="alert-banner tone-warning">
            <div className="ic"><Icon name="alertTriangle" size={16} /></div>
            <div className="text"><div className="d">{report.banner}</div></div>
          </div>
        )}

        {report.sections.map((sec, i) => (
          <div key={i} className="card card-pad col gap-2">
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{sec.title}</div>
            {sec.lines.map((l, j) => (
              <div key={j} className="row between" style={{ font: l.bold ? "var(--t-body-md)" : "var(--t-small)", color: l.muted ? "var(--ink-quiet)" : undefined }}>
                <span style={{ color: l.muted ? "var(--ink-quiet)" : "var(--ink-mute)" }}>{l.label}</span>
                <strong className="numeric" style={{ fontWeight: l.bold ? 700 : 600 }}>{fmtMoney(l.value)}</strong>
              </div>
            ))}
            {sec.note && <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{sec.note}</div>}
          </div>
        ))}

        <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
