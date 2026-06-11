// ============================================================
// Accountant module · Phase 2 (Slice 2B) — Purchase Orders data layer
// (migration 0048).
//
// ISOLATED + ADDITIVE: self-contained, client-session (RLS-gated) data
// access — touches none of the shared hydrate/db/app-context mirrors,
// exactly like settings.ts / invoices.ts / vendors.ts.
//
// Money rules live in the DB (line amounts are generated; header totals
// and received-status are trigger-maintained). This layer enforces the
// STATUS WORKFLOW (draft → pending_approval → approved → issued →
// partially_received / received → closed / cancelled), threads the audit
// actor (last_action_by) through every mutation, and reads defaults
// (tax %) + approval thresholds from Phase 0 settings rather than
// hardcoding.
//
// Approval is a SINGLE action here (the tier is computed for display /
// gating); full multi-signatory enforcement is deferred — see report.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchAccountingSettings, type AcctResult } from "./settings";

export type POStatus =
  | "draft" | "pending_approval" | "approved" | "issued"
  | "partially_received" | "received" | "closed" | "rejected" | "cancelled";

export interface PurchaseOrder {
  id: string;
  orgKey: string;
  poNumber: string;
  vendorId: string;
  projectId: string | null;
  status: POStatus;
  orderDate: string;
  expectedDate: string | null;
  description: string | null;
  notes: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  issuedAt: string | null;
  closedAt: string | null;
  rejectionReason: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface POLineItem {
  id: string;
  poId: string;
  description: string;
  quantity: number;
  rate: number;
  taxPct: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  quantityReceived: number;
  sortOrder: number;
  createdAt: string;
}

export interface POReceipt {
  id: string;
  poId: string;
  poLineId: string;
  quantity: number;
  receivedAt: string;
  reference: string | null;
  notes: string | null;
  receivedBy: string | null;
  createdAt: string;
}

export interface POHistoryEntry {
  id: string;
  poId: string;
  action: string;
  detail: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface PODetail {
  po: PurchaseOrder;
  lines: POLineItem[];
  receipts: POReceipt[];
  history: POHistoryEntry[];
}

const PO_COLS =
  "id, org_key, po_number, vendor_id, project_id, status, order_date, expected_date, description, notes, subtotal, tax_amount, total, created_by, approved_by, approved_at, issued_at, closed_at, rejection_reason, rejected_by, rejected_at, created_at, updated_at";
const PO_LINE_COLS =
  "id, po_id, description, quantity, rate, tax_pct, line_subtotal, line_tax, line_total, quantity_received, sort_order, created_at";
const PO_RECEIPT_COLS =
  "id, po_id, po_line_id, quantity, received_at, reference, notes, received_by, created_at";
const PO_HISTORY_COLS =
  "id, po_id, action, detail, changed_by, changed_at";

const n = (v: unknown, dflt = 0): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : dflt; };
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);

function rowToPO(r: Record<string, unknown>): PurchaseOrder {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), poNumber: s(r.po_number),
    vendorId: s(r.vendor_id), projectId: sn(r.project_id),
    status: (r.status as POStatus) ?? "draft",
    orderDate: s(r.order_date), expectedDate: sn(r.expected_date),
    description: sn(r.description), notes: sn(r.notes),
    subtotal: n(r.subtotal), taxAmount: n(r.tax_amount), total: n(r.total),
    createdBy: sn(r.created_by), approvedBy: sn(r.approved_by), approvedAt: sn(r.approved_at),
    issuedAt: sn(r.issued_at), closedAt: sn(r.closed_at),
    rejectionReason: sn(r.rejection_reason), rejectedBy: sn(r.rejected_by), rejectedAt: sn(r.rejected_at),
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToLine(r: Record<string, unknown>): POLineItem {
  return {
    id: s(r.id), poId: s(r.po_id), description: s(r.description),
    quantity: n(r.quantity, 1), rate: n(r.rate), taxPct: n(r.tax_pct),
    lineSubtotal: n(r.line_subtotal), lineTax: n(r.line_tax), lineTotal: n(r.line_total),
    quantityReceived: n(r.quantity_received), sortOrder: n(r.sort_order), createdAt: s(r.created_at),
  };
}
function rowToReceipt(r: Record<string, unknown>): POReceipt {
  return {
    id: s(r.id), poId: s(r.po_id), poLineId: s(r.po_line_id), quantity: n(r.quantity),
    receivedAt: s(r.received_at), reference: sn(r.reference), notes: sn(r.notes),
    receivedBy: sn(r.received_by), createdAt: s(r.created_at),
  };
}
function rowToHistory(r: Record<string, unknown>): POHistoryEntry {
  return {
    id: s(r.id), poId: s(r.po_id), action: s(r.action), detail: sn(r.detail),
    changedBy: sn(r.changed_by), changedAt: s(r.changed_at),
  };
}

