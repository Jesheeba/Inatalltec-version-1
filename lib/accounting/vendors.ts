// ============================================================
// Accountant module · Phase 2 (Slice 2A) — Vendors data layer
// (migration 0047).
//
// ISOLATED + ADDITIVE: self-contained, client-session (RLS-gated) data
// access — touches none of the shared hydrate/db/app-context mirrors,
// exactly like settings.ts / invoices.ts.
//
// Vendor categories are CONFIGURABLE (accounting_lookups, type
// 'vendor_category', seeded by 0047) and read through here rather than
// hardcoded. The vendor code (VEN-NNNN) and the default payment-terms
// fallback are assigned by DB triggers, never by this layer.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchLookups, type AcctResult, type AccountingLookup } from "./settings";

// Well-known lookup type for the configurable category list.
export const LOOKUP_VENDOR_CATEGORY = "vendor_category";

export type VendorStatus = "active" | "inactive" | "blacklisted";

export interface Vendor {
  id: string;
  orgKey: string;
  vendorCode: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  trn: string | null;
  foreignTaxNumber: string | null;
  bankAccount: string | null;
  paymentTermsDays: number | null;
  category: string;            // lookup code (e.g. 'materials_supplier')
  country: string;
  status: VendorStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// Display fallback for category labels, used only if the lookup list
// hasn't loaded yet. Real labels always come from accounting_lookups.
export const VENDOR_CATEGORY_FALLBACK: Record<string, string> = {
  materials_supplier: "Materials Supplier",
  service_provider: "Service Provider",
  subcontractor: "Subcontractor",
  other: "Other",
};

export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

const VENDOR_COLS =
  "id, org_key, vendor_code, name, contact_person, phone, email, address, trn, foreign_tax_number, bank_account, payment_terms_days, category, country, status, notes, created_by, created_at, updated_at";

// PostgREST returns numerics as strings — coerce defensively.
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
};
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);

function rowToVendor(r: Record<string, unknown>): Vendor {
  return {
    id: s(r.id),
    orgKey: s(r.org_key, "org_installtec"),
    vendorCode: s(r.vendor_code),
    name: s(r.name),
    contactPerson: sn(r.contact_person),
    phone: sn(r.phone),
    email: sn(r.email),
    address: sn(r.address),
    trn: sn(r.trn),
    foreignTaxNumber: sn(r.foreign_tax_number),
    bankAccount: sn(r.bank_account),
    paymentTermsDays: n(r.payment_terms_days),
    category: s(r.category, "other"),
    country: s(r.country),
    status: (r.status as VendorStatus) ?? "active",
    notes: sn(r.notes),
    createdBy: sn(r.created_by),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

// ── Categories (configurable lookup) ────────────────────────
export async function fetchVendorCategories(): Promise<AcctResult<AccountingLookup[]>> {
  return fetchLookups(LOOKUP_VENDOR_CATEGORY);
}

// ── Fetch ───────────────────────────────────────────────────
export interface VendorFilter {
  status?: VendorStatus;
  category?: string;
  search?: string;   // matches name / vendor_code / contact_person
}

export async function fetchVendors(filter?: VendorFilter): Promise<AcctResult<Vendor[]>> {
  let q = supabaseBrowser().from("vendors").select(VENDOR_COLS).order("name", { ascending: true });
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.category) q = q.eq("category", filter.category);
  if (filter?.search?.trim()) {
    const t = filter.search.trim().replace(/[%,]/g, " ");
    q = q.or(`name.ilike.%${t}%,vendor_code.ilike.%${t}%,contact_person.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToVendor(r as Record<string, unknown>)) };
}

export async function fetchVendor(id: string): Promise<AcctResult<Vendor>> {
  const { data, error } = await supabaseBrowser().from("vendors").select(VENDOR_COLS).eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Vendor not found." };
  return { ok: true, data: rowToVendor(data as Record<string, unknown>) };
}

// ── Create / edit ───────────────────────────────────────────
export interface VendorInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  trn?: string;
  foreignTaxNumber?: string;
  bankAccount?: string;
  paymentTermsDays?: number | null;   // null/omitted → DB defaults from settings
  category?: string;                   // lookup code; defaults to 'other'
  country?: string;
  notes?: string;
}

// snake_case body builder shared by create + update. Trims strings and
// maps "" → null so optional fields stay clean.
function vendorBody(input: Partial<VendorInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const setStr = (key: string, v: string | undefined) => {
    if (v !== undefined) body[key] = v.trim() || null;
  };
  if (input.name !== undefined) body.name = input.name.trim();
  setStr("contact_person", input.contactPerson);
  setStr("phone", input.phone);
  setStr("email", input.email);
  setStr("address", input.address);
  setStr("trn", input.trn);
  setStr("foreign_tax_number", input.foreignTaxNumber);
  setStr("bank_account", input.bankAccount);
  setStr("notes", input.notes);
  if (input.category !== undefined) body.category = input.category || "other";
  if (input.country !== undefined) body.country = input.country.trim() || "United Arab Emirates";
  if (input.paymentTermsDays !== undefined) {
    body.payment_terms_days = input.paymentTermsDays === null ? null : input.paymentTermsDays;
  }
  return body;
}

export async function createVendor(input: VendorInput, createdBy: string | null): Promise<AcctResult<Vendor>> {
  if (!input.name?.trim()) return { ok: false, error: "Vendor name is required." };
  const body = vendorBody(input);
  body.created_by = createdBy;
  // Leave payment_terms_days off entirely when omitted so the DB trigger
  // fills the org default (passing null also triggers the default).
  const { data, error } = await supabaseBrowser().from("vendors").insert(body).select(VENDOR_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to create vendor." };
  return { ok: true, data: rowToVendor(data as Record<string, unknown>) };
}

export async function updateVendor(id: string, patch: Partial<VendorInput>): Promise<AcctResult<Vendor>> {
  const body = vendorBody(patch);
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  const { data, error } = await supabaseBrowser().from("vendors").update(body).eq("id", id).select(VENDOR_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update vendor." };
  return { ok: true, data: rowToVendor(data as Record<string, unknown>) };
}

// ── Status ──────────────────────────────────────────────────
export async function setVendorStatus(id: string, status: VendorStatus): Promise<AcctResult<Vendor>> {
  const { data, error } = await supabaseBrowser().from("vendors").update({ status }).eq("id", id).select(VENDOR_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update vendor status." };
  return { ok: true, data: rowToVendor(data as Record<string, unknown>) };
}
