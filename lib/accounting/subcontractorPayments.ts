// ============================================================
// Accountant module · Phase 3 (Slice 3A) — Subcontractor Payments
// data layer (migration 0051).
//
// ISOLATED + ADDITIVE: self-contained, client-session (RLS-gated) data
// access — touches none of the shared hydrate/db/app-context mirrors,
// like the rest of lib/accounting/*.
//
// RATE MODEL = hourly. A subcontractor's ledger is COMPUTED LIVE from
// three RLS-gated sources (no stored balance, no triggers on the
// protected hours table):
//     earned      = Σ(logged hours) × payment_hourly_rate
//     paid        = Σ(payments)
//     outstanding = earned − paid
//
// The hours come from work_order_sub_contractor_hours (migration 0026,
// read-only here); the rate from sub_contractors.payment_hourly_rate
// (0051); payments from sub_contractor_payments (0051).
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import type { AcctResult } from "./settings";

export interface SubContractorLedger {
  id: string;
  name: string;
  company: string | null;
  isActive: boolean;
  hourlyRate: number | null;      // null = rate not set yet
  hoursTotal: number;
  earned: number;                 // hoursTotal × (hourlyRate ?? 0)
  paid: number;
  outstanding: number;            // earned − paid (can be negative = advance)
}

export interface SubContractorPayment {
  id: string;
  subContractorId: string;
  amount: number;
  paymentDate: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface SubContractorHoursEntry {
  id: string;
  workOrderId: string;
  entryDate: string;
  hours: number;
  notes: string | null;
}

export interface SubContractorPaymentHistoryEntry {
  id: string;
  subContractorId: string;
  action: string;
  detail: string | null;
  amount: number | null;
  changedBy: string | null;
  changedAt: string;
}

export interface SubContractorDetail {
  ledger: SubContractorLedger;
  hoursEntries: SubContractorHoursEntry[];
  payments: SubContractorPayment[];
  history: SubContractorPaymentHistoryEntry[];
}

const PAY_COLS = "id, sub_contractor_id, amount, payment_date, method, reference, notes, recorded_by, created_at";
const HIST_COLS = "id, sub_contractor_id, action, detail, amount, changed_by, changed_at";
const HOURS_COLS = "id, work_order_id, entry_date, hours, notes";

const n = (v: unknown, dflt = 0): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : dflt; };
const nNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
};
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);
const round2 = (x: number): number => Math.round(x * 100) / 100;

function rowToPayment(r: Record<string, unknown>): SubContractorPayment {
  return {
    id: s(r.id), subContractorId: s(r.sub_contractor_id), amount: n(r.amount),
    paymentDate: s(r.payment_date), method: sn(r.method), reference: sn(r.reference),
    notes: sn(r.notes), recordedBy: sn(r.recorded_by), createdAt: s(r.created_at),
  };
}
function rowToHours(r: Record<string, unknown>): SubContractorHoursEntry {
  return {
    id: s(r.id), workOrderId: s(r.work_order_id), entryDate: s(r.entry_date),
    hours: n(r.hours), notes: sn(r.notes),
  };
}
function rowToHistory(r: Record<string, unknown>): SubContractorPaymentHistoryEntry {
  return {
    id: s(r.id), subContractorId: s(r.sub_contractor_id), action: s(r.action),
    detail: sn(r.detail), amount: nNull(r.amount), changedBy: sn(r.changed_by), changedAt: s(r.changed_at),
  };
}

// Build a ledger row from a subcontractor profile + its summed hours/pay.
function buildLedger(
  sub: { id: string; name: string; company: string | null; isActive: boolean; hourlyRate: number | null },
  hoursTotal: number, paid: number,
): SubContractorLedger {
  const earned = round2(hoursTotal * (sub.hourlyRate ?? 0));
  return {
    ...sub,
    hoursTotal: round2(hoursTotal),
    earned,
    paid: round2(paid),
    outstanding: round2(earned - paid),
  };
}

