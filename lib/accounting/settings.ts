// ============================================================
// Accountant module · Phase 0 — Settings data layer (migration 0045).
//
// ISOLATED + ADDITIVE: this file is self-contained. It does NOT touch
// the global hydrate/db/app-context mirrors — accounting data is fetched
// client-side via the user's Supabase session (RLS-gated), so the
// Accountant module stays modular and changes here can't ripple into
// other modules.
//
// Everything the accounting modules treat as "config" lives behind these
// helpers (tax rate, document prefixes, payment terms, aging buckets,
// payment methods). Later phases import from here instead of hardcoding.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import { DEFAULT_ORG_ID } from "@/lib/db";

// Generic result shape used across the accounting data layer.
export type AcctResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Types ───────────────────────────────────────────────────
export interface AccountingSettings {
  id: string;
  orgKey: string;
  defaultTaxRatePct: number;
  taxLabel: string;
  invoicePrefix: string;
  poPrefix: string;
  invoiceDueDays: number;
  agingBucket1Days: number;
  agingBucket2Days: number;
  agingBucket3Days: number;
  // PO approval thresholds (AED) — added in migration 0048. Drive the
  // required approval tier for a purchase order's total (Module 4).
  poApprovalThreshold1: number;
  poApprovalThreshold2: number;
  poApprovalThreshold3: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingLookup {
  id: string;
  orgKey: string;
  lookupType: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

// Well-known lookup types (extend as later phases add lists).
export const LOOKUP_PAYMENT_METHOD = "payment_method";

// Hardcoded fallback ONLY for the brief window before the settings row
// is read (or if the migration hasn't been applied). Mirrors the SQL
// defaults so the UI never shows NaN. Real values always come from DB.
export const SETTINGS_FALLBACK: Omit<AccountingSettings, "id" | "orgKey" | "createdAt" | "updatedAt"> = {
  defaultTaxRatePct: 5,
  taxLabel: "VAT",
  invoicePrefix: "INV",
  poPrefix: "PO",
  invoiceDueDays: 30,
  agingBucket1Days: 30,
  agingBucket2Days: 60,
  agingBucket3Days: 90,
  poApprovalThreshold1: 10000,
  poApprovalThreshold2: 50000,
  poApprovalThreshold3: 200000,
};

const SETTINGS_COLS =
  "id, org_key, default_tax_rate_pct, tax_label, invoice_prefix, po_prefix, invoice_due_days, aging_bucket_1_days, aging_bucket_2_days, aging_bucket_3_days, po_approval_threshold_1, po_approval_threshold_2, po_approval_threshold_3, created_at, updated_at";
const LOOKUP_COLS = "id, org_key, lookup_type, code, label, sort_order, is_active";

// PostgREST returns numeric columns as strings — coerce defensively.
const n = (v: unknown, dflt = 0): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : dflt;
};
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);

