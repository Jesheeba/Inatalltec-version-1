// ============================================================
// Accountant module · Phase 4 (Slice 4C-1) — Payroll Runs data layer
// (migration 0053).
//
// ISOLATED + ADDITIVE: self-contained, client-session (RLS-gated) access —
// touches none of the shared hydrate/db/app-context mirrors, like the rest of
// lib/accounting/*. RLS restricts every table here to admin/md/accounts.
//
// Workflow: createPayrollRun → seedPayrollLines (snapshots active staff) →
// updatePayrollLine (overtime/bonus/deductions, draft-only) → approve →
// buildWpsForRun (WPS file) → markPayrollRunPaid (writes salary_payments).
//
// ⚠️  This layer stores ENTERED amounts and does only arithmetic the DB
// generates (gross/net). It applies NO UAE statutory calculation — overtime
// multipliers, GPSSA pension, gratuity are all out of scope. See 0053 and
// wps.ts for the full list of flagged assumptions.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import type { AcctResult } from "./settings";
import { buildWpsSif, type WpsEmployer, type WpsBuildResult } from "./wps";

export type PayrollRunStatus = "draft" | "approved" | "paid" | "cancelled";

export const PAYROLL_RUN_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  paid: "Paid",
  cancelled: "Cancelled",
};

// Who gets a line when a run is seeded: everyone CURRENTLY EMPLOYED, i.e.
// active + probation + on-leave. Resigned/terminated are excluded (their final
// settlement is separation handling, Slice 4E).
// ⚠️ ASSUMPTION: probation and paid-leave staff ARE included by default. The
// scope said "active employees"; confirm whether probation/on-leave should be
// auto-seeded or added by hand.
export const PAYABLE_EMPLOYEE_STATUSES = ["active", "probation", "on_leave"] as const;

