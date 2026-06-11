// ============================================================
// Accountant module · Phase 1 — Invoices + Receivables data layer
// (migration 0046).
//
// ISOLATED + ADDITIVE: self-contained, client-session (RLS-gated) data
// access — touches none of the shared hydrate/db/app-context mirrors.
//
// Money rules live in the DB (line amounts are generated; header totals
// and paid-status are trigger-maintained). This layer enforces the
// STATUS WORKFLOW (draft → pending_approval → approved → sent → paid /
// cancelled) and reads defaults (tax %, due date) from Phase 0 settings
// rather than hardcoding.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchAccountingSettings, type AcctResult } from "./settings";

export type InvoiceStatus =
  | "draft" | "pending_approval" | "approved" | "sent"
  | "partially_paid" | "paid" | "overdue" | "rejected" | "cancelled";

export interface Invoice {
  id: string;
  orgKey: string;
  invoiceNumber: string;
  projectId: string | null;
  customerId: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string | null;
  description: string | null;
  notes: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  rejectionReason: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  rate: number;
  taxPct: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  sortOrder: number;
  createdAt: string;
}

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  amount: number;
  receivedAt: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface InvoiceDetail {
  invoice: Invoice;
  lines: InvoiceLineItem[];
  payments: InvoicePayment[];
}

const INVOICE_COLS =
  "id, org_key, invoice_number, project_id, customer_id, status, invoice_date, due_date, description, notes, subtotal, tax_amount, total, amount_paid, created_by, approved_by, approved_at, sent_at, rejection_reason, rejected_by, rejected_at, created_at, updated_at";
const LINE_COLS =
  "id, invoice_id, description, quantity, rate, tax_pct, line_subtotal, line_tax, line_total, sort_order, created_at";
const PAYMENT_COLS =
  "id, invoice_id, amount, received_at, method, reference, notes, recorded_by, created_at";

const n = (v: unknown, dflt = 0): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : dflt; };
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);

function rowToInvoice(r: Record<string, unknown>): Invoice {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), invoiceNumber: s(r.invoice_number),
    projectId: sn(r.project_id), customerId: s(r.customer_id),
    status: (r.status as InvoiceStatus) ?? "draft",
    invoiceDate: s(r.invoice_date), dueDate: sn(r.due_date),
    description: sn(r.description), notes: sn(r.notes),
    subtotal: n(r.subtotal), taxAmount: n(r.tax_amount), total: n(r.total), amountPaid: n(r.amount_paid),
    createdBy: sn(r.created_by), approvedBy: sn(r.approved_by), approvedAt: sn(r.approved_at), sentAt: sn(r.sent_at),
    rejectionReason: sn(r.rejection_reason), rejectedBy: sn(r.rejected_by), rejectedAt: sn(r.rejected_at),
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToLine(r: Record<string, unknown>): InvoiceLineItem {
  return {
    id: s(r.id), invoiceId: s(r.invoice_id), description: s(r.description),
    quantity: n(r.quantity, 1), rate: n(r.rate), taxPct: n(r.tax_pct),
    lineSubtotal: n(r.line_subtotal), lineTax: n(r.line_tax), lineTotal: n(r.line_total),
    sortOrder: n(r.sort_order), createdAt: s(r.created_at),
  };
}
function rowToPayment(r: Record<string, unknown>): InvoicePayment {
  return {
    id: s(r.id), invoiceId: s(r.invoice_id), amount: n(r.amount),
    receivedAt: s(r.received_at), method: sn(r.method), reference: sn(r.reference),
    notes: sn(r.notes), recordedBy: sn(r.recorded_by), createdAt: s(r.created_at),
  };
}

export const outstandingOf = (inv: Invoice): number => Math.max(0, inv.total - inv.amountPaid);

// ── Fetch ───────────────────────────────────────────────────
export interface InvoiceFilter { status?: InvoiceStatus; projectId?: string; customerId?: string; }

