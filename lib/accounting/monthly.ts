// ============================================================
// Accountant module · Phase 7 — Monthly cross-module aggregation
// (no new migration; reads every prior phase's tables, RLS-gated).
//
// One getMonthlyData(year, month) fan-out feeds the Monthly dashboard and
// every report (Status, CNL, P&L, Cash Flow). Pure builders below turn that
// snapshot into report shapes the UI renders and prints.
//
// ⚠️ SCOPE/ASSUMPTIONS (flagged in the phase report):
//   • AMC receipts are NOT a dated transaction in this system (the AMC engine
//     flips contract_status rather than recording dated payments), so AMC is
//     excluded from "received this month". AR/AP here = invoices / vendor bills.
//   • Money sources are the accounting tables only. A viewer whose role can't
//     read a table (e.g. Manager + payroll) simply sees zero there (RLS), which
//     is the intended confidentiality behaviour — not an error.
//   • P&L is a SIMPLIFIED period view (see generatePnL), not GAAP accrual.
//   • Cash-flow opening balance is supplied by the caller (e.g. last bank
//     reconciliation) or treated as 0 — flagged in the UI.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import type { AcctResult } from "./settings";
import { fetchSubContractorLedgers } from "./subcontractorPayments";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const pad = (x: number) => String(x).padStart(2, "0");
const n = (v: unknown): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