export interface PayrollRun {
  id: string;
  orgKey: string;
  runCode: string;
  periodYear: number;
  periodMonth: number;
  periodStart: string | null;
  periodEnd: string | null;
  status: PayrollRunStatus;
  totalGross: number;
  totalAdditions: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  paymentDate: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollLine {
  id: string;
  runId: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  overtimeAmount: number;
  bonusAmount: number;
  otherAdditions: number;
  deductions: number;
  grossSalary: number;     // generated
  additionsTotal: number;  // generated
  netPay: number;          // generated
  emiratesId: string | null;
  iban: string | null;
  bankAccount: string | null;
  daysInPeriod: number | null;
  leaveDays: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryPayment {
  id: string;
  runId: string;
  lineId: string | null;
  employeeId: string | null;
  amount: number;
  paymentDate: string;
  method: string | null;
  reference: string | null;
  paidBy: string | null;
  createdAt: string;
}

export interface PayrollRunHistory {
  id: string;
  runId: string;
  action: string;
  detail: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface PayrollRunDetail {
  run: PayrollRun;
  lines: PayrollLine[];
  payments: SalaryPayment[];
  history: PayrollRunHistory[];
}

const RUN_COLS =
  "id, org_key, run_code, period_year, period_month, period_start, period_end, status, total_gross, total_additions, total_deductions, total_net, employee_count, notes, approved_by, approved_at, paid_by, paid_at, payment_date, created_by, created_at, updated_at";
const LINE_COLS =
  "id, run_id, employee_id, employee_code, employee_name, basic_salary, housing_allowance, transport_allowance, other_allowances, overtime_amount, bonus_amount, other_additions, deductions, gross_salary, additions_total, net_pay, emirates_id, iban, bank_account, days_in_period, leave_days, notes, created_at, updated_at";
const PAYMENT_COLS =
  "id, run_id, line_id, employee_id, amount, payment_date, method, reference, paid_by, created_at";
const HISTORY_COLS = "id, run_id, action, detail, changed_by, changed_at";

const n = (v: unknown, dflt = 0): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : dflt; };
const ni = (v: unknown): number | null => { if (v === null || v === undefined) return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);

function rowToRun(r: Record<string, unknown>): PayrollRun {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), runCode: s(r.run_code),
    periodYear: n(r.period_year), periodMonth: n(r.period_month),
    periodStart: sn(r.period_start), periodEnd: sn(r.period_end),
    status: (r.status as PayrollRunStatus) ?? "draft",
    totalGross: n(r.total_gross), totalAdditions: n(r.total_additions),
    totalDeductions: n(r.total_deductions), totalNet: n(r.total_net),
    employeeCount: n(r.employee_count), notes: sn(r.notes),
    approvedBy: sn(r.approved_by), approvedAt: sn(r.approved_at),
    paidBy: sn(r.paid_by), paidAt: sn(r.paid_at), paymentDate: sn(r.payment_date),
    createdBy: sn(r.created_by), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}

function rowToLine(r: Record<string, unknown>): PayrollLine {
  return {
    id: s(r.id), runId: s(r.run_id), employeeId: s(r.employee_id),
    employeeCode: sn(r.employee_code), employeeName: s(r.employee_name),
    basicSalary: n(r.basic_salary), housingAllowance: n(r.housing_allowance),
    transportAllowance: n(r.transport_allowance), otherAllowances: n(r.other_allowances),
    overtimeAmount: n(r.overtime_amount), bonusAmount: n(r.bonus_amount),
    otherAdditions: n(r.other_additions), deductions: n(r.deductions),
    grossSalary: n(r.gross_salary), additionsTotal: n(r.additions_total), netPay: n(r.net_pay),
    emiratesId: sn(r.emirates_id), iban: sn(r.iban), bankAccount: sn(r.bank_account),
    daysInPeriod: ni(r.days_in_period), leaveDays: n(r.leave_days), notes: sn(r.notes),
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}

function rowToPayment(r: Record<string, unknown>): SalaryPayment {
  return {
    id: s(r.id), runId: s(r.run_id), lineId: sn(r.line_id), employeeId: sn(r.employee_id),
    amount: n(r.amount), paymentDate: s(r.payment_date), method: sn(r.method),
    reference: sn(r.reference), paidBy: sn(r.paid_by), createdAt: s(r.created_at),
  };
}

function rowToHistory(r: Record<string, unknown>): PayrollRunHistory {
  return {
    id: s(r.id), runId: s(r.run_id), action: s(r.action), detail: sn(r.detail),
    changedBy: sn(r.changed_by), changedAt: s(r.changed_at),
  };
}

// ── Fetch ───────────────────────────────────────────────────
export interface PayrollRunFilter { status?: PayrollRunStatus; year?: number; }

export async function fetchPayrollRuns(filter?: PayrollRunFilter): Promise<AcctResult<PayrollRun[]>> {
  let q = supabaseBrowser().from("payroll_runs").select(RUN_COLS)
    .order("period_year", { ascending: false }).order("period_month", { ascending: false });
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.year) q = q.eq("period_year", filter.year);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToRun(r as Record<string, unknown>)) };
}

export async function fetchPayrollRunDetail(id: string): Promise<AcctResult<PayrollRunDetail>> {
  const sb = supabaseBrowser();
  const { data: runRow, error: runErr } = await sb.from("payroll_runs").select(RUN_COLS).eq("id", id).maybeSingle();
  if (runErr) return { ok: false, error: runErr.message };
  if (!runRow) return { ok: false, error: "Payroll run not found." };

  const [linesRes, paysRes, histRes] = await Promise.all([
    sb.from("payroll_lines").select(LINE_COLS).eq("run_id", id).order("employee_name", { ascending: true }),
    sb.from("salary_payments").select(PAYMENT_COLS).eq("run_id", id).order("created_at", { ascending: true }),
    sb.from("payroll_run_history").select(HISTORY_COLS).eq("run_id", id).order("changed_at", { ascending: false }),
  ]);
  if (linesRes.error) return { ok: false, error: linesRes.error.message };
  if (paysRes.error) return { ok: false, error: paysRes.error.message };
  if (histRes.error) return { ok: false, error: histRes.error.message };

  return {
    ok: true,
    data: {
      run: rowToRun(runRow as Record<string, unknown>),
      lines: (linesRes.data ?? []).map(r => rowToLine(r as Record<string, unknown>)),
      payments: (paysRes.data ?? []).map(r => rowToPayment(r as Record<string, unknown>)),
      history: (histRes.data ?? []).map(r => rowToHistory(r as Record<string, unknown>)),
    },
  };
}

