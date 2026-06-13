// ============================================================
// Accountant module · Phase 5 (Module 8) — Expenses data layer
// (migration 0055).
//
// ISOLATED + ADDITIVE: self-contained, client-session (RLS-gated) access,
// like the rest of lib/accounting/*. Receipts live in the private
// 'expense-receipts' bucket; categories + approval threshold + payment
// methods are config (accounting_lookups / accounting_settings).
//
// Workflow: createExpense (draft, receipt required) → submitExpense (≤ threshold
// auto-approves, else pending_approval) → approve/reject → markExpensePaid.
// Recurring templates generate draft expenses when due (receipt attached later).
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import type { AcctResult } from "./settings";
import { fetchAccountingSettings } from "./settings";

const EXPENSE_BUCKET = "expense-receipts";
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;     // 10 MB
const RECEIPT_OK = /^(image\/|application\/pdf)/i;

export type ExpenseStatus = "draft" | "pending_approval" | "approved" | "paid" | "rejected";

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

export interface Expense {
  id: string;
  orgKey: string;
  expenseNumber: string;
  expenseDate: string;
  categoryCode: string | null;
  vendorId: string | null;
  description: string;
  amount: number;
  vatIncluded: boolean;
  vatAmount: number;
  total: number;            // generated
  receiptPath: string | null;
  receiptName: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paidDate: string | null;
  status: ExpenseStatus;
  rejectionReason: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseHistory {
  id: string; expenseId: string; action: string; detail: string | null;
  changedBy: string | null; changedAt: string;
}

export type RecurringFrequency = "monthly" | "quarterly";

export interface RecurringExpense {
  id: string;
  orgKey: string;
  categoryCode: string | null;
  vendorId: string | null;
  description: string;
  baseAmount: number;
  vatIncluded: boolean;
  frequency: RecurringFrequency;
  nextDueDate: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const EXPENSE_COLS =
  "id, org_key, expense_number, expense_date, category_code, vendor_id, description, amount, vat_included, vat_amount, total, receipt_path, receipt_name, payment_method, payment_reference, paid_date, status, rejection_reason, notes, created_by, created_at, updated_at";
const HISTORY_COLS = "id, expense_id, action, detail, changed_by, changed_at";
const RECURRING_COLS =
  "id, org_key, category_code, vendor_id, description, base_amount, vat_included, frequency, next_due_date, is_active, notes, created_at, updated_at";

const n = (v: unknown, dflt = 0): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : dflt; };
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);
const b = (v: unknown): boolean => v === true;

function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), expenseNumber: s(r.expense_number),
    expenseDate: s(r.expense_date), categoryCode: sn(r.category_code), vendorId: sn(r.vendor_id),
    description: s(r.description), amount: n(r.amount), vatIncluded: b(r.vat_included),
    vatAmount: n(r.vat_amount), total: n(r.total),
    receiptPath: sn(r.receipt_path), receiptName: sn(r.receipt_name),
    paymentMethod: sn(r.payment_method), paymentReference: sn(r.payment_reference),
    paidDate: sn(r.paid_date), status: (r.status as ExpenseStatus) ?? "draft",
    rejectionReason: sn(r.rejection_reason), notes: sn(r.notes),
    createdBy: sn(r.created_by), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToHistory(r: Record<string, unknown>): ExpenseHistory {
  return {
    id: s(r.id), expenseId: s(r.expense_id), action: s(r.action), detail: sn(r.detail),
    changedBy: sn(r.changed_by), changedAt: s(r.changed_at),
  };
}
function rowToRecurring(r: Record<string, unknown>): RecurringExpense {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), categoryCode: sn(r.category_code),
    vendorId: sn(r.vendor_id), description: s(r.description), baseAmount: n(r.base_amount),
    vatIncluded: b(r.vat_included), frequency: (r.frequency as RecurringFrequency) ?? "monthly",
    nextDueDate: s(r.next_due_date), isActive: r.is_active !== false, notes: sn(r.notes),
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}

// ── Fetch ───────────────────────────────────────────────────
export interface ExpenseFilter {
  status?: ExpenseStatus; categoryCode?: string; vendorId?: string; from?: string; to?: string;
}