// ── Ledger list (all subcontractors with computed totals) ───
export async function fetchSubContractorLedgers(): Promise<AcctResult<SubContractorLedger[]>> {
  const supa = supabaseBrowser();
  const [subsRes, hoursRes, paysRes] = await Promise.all([
    supa.from("sub_contractors").select("id, name, company, is_active, payment_hourly_rate"),
    supa.from("work_order_sub_contractor_hours").select("sub_contractor_id, hours"),
    supa.from("sub_contractor_payments").select("sub_contractor_id, amount"),
  ]);
  if (subsRes.error) return { ok: false, error: subsRes.error.message };
  if (hoursRes.error) return { ok: false, error: hoursRes.error.message };
  if (paysRes.error) return { ok: false, error: paysRes.error.message };

  const hoursBySub = new Map<string, number>();
  for (const r of hoursRes.data ?? []) {
    const row = r as Record<string, unknown>;
    const id = s(row.sub_contractor_id);
    hoursBySub.set(id, (hoursBySub.get(id) ?? 0) + n(row.hours));
  }
  const paidBySub = new Map<string, number>();
  for (const r of paysRes.data ?? []) {
    const row = r as Record<string, unknown>;
    const id = s(row.sub_contractor_id);
    paidBySub.set(id, (paidBySub.get(id) ?? 0) + n(row.amount));
  }

  const ledgers = (subsRes.data ?? []).map(r => {
    const row = r as Record<string, unknown>;
    const id = s(row.id);
    return buildLedger(
      { id, name: s(row.name), company: sn(row.company), isActive: row.is_active !== false, hourlyRate: nNull(row.payment_hourly_rate) },
      hoursBySub.get(id) ?? 0, paidBySub.get(id) ?? 0,
    );
  });
  // Most owed first, then by name.
  ledgers.sort((a, b) => (b.outstanding - a.outstanding) || a.name.localeCompare(b.name));
  return { ok: true, data: ledgers };
}

// ── Single-subcontractor detail ─────────────────────────────
export async function fetchSubContractorDetail(subId: string): Promise<AcctResult<SubContractorDetail>> {
  const supa = supabaseBrowser();
  const [subRes, hoursRes, paysRes, histRes] = await Promise.all([
    supa.from("sub_contractors").select("id, name, company, is_active, payment_hourly_rate").eq("id", subId).maybeSingle(),
    supa.from("work_order_sub_contractor_hours").select(HOURS_COLS).eq("sub_contractor_id", subId).order("entry_date", { ascending: false }),
    supa.from("sub_contractor_payments").select(PAY_COLS).eq("sub_contractor_id", subId).order("payment_date", { ascending: true }),
    supa.from("sub_contractor_payment_history").select(HIST_COLS).eq("sub_contractor_id", subId).order("changed_at", { ascending: true }),
  ]);
  if (subRes.error) return { ok: false, error: subRes.error.message };
  if (!subRes.data) return { ok: false, error: "Subcontractor not found." };

  const hoursEntries = (hoursRes.data ?? []).map(r => rowToHours(r as Record<string, unknown>));
  const payments = (paysRes.data ?? []).map(r => rowToPayment(r as Record<string, unknown>));
  const sr = subRes.data as Record<string, unknown>;
  const hoursTotal = hoursEntries.reduce((sum, h) => sum + h.hours, 0);
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const ledger = buildLedger(
    { id: s(sr.id), name: s(sr.name), company: sn(sr.company), isActive: sr.is_active !== false, hourlyRate: nNull(sr.payment_hourly_rate) },
    hoursTotal, paid,
  );
  return {
    ok: true,
    data: { ledger, hoursEntries, payments, history: (histRes.data ?? []).map(r => rowToHistory(r as Record<string, unknown>)) },
  };
}

// ── Rate ────────────────────────────────────────────────────
export async function updateSubContractorRate(subId: string, hourlyRate: number): Promise<AcctResult<{ id: string; hourlyRate: number }>> {
  if (!(hourlyRate >= 0)) return { ok: false, error: "Rate cannot be negative." };
  const { data, error } = await supabaseBrowser().from("sub_contractors")
    .update({ payment_hourly_rate: hourlyRate }).eq("id", subId).select("id, payment_hourly_rate");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Subcontractor not found." };
  return { ok: true, data: { id: subId, hourlyRate: n((data[0] as Record<string, unknown>).payment_hourly_rate) } };
}

// ── Payments ────────────────────────────────────────────────
export interface RecordSubPaymentInput { amount: number; paymentDate?: string; method?: string; reference?: string; notes?: string; }

// No outstanding cap: subcontractor settlements may include advances
// against future work, so an overpayment (negative outstanding = credit)
// is allowed. Flagged in the report.
export async function recordSubContractorPayment(
  subId: string, input: RecordSubPaymentInput, recordedBy: string | null,
): Promise<AcctResult<SubContractorPayment>> {
  if (!(input.amount > 0)) return { ok: false, error: "Payment amount must be greater than zero." };
  const { data, error } = await supabaseBrowser().from("sub_contractor_payments").insert({
    sub_contractor_id: subId,
    amount: input.amount,
    payment_date: input.paymentDate || undefined,
    method: input.method?.trim() || null,
    reference: input.reference?.trim() || null,
    notes: input.notes?.trim() || null,
    recorded_by: recordedBy,
  }).select(PAY_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to record payment." };
  return { ok: true, data: rowToPayment(data as Record<string, unknown>) };
}

// Reverse (delete) a payment; the audit trigger logs the reversal.
export async function reverseSubContractorPayment(paymentId: string): Promise<AcctResult<{ id: string }>> {
  const { error } = await supabaseBrowser().from("sub_contractor_payments").delete().eq("id", paymentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: paymentId } };
}