// ── Create ──────────────────────────────────────────────────
export interface PayrollRunInput {
  periodYear: number;
  periodMonth: number;       // 1–12
  periodStart?: string | null;
  periodEnd?: string | null;
  notes?: string;
}

export async function createPayrollRun(input: PayrollRunInput, createdBy: string | null): Promise<AcctResult<PayrollRun>> {
  if (!(input.periodMonth >= 1 && input.periodMonth <= 12)) return { ok: false, error: "Choose a month between 1 and 12." };
  if (!(input.periodYear >= 2000 && input.periodYear <= 2100)) return { ok: false, error: "Enter a valid year." };
  const body: Record<string, unknown> = {
    period_year: input.periodYear, period_month: input.periodMonth, created_by: createdBy,
  };
  if (input.periodStart) body.period_start = input.periodStart;
  if (input.periodEnd) body.period_end = input.periodEnd;
  if (input.notes?.trim()) body.notes = input.notes.trim();

  const { data, error } = await supabaseBrowser().from("payroll_runs").insert(body).select(RUN_COLS).single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "A payroll run already exists for that month." };
    return { ok: false, error: error?.message || "Failed to create payroll run." };
  }
  return { ok: true, data: rowToRun(data as Record<string, unknown>) };
}

// ── Seed lines from currently-employed staff (draft-only) ───
// Idempotent: only inserts employees not already on the run, so existing
// adjustments are never wiped. Returns the number of new lines added.
export async function seedPayrollLines(runId: string, actorId: string | null): Promise<AcctResult<number>> {
  const sb = supabaseBrowser();
  const { data: runRow, error: runErr } = await sb.from("payroll_runs")
    .select("id, status, period_start, period_end").eq("id", runId).maybeSingle();
  if (runErr) return { ok: false, error: runErr.message };
  if (!runRow) return { ok: false, error: "Payroll run not found." };
  if ((runRow as Record<string, unknown>).status !== "draft") return { ok: false, error: "Lines can only be seeded on a draft run." };

  const { data: emps, error: empErr } = await sb.from("employees")
    .select("id, employee_code, name, basic_salary, housing_allowance, transport_allowance, other_allowances, emirates_id, iban, bank_account")
    .in("status", PAYABLE_EMPLOYEE_STATUSES as unknown as string[]);
  if (empErr) return { ok: false, error: empErr.message };
  if (!emps || emps.length === 0) return { ok: false, error: "No active employees to seed." };

  const { data: existing, error: exErr } = await sb.from("payroll_lines").select("employee_id").eq("run_id", runId);
  if (exErr) return { ok: false, error: exErr.message };
  const seen = new Set((existing ?? []).map(r => (r as Record<string, unknown>).employee_id as string));

  // Default days_in_period from the run's period span (inclusive). Captured
  // for WPS only — never used to auto-prorate pay.
  const ps = (runRow as Record<string, unknown>).period_start as string | null;
  const pe = (runRow as Record<string, unknown>).period_end as string | null;
  let days: number | null = null;
  if (ps && pe) {
    const dms = Date.parse(pe) - Date.parse(ps);
    if (Number.isFinite(dms)) days = Math.round(dms / 86400000) + 1;
  }

  const rows = (emps as Record<string, unknown>[])
    .filter(e => !seen.has(e.id as string))
    .map(e => ({
      run_id: runId,
      employee_id: e.id,
      employee_code: e.employee_code ?? null,
      employee_name: e.name,
      basic_salary: n(e.basic_salary),
      housing_allowance: n(e.housing_allowance),
      transport_allowance: n(e.transport_allowance),
      other_allowances: n(e.other_allowances),
      emirates_id: e.emirates_id ?? null,
      iban: e.iban ?? null,
      bank_account: e.bank_account ?? null,
      days_in_period: days,
    }));

  if (rows.length === 0) return { ok: true, data: 0 };

  const { error: insErr } = await sb.from("payroll_lines").insert(rows);
  if (insErr) return { ok: false, error: insErr.message };

  // Stamp actor on the run (keeps last_action_by honest; totals are updated by
  // the recalc trigger that fired on the inserts).
  await sb.from("payroll_runs").update({ last_action_by: actorId }).eq("id", runId);
  return { ok: true, data: rows.length };
}

