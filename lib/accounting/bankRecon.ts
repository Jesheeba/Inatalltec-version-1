// ============================================================
// Accountant module · Phase 7 (Module 10) — Bank Reconciliation
// data layer + CSV parser + auto-match (migration 0056).
//
// ISOLATED + ADDITIVE, client-session (RLS-gated). Statements + their parsed
// lines live in the DB; the uploaded CSV goes to the private 'bank-statements'
// bucket. Auto-match compares statement lines against the cash movements the
// system already recorded (invoice receipts, vendor/expense/sub/payroll
// payments) by signed amount + date proximity.
//
// ⚠️ CSV-FORMAT ASSUMPTIONS (flagged in the report): banks differ wildly. The
// parser detects a header row and maps columns by name (date / description /
// amount, or debit+credit). Dates are read as DD/MM/YYYY (UAE) when ambiguous.
// Validate the parsed preview before saving.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import type { AcctResult } from "./settings";
import { monthRange } from "./monthly";

const BUCKET = "bank-statements";
const MATCH_DATE_TOLERANCE_DAYS = 5;
const pad = (x: number) => String(x).padStart(2, "0");
const n = (v: unknown): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);

export type BankTxnStatus = "unmatched" | "matched" | "ignored";

export interface BankStatement {
  id: string; orgKey: string; statementRef: string; bankName: string | null; accountLabel: string | null;
  periodStart: string | null; periodEnd: string | null; openingBalance: number; closingBalance: number;
  filePath: string | null; fileName: string | null; createdAt: string; updatedAt: string;
}
export interface BankTransaction {
  id: string; statementId: string; txnDate: string; description: string | null; reference: string | null;
  amount: number; status: BankTxnStatus; matchedType: string | null; matchedRef: string | null;
  matchedNote: string | null; matchedAt: string | null; createdAt: string;
}
export interface BankReconciliation {
  id: string; orgKey: string; reconRef: string; periodYear: number; periodMonth: number;
  statementId: string | null; bookBalance: number; bankBalance: number; difference: number;
  status: "draft" | "finalized"; notes: string | null; finalizedAt: string | null; createdAt: string; updatedAt: string;
}
export interface BankReconHistory { id: string; reconciliationId: string; action: string; detail: string | null; changedAt: string; }

const STMT_COLS = "id, org_key, statement_ref, bank_name, account_label, period_start, period_end, opening_balance, closing_balance, file_path, file_name, created_at, updated_at";
const TXN_COLS = "id, statement_id, txn_date, description, reference, amount, status, matched_type, matched_ref, matched_note, matched_at, created_at";
const RECON_COLS = "id, org_key, recon_ref, period_year, period_month, statement_id, book_balance, bank_balance, difference, status, notes, finalized_at, created_at, updated_at";

function rowToStatement(r: Record<string, unknown>): BankStatement {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), statementRef: s(r.statement_ref),
    bankName: sn(r.bank_name), accountLabel: sn(r.account_label),
    periodStart: sn(r.period_start), periodEnd: sn(r.period_end),
    openingBalance: n(r.opening_balance), closingBalance: n(r.closing_balance),
    filePath: sn(r.file_path), fileName: sn(r.file_name), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToTxn(r: Record<string, unknown>): BankTransaction {
  return {
    id: s(r.id), statementId: s(r.statement_id), txnDate: s(r.txn_date), description: sn(r.description),
    reference: sn(r.reference), amount: n(r.amount), status: (r.status as BankTxnStatus) ?? "unmatched",
    matchedType: sn(r.matched_type), matchedRef: sn(r.matched_ref), matchedNote: sn(r.matched_note),
    matchedAt: sn(r.matched_at), createdAt: s(r.created_at),
  };
}
function rowToRecon(r: Record<string, unknown>): BankReconciliation {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), reconRef: s(r.recon_ref),
    periodYear: n(r.period_year), periodMonth: n(r.period_month), statementId: sn(r.statement_id),
    bookBalance: n(r.book_balance), bankBalance: n(r.bank_balance), difference: n(r.difference),
    status: (r.status as "draft" | "finalized") ?? "draft", notes: sn(r.notes),
    finalizedAt: sn(r.finalized_at), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}

// ── CSV parsing ─────────────────────────────────────────────
export interface ParsedTxn { txnDate: string; description: string; reference: string; amount: number; }
export interface ParseResult { ok: boolean; rows: ParsedTxn[]; error?: string; warnings: string[]; }

function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim());
}

