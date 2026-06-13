// ============================================================
// Accountant module · Phase 2 (Slice 2C.1) — Vendor Payables data layer
// (migration 0050).
//
// ISOLATED + ADDITIVE: self-contained, client-session (RLS-gated) data
// access — touches none of the shared hydrate/db/app-context mirrors,
// like the rest of lib/accounting/*.
//
// SOURCE MODEL = Option B (manual vendor bill entry). A vendor_bill is the
// liability; AP aging + payments derive from it. Money rules live in the
// DB (total is generated; amount_paid + status are trigger-maintained).
// This layer enforces the small workflow (unpaid → partial_paid → paid /
// cancelled), threads the audit actor, and reads defaults from settings.
//
// AP aging mirrors the AR aging in invoices.ts — same configurable buckets.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import type { AcctResult } from "./settings";

export type BillStatus = "unpaid" | "partial_paid" | "paid" | "cancelled";

export interface VendorBill {
  id: string;
  orgKey: string;
  billNumber: string;
  vendorId: string;
  poId: string | null;
  projectId: string | null;
  vendorInvoiceNumber: string | null;
  status: BillStatus;
  billDate: string;
  dueDate: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorBillPayment {
  id: string;
  billId: string;
  amount: number;
  paidAt: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface VendorBillHistoryEntry {
  id: string;
  billId: string;
  action: string;
  detail: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface VendorBillDetail {
  bill: VendorBill;
  payments: VendorBillPayment[];
  history: VendorBillHistoryEntry[];
}

const BILL_COLS =
  "id, org_key, bill_number, vendor_id, po_id, project_id, vendor_invoice_number, status, bill_date, due_date, subtotal, tax_amount, total, amount_paid, notes, created_by, created_at, updated_at";
const PAYMENT_COLS =
  "id, bill_id, amount, paid_at, method, reference, notes, recorded_by, created_at";
const HISTORY_COLS =
  "id, bill_id, action, detail, changed_by, changed_at";

const n = (v: unknown, dflt = 0): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : dflt; };
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);

function rowToBill(r: Record<string, unknown>): VendorBill {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), billNumber: s(r.bill_number),
    vendorId: s(r.vendor_id), poId: sn(r.po_id), projectId: sn(r.project_id),
    vendorInvoiceNumber: sn(r.vendor_invoice_number),
    status: (r.status as BillStatus) ?? "unpaid",
    billDate: s(r.bill_date), dueDate: sn(r.due_date),
    subtotal: n(r.subtotal), taxAmount: n(r.tax_amount), total: n(r.total), amountPaid: n(r.amount_paid),
    notes: sn(r.notes), createdBy: sn(r.created_by),
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToPayment(r: Record<string, unknown>): VendorBillPayment {
  return {
    id: s(r.id), billId: s(r.bill_id), amount: n(r.amount), paidAt: s(r.paid_at),
    method: sn(r.method), reference: sn(r.reference), notes: sn(r.notes),
    recordedBy: sn(r.recorded_by), createdAt: s(r.created_at),
  };
}
function rowToHistory(r: Record<string, unknown>): VendorBillHistoryEntry {
  return {
    id: s(r.id), billId: s(r.bill_id), action: s(r.action), detail: sn(r.detail),
    changedBy: sn(r.changed_by), changedAt: s(r.changed_at),
  };
}

export const outstandingOf = (bill: VendorBill): number => Math.max(0, bill.total - bill.amountPaid);

// A bill is a payable while it still owes money (and isn't cancelled).
export function isPayable(bill: VendorBill): boolean {
  return (bill.status === "unpaid" || bill.status === "partial_paid") && outstandingOf(bill) > 0;
}

// ── Fetch ───────────────────────────────────────────────────
export interface BillFilter { status?: BillStatus; vendorId?: string; poId?: string; }

export async function fetchVendorBills(filter?: BillFilter): Promise<AcctResult<VendorBill[]>> {
  let q = supabaseBrowser().from("vendor_bills").select(BILL_COLS).order("created_at", { ascending: false });
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.vendorId) q = q.eq("vendor_id", filter.vendorId);
  if (filter?.poId) q = q.eq("po_id", filter.poId);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToBill(r as Record<string, unknown>)) };
}