export async function fetchExpenses(filter?: ExpenseFilter): Promise<AcctResult<Expense[]>> {
  let q = supabaseBrowser().from("expenses").select(EXPENSE_COLS).order("expense_date", { ascending: false });
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.categoryCode) q = q.eq("category_code", filter.categoryCode);
  if (filter?.vendorId) q = q.eq("vendor_id", filter.vendorId);
  if (filter?.from) q = q.gte("expense_date", filter.from);
  if (filter?.to) q = q.lte("expense_date", filter.to);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToExpense(r as Record<string, unknown>)) };
}

export async function fetchExpenseHistory(expenseId: string): Promise<AcctResult<ExpenseHistory[]>> {
  const { data, error } = await supabaseBrowser().from("expense_history")
    .select(HISTORY_COLS).eq("expense_id", expenseId).order("changed_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToHistory(r as Record<string, unknown>)) };
}

// ── Receipt upload (private bucket) ─────────────────────────
function validateReceipt(file: File): string | null {
  if (!file) return "A receipt is required.";
  if (file.size > RECEIPT_MAX_BYTES) return `Receipt is over the 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  if (!RECEIPT_OK.test(file.type || "")) return "Receipt must be an image or a PDF.";
  return null;
}

async function uploadReceipt(file: File): Promise<{ ok: true; path: string; name: string } | { ok: false; error: string }> {
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "receipt";
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `expense/${rand}-${safe}`;
  const { error } = await supabaseBrowser().storage.from(EXPENSE_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) return { ok: false, error: `Receipt upload failed: ${error.message}` };
  return { ok: true, path, name: file.name.slice(0, 200) };
}

export async function getReceiptUrl(path: string, expiresInSeconds = 120): Promise<AcctResult<string>> {
  if (!path) return { ok: false, error: "No receipt on file." };
  const { data, error } = await supabaseBrowser().storage.from(EXPENSE_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message || "Could not open the receipt." };
  return { ok: true, data: data.signedUrl };
}

// ── Create / edit ───────────────────────────────────────────
export interface ExpenseInput {
  expenseDate: string;
  categoryCode?: string;
  vendorId?: string | null;
  description: string;
  amount: number;
  vatIncluded: boolean;
  vatAmount: number;
  paymentMethod?: string;
  notes?: string;
}

function expenseBody(input: Partial<ExpenseInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.expenseDate !== undefined) body.expense_date = input.expenseDate;
  if (input.categoryCode !== undefined) body.category_code = input.categoryCode || null;
  if (input.vendorId !== undefined) body.vendor_id = input.vendorId || null;
  if (input.description !== undefined) body.description = input.description.trim();
  if (input.amount !== undefined) body.amount = Math.max(0, n(input.amount));
  if (input.vatIncluded !== undefined) body.vat_included = !!input.vatIncluded;
  if (input.vatAmount !== undefined) body.vat_amount = Math.max(0, n(input.vatAmount));
  if (input.paymentMethod !== undefined) body.payment_method = input.paymentMethod || null;
  if (input.notes !== undefined) body.notes = input.notes.trim() || null;
  return body;
}

// Always creates a DRAFT with a mandatory receipt; submit applies the threshold.
export async function createExpense(input: ExpenseInput, file: File, createdBy: string | null): Promise<AcctResult<Expense>> {
  if (!input.description?.trim()) return { ok: false, error: "Description is required." };
  const v = validateReceipt(file);
  if (v) return { ok: false, error: v };
  const up = await uploadReceipt(file);
  if (!up.ok) return up;

  const body = expenseBody(input);
  body.receipt_path = up.path;
  body.receipt_name = up.name;
  body.created_by = createdBy;
  body.status = "draft";

  const { data, error } = await supabaseBrowser().from("expenses").insert(body).select(EXPENSE_COLS).single();
  if (error || !data) {
    await supabaseBrowser().storage.from(EXPENSE_BUCKET).remove([up.path]);   // rollback the orphan
    return { ok: false, error: error?.message || "Failed to create expense." };
  }
  return { ok: true, data: rowToExpense(data as Record<string, unknown>) };
}

export async function updateExpense(id: string, patch: Partial<ExpenseInput>, actorId: string | null): Promise<AcctResult<Expense>> {
  const body = expenseBody(patch);
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  body.last_action_by = actorId;
  // Draft-only edit.
  const { data, error } = await supabaseBrowser().from("expenses")
    .update(body).eq("id", id).eq("status", "draft").select(EXPENSE_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only a draft expense can be edited." };
  return { ok: true, data: rowToExpense(data as Record<string, unknown>) };
}

// Replace the receipt on a draft (e.g. on a recurring-generated draft).
export async function replaceReceipt(id: string, file: File, actorId: string | null): Promise<AcctResult<Expense>> {
  const v = validateReceipt(file);
  if (v) return { ok: false, error: v };
  const sb = supabaseBrowser();
  const { data: cur } = await sb.from("expenses").select("status, receipt_path").eq("id", id).maybeSingle();
  if ((cur as Record<string, unknown> | null)?.status !== "draft") return { ok: false, error: "Only a draft expense can change its receipt." };
  const up = await uploadReceipt(file);
  if (!up.ok) return up;
  const { data, error } = await sb.from("expenses")
    .update({ receipt_path: up.path, receipt_name: up.name, last_action_by: actorId })
    .eq("id", id).eq("status", "draft").select(EXPENSE_COLS).maybeSingle();
  if (error || !data) {
    await sb.storage.from(EXPENSE_BUCKET).remove([up.path]);
    return { ok: false, error: error?.message || "Failed to attach the receipt." };
  }
  const oldPath = (cur as Record<string, unknown> | null)?.receipt_path as string | undefined;
  if (oldPath) await sb.storage.from(EXPENSE_BUCKET).remove([oldPath]);
  return { ok: true, data: rowToExpense(data as Record<string, unknown>) };
}

// ── Status workflow ─────────────────────────────────────────
// Submit a draft/rejected expense: auto-approve at or below the configured
// threshold, otherwise route to pending_approval.
export async function submitExpense(id: string, actorId: string | null): Promise<AcctResult<Expense>> {
  const sb = supabaseBrowser();
  const { data: cur, error: curErr } = await sb.from("expenses").select("total, receipt_path, status").eq("id", id).maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  const row = cur as Record<string, unknown> | null;
  if (!row) return { ok: false, error: "Expense not found." };
  if (!(row.status === "draft" || row.status === "rejected")) return { ok: false, error: "Only a draft can be submitted." };
  if (!row.receipt_path) return { ok: false, error: "Attach a receipt before submitting." };

  const settings = await fetchAccountingSettings();
  const threshold = settings.ok ? settings.data.expenseApprovalThreshold : 5000;
  const newStatus: ExpenseStatus = n(row.total) <= threshold ? "approved" : "pending_approval";

  const { data, error } = await sb.from("expenses")
    .update({ status: newStatus, rejection_reason: null, last_action_by: actorId })
    .eq("id", id).in("status", ["draft", "rejected"]).select(EXPENSE_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Expense is no longer a draft — refresh and retry." };
  return { ok: true, data: rowToExpense(data as Record<string, unknown>) };
}

export async function approveExpense(id: string, actorId: string | null): Promise<AcctResult<Expense>> {
  const { data, error } = await supabaseBrowser().from("expenses")
    .update({ status: "approved", last_action_by: actorId })
    .eq("id", id).eq("status", "pending_approval").select(EXPENSE_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only a pending expense can be approved." };
  return { ok: true, data: rowToExpense(data as Record<string, unknown>) };
}

export async function rejectExpense(id: string, reason: string, actorId: string | null): Promise<AcctResult<Expense>> {
  if (!reason.trim()) return { ok: false, error: "A reason is required to reject." };
  const { data, error } = await supabaseBrowser().from("expenses")
    .update({ status: "rejected", rejection_reason: reason.trim(), last_action_by: actorId })
    .eq("id", id).eq("status", "pending_approval").select(EXPENSE_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only a pending expense can be rejected." };
  return { ok: true, data: rowToExpense(data as Record<string, unknown>) };
}

export interface ExpensePaymentInput { paidDate: string; method?: string; reference?: string; }

export async function markExpensePaid(id: string, input: ExpensePaymentInput, actorId: string | null): Promise<AcctResult<Expense>> {
  if (!input.paidDate) return { ok: false, error: "Enter the payment date." };
  const { data, error } = await supabaseBrowser().from("expenses")
    .update({
      status: "paid", paid_date: input.paidDate,
      payment_method: input.method?.trim() || null, payment_reference: input.reference?.trim() || null,
      last_action_by: actorId,
    })
    .eq("id", id).eq("status", "approved").select(EXPENSE_COLS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only an approved expense can be marked paid." };
  return { ok: true, data: rowToExpense(data as Record<string, unknown>) };
}

export async function deleteExpense(id: string): Promise<AcctResult<true>> {
  const sb = supabaseBrowser();
  const { data: cur } = await sb.from("expenses").select("status, receipt_path").eq("id", id).maybeSingle();
  const row = cur as Record<string, unknown> | null;
  if (!row) return { ok: false, error: "Expense not found." };
  if (row.status !== "draft") return { ok: false, error: "Only a draft expense can be deleted." };
  const { error } = await sb.from("expenses").delete().eq("id", id).eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  if (row.receipt_path) await sb.storage.from(EXPENSE_BUCKET).remove([row.receipt_path as string]);
  return { ok: true, data: true };
}

// ── Recurring templates ─────────────────────────────────────
export interface RecurringInput {
  categoryCode?: string;
  vendorId?: string | null;
  description: string;
  baseAmount: number;
  vatIncluded?: boolean;
  frequency: RecurringFrequency;
  nextDueDate: string;
  notes?: string;
}

export async function fetchRecurringExpenses(): Promise<AcctResult<RecurringExpense[]>> {
  const { data, error } = await supabaseBrowser().from("recurring_expenses")
    .select(RECURRING_COLS).order("next_due_date", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToRecurring(r as Record<string, unknown>)) };
}

export async function createRecurringExpense(input: RecurringInput, createdBy: string | null): Promise<AcctResult<RecurringExpense>> {
  if (!input.description?.trim()) return { ok: false, error: "Description is required." };
  if (!input.nextDueDate) return { ok: false, error: "Next due date is required." };
  const { data, error } = await supabaseBrowser().from("recurring_expenses").insert({
    category_code: input.categoryCode || null, vendor_id: input.vendorId || null,
    description: input.description.trim(), base_amount: Math.max(0, n(input.baseAmount)),
    vat_included: !!input.vatIncluded, frequency: input.frequency, next_due_date: input.nextDueDate,
    notes: input.notes?.trim() || null, created_by: createdBy,
  }).select(RECURRING_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to create template." };
  return { ok: true, data: rowToRecurring(data as Record<string, unknown>) };
}

export async function updateRecurringExpense(id: string, patch: Partial<RecurringInput>): Promise<AcctResult<RecurringExpense>> {
  const body: Record<string, unknown> = {};
  if (patch.categoryCode !== undefined) body.category_code = patch.categoryCode || null;
  if (patch.vendorId !== undefined) body.vendor_id = patch.vendorId || null;
  if (patch.description !== undefined) body.description = patch.description.trim();
  if (patch.baseAmount !== undefined) body.base_amount = Math.max(0, n(patch.baseAmount));
  if (patch.vatIncluded !== undefined) body.vat_included = !!patch.vatIncluded;
  if (patch.frequency !== undefined) body.frequency = patch.frequency;
  if (patch.nextDueDate !== undefined) body.next_due_date = patch.nextDueDate;
  if (patch.notes !== undefined) body.notes = patch.notes.trim() || null;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  const { data, error } = await supabaseBrowser().from("recurring_expenses").update(body).eq("id", id).select(RECURRING_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update template." };
  return { ok: true, data: rowToRecurring(data as Record<string, unknown>) };
}

export async function setRecurringActive(id: string, isActive: boolean): Promise<AcctResult<RecurringExpense>> {
  const { data, error } = await supabaseBrowser().from("recurring_expenses").update({ is_active: isActive }).eq("id", id).select(RECURRING_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update template." };
  return { ok: true, data: rowToRecurring(data as Record<string, unknown>) };
}

export async function deleteRecurringExpense(id: string): Promise<AcctResult<true>> {
  const { error } = await supabaseBrowser().from("recurring_expenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: true };
}

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Generate a draft expense for every active template due on/before today, and
// roll its next_due_date forward. The generated expense has NO receipt yet —
// it stays a draft until the accountant attaches one and submits.
export async function generateDueRecurringExpenses(actorId: string | null): Promise<AcctResult<number>> {
  const sb = supabaseBrowser();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from("recurring_expenses").select(RECURRING_COLS)
    .eq("is_active", true).lte("next_due_date", today);
  if (error) return { ok: false, error: error.message };
  const due = (data ?? []).map(r => rowToRecurring(r as Record<string, unknown>));
  let made = 0;
  for (const t of due) {
    const ins = await sb.from("expenses").insert({
      expense_date: t.nextDueDate, category_code: t.categoryCode, vendor_id: t.vendorId,
      description: t.description, amount: t.baseAmount, vat_included: t.vatIncluded, vat_amount: 0,
      status: "draft", notes: "Auto-generated from recurring template", created_by: actorId,
    }).select("id").single();
    if (ins.error) continue;
    const next = addMonthsISO(t.nextDueDate, t.frequency === "quarterly" ? 3 : 1);
    await sb.from("recurring_expenses").update({ next_due_date: next }).eq("id", t.id);
    made += 1;
  }
  return { ok: true, data: made };
}

// ── Report helpers (pure; operate on a fetched Expense[]) ───
export interface Breakdown { key: string; label: string; count: number; total: number; }

export function buildCategoryBreakdown(expenses: Expense[], labelOf: (code: string | null) => string): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const e of expenses) {
    const key = e.categoryCode ?? "_uncategorized";
    const cur = map.get(key) ?? { key, label: labelOf(e.categoryCode), count: 0, total: 0 };
    cur.count += 1; cur.total += e.total;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b2) => b2.total - a.total);
}

export function buildVendorBreakdown(expenses: Expense[], nameOf: (id: string | null) => string): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const e of expenses) {
    const key = e.vendorId ?? "_none";
    const cur = map.get(key) ?? { key, label: nameOf(e.vendorId), count: 0, total: 0 };
    cur.count += 1; cur.total += e.total;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b2) => b2.total - a.total);
}

export interface MonthlyPoint { month: string; total: number; count: number; }
export function buildMonthlySummary(expenses: Expense[]): MonthlyPoint[] {
  const map = new Map<string, MonthlyPoint>();
  for (const e of expenses) {
    const month = (e.expenseDate || "").slice(0, 7) || "—";
    const cur = map.get(month) ?? { month, total: 0, count: 0 };
    cur.total += e.total; cur.count += 1;
    map.set(month, cur);
  }
  return [...map.values()].sort((a, b2) => a.month.localeCompare(b2.month));
}

// RFC-4180 CSV (+ BOM) for the monthly/expense export.
export function expensesToCsv(
  expenses: Expense[],
  labelOf: (code: string | null) => string,
  nameOf: (id: string | null) => string,
): string {
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["Number", "Date", "Category", "Vendor", "Description", "Amount", "VAT", "Total", "Status", "Paid date", "Method", "Reference"];
  const rows = expenses.map(e => [
    e.expenseNumber, e.expenseDate, labelOf(e.categoryCode), nameOf(e.vendorId), e.description,
    e.amount.toFixed(2), e.vatAmount.toFixed(2), e.total.toFixed(2),
    EXPENSE_STATUS_LABEL[e.status], e.paidDate ?? "", e.paymentMethod ?? "", e.paymentReference ?? "",
  ].map(esc).join(","));
  return "﻿" + [head.map(esc).join(","), ...rows].join("\r\n");
}