// Outstanding (un-received) quantity on a line.
export const outstandingQtyOf = (l: POLineItem): number => Math.max(0, l.quantity - l.quantityReceived);

// ── Approval tiers (config-driven; computed, not enforced server-side) ──
export interface ApprovalThresholds { t1: number; t2: number; t3: number; }
export interface ApprovalTier { tier: 1 | 2 | 3 | 4; label: string; approvers: string }

// Pure: which approval tier a PO total falls into, per the configurable
// thresholds (spec Module 4 defaults 10k / 50k / 200k AED).
export function requiredApprovalTier(total: number, t: ApprovalThresholds): ApprovalTier {
  if (total <= t.t1) return { tier: 1, label: `≤ ${t.t1}`, approvers: "Operations Manager" };
  if (total <= t.t2) return { tier: 2, label: `${t.t1}–${t.t2}`, approvers: "Operations Manager + Accountant" };
  if (total <= t.t3) return { tier: 3, label: `${t.t2}–${t.t3}`, approvers: "Operations Manager + Accountant + MD" };
  return { tier: 4, label: `> ${t.t3}`, approvers: "Operations Manager + Accountant + MD + Founder" };
}

// ── Fetch ───────────────────────────────────────────────────
export interface POFilter { status?: POStatus; vendorId?: string; projectId?: string; }

export async function fetchPurchaseOrders(filter?: POFilter): Promise<AcctResult<PurchaseOrder[]>> {
  let q = supabaseBrowser().from("purchase_orders").select(PO_COLS).order("created_at", { ascending: false });
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.vendorId) q = q.eq("vendor_id", filter.vendorId);
  if (filter?.projectId) q = q.eq("project_id", filter.projectId);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToPO(r as Record<string, unknown>)) };
}

export async function fetchPurchaseOrderDetail(id: string): Promise<AcctResult<PODetail>> {
  const supa = supabaseBrowser();
  const [po, lines, receipts, history] = await Promise.all([
    supa.from("purchase_orders").select(PO_COLS).eq("id", id).maybeSingle(),
    supa.from("po_line_items").select(PO_LINE_COLS).eq("po_id", id).order("sort_order", { ascending: true }),
    supa.from("po_receipts").select(PO_RECEIPT_COLS).eq("po_id", id).order("received_at", { ascending: true }),
    supa.from("po_history").select(PO_HISTORY_COLS).eq("po_id", id).order("changed_at", { ascending: true }),
  ]);
  if (po.error) return { ok: false, error: po.error.message };
  if (!po.data) return { ok: false, error: "Purchase order not found." };
  return {
    ok: true,
    data: {
      po: rowToPO(po.data as Record<string, unknown>),
      lines: (lines.data ?? []).map(r => rowToLine(r as Record<string, unknown>)),
      receipts: (receipts.data ?? []).map(r => rowToReceipt(r as Record<string, unknown>)),
      // history read is RLS-gated to audit roles; non-audit viewers get [].
      history: (history.data ?? []).map(r => rowToHistory(r as Record<string, unknown>)),
    },
  };
}

// ── Create / edit (draft) ───────────────────────────────────
export interface CreatePOInput {
  vendorId: string;
  projectId?: string | null;
  orderDate?: string;
  expectedDate?: string;
  description?: string;
  notes?: string;
}