export async function fetchVendorBillDetail(id: string): Promise<AcctResult<VendorBillDetail>> {
  const supa = supabaseBrowser();
  const [bill, pays, history] = await Promise.all([
    supa.from("vendor_bills").select(BILL_COLS).eq("id", id).maybeSingle(),
    supa.from("vendor_bill_payments").select(PAYMENT_COLS).eq("bill_id", id).order("paid_at", { ascending: true }),
    supa.from("vendor_bill_history").select(HISTORY_COLS).eq("bill_id", id).order("changed_at", { ascending: true }),
  ]);
  if (bill.error) return { ok: false, error: bill.error.message };
  if (!bill.data) return { ok: false, error: "Vendor bill not found." };
  return {
    ok: true,
    data: {
      bill: rowToBill(bill.data as Record<string, unknown>),
      payments: (pays.data ?? []).map(r => rowToPayment(r as Record<string, unknown>)),
      history: (history.data ?? []).map(r => rowToHistory(r as Record<string, unknown>)),
    },
  };
}

// ── Create / edit ───────────────────────────────────────────
export interface CreateVendorBillInput {
  vendorId: string;
  vendorInvoiceNumber: string;     // the vendor's own invoice number (required)
  poId?: string | null;
  projectId?: string | null;
  billDate?: string;               // vendor's invoice date; defaults today (DB)
  dueDate?: string;                // defaults from vendor terms (DB trigger)
  subtotal: number;
  taxAmount?: number;
  notes?: string;
}