export async function fetchInvoices(filter?: InvoiceFilter): Promise<AcctResult<Invoice[]>> {
  let q = supabaseBrowser().from("invoices").select(INVOICE_COLS).order("created_at", { ascending: false });
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.projectId) q = q.eq("project_id", filter.projectId);
  if (filter?.customerId) q = q.eq("customer_id", filter.customerId);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToInvoice(r as Record<string, unknown>)) };
}

export async function fetchInvoiceDetail(id: string): Promise<AcctResult<InvoiceDetail>> {
  const supa = supabaseBrowser();
  const [inv, lines, pays] = await Promise.all([
    supa.from("invoices").select(INVOICE_COLS).eq("id", id).maybeSingle(),
    supa.from("invoice_line_items").select(LINE_COLS).eq("invoice_id", id).order("sort_order", { ascending: true }),
    supa.from("invoice_payments").select(PAYMENT_COLS).eq("invoice_id", id).order("received_at", { ascending: true }),
  ]);
  if (inv.error) return { ok: false, error: inv.error.message };
  if (!inv.data) return { ok: false, error: "Invoice not found." };
  return {
    ok: true,
    data: {
      invoice: rowToInvoice(inv.data as Record<string, unknown>),
      lines: (lines.data ?? []).map(r => rowToLine(r as Record<string, unknown>)),
      payments: (pays.data ?? []).map(r => rowToPayment(r as Record<string, unknown>)),
    },
  };
}

// ── Create / edit (draft) ───────────────────────────────────
export interface CreateInvoiceInput {
  customerId: string;
  projectId?: string | null;
  invoiceDate?: string;   // defaults to today (DB)
  dueDate?: string;       // defaults from settings (DB trigger)
  description?: string;
  notes?: string;
}