export interface MonthRange { year: number; month: number; start: string; end: string; label: string; }
export function monthRange(year: number, month: number): MonthRange {
  const last = new Date(year, month, 0).getDate();   // month is 1-based → day 0 of next = last day
  return { year, month, start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(last)}`, label: `${MONTH_NAMES[month - 1]} ${year}` };
}

export interface ActivityRow { id: string; ref: string; date: string; amount: number; party: string | null; status: string | null; }
export interface Bucket { count: number; total: number; rows: ActivityRow[] }
const emptyBucket = (): Bucket => ({ count: 0, total: 0, rows: [] });

export interface MonthlyData {
  range: MonthRange;
  invoices: Bucket;          // revenue: invoice_date in month, excl. cancelled/rejected
  receipts: Bucket;          // invoice_payments received_at in month
  vendorBills: Bucket;       // bill_date in month
  vendorPayments: { count: number; total: number };  // vendor_bill_payments paid_at in month
  expensesRecorded: Bucket;  // expense_date in month, excl. rejected
  expensesPaid: { count: number; total: number };    // paid_date in month
  subPayments: Bucket;       // payment_date in month
  payrollPaid: { count: number; total: number };     // runs paid (payment_date) in month
  payrollRuns: Bucket;       // runs whose period is this month
  outstanding: { customer: number; vendor: number; subcontractor: number };
}

const sumRows = (rows: ActivityRow[]) => rows.reduce((t, r) => t + r.amount, 0);

export async function getMonthlyData(year: number, month: number): Promise<AcctResult<MonthlyData>> {
  const range = monthRange(year, month);
  const { start, end } = range;
  const sb = supabaseBrowser();

  const [inv, pay, bills, billPays, expRec, expPaid, subPays, payRuns, openInv, openBills, ledgers] = await Promise.all([
    sb.from("invoices").select("id, invoice_number, invoice_date, total, status, customer_id").gte("invoice_date", start).lte("invoice_date", end),
    sb.from("invoice_payments").select("id, invoice_id, amount, received_at").gte("received_at", start).lte("received_at", end),
    sb.from("vendor_bills").select("id, bill_number, bill_date, total, status, vendor_id").gte("bill_date", start).lte("bill_date", end),
    sb.from("vendor_bill_payments").select("amount, paid_at").gte("paid_at", start).lte("paid_at", end),
    sb.from("expenses").select("id, expense_number, expense_date, total, status, category_code").gte("expense_date", start).lte("expense_date", end),
    sb.from("expenses").select("total, paid_date").eq("status", "paid").gte("paid_date", start).lte("paid_date", end),
    sb.from("sub_contractor_payments").select("id, amount, payment_date, sub_contractor_id").gte("payment_date", start).lte("payment_date", end),
    sb.from("payroll_runs").select("id, run_code, total_net, payment_date, status").eq("status", "paid").gte("payment_date", start).lte("payment_date", end),
    sb.from("invoices").select("total, amount_paid, status").in("status", ["approved", "sent", "partially_paid", "overdue"]),
    sb.from("vendor_bills").select("total, amount_paid, status").in("status", ["unpaid", "partial_paid"]),
    fetchSubContractorLedgers(),
  ]);

  // Activity period runs (period in this month) — separate from "paid this month".
  const periodRuns = await sb.from("payroll_runs").select("id, run_code, total_net, status").eq("period_year", year).eq("period_month", month);

  const firstErr = [inv, pay, bills, billPays, expRec, expPaid, subPays, payRuns, openInv, openBills, periodRuns].find(r => r.error);
  if (firstErr?.error) return { ok: false, error: firstErr.error.message };

  // Invoices (revenue) — exclude cancelled/rejected.
  const invoices = emptyBucket();
  for (const r of (inv.data ?? []) as Record<string, unknown>[]) {
    const st = s(r.status);
    if (st === "cancelled" || st === "rejected") continue;
    invoices.rows.push({ id: s(r.id), ref: s(r.invoice_number), date: s(r.invoice_date), amount: n(r.total), party: s(r.customer_id) || null, status: st });
  }
  invoices.count = invoices.rows.length; invoices.total = sumRows(invoices.rows);

  const receipts = emptyBucket();
  for (const r of (pay.data ?? []) as Record<string, unknown>[])
    receipts.rows.push({ id: s(r.id), ref: "Receipt", date: s(r.received_at), amount: n(r.amount), party: s(r.invoice_id) || null, status: null });
  receipts.count = receipts.rows.length; receipts.total = sumRows(receipts.rows);

  const vendorBills = emptyBucket();
  for (const r of (bills.data ?? []) as Record<string, unknown>[]) {
    if (s(r.status) === "cancelled") continue;
    vendorBills.rows.push({ id: s(r.id), ref: s(r.bill_number), date: s(r.bill_date), amount: n(r.total), party: s(r.vendor_id) || null, status: s(r.status) });
  }
  vendorBills.count = vendorBills.rows.length; vendorBills.total = sumRows(vendorBills.rows);

  const vendorPayments = { count: (billPays.data ?? []).length, total: (billPays.data ?? []).reduce((t, r) => t + n((r as Record<string, unknown>).amount), 0) };

  const expensesRecorded = emptyBucket();
  for (const r of (expRec.data ?? []) as Record<string, unknown>[]) {
    if (s(r.status) === "rejected") continue;
    expensesRecorded.rows.push({ id: s(r.id), ref: s(r.expense_number), date: s(r.expense_date), amount: n(r.total), party: s(r.category_code) || null, status: s(r.status) });
  }
  expensesRecorded.count = expensesRecorded.rows.length; expensesRecorded.total = sumRows(expensesRecorded.rows);

  const expensesPaid = { count: (expPaid.data ?? []).length, total: (expPaid.data ?? []).reduce((t, r) => t + n((r as Record<string, unknown>).total), 0) };

  const subPayments = emptyBucket();
  for (const r of (subPays.data ?? []) as Record<string, unknown>[])
    subPayments.rows.push({ id: s(r.id), ref: "Payment", date: s(r.payment_date), amount: n(r.amount), party: s(r.sub_contractor_id) || null, status: null });
  subPayments.count = subPayments.rows.length; subPayments.total = sumRows(subPayments.rows);

  const payrollPaid = { count: (payRuns.data ?? []).length, total: (payRuns.data ?? []).reduce((t, r) => t + n((r as Record<string, unknown>).total_net), 0) };

  const payrollRuns = emptyBucket();
  for (const r of (periodRuns.data ?? []) as Record<string, unknown>[])
    payrollRuns.rows.push({ id: s(r.id), ref: s(r.run_code), date: range.start, amount: n(r.total_net), party: null, status: s(r.status) });
  payrollRuns.count = payrollRuns.rows.length; payrollRuns.total = sumRows(payrollRuns.rows);

  const customer = ((openInv.data ?? []) as Record<string, unknown>[]).reduce((t, r) => t + Math.max(0, n(r.total) - n(r.amount_paid)), 0);
  const vendor = ((openBills.data ?? []) as Record<string, unknown>[]).reduce((t, r) => t + Math.max(0, n(r.total) - n(r.amount_paid)), 0);
  const subcontractor = ledgers.ok ? ledgers.data.reduce((t, l) => t + Math.max(0, l.outstanding), 0) : 0;

  return {
    ok: true,
    data: { range, invoices, receipts, vendorBills, vendorPayments, expensesRecorded, expensesPaid, subPayments, payrollPaid, payrollRuns, outstanding: { customer, vendor, subcontractor } },
  };
}

// ── Derived KPIs ────────────────────────────────────────────
export interface MonthlyKPIs {
  invoicedTotal: number; invoicedCount: number;
  receivedTotal: number; receivedCount: number;
  spentTotal: number;
  spent: { vendorPaid: number; expensesPaid: number; subPaid: number; payrollPaid: number };
  netCash: number;
  outstanding: { customer: number; vendor: number; subcontractor: number };
}
export function getMonthlyKPIs(d: MonthlyData): MonthlyKPIs {
  const spent = { vendorPaid: d.vendorPayments.total, expensesPaid: d.expensesPaid.total, subPaid: d.subPayments.total, payrollPaid: d.payrollPaid.total };
  const spentTotal = spent.vendorPaid + spent.expensesPaid + spent.subPaid + spent.payrollPaid;
  return {
    invoicedTotal: d.invoices.total, invoicedCount: d.invoices.count,
    receivedTotal: d.receipts.total, receivedCount: d.receipts.count,
    spentTotal, spent, netCash: d.receipts.total - spentTotal,
    outstanding: d.outstanding,
  };
}

// ── Report shapes (pure; rendered + printed by the UI) ──────
export interface ReportLine { label: string; value: number; bold?: boolean; muted?: boolean; }
export interface ReportSection { title: string; lines: ReportLine[]; note?: string; }
export interface Report { kind: string; title: string; period: string; sections: ReportSection[]; banner?: string; }

export function generatePnL(d: MonthlyData): Report {
  const revenue = d.invoices.total;
  const costOfSales = d.vendorBills.total + d.subPayments.total;
  const grossProfit = revenue - costOfSales;
  const opex = d.expensesRecorded.total;
  const payroll = d.payrollRuns.total;
  const netProfit = grossProfit - opex - payroll;
  return {
    kind: "pnl", title: "Profit & Loss (simplified)", period: d.range.label,
    sections: [
      { title: "Revenue", lines: [{ label: "Invoiced (excl. cancelled/voided)", value: revenue, bold: true }] },
      { title: "Cost of sales", lines: [
        { label: "Vendor bills recorded", value: d.vendorBills.total },
        { label: "Subcontractor payments", value: d.subPayments.total },
        { label: "Total cost of sales", value: costOfSales, bold: true },
        { label: "Gross profit", value: grossProfit, bold: true },
      ] },
      { title: "Operating costs", lines: [
        { label: "Operating expenses", value: opex },
        { label: "Payroll (period net)", value: payroll },
        { label: "Net profit", value: netProfit, bold: true },
      ], note: "Simplified period view — mixes recorded bills with cash payments; not GAAP accrual. Confirm treatment with your accountant." },
    ],
  };
}

export function generateCashFlow(d: MonthlyData, openingBalance: number | null): Report {
  const cashIn = d.receipts.total;
  const cashOut = d.vendorPayments.total + d.expensesPaid.total + d.subPayments.total + d.payrollPaid.total;
  const movement = cashIn - cashOut;
  const opening = openingBalance ?? 0;
  return {
    kind: "cashflow", title: "Cash Flow Summary", period: d.range.label,
    sections: [
      { title: "Opening", lines: [{ label: openingBalance === null ? "Opening position (not set)" : "Opening position", value: opening, muted: openingBalance === null }] },
      { title: "Cash in", lines: [{ label: "Customer receipts", value: cashIn, bold: true }] },
      { title: "Cash out", lines: [
        { label: "Vendor payments", value: d.vendorPayments.total },
        { label: "Expenses paid", value: d.expensesPaid.total },
        { label: "Subcontractor payments", value: d.subPayments.total },
        { label: "Payroll paid", value: d.payrollPaid.total },
        { label: "Total cash out", value: cashOut, bold: true },
      ] },
      { title: "Net", lines: [
        { label: "Net movement", value: movement, bold: true },
        { label: "Closing position", value: opening + movement, bold: true },
      ], note: openingBalance === null ? "Opening position not set — provide it from your latest bank reconciliation for an accurate closing figure." : undefined },
    ],
  };
}

export function generateStatusReport(d: MonthlyData): Report {
  const k = getMonthlyKPIs(d);
  return {
    kind: "status", title: "Monthly Status Report", period: d.range.label,
    sections: [
      { title: "Executive summary", lines: [
        { label: "Invoiced", value: k.invoicedTotal },
        { label: "Received", value: k.receivedTotal },
        { label: "Spent", value: k.spentTotal },
        { label: "Net cash movement", value: k.netCash, bold: true },
      ] },
      { title: "Receivables", lines: [
        { label: "Invoices issued", value: d.invoices.total },
        { label: "Customer outstanding", value: d.outstanding.customer, bold: true },
      ] },
      { title: "Payables", lines: [
        { label: "Vendor bills recorded", value: d.vendorBills.total },
        { label: "Vendor outstanding", value: d.outstanding.vendor },
        { label: "Subcontractor outstanding", value: d.outstanding.subcontractor, bold: true },
      ] },
      { title: "Payroll & expenses", lines: [
        { label: "Payroll (period net)", value: d.payrollRuns.total },
        { label: "Operating expenses", value: d.expensesRecorded.total },
      ] },
      { title: "Cash position", lines: [
        { label: "Received", value: k.receivedTotal },
        { label: "Spent", value: k.spentTotal },
        { label: "Net", value: k.netCash, bold: true },
      ] },
    ],
  };
}

export function generateCNLReport(d: MonthlyData): Report {
  const totalPayable = d.outstanding.vendor + d.outstanding.subcontractor;
  const totalReceivable = d.outstanding.customer;
  return {
    kind: "cnl", title: "CNL Report", period: d.range.label,
    banner: "CNL Report — awaiting client format confirmation. Sections below are a best-guess placeholder.",
    sections: [
      { title: "Cash position (estimate)", lines: [
        { label: "Received this month", value: d.receipts.total },
        { label: "Spent this month", value: d.vendorPayments.total + d.expensesPaid.total + d.subPayments.total + d.payrollPaid.total },
      ], note: "Bank balance is an estimate until a bank reconciliation is finalized." },
      { title: "Net liability", lines: [
        { label: "Total payable (vendor + sub)", value: totalPayable },
        { label: "Total receivable (customer)", value: totalReceivable },
        { label: "Net liability (payable − receivable)", value: totalPayable - totalReceivable, bold: true },
      ] },
    ],
  };
}