function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;                    // assume DD/MM/YYYY (UAE)
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${pad(Number(mm))}-${pad(Number(dd))}`;
  }
  const parsed = Date.parse(t);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let t = raw.replace(/[^\d.\-()]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.replace(/[()]/g, ""); }
  if (t === "" || t === "-" || t === ".") return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return neg ? -Math.abs(v) : v;
}

const findCol = (head: string[], needles: string[]) =>
  head.findIndex(h => needles.some(nd => h.toLowerCase().includes(nd)));

export function parseBankCsv(text: string): ParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length === 0) return { ok: false, rows: [], warnings, error: "The file is empty." };

  const first = parseCsvLine(lines[0]);
  const headerLooksText = first.every(c => parseAmount(c) === null || normalizeDate(c) === null) && first.length > 1;
  let dateIdx = 0, descIdx = 1, amtIdx = 2, refIdx = -1, debitIdx = -1, creditIdx = -1, dataStart = 0;

  if (headerLooksText) {
    dataStart = 1;
    dateIdx = findCol(first, ["date"]);
    descIdx = findCol(first, ["desc", "narrat", "detail", "particular", "remark", "transaction"]);
    refIdx = findCol(first, ["ref", "cheque", "chq"]);
    amtIdx = findCol(first, ["amount", "value"]);
    debitIdx = findCol(first, ["debit", "withdraw"]);
    creditIdx = findCol(first, ["credit", "deposit"]);
    if (dateIdx < 0) dateIdx = 0;
    if (descIdx < 0) descIdx = 1;
  } else {
    warnings.push("No header row detected — assumed columns are Date, Description, Amount.");
  }

  const rows: ParsedTxn[] = [];
  let skipped = 0;
  for (let i = dataStart; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const txnDate = normalizeDate(c[dateIdx] ?? "");
    let amount: number | null = null;
    if (amtIdx >= 0 && c[amtIdx] !== undefined && c[amtIdx] !== "") amount = parseAmount(c[amtIdx]);
    if (amount === null && (debitIdx >= 0 || creditIdx >= 0)) {
      const dr = debitIdx >= 0 ? parseAmount(c[debitIdx] ?? "") : null;
      const cr = creditIdx >= 0 ? parseAmount(c[creditIdx] ?? "") : null;
      if (dr || cr) amount = (Math.abs(cr ?? 0)) - (Math.abs(dr ?? 0));   // credit in, debit out
    }
    if (!txnDate || amount === null) { skipped++; continue; }
    rows.push({
      txnDate,
      description: (c[descIdx] ?? "").slice(0, 300),
      reference: refIdx >= 0 ? (c[refIdx] ?? "").slice(0, 120) : "",
      amount,
    });
  }
  if (skipped > 0) warnings.push(`${skipped} row(s) skipped (unreadable date or amount).`);
  if (rows.length === 0) return { ok: false, rows, warnings, error: "No usable transaction rows were found. Check the CSV columns." };
  return { ok: true, rows, warnings };
}

// ── Fetch ───────────────────────────────────────────────────
export async function fetchBankStatements(): Promise<AcctResult<BankStatement[]>> {
  const { data, error } = await supabaseBrowser().from("bank_statements").select(STMT_COLS).order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToStatement(r as Record<string, unknown>)) };
}

export interface StatementDetail { statement: BankStatement; transactions: BankTransaction[]; }
export async function fetchStatementDetail(id: string): Promise<AcctResult<StatementDetail>> {
  const sb = supabaseBrowser();
  const { data: st, error: stErr } = await sb.from("bank_statements").select(STMT_COLS).eq("id", id).maybeSingle();
  if (stErr) return { ok: false, error: stErr.message };
  if (!st) return { ok: false, error: "Statement not found." };
  const { data: txns, error: txErr } = await sb.from("bank_transactions").select(TXN_COLS).eq("statement_id", id).order("txn_date", { ascending: true });
  if (txErr) return { ok: false, error: txErr.message };
  return { ok: true, data: { statement: rowToStatement(st as Record<string, unknown>), transactions: (txns ?? []).map(r => rowToTxn(r as Record<string, unknown>)) } };
}

export async function getStatementUrl(path: string): Promise<AcctResult<string>> {
  const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 120);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message || "Could not open the file." };
  return { ok: true, data: data.signedUrl };
}

// ── Create statement from an uploaded CSV ───────────────────
export interface StatementInput { bankName?: string; accountLabel?: string; periodStart?: string; periodEnd?: string; openingBalance?: number; closingBalance?: number; }

export async function createStatementFromCsv(input: StatementInput, file: File, createdBy: string | null): Promise<AcctResult<{ statement: BankStatement; imported: number; warnings: string[] }>> {
  if (!file) return { ok: false, error: "Choose a CSV file." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File is over the 10 MB limit." };
  const text = await file.text();
  const parsed = parseBankCsv(text);
  if (!parsed.ok) return { ok: false, error: parsed.error ?? "Could not parse the CSV." };

  const sb = supabaseBrowser();
  // Upload the original CSV.
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "statement.csv";
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `bank/${rand}-${safe}`;
  const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "text/csv", upsert: false });
  const filePath = up.error ? null : path;          // upload failure isn't fatal — keep the parsed rows

  // Derive period from rows if not supplied.
  const dates = parsed.rows.map(r => r.txnDate).sort();
  const periodStart = input.periodStart || dates[0] || null;
  const periodEnd = input.periodEnd || dates[dates.length - 1] || null;

  const { data: stmt, error: stErr } = await sb.from("bank_statements").insert({
    bank_name: input.bankName?.trim() || null, account_label: input.accountLabel?.trim() || null,
    period_start: periodStart, period_end: periodEnd,
    opening_balance: n(input.openingBalance), closing_balance: n(input.closingBalance),
    file_path: filePath, file_name: file.name.slice(0, 200), created_by: createdBy,
  }).select(STMT_COLS).single();
  if (stErr || !stmt) {
    if (filePath) await sb.storage.from(BUCKET).remove([filePath]);
    return { ok: false, error: stErr?.message || "Failed to create the statement." };
  }
  const statement = rowToStatement(stmt as Record<string, unknown>);

  const txnRows = parsed.rows.map(r => ({
    statement_id: statement.id, txn_date: r.txnDate, description: r.description || null,
    reference: r.reference || null, amount: r.amount,
  }));
  const { error: txErr } = await sb.from("bank_transactions").insert(txnRows);
  if (txErr) return { ok: false, error: `Statement saved but transactions failed: ${txErr.message}` };

  return { ok: true, data: { statement, imported: txnRows.length, warnings: parsed.warnings } };
}

export async function deleteStatement(id: string): Promise<AcctResult<true>> {
  const sb = supabaseBrowser();
  const { data: st } = await sb.from("bank_statements").select("file_path").eq("id", id).maybeSingle();
  const { error } = await sb.from("bank_statements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  const path = (st as Record<string, unknown> | null)?.file_path as string | undefined;
  if (path) await sb.storage.from(BUCKET).remove([path]);
  return { ok: true, data: true };
}

// ── Auto-match against recorded cash movements ──────────────
interface Candidate { amount: number; date: string; label: string; type: string; used: boolean; }

export async function autoMatchStatement(statementId: string, actorId: string | null): Promise<AcctResult<number>> {
  const detail = await fetchStatementDetail(statementId);
  if (!detail.ok) return detail;
  const { statement, transactions } = detail.data;
  const unmatched = transactions.filter(t => t.status === "unmatched");
  if (unmatched.length === 0) return { ok: true, data: 0 };

  // Candidate window around the statement period.
  const dates = transactions.map(t => t.txnDate).sort();
  const lo = shiftDate(statement.periodStart || dates[0], -MATCH_DATE_TOLERANCE_DAYS);
  const hi = shiftDate(statement.periodEnd || dates[dates.length - 1], MATCH_DATE_TOLERANCE_DAYS);
  const sb = supabaseBrowser();

  const [recv, vpay, exp, sub, pay] = await Promise.all([
    sb.from("invoice_payments").select("amount, received_at, invoice_id").gte("received_at", lo).lte("received_at", hi),
    sb.from("vendor_bill_payments").select("amount, paid_at, bill_id").gte("paid_at", lo).lte("paid_at", hi),
    sb.from("expenses").select("total, paid_date, expense_number").eq("status", "paid").gte("paid_date", lo).lte("paid_date", hi),
    sb.from("sub_contractor_payments").select("amount, payment_date").gte("payment_date", lo).lte("payment_date", hi),
    sb.from("payroll_runs").select("total_net, payment_date, run_code").eq("status", "paid").gte("payment_date", lo).lte("payment_date", hi),
  ]);

  const candidates: Candidate[] = [];
  for (const r of (recv.data ?? []) as Record<string, unknown>[]) candidates.push({ amount: n(r.amount), date: s(r.received_at), label: "Customer receipt", type: "invoice_payment", used: false });
  for (const r of (vpay.data ?? []) as Record<string, unknown>[]) candidates.push({ amount: -Math.abs(n(r.amount)), date: s(r.paid_at), label: "Vendor payment", type: "vendor_payment", used: false });
  for (const r of (exp.data ?? []) as Record<string, unknown>[]) candidates.push({ amount: -Math.abs(n(r.total)), date: s(r.paid_date), label: `Expense ${s(r.expense_number)}`, type: "expense", used: false });
  for (const r of (sub.data ?? []) as Record<string, unknown>[]) candidates.push({ amount: -Math.abs(n(r.amount)), date: s(r.payment_date), label: "Subcontractor payment", type: "sub_payment", used: false });
  for (const r of (pay.data ?? []) as Record<string, unknown>[]) candidates.push({ amount: -Math.abs(n(r.total_net)), date: s(r.payment_date), label: `Payroll ${s(r.run_code)}`, type: "payroll", used: false });

  let matched = 0;
  for (const t of unmatched) {
    const cand = candidates.find(c => !c.used && sameSign(c.amount, t.amount) && Math.abs(Math.abs(c.amount) - Math.abs(t.amount)) < 0.01 && withinDays(c.date, t.txnDate, MATCH_DATE_TOLERANCE_DAYS));
    if (!cand) continue;
    cand.used = true;
    const { error } = await sb.from("bank_transactions").update({
      status: "matched", matched_type: cand.type, matched_ref: cand.label, matched_at: new Date().toISOString(), matched_by: actorId,
    }).eq("id", t.id).eq("status", "unmatched");
    if (!error) matched++;
  }
  return { ok: true, data: matched };
}

export async function setTransactionMatch(txnId: string, patch: { status: BankTxnStatus; matchedNote?: string; matchedRef?: string }, actorId: string | null): Promise<AcctResult<BankTransaction>> {
  const body: Record<string, unknown> = { status: patch.status };
  if (patch.status === "matched") {
    body.matched_type = "manual"; body.matched_ref = patch.matchedRef?.trim() || "Manual match";
    body.matched_note = patch.matchedNote?.trim() || null; body.matched_at = new Date().toISOString(); body.matched_by = actorId;
  } else if (patch.status === "unmatched") {
    body.matched_type = null; body.matched_ref = null; body.matched_note = null; body.matched_at = null; body.matched_by = null;
  } else {
    body.matched_note = patch.matchedNote?.trim() || null;
  }
  const { data, error } = await supabaseBrowser().from("bank_transactions").update(body).eq("id", txnId).select(TXN_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update the line." };
  return { ok: true, data: rowToTxn(data as Record<string, unknown>) };
}

export interface ReconSummary { matched: number; unmatched: number; ignored: number; inflow: number; outflow: number; net: number; unmatchedTotal: number; }
export function summarizeTransactions(txns: BankTransaction[]): ReconSummary {
  let matched = 0, unmatched = 0, ignored = 0, inflow = 0, outflow = 0, unmatchedTotal = 0;
  for (const t of txns) {
    if (t.status === "matched") matched++; else if (t.status === "ignored") ignored++; else { unmatched++; unmatchedTotal += t.amount; }
    if (t.amount >= 0) inflow += t.amount; else outflow += t.amount;
  }
  return { matched, unmatched, ignored, inflow, outflow, net: inflow + outflow, unmatchedTotal };
}

// ── Reconciliation close-out ────────────────────────────────
export async function fetchReconciliations(): Promise<AcctResult<BankReconciliation[]>> {
  const { data, error } = await supabaseBrowser().from("bank_reconciliations").select(RECON_COLS).order("period_year", { ascending: false }).order("period_month", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToRecon(r as Record<string, unknown>)) };
}

export interface ReconInput { periodYear: number; periodMonth: number; statementId?: string | null; bookBalance: number; bankBalance: number; notes?: string; }
export async function createReconciliation(input: ReconInput, createdBy: string | null): Promise<AcctResult<BankReconciliation>> {
  const { data, error } = await supabaseBrowser().from("bank_reconciliations").insert({
    period_year: input.periodYear, period_month: input.periodMonth, statement_id: input.statementId || null,
    book_balance: n(input.bookBalance), bank_balance: n(input.bankBalance), notes: input.notes?.trim() || null, created_by: createdBy,
  }).select(RECON_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to create the reconciliation." };
  return { ok: true, data: rowToRecon(data as Record<string, unknown>) };
}

export async function finalizeReconciliation(id: string, actorId: string | null): Promise<AcctResult<BankReconciliation>> {
  const { data, error } = await supabaseBrowser().from("bank_reconciliations")
    .update({ status: "finalized", finalized_by: actorId, finalized_at: new Date().toISOString(), last_action_by: actorId })
    .eq("id", id).eq("status", "draft").select(RECON_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only a draft reconciliation can be finalized." };
  return { ok: true, data: rowToRecon(data as Record<string, unknown>) };
}

// ── date helpers ────────────────────────────────────────────
function shiftDate(iso: string | null, days: number): string {
  const base = iso || monthRange(new Date().getFullYear(), new Date().getMonth() + 1).start;
  const d = new Date(base + "T00:00:00"); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function withinDays(a: string, b: string, days: number): boolean {
  const da = Date.parse(a + "T00:00:00"), db = Date.parse(b + "T00:00:00");
  if (!Number.isFinite(da) || !Number.isFinite(db)) return false;
  return Math.abs(da - db) <= days * 86400000;
}
const sameSign = (a: number, b: number) => (a >= 0 && b >= 0) || (a < 0 && b < 0);