export async function createPurchaseOrder(input: CreatePOInput, createdBy: string | null): Promise<AcctResult<PurchaseOrder>> {
  if (!input.vendorId) return { ok: false, error: "Vendor is required." };
  const body: Record<string, unknown> = {
    vendor_id: input.vendorId,
    project_id: input.projectId || null,
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: createdBy,
    last_action_by: createdBy,
  };
  if (input.orderDate) body.order_date = input.orderDate;
  if (input.expectedDate) body.expected_date = input.expectedDate;
  const { data, error } = await supabaseBrowser().from("purchase_orders").insert(body).select(PO_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to create purchase order." };
  return { ok: true, data: rowToPO(data as Record<string, unknown>) };
}

export async function updatePODraft(
  id: string,
  patch: { vendorId?: string; projectId?: string | null; orderDate?: string; expectedDate?: string | null; description?: string; notes?: string },
  actorId: string | null,
): Promise<AcctResult<PurchaseOrder>> {
  const body: Record<string, unknown> = {};
  if (patch.vendorId !== undefined) body.vendor_id = patch.vendorId;
  if (patch.projectId !== undefined) body.project_id = patch.projectId || null;
  if (patch.orderDate !== undefined) body.order_date = patch.orderDate;
  if (patch.expectedDate !== undefined) body.expected_date = patch.expectedDate || null;
  if (patch.description !== undefined) body.description = patch.description.trim() || null;
  if (patch.notes !== undefined) body.notes = patch.notes.trim() || null;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  body.last_action_by = actorId;
  const { data, error } = await supabaseBrowser().from("purchase_orders").update(body)
    .eq("id", id).eq("status", "draft").select(PO_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Only draft purchase orders can be edited." };
  return { ok: true, data: rowToPO(data[0] as Record<string, unknown>) };
}

// ── Line items (draft only; header totals via DB trigger) ───
export interface POLineInput { description: string; quantity?: number; rate?: number; taxPct?: number; }

export async function addPOLine(poId: string, input: POLineInput): Promise<AcctResult<POLineItem>> {
  if (!input.description?.trim()) return { ok: false, error: "Line description is required." };
  const { data: po } = await supabaseBrowser().from("purchase_orders").select("status").eq("id", poId).maybeSingle();
  if (!po) return { ok: false, error: "Purchase order not found." };
  if ((po as { status?: string }).status !== "draft") return { ok: false, error: "Line items can only be changed on a draft purchase order." };

  let taxPct = input.taxPct;
  if (taxPct === undefined) {
    const settings = await fetchAccountingSettings();
    taxPct = settings.ok ? settings.data.defaultTaxRatePct : 0;
  }
  const { count } = await supabaseBrowser().from("po_line_items")
    .select("id", { count: "exact", head: true }).eq("po_id", poId);

  const { data, error } = await supabaseBrowser().from("po_line_items").insert({
    po_id: poId,
    description: input.description.trim(),
    quantity: input.quantity ?? 1,
    rate: input.rate ?? 0,
    tax_pct: taxPct,
    sort_order: count ?? 0,
  }).select(PO_LINE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to add line." };
  return { ok: true, data: rowToLine(data as Record<string, unknown>) };
}

export async function updatePOLine(
  id: string, patch: { description?: string; quantity?: number; rate?: number; taxPct?: number },
): Promise<AcctResult<POLineItem>> {
  const body: Record<string, unknown> = {};
  if (patch.description !== undefined) body.description = patch.description.trim();
  if (patch.quantity !== undefined) body.quantity = patch.quantity;
  if (patch.rate !== undefined) body.rate = patch.rate;
  if (patch.taxPct !== undefined) body.tax_pct = patch.taxPct;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  const { data, error } = await supabaseBrowser().from("po_line_items").update(body).eq("id", id).select(PO_LINE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update line." };
  return { ok: true, data: rowToLine(data as Record<string, unknown>) };
}

export async function deletePOLine(id: string): Promise<AcctResult<{ id: string }>> {
  const { error } = await supabaseBrowser().from("po_line_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// ── Status workflow ─────────────────────────────────────────
// Threads last_action_by so the audit trigger captures who acted.
async function poTransition(id: string, from: POStatus[], patch: Record<string, unknown>, actorId: string | null): Promise<AcctResult<PurchaseOrder>> {
  const body = { ...patch, last_action_by: actorId };
  const { data, error } = await supabaseBrowser().from("purchase_orders").update(body).eq("id", id).in("status", from).select(PO_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    const { data: cur } = await supabaseBrowser().from("purchase_orders").select("status").eq("id", id).maybeSingle();
    return { ok: false, error: cur ? `Action not allowed while the PO is "${(cur as { status: string }).status}".` : "Purchase order not found." };
  }
  return { ok: true, data: rowToPO(data[0] as Record<string, unknown>) };
}

export async function submitPOForApproval(id: string, actorId: string | null): Promise<AcctResult<PurchaseOrder>> {
  const { data: po } = await supabaseBrowser().from("purchase_orders").select("total, status").eq("id", id).maybeSingle();
  if (!po) return { ok: false, error: "Purchase order not found." };
  if (n((po as { total: unknown }).total) <= 0) return { ok: false, error: "Add at least one line item before submitting." };
  return poTransition(id, ["draft"], { status: "pending_approval" }, actorId);
}

export async function approvePO(id: string, approvedBy: string | null): Promise<AcctResult<PurchaseOrder>> {
  return poTransition(id, ["pending_approval"], {
    status: "approved", approved_by: approvedBy, approved_at: new Date().toISOString(),
  }, approvedBy);
}

// Approver sends a submitted PO back with a reason (recorded in po_history
// by the audit trigger, which reads rejection_reason on the transition).
export async function rejectPO(id: string, rejectedBy: string | null, reason: string): Promise<AcctResult<PurchaseOrder>> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A rejection reason is required." };
  return poTransition(id, ["pending_approval"], {
    status: "rejected", rejection_reason: trimmed, rejected_by: rejectedBy, rejected_at: new Date().toISOString(),
  }, rejectedBy);
}

// Originator reopens a rejected PO for edits (→ draft). The reason stays
// on the record so the draft editor can show what to fix.
export async function revisePO(id: string, actorId: string | null): Promise<AcctResult<PurchaseOrder>> {
  return poTransition(id, ["rejected"], { status: "draft" }, actorId);
}

export async function issuePO(id: string, actorId: string | null): Promise<AcctResult<PurchaseOrder>> {
  return poTransition(id, ["approved"], { status: "issued", issued_at: new Date().toISOString() }, actorId);
}

export async function closePO(id: string, actorId: string | null): Promise<AcctResult<PurchaseOrder>> {
  // Closeable once goods have started / finished arriving.
  return poTransition(id, ["issued", "partially_received", "received"], { status: "closed", closed_at: new Date().toISOString() }, actorId);
}

export async function cancelPO(id: string, actorId: string | null): Promise<AcctResult<PurchaseOrder>> {
  // Cancellable only before goods are issued to the vendor / received
  // (incl. a rejected PO the originator decides to drop rather than revise).
  return poTransition(id, ["draft", "pending_approval", "approved", "rejected"], { status: "cancelled" }, actorId);
}

// ── Receipts (drive received status via DB trigger) ─────────
export interface RecordPOReceiptInput { poLineId: string; quantity: number; receivedAt?: string; reference?: string; notes?: string; }

export async function recordPOReceipt(
  poId: string, input: RecordPOReceiptInput, receivedBy: string | null,
): Promise<AcctResult<POReceipt>> {
  if (!input.poLineId) return { ok: false, error: "Pick a line item to receive against." };
  if (!(input.quantity > 0)) return { ok: false, error: "Received quantity must be greater than zero." };
  const { data: po } = await supabaseBrowser().from("purchase_orders").select("status").eq("id", poId).maybeSingle();
  if (!po) return { ok: false, error: "Purchase order not found." };
  const status = (po as { status: string }).status;
  if (status !== "issued" && status !== "partially_received") {
    return { ok: false, error: "Goods can only be received against an issued purchase order." };
  }
  // Guard against over-receiving a line.
  const { data: line } = await supabaseBrowser().from("po_line_items").select("quantity, quantity_received").eq("id", input.poLineId).maybeSingle();
  if (!line) return { ok: false, error: "Line item not found." };
  const outstanding = n((line as { quantity: unknown }).quantity) - n((line as { quantity_received: unknown }).quantity_received);
  if (input.quantity > outstanding + 0.001) {
    return { ok: false, error: `Receipt exceeds the outstanding quantity (${outstanding}).` };
  }
  const { data, error } = await supabaseBrowser().from("po_receipts").insert({
    po_id: poId,
    po_line_id: input.poLineId,
    quantity: input.quantity,
    received_at: input.receivedAt || undefined,
    reference: input.reference?.trim() || null,
    notes: input.notes?.trim() || null,
    received_by: receivedBy,
  }).select(PO_RECEIPT_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to record receipt." };
  return { ok: true, data: rowToReceipt(data as Record<string, unknown>) };
}