export async function createInvoice(input: CreateInvoiceInput, createdBy: string | null): Promise<AcctResult<Invoice>> {
  if (!input.customerId) return { ok: false, error: "Customer is required." };
  const body: Record<string, unknown> = {
    customer_id: input.customerId,
    project_id: input.projectId || null,
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: createdBy,
  };
  if (input.invoiceDate) body.invoice_date = input.invoiceDate;
  if (input.dueDate) body.due_date = input.dueDate;
  const { data, error } = await supabaseBrowser().from("invoices").insert(body).select(INVOICE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to create invoice." };
  return { ok: true, data: rowToInvoice(data as Record<string, unknown>) };
}

export async function updateInvoiceDraft(
  id: string, patch: { customerId?: string; projectId?: string | null; invoiceDate?: string; dueDate?: string | null; description?: string; notes?: string },
): Promise<AcctResult<Invoice>> {
  const body: Record<string, unknown> = {};
  if (patch.customerId !== undefined) body.customer_id = patch.customerId;
  if (patch.projectId !== undefined) body.project_id = patch.projectId || null;
  if (patch.invoiceDate !== undefined) body.invoice_date = patch.invoiceDate;
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate || null;
  if (patch.description !== undefined) body.description = patch.description.trim() || null;
  if (patch.notes !== undefined) body.notes = patch.notes.trim() || null;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  // Only editable while a draft.
  const { data, error } = await supabaseBrowser().from("invoices").update(body)
    .eq("id", id).eq("status", "draft").select(INVOICE_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Only draft invoices can be edited." };
  return { ok: true, data: rowToInvoice(data[0] as Record<string, unknown>) };
}

// ── Line items (draft only; header totals via DB trigger) ───
export interface InvoiceLineInput { description: string; quantity?: number; rate?: number; taxPct?: number; }

export async function addInvoiceLine(invoiceId: string, input: InvoiceLineInput): Promise<AcctResult<InvoiceLineItem>> {
  if (!input.description?.trim()) return { ok: false, error: "Line description is required." };
  // Guard: parent must be a draft.
  const { data: inv } = await supabaseBrowser().from("invoices").select("status").eq("id", invoiceId).maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if ((inv as { status?: string }).status !== "draft") return { ok: false, error: "Line items can only be changed on a draft invoice." };

  // Default tax % from settings (configurable), unless caller supplied one.
  let taxPct = input.taxPct;
  if (taxPct === undefined) {
    const settings = await fetchAccountingSettings();
    taxPct = settings.ok ? settings.data.defaultTaxRatePct : 0;
  }
  const { count } = await supabaseBrowser().from("invoice_line_items")
    .select("id", { count: "exact", head: true }).eq("invoice_id", invoiceId);

  const { data, error } = await supabaseBrowser().from("invoice_line_items").insert({
    invoice_id: invoiceId,
    description: input.description.trim(),
    quantity: input.quantity ?? 1,
    rate: input.rate ?? 0,
    tax_pct: taxPct,
    sort_order: count ?? 0,
  }).select(LINE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to add line." };
  return { ok: true, data: rowToLine(data as Record<string, unknown>) };
}

export async function updateInvoiceLine(
  id: string, patch: { description?: string; quantity?: number; rate?: number; taxPct?: number },
): Promise<AcctResult<InvoiceLineItem>> {
  const body: Record<string, unknown> = {};
  if (patch.description !== undefined) body.description = patch.description.trim();
  if (patch.quantity !== undefined) body.quantity = patch.quantity;
  if (patch.rate !== undefined) body.rate = patch.rate;
  if (patch.taxPct !== undefined) body.tax_pct = patch.taxPct;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  const { data, error } = await supabaseBrowser().from("invoice_line_items").update(body).eq("id", id).select(LINE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update line." };
  return { ok: true, data: rowToLine(data as Record<string, unknown>) };
}

export async function deleteInvoiceLine(id: string): Promise<AcctResult<{ id: string }>> {
  const { error } = await supabaseBrowser().from("invoice_line_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// ── Status workflow ─────────────────────────────────────────
async function invoiceTransition(id: string, from: InvoiceStatus[], patch: Record<string, unknown>): Promise<AcctResult<Invoice>> {
  const { data, error } = await supabaseBrowser().from("invoices").update(patch).eq("id", id).in("status", from).select(INVOICE_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    const { data: cur } = await supabaseBrowser().from("invoices").select("status").eq("id", id).maybeSingle();
    return { ok: false, error: cur ? `Action not allowed while invoice is "${(cur as { status: string }).status}".` : "Invoice not found." };
  }
  return { ok: true, data: rowToInvoice(data[0] as Record<string, unknown>) };
}

export async function submitInvoiceForApproval(id: string): Promise<AcctResult<Invoice>> {
  // Must have a positive total (i.e. at least one priced line).
  const { data: inv } = await supabaseBrowser().from("invoices").select("total, status").eq("id", id).maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (n((inv as { total: unknown }).total) <= 0) return { ok: false, error: "Add at least one line item before submitting." };
  return invoiceTransition(id, ["draft"], { status: "pending_approval" });
}

export async function approveInvoice(id: string, approvedBy: string | null): Promise<AcctResult<Invoice>> {
  return invoiceTransition(id, ["pending_approval"], {
    status: "approved", approved_by: approvedBy, approved_at: new Date().toISOString(),
  });
}

export async function sendInvoice(id: string): Promise<AcctResult<Invoice>> {
  return invoiceTransition(id, ["approved"], { status: "sent", sent_at: new Date().toISOString() });
}

// Approver sends a submitted invoice back with a reason.
export async function rejectInvoice(id: string, rejectedBy: string | null, reason: string): Promise<AcctResult<Invoice>> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A rejection reason is required." };
  return invoiceTransition(id, ["pending_approval"], {
    status: "rejected", rejection_reason: trimmed, rejected_by: rejectedBy, rejected_at: new Date().toISOString(),
  });
}

// Originator reopens a rejected invoice for edits (→ draft). The reason
// stays on the record so the draft editor can show what to fix.
export async function reviseInvoice(id: string): Promise<AcctResult<Invoice>> {
  return invoiceTransition(id, ["rejected"], { status: "draft" });
}

export async function voidInvoice(id: string): Promise<AcctResult<Invoice>> {
  // Void from any non-terminal, non-paid state (incl. rejected).
  return invoiceTransition(id, ["draft", "pending_approval", "approved", "sent", "partially_paid", "rejected"], { status: "cancelled" });
}

// ── Payments (drive paid status via DB trigger) ─────────────
export interface RecordInvoicePaymentInput { amount: number; receivedAt?: string; method?: string; reference?: string; notes?: string; }

export async function recordInvoicePayment(
  invoiceId: string, input: RecordInvoicePaymentInput, recordedBy: string | null,
): Promise<AcctResult<InvoicePayment>> {
  if (!(input.amount > 0)) return { ok: false, error: "Payment amount must be greater than zero." };
  const { data: inv } = await supabaseBrowser().from("invoices").select("status, total, amount_paid").eq("id", invoiceId).maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  const status = (inv as { status: string }).status;
  if (status !== "sent" && status !== "partially_paid") {
    return { ok: false, error: "Payments can only be recorded on a sent invoice." };
  }
  const outstanding = n((inv as { total: unknown }).total) - n((inv as { amount_paid: unknown }).amount_paid);
  if (input.amount > outstanding + 0.001) {
    return { ok: false, error: `Payment exceeds the outstanding balance (${outstanding.toFixed(2)}).` };
  }
  const { data, error } = await supabaseBrowser().from("invoice_payments").insert({
    invoice_id: invoiceId,
    amount: input.amount,
    received_at: input.receivedAt || undefined,
    method: input.method?.trim() || null,
    reference: input.reference?.trim() || null,
    notes: input.notes?.trim() || null,
    recorded_by: recordedBy,
  }).select(PAYMENT_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to record payment." };
  return { ok: true, data: rowToPayment(data as Record<string, unknown>) };
}

// ── Receivables (AR aging) — derived, config-driven buckets ─
export interface ReceivableItem { invoice: Invoice; outstanding: number; daysPastDue: number; bucketIndex: number; }
export interface AgingBucket { label: string; count: number; amount: number; }
export interface Aging { items: ReceivableItem[]; buckets: AgingBucket[]; totalOutstanding: number; }

// An invoice is a receivable once it's been sent and still has a balance.
export function isReceivable(inv: Invoice): boolean {
  return (inv.status === "sent" || inv.status === "partially_paid") && outstandingOf(inv) > 0;
}

export interface AgingBucketBounds { b1: number; b2: number; b3: number; }

// Pure: build AR aging from a set of invoices + the configurable bucket
// bounds (days). bucketIndex 0..3 maps to ≤b1, ≤b2, ≤b3, >b3.
export function buildAging(invoices: Invoice[], bounds: AgingBucketBounds, today = new Date()): Aging {
  const todayMs = new Date(today.toISOString().slice(0, 10)).getTime();
  const labels = [`0-${bounds.b1}`, `${bounds.b1 + 1}-${bounds.b2}`, `${bounds.b2 + 1}-${bounds.b3}`, `${bounds.b3}+`];
  const buckets: AgingBucket[] = labels.map(l => ({ label: l + " days", count: 0, amount: 0 }));
  const items: ReceivableItem[] = [];
  let totalOutstanding = 0;

  for (const inv of invoices) {
    if (!isReceivable(inv)) continue;
    const outstanding = outstandingOf(inv);
    let daysPastDue = 0;
    if (inv.dueDate) {
      const dueMs = new Date(inv.dueDate).getTime();
      daysPastDue = Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000));
    }
    let bucketIndex = 3;
    if (daysPastDue <= bounds.b1) bucketIndex = 0;
    else if (daysPastDue <= bounds.b2) bucketIndex = 1;
    else if (daysPastDue <= bounds.b3) bucketIndex = 2;
    buckets[bucketIndex].count += 1;
    buckets[bucketIndex].amount += outstanding;
    totalOutstanding += outstanding;
    items.push({ invoice: inv, outstanding, daysPastDue, bucketIndex });
  }
  items.sort((a, b) => b.daysPastDue - a.daysPastDue);
  return { items, buckets, totalOutstanding };
}