// ── Adjust a line (draft-only) ──────────────────────────────
export interface PayrollLinePatch {
  overtimeAmount?: number;
  bonusAmount?: number;
  otherAdditions?: number;
  deductions?: number;
  daysInPeriod?: number | null;
  leaveDays?: number;
  notes?: string;
}

export async function updatePayrollLine(lineId: string, patch: PayrollLinePatch): Promise<AcctResult<PayrollLine>> {
  const sb = supabaseBrowser();
  const { data: lineRow, error: lErr } = await sb.from("payroll_lines").select("id, run_id").eq("id", lineId).maybeSingle();
  if (lErr) return { ok: false, error: lErr.message };
  if (!lineRow) return { ok: false, error: "Line not found." };
  const runId = (lineRow as Record<string, unknown>).run_id as string;

  const { data: runRow, error: rErr } = await sb.from("payroll_runs").select("status").eq("id", runId).maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if ((runRow as Record<string, unknown> | null)?.status !== "draft") {
    return { ok: false, error: "Lines can only be edited while the run is a draft." };
  }

  const body: Record<string, unknown> = {};
  const setNum = (k: string, v: number | undefined) => { if (v !== undefined) body[k] = Math.max(0, n(v)); };
  setNum("overtime_amount", patch.overtimeAmount);
  setNum("bonus_amount", patch.bonusAmount);
  setNum("other_additions", patch.otherAdditions);
  setNum("deductions", patch.deductions);
  setNum("leave_days", patch.leaveDays);
  if (patch.daysInPeriod !== undefined) body.days_in_period = patch.daysInPeriod === null ? null : Math.max(0, n(patch.daysInPeriod));
  if (patch.notes !== undefined) body.notes = patch.notes.trim() || null;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };

  const { data, error } = await sb.from("payroll_lines").update(body).eq("id", lineId).select(LINE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update line." };
  return { ok: true, data: rowToLine(data as Record<string, unknown>) };
}

export async function deletePayrollLine(lineId: string): Promise<AcctResult<true>> {
  const sb = supabaseBrowser();
  const { data: lineRow, error: lErr } = await sb.from("payroll_lines").select("id, run_id").eq("id", lineId).maybeSingle();
  if (lErr) return { ok: false, error: lErr.message };
  if (!lineRow) return { ok: false, error: "Line not found." };
  const runId = (lineRow as Record<string, unknown>).run_id as string;
  const { data: runRow } = await sb.from("payroll_runs").select("status").eq("id", runId).maybeSingle();
  if ((runRow as Record<string, unknown> | null)?.status !== "draft") {
    return { ok: false, error: "Lines can only be removed while the run is a draft." };
  }
  const { error } = await sb.from("payroll_lines").delete().eq("id", lineId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: true };
}