function rowToSettings(r: Record<string, unknown>): AccountingSettings {
  return {
    id: s(r.id),
    orgKey: s(r.org_key, DEFAULT_ORG_ID),
    defaultTaxRatePct: n(r.default_tax_rate_pct, SETTINGS_FALLBACK.defaultTaxRatePct),
    taxLabel: s(r.tax_label, SETTINGS_FALLBACK.taxLabel),
    invoicePrefix: s(r.invoice_prefix, SETTINGS_FALLBACK.invoicePrefix),
    poPrefix: s(r.po_prefix, SETTINGS_FALLBACK.poPrefix),
    invoiceDueDays: n(r.invoice_due_days, SETTINGS_FALLBACK.invoiceDueDays),
    agingBucket1Days: n(r.aging_bucket_1_days, SETTINGS_FALLBACK.agingBucket1Days),
    agingBucket2Days: n(r.aging_bucket_2_days, SETTINGS_FALLBACK.agingBucket2Days),
    agingBucket3Days: n(r.aging_bucket_3_days, SETTINGS_FALLBACK.agingBucket3Days),
    poApprovalThreshold1: n(r.po_approval_threshold_1, SETTINGS_FALLBACK.poApprovalThreshold1),
    poApprovalThreshold2: n(r.po_approval_threshold_2, SETTINGS_FALLBACK.poApprovalThreshold2),
    poApprovalThreshold3: n(r.po_approval_threshold_3, SETTINGS_FALLBACK.poApprovalThreshold3),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

function rowToLookup(r: Record<string, unknown>): AccountingLookup {
  return {
    id: s(r.id),
    orgKey: s(r.org_key, DEFAULT_ORG_ID),
    lookupType: s(r.lookup_type),
    code: s(r.code),
    label: s(r.label),
    sortOrder: n(r.sort_order, 0),
    isActive: r.is_active !== false,
  };
}

// ── Settings ────────────────────────────────────────────────
export async function fetchAccountingSettings(): Promise<AcctResult<AccountingSettings>> {
  const { data, error } = await supabaseBrowser()
    .from("accounting_settings")
    .select(SETTINGS_COLS)
    .eq("org_key", DEFAULT_ORG_ID)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    // Migration seeds a row, so this is unexpected; surface fallback so UI renders.
    return {
      ok: true,
      data: { id: "", orgKey: DEFAULT_ORG_ID, createdAt: "", updatedAt: "", ...SETTINGS_FALLBACK },
    };
  }
  return { ok: true, data: rowToSettings(data as Record<string, unknown>) };
}

export interface AccountingSettingsPatch {
  defaultTaxRatePct?: number;
  taxLabel?: string;
  invoicePrefix?: string;
  poPrefix?: string;
  invoiceDueDays?: number;
  agingBucket1Days?: number;
  agingBucket2Days?: number;
  agingBucket3Days?: number;
  poApprovalThreshold1?: number;
  poApprovalThreshold2?: number;
  poApprovalThreshold3?: number;
}

export async function updateAccountingSettings(
  patch: AccountingSettingsPatch,
): Promise<AcctResult<AccountingSettings>> {
  // Map camelCase → snake_case, dropping undefined keys.
  const body: Record<string, unknown> = {};
  if (patch.defaultTaxRatePct !== undefined) body.default_tax_rate_pct = patch.defaultTaxRatePct;
  if (patch.taxLabel !== undefined) body.tax_label = patch.taxLabel.trim();
  if (patch.invoicePrefix !== undefined) body.invoice_prefix = patch.invoicePrefix.trim();
  if (patch.poPrefix !== undefined) body.po_prefix = patch.poPrefix.trim();
  if (patch.invoiceDueDays !== undefined) body.invoice_due_days = patch.invoiceDueDays;
  if (patch.agingBucket1Days !== undefined) body.aging_bucket_1_days = patch.agingBucket1Days;
  if (patch.agingBucket2Days !== undefined) body.aging_bucket_2_days = patch.agingBucket2Days;
  if (patch.agingBucket3Days !== undefined) body.aging_bucket_3_days = patch.agingBucket3Days;
  if (patch.poApprovalThreshold1 !== undefined) body.po_approval_threshold_1 = patch.poApprovalThreshold1;
  if (patch.poApprovalThreshold2 !== undefined) body.po_approval_threshold_2 = patch.poApprovalThreshold2;
  if (patch.poApprovalThreshold3 !== undefined) body.po_approval_threshold_3 = patch.poApprovalThreshold3;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };

  const { data, error } = await supabaseBrowser()
    .from("accounting_settings")
    .update(body)
    .eq("org_key", DEFAULT_ORG_ID)
    .select(SETTINGS_COLS)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Settings row not found — apply migration 0045." };
  return { ok: true, data: rowToSettings(data as Record<string, unknown>) };
}

// ── Lookups (payment methods, and future enumerated lists) ──
export async function fetchLookups(lookupType: string): Promise<AcctResult<AccountingLookup[]>> {
  const { data, error } = await supabaseBrowser()
    .from("accounting_lookups")
    .select(LOOKUP_COLS)
    .eq("org_key", DEFAULT_ORG_ID)
    .eq("lookup_type", lookupType)
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToLookup(r as Record<string, unknown>)) };
}

export async function fetchPaymentMethods(): Promise<AcctResult<AccountingLookup[]>> {
  return fetchLookups(LOOKUP_PAYMENT_METHOD);
}

// Slugify a label into a stable code when the caller doesn't supply one.
function toCode(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "item";
}

export async function createLookup(
  lookupType: string, label: string, opts?: { code?: string; sortOrder?: number },
): Promise<AcctResult<AccountingLookup>> {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Label is required." };
  const { data, error } = await supabaseBrowser()
    .from("accounting_lookups")
    .insert({
      org_key: DEFAULT_ORG_ID,
      lookup_type: lookupType,
      code: opts?.code?.trim() || toCode(trimmed),
      label: trimmed,
      sort_order: opts?.sortOrder ?? 99,
    })
    .select(LOOKUP_COLS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: rowToLookup(data as Record<string, unknown>) };
}

export async function updateLookup(
  id: string, patch: { label?: string; sortOrder?: number; isActive?: boolean },
): Promise<AcctResult<AccountingLookup>> {
  const body: Record<string, unknown> = {};
  if (patch.label !== undefined) body.label = patch.label.trim();
  if (patch.sortOrder !== undefined) body.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  const { data, error } = await supabaseBrowser()
    .from("accounting_lookups")
    .update(body)
    .eq("id", id)
    .select(LOOKUP_COLS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: rowToLookup(data as Record<string, unknown>) };
}