export async function createVendorBill(input: CreateVendorBillInput, createdBy: string | null): Promise<AcctResult<VendorBill>> {
  if (!input.vendorId) return { ok: false, error: "Vendor is required." };
  if (!input.vendorInvoiceNumber?.trim()) return { ok: false, error: "Vendor invoice number is required." };
  const subtotal = n(input.subtotal);
  const tax = n(input.taxAmount);
  if (subtotal < 0 || tax < 0) return { ok: false, error: "Amounts cannot be negative." };
  if (subtotal + tax <= 0) return { ok: false, error: "Bill total must be greater than zero." };

  const body: Record<string, unknown> = {
    vendor_id: input.vendorId,
    po_id: input.poId || null,
    project_id: input.projectId || null,
    vendor_invoice_number: input.vendorInvoiceNumber.trim(),
    subtotal, tax_amount: tax,
    notes: input.notes?.trim() || null,
    created_by: createdBy,
  };
  if (input.billDate) body.bill_date = input.billDate;
  if (input.dueDate) body.due_date = input.dueDate;
  const { data, error } = await supabaseBrowser().from("vendor_bills").insert(body).select(BILL_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to record vendor bill." };
  return { ok: true, data: rowToBill(data as Record<string, unknown>) };
}

export interface UpdateVendorBillPatch {
  vendorInvoiceNumber?: string;
  poId?: string | null;
  projectId?: string | null;
  billDate?: string;
  dueDate?: string | null;
  subtotal?: number;
  taxAmount?: number;
  notes?: string;
}

// Editable only while still unpaid (no payments recorded yet).
export async function updateVendorBill(id: string, patch: UpdateVendorBillPatch, actorId: string | null): Promise<AcctResult<VendorBill>> {
  const body: Record<string, unknown> = {};
  if (patch.vendorInvoiceNumber !== undefined) body.vendor_invoice_number = patch.vendorInvoiceNumber.trim() || null;
  if (patch.poId !== undefined) body.po_id = patch.poId || null;
  if (patch.projectId !== undefined) body.project_id = patch.projectId || null;
  if (patch.billDate !== undefined) body.bill_date = patch.billDate;
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate || null;
  if (patch.subtotal !== undefined) body.subtotal = n(patch.subtotal);
  if (patch.taxAmount !== undefined) body.tax_amount = n(patch.taxAmount);
  if (patch.notes !== undefined) body.notes = patch.notes.trim() || null;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  body.last_action_by = actorId;
  const { data, error } = await supabaseBrowser().from("vendor_bills").update(body)
    .eq("id", id).eq("status", "unpaid").select(BILL_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Only an unpaid bill (with no payments) can be edited." };
  return { ok: true, data: rowToBill(data[0] as Record<string, unknown>) };
}

export async function cancelVendorBill(id: string, actorId: string | null): Promise<AcctResult<VendorBill>> {
  // Cancel only while unpaid (a bill with payments must be reversed first).
  const { data, error } = await supabaseBrowser().from("vendor_bills")
    .update({ status: "cancelled", last_action_by: actorId })
    .eq("id", id).eq("status", "unpaid").select(BILL_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Only an unpaid bill can be cancelled." };
  return { ok: true, data: rowToBill(data[0] as Record<string, unknown>) };
}

// ── Payments (drive paid status via DB trigger) ─────────────
export interface RecordVendorPaymentInput { amount: number; paidAt?: string; method?: string; reference?: string; notes?: string; }

export async function recordVendorPayment(
  billId: string, input: RecordVendorPaymentInput, recordedBy: string | null,
): Promise<AcctResult<VendorBillPayment>> {
  if (!(input.amount > 0)) return { ok: false, error: "Payment amount must be greater than zero." };
  const { data: bill } = await supabaseBrowser().from("vendor_bills").select("status, total, amount_paid").eq("id", billId).maybeSingle();
  if (!bill) return { ok: false, error: "Vendor bill not found." };
  const status = (bill as { status: string }).status;
  if (status !== "unpaid" && status !== "partial_paid") {
    return { ok: false, error: "Payments can only be recorded on an open (unpaid / partially paid) bill." };
  }
  const outstanding = n((bill as { total: unknown }).total) - n((bill as { amount_paid: unknown }).amount_paid);
  if (input.amount > outstanding + 0.001) {
    return { ok: false, error: `Payment exceeds the outstanding balance (${outstanding.toFixed(2)}).` };
  }
  const { data, error } = await supabaseBrowser().from("vendor_bill_payments").insert({
    bill_id: billId,
    amount: input.amount,
    paid_at: input.paidAt || undefined,
    method: input.method?.trim() || null,
    reference: input.reference?.trim() || null,
    notes: input.notes?.trim() || null,
    recorded_by: recordedBy,
  }).select(PAYMENT_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to record payment." };
  return { ok: true, data: rowToPayment(data as Record<string, unknown>) };
}

// ── AP aging — derived, config-driven buckets (mirrors AR) ──
export interface PayableItem { bill: VendorBill; outstanding: number; daysPastDue: number; bucketIndex: number; }
export interface ApAgingBucket { label: string; count: number; amount: number; }
export interface ApAging { items: PayableItem[]; buckets: ApAgingBucket[]; totalOutstanding: number; }
export interface AgingBucketBounds { b1: number; b2: number; b3: number; }

// Pure: build AP aging from a set of bills + the configurable bucket
// bounds (days). bucketIndex 0..3 maps to ≤b1, ≤b2, ≤b3, >b3.
export function buildApAging(bills: VendorBill[], bounds: AgingBucketBounds, today = new Date()): ApAging {
  const todayMs = new Date(today.toISOString().slice(0, 10)).getTime();
  const labels = [`0-${bounds.b1}`, `${bounds.b1 + 1}-${bounds.b2}`, `${bounds.b2 + 1}-${bounds.b3}`, `${bounds.b3}+`];
  const buckets: ApAgingBucket[] = labels.map(l => ({ label: l + " days", count: 0, amount: 0 }));
  const items: PayableItem[] = [];
  let totalOutstanding = 0;

  for (const bill of bills) {
    if (!isPayable(bill)) continue;
    const outstanding = outstandingOf(bill);
    let daysPastDue = 0;
    if (bill.dueDate) {
      const dueMs = new Date(bill.dueDate).getTime();
      daysPastDue = Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000));
    }
    let bucketIndex = 3;
    if (daysPastDue <= bounds.b1) bucketIndex = 0;
    else if (daysPastDue <= bounds.b2) bucketIndex = 1;
    else if (daysPastDue <= bounds.b3) bucketIndex = 2;
    buckets[bucketIndex].count += 1;
    buckets[bucketIndex].amount += outstanding;
    totalOutstanding += outstanding;
    items.push({ bill, outstanding, daysPastDue, bucketIndex });
  }
  items.sort((a, b) => b.daysPastDue - a.daysPastDue);
  return { items, buckets, totalOutstanding };
}