// ── Status workflow (optimistic from-state guards) ──────────
export async function approvePayrollRun(runId: string, actorId: string | null): Promise<AcctResult<PayrollRun>> {
  const sb = supabaseBrowser();
  const { data: runRow } = await sb.from("payroll_runs").select("employee_count").eq("id", runId).maybeSingle();
  if (((runRow as Record<string, unknown> | null)?.employee_count ?? 0) === 0) {
    return { ok: false, error: "Seed at least one employee line before approving." };
  }
  const { data, error } = await sb.from("payroll_runs")
    .update({ status: "approved", approved_by: actorId, approved_at: new Date().toISOString(), last_action_by: actorId })
    .eq("id", runId).eq("status", "draft").select(RUN_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Run is no longer a draft — refresh and retry." };
  return { ok: true, data: rowToRun(data as Record<string, unknown>) };
}

export async function reopenPayrollRun(runId: string, actorId: string | null): Promise<AcctResult<PayrollRun>> {
  const { data, error } = await supabaseBrowser().from("payroll_runs")
    .update({ status: "draft", approved_by: null, approved_at: null, last_action_by: actorId })
    .eq("id", runId).eq("status", "approved").select(RUN_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only an approved (unpaid) run can be reopened." };
  return { ok: true, data: rowToRun(data as Record<string, unknown>) };
}

export interface PayrollPaymentInput { paymentDate: string; method?: string; reference?: string; }

// Mark an approved run paid: write one salary_payments row per line, then flip
// the status (guarded). On a lost race the just-written payments are rolled back.
export async function markPayrollRunPaid(
  runId: string, input: PayrollPaymentInput, actorId: string | null,
): Promise<AcctResult<PayrollRun>> {
  const sb = supabaseBrowser();
  if (!input.paymentDate) return { ok: false, error: "Enter the payment date." };

  const { data: runRow, error: rErr } = await sb.from("payroll_runs").select("status").eq("id", runId).maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if ((runRow as Record<string, unknown> | null)?.status !== "approved") {
    return { ok: false, error: "Only an approved run can be marked paid." };
  }

  const { data: lines, error: lErr } = await sb.from("payroll_lines").select("id, employee_id, net_pay").eq("run_id", runId);
  if (lErr) return { ok: false, error: lErr.message };
  if (!lines || lines.length === 0) return { ok: false, error: "This run has no lines." };

  const payRows = (lines as Record<string, unknown>[]).map(l => ({
    run_id: runId, line_id: l.id, employee_id: l.employee_id, amount: n(l.net_pay),
    payment_date: input.paymentDate, method: input.method?.trim() || null,
    reference: input.reference?.trim() || null, paid_by: actorId,
  }));
  const { error: payErr } = await sb.from("salary_payments").insert(payRows);
  if (payErr) return { ok: false, error: payErr.message };

  const { data, error } = await sb.from("payroll_runs")
    .update({ status: "paid", paid_by: actorId, paid_at: new Date().toISOString(),
              payment_date: input.paymentDate, last_action_by: actorId })
    .eq("id", runId).eq("status", "approved").select(RUN_COLS).maybeSingle();
  if (error || !data) {
    // Roll back the payment rows we just wrote so a non-paid run never carries them.
    await sb.from("salary_payments").delete().eq("run_id", runId);
    return { ok: false, error: error?.message || "Run is no longer approved — refresh and retry." };
  }
  return { ok: true, data: rowToRun(data as Record<string, unknown>) };
}

export async function cancelPayrollRun(runId: string, actorId: string | null): Promise<AcctResult<PayrollRun>> {
  const { data, error } = await supabaseBrowser().from("payroll_runs")
    .update({ status: "cancelled", last_action_by: actorId })
    .eq("id", runId).in("status", ["draft", "approved"]).select(RUN_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "A paid run cannot be cancelled." };
  return { ok: true, data: rowToRun(data as Record<string, unknown>) };
}

// ── WPS file ────────────────────────────────────────────────
// Maps a run's snapshot lines onto the WPS builder. Employer identifiers are
// supplied by the caller (not stored in app settings yet — see wps.ts flags).
export function buildWpsForRun(run: PayrollRun, lines: PayrollLine[], employer: WpsEmployer): WpsBuildResult {
  return buildWpsSif({
    employer,
    salaryYear: run.periodYear,
    salaryMonth: run.periodMonth,
    periodStart: run.periodStart ?? "",
    periodEnd: run.periodEnd ?? "",
    lines: lines.map(l => ({
      personId: l.emiratesId,          // placeholder for MOL labour-card no
      agentId: null,                   // employee bank routing not stored
      iban: l.iban,
      fixedIncome: l.grossSalary,
      variableIncome: l.additionsTotal,
      netSalary: l.netPay,
      daysInPeriod: l.daysInPeriod,
      leaveDays: l.leaveDays,
      employeeName: l.employeeName,
    })),
  });
}
