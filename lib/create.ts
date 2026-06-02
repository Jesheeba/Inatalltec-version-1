// ============================================================
// Installtec OS - Create / Update / Delete operations
// One function per entity. Supabase is the source of truth - no
// in-memory fallback. Each function:
//   - validates required fields
//   - ensures the Supabase client is configured (otherwise returns
//     a clear error instead of silently mutating local state)
//   - performs the write against Supabase
//   - mirrors the resulting row into the in-memory db so the list
//     view re-renders immediately without waiting for the next
//     server hydration on page reload
//   - returns { ok, error?, id? }
//
// NOTE: NEXT_PUBLIC_USE_MOCK_DATA used to silently swap in an
// in-memory branch here. That created a write/read asymmetry
// where the server layout always read from Supabase but the
// client wrote only to memory - every create vanished on refresh.
// The flag is no longer consulted by production code. It is kept
// in .env.local only because Shell.tsx still gates the dev-only
// role switcher on it. See git history for context.
// ============================================================

import { supabaseBrowser } from "./supabase/client";
import { db } from "./db";
import type {
  AmcContract, AmcStatus, Approval, Customer, FreeCall, Organization, Project, ProjectPhase,
  Quotation, QuotationStatus, RepairTicket, ReplacementContext, ReplacementRequest,
  ReplacementStatus, Role, Site, SubContractor, Tint, User, WorkOrder, WorkOrderSubContractor,
  WorkOrderSubContractorHours, WorkOrderTimeEntry, WoStatus, WoType,
} from "./types";

// Returns null when Supabase is configured, otherwise a Result-shaped
// failure so callers surface the misconfiguration as a normal error
// (toast / inline message) instead of an unhandled promise rejection.
function ensureSupabase(): { ok: false; error: string } | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      error: "Supabase client not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local and restart the dev server.",
    };
  }
  return null;
}

type Credentials = { email: string; password: string };
type Result = { ok: true; id: string; credentials?: Credentials } | { ok: false; error: string };

function shortId(prefix: string) {
  const n = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${n}`;
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("");
}

// Derive the default password from the user's name: <FirstName>@123.
// Strips non-alphanumerics, capitalises, falls back to email local-part if name is empty.
export function defaultPasswordFor(fullName: string, email: string): string {
  const cleaned = (fullName || "").trim().split(/\s+/)[0]?.replace(/[^a-zA-Z0-9]/g, "") || "";
  const root = cleaned || (email.split("@")[0] || "User").replace(/[^a-zA-Z0-9]/g, "") || "User";
  const cap = root.charAt(0).toUpperCase() + root.slice(1);
  return `${cap}@123`;
}

// ─────────────────────────────────────────────────────────
// ORGANIZATION (Super Admin only - RLS enforced server-side)
// ─────────────────────────────────────────────────────────
export interface OrganizationInput {
  name: string;
  display_name: string;
  subdomain: string;
  legal_name?: string;
  tagline?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  logo_url?: string;
  default_currency?: string;
  currency_symbol?: string;
  currency_position?: "before" | "after";
  decimal_places?: number;
  default_locale?: string;
  default_timezone?: string;
  date_format?: string;
  time_format?: "12h" | "24h";
  email_from_name?: string;
  whatsapp_business_name?: string;
  admin_can_manage_branding?: boolean;
}
export async function createOrganization(input: OrganizationInput): Promise<Result> {
  if (!input.name?.trim()) return { ok: false, error: "Organization name is required." };
  if (!input.display_name?.trim()) return { ok: false, error: "Display name is required." };
  if (!input.subdomain?.trim()) return { ok: false, error: "Subdomain is required." };

  const subdomain = input.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (Object.values(db.ORGANIZATIONS).some(o => o.subdomain === subdomain)) {
    return { ok: false, error: `Subdomain "${subdomain}" is already taken.` };
  }

  const id = shortId("org");
  const row: Organization = {
    id,
    name: input.name.trim(),
    display_name: input.display_name.trim(),
    legal_name: input.legal_name?.trim(),
    tagline: input.tagline?.trim(),
    subdomain,
    primary_color: input.primary_color || "#5BAE9C",
    secondary_color: input.secondary_color || "#A78BFA",
    accent_color: input.accent_color || "#F4B8A4",
    logo_url: input.logo_url,
    default_currency: input.default_currency || "AED",
    currency_symbol: input.currency_symbol || input.default_currency || "AED",
    currency_position: input.currency_position || "before",
    decimal_separator: ".",
    thousand_separator: ",",
    decimal_places: input.decimal_places ?? 2,
    default_locale: input.default_locale || "en-AE",
    default_timezone: input.default_timezone || "Asia/Dubai",
    date_format: input.date_format || "DD/MM/YYYY",
    time_format: input.time_format || "24h",
    email_from_name: input.email_from_name,
    whatsapp_business_name: input.whatsapp_business_name,
    admin_can_manage_branding: input.admin_can_manage_branding ?? false,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const guard = ensureSupabase();
  if (guard) return guard;

  const { data, error } = await supabaseBrowser().from("organizations").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  row.id = data.id;

  db.ORGANIZATIONS[row.id] = row;
  return { ok: true, id: row.id };
}

export async function updateOrganization(id: string, patch: Partial<OrganizationInput>): Promise<Result> {
  const current = db.ORGANIZATIONS[id];
  if (!current) return { ok: false, error: "Organization not found." };

  if (patch.subdomain) {
    const sub = patch.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (sub !== current.subdomain && Object.values(db.ORGANIZATIONS).some(o => o.subdomain === sub)) {
      return { ok: false, error: `Subdomain "${sub}" is already taken.` };
    }
    patch.subdomain = sub;
  }

  const next: Organization = {
    ...current,
    ...patch,
    // ensure currency_symbol defaults to currency code if user blanked it
    currency_symbol: patch.currency_symbol ?? (patch.default_currency ?? current.currency_symbol),
  };

  const guard = ensureSupabase();
  if (guard) return guard;

  const { error } = await supabaseBrowser().from("organizations").update(next).eq("id", id);
  if (error) return { ok: false, error: error.message };

  db.ORGANIZATIONS[id] = next;
  return { ok: true, id };
}

export async function deleteOrganization(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db.ORGANIZATIONS[id]) return { ok: false, error: "Organization not found." };
  if (Object.keys(db.ORGANIZATIONS).length <= 1) {
    return { ok: false, error: "Cannot delete the last organization." };
  }
  // Block deletion if any user still belongs to this org
  const usersInOrg = Object.values(db.USERS).filter(u => u.organization_id === id);
  if (usersInOrg.length > 0) {
    return { ok: false, error: `Cannot delete - ${usersInOrg.length} user(s) still belong to this organization.` };
  }

  const guard = ensureSupabase();
  if (guard) return guard;

  const { error } = await supabaseBrowser().from("organizations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  delete db.ORGANIZATIONS[id];
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────────────────
export interface UserInput {
  full_name: string;
  email: string;
  phone?: string;
  role: Role;
  region?: string;
  manager_id?: string | null;
  tint?: Tint;
  organization_id?: string;
}
export async function createUser(input: UserInput): Promise<Result> {
  if (!input.full_name?.trim()) return { ok: false, error: "Full name is required." };
  if (!input.email?.trim()) return { ok: false, error: "Email is required." };
  if (!input.role) return { ok: false, error: "Role is required." };

  // Default to the first available org if caller didn't specify one.
  const orgId = input.organization_id || Object.keys(db.ORGANIZATIONS)[0];

  const id = shortId("u");
  const row: User = {
    id, email: input.email.trim(), phone: input.phone || "",
    full_name: input.full_name.trim(), name: input.full_name.trim(),
    initials: initials(input.full_name), tint: input.tint || "primary",
    role: input.role, mgr: input.manager_id || null, team: null,
    skills: [], region: input.region || "UAE",
    organization_id: orgId,
  } as unknown as User;

  // Always go through the API route - Supabase is the source of truth for
  // users. The route uses the service role to provision auth.users + insert
  // into public.users atomically; never falls back to in-memory mock.
  let res: globalThis.Response;
  try {
    res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: input.full_name.trim(),
        email: input.email.trim(),
        phone: input.phone,
        role: input.role,
        region: input.region,
        manager_id: input.manager_id ?? null,
        tint: input.tint,
        organization_id: orgId,
      }),
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Network error calling /api/admin/users" };
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    return { ok: false, error: payload?.error || `Provisioning failed (${res.status})` };
  }

  row.id = payload.id;
  // Mirror into db.USERS for immediate UI update; the next layout fetch will
  // re-hydrate from Supabase (the source of truth).
  db.USERS[row.id] = row;
  return { ok: true, id: row.id, credentials: payload.credentials };
}

export async function deleteUser(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "User id is required." };

  // Soft-delete via the server route. The route writes is_active=false +
  // deactivated_at=now() so history is preserved and the user can no longer
  // pass the active-user check at sign-in. No mock branch - Supabase is the
  // source of truth for users.
  let res: globalThis.Response;
  try {
    res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Network error calling /api/admin/users" };
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    return { ok: false, error: payload?.error || `Delete failed (${res.status})` };
  }

  // Drop from the local mirror so the list view updates without waiting for
  // the next page refresh.
  delete db.USERS[id];
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// CUSTOMER
// ─────────────────────────────────────────────────────────
export interface CustomerInput {
  name: string;
  tier: "Strategic" | "Key" | "Standard";
  region?: string;
  sector?: string;
  owner_id?: string | null;
  tags?: string[];
}
export async function createCustomer(input: CustomerInput): Promise<Result> {
  if (!input.name?.trim()) return { ok: false, error: "Customer name is required." };
  if (!input.tier) return { ok: false, error: "Tier is required." };

  const id = shortId("c");
  const row: Customer = {
    id, name: input.name.trim(), tier: input.tier,
    region: input.region || "UAE", sector: input.sector || "-",
    owner: input.owner_id || "",
    since: new Date().toISOString().slice(0, 7),
    tags: input.tags || [],
  };

  const guard = ensureSupabase();
  if (guard) return guard;

  const { data, error } = await supabaseBrowser().from("customers").insert({
    name: input.name.trim(),
    tier: input.tier,
    region: input.region || "UAE",
    sector: input.sector || null,
    owner_id: input.owner_id || null,
    customer_since: new Date().toISOString().slice(0, 10),
    tags: input.tags || [],
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  row.id = data.id;

  db.CUSTOMERS[row.id] = row;
  return { ok: true, id: row.id };
}

// ─────────────────────────────────────────────────────────
// SITE
// ─────────────────────────────────────────────────────────
//
// Sites belong to a customer. Address + contact fields were added
// in migration 0013; the form prompts for them but all are optional
// — only name + customer_id are enforced here.
export const UAE_EMIRATES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
] as const;
export type Emirate = (typeof UAE_EMIRATES)[number];

export interface SiteInput {
  name: string;
  customer_id: string;
  address_line_1?: string;
  address_line_2?: string;
  area?: string;          // city / area
  emirate?: string;
  geo_lat?: number | null;
  geo_lng?: number | null;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  access_instructions?: string;
}

export async function createSite(input: SiteInput): Promise<Result> {
  if (!input.name?.trim()) return { ok: false, error: "Site name is required." };
  if (!input.customer_id)  return { ok: false, error: "Customer is required." };

  const guard = ensureSupabase();
  if (guard) return guard;

  const trim = (s?: string) => (s && s.trim() ? s.trim() : null);

  const { data, error } = await supabaseBrowser().from("sites").insert({
    name: input.name.trim(),
    customer_id: input.customer_id,
    address_line_1: trim(input.address_line_1),
    address_line_2: trim(input.address_line_2),
    area:           trim(input.area),
    emirate:        trim(input.emirate),
    geo_lat:        typeof input.geo_lat === "number" ? input.geo_lat : null,
    geo_lng:        typeof input.geo_lng === "number" ? input.geo_lng : null,
    contact_name:   trim(input.contact_name),
    contact_phone:  trim(input.contact_phone),
    contact_email:  trim(input.contact_email),
    access_instructions: trim(input.access_instructions),
    is_active: true,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };

  const row: Site = {
    id: data.id,
    name: input.name.trim(),
    customer: input.customer_id,
    area:   input.area || "",
    access: input.access_instructions || "",
    address_line_1: trim(input.address_line_1) ?? undefined,
    address_line_2: trim(input.address_line_2) ?? undefined,
    emirate:        trim(input.emirate) ?? undefined,
    contact_name:   trim(input.contact_name) ?? undefined,
    contact_phone:  trim(input.contact_phone) ?? undefined,
    contact_email:  trim(input.contact_email) ?? undefined,
    geo_lat:        typeof input.geo_lat === "number" ? input.geo_lat : undefined,
    geo_lng:        typeof input.geo_lng === "number" ? input.geo_lng : undefined,
    is_active: true,
  };
  db.SITES[row.id] = row;
  return { ok: true, id: row.id };
}

export interface SitePatch {
  name?: string;
  customer_id?: string;
  address_line_1?: string | null;
  address_line_2?: string | null;
  area?: string | null;
  emirate?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  access_instructions?: string | null;
}
export async function updateSite(id: string, patch: SitePatch): Promise<{ ok: true; site: Site } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Site id is required." };
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };

  const guard = ensureSupabase();
  if (guard) return guard;

  const body: Record<string, unknown> = {};
  const setText = (k: keyof SitePatch, col: string) => {
    if (patch[k] === undefined) return;
    const v = patch[k];
    body[col] = typeof v === "string" ? (v.trim() || null) : v;
  };
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.customer_id !== undefined) body.customer_id = patch.customer_id;
  setText("address_line_1", "address_line_1");
  setText("address_line_2", "address_line_2");
  setText("area",           "area");
  setText("emirate",        "emirate");
  setText("contact_name",   "contact_name");
  setText("contact_phone",  "contact_phone");
  setText("contact_email",  "contact_email");
  setText("access_instructions", "access_instructions");
  if (patch.geo_lat !== undefined) body.geo_lat = patch.geo_lat;
  if (patch.geo_lng !== undefined) body.geo_lng = patch.geo_lng;

  const { error } = await supabaseBrowser().from("sites").update(body).eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Re-fetch so the mirror matches the DB exactly (defaults applied, etc).
  const { data: refreshed, error: rErr } = await supabaseBrowser()
    .from("sites")
    .select("id, name, customer_id, area, access_instructions, address_line_1, address_line_2, emirate, contact_name, contact_phone, contact_email, geo_lat, geo_lng, is_active")
    .eq("id", id).maybeSingle();
  if (rErr || !refreshed) return { ok: false, error: rErr?.message || "Site disappeared after update." };

  const next: Site = {
    id: refreshed.id as string,
    name: refreshed.name as string,
    customer: refreshed.customer_id as string,
    area:   (refreshed.area as string | null) ?? "",
    access: (refreshed.access_instructions as string | null) ?? "",
    address_line_1: (refreshed.address_line_1 as string | null) ?? undefined,
    address_line_2: (refreshed.address_line_2 as string | null) ?? undefined,
    emirate:        (refreshed.emirate as string | null) ?? undefined,
    contact_name:   (refreshed.contact_name as string | null) ?? undefined,
    contact_phone:  (refreshed.contact_phone as string | null) ?? undefined,
    contact_email:  (refreshed.contact_email as string | null) ?? undefined,
    geo_lat: typeof refreshed.geo_lat === "number" ? (refreshed.geo_lat as number) : undefined,
    geo_lng: typeof refreshed.geo_lng === "number" ? (refreshed.geo_lng as number) : undefined,
    is_active: refreshed.is_active === false ? false : true,
  };
  db.SITES[next.id] = next;
  return { ok: true, site: next };
}

// Soft delete — flips is_active=false so any WO/AMC/project still pointing
// at the site keeps its FK valid and the audit trail survives.
export async function deleteSite(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Site id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;

  const { error } = await supabaseBrowser().from("sites").update({ is_active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  // Drop from the in-memory mirror so list views hide it immediately;
  // the next hydration will fetch only is_active rows once we filter there.
  if (db.SITES[id]) db.SITES[id] = { ...db.SITES[id], is_active: false };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// PROJECT
// ─────────────────────────────────────────────────────────
//
// project_status / project_stage enums are defined in migration
// 0008_project_status.sql. Keep these literal unions in sync with
// the SQL - Supabase will reject any value not present in the enum.
export const PROJECT_STATUSES = [
  "planned", "in_progress", "on_hold", "completed", "cancelled",
] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

export const PROJECT_STAGES = [
  "lead", "quote", "won", "mobilization", "execution",
  "testing_commissioning", "handover", "dlp", "amc_handoff",
] as const;
export type ProjectStage = typeof PROJECT_STAGES[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const PROJECT_STAGE_LABEL: Record<ProjectStage, string> = {
  lead: "Lead",
  quote: "Quote",
  won: "Won",
  mobilization: "Mobilization",
  execution: "Execution",
  testing_commissioning: "Testing & Commissioning",
  handover: "Handover",
  dlp: "DLP",
  amc_handoff: "AMC Handoff",
};

// Job-category dropdown values. Mirrors the CHECK constraint added in
// migration 0012 — keep them in lock-step.
export const JOB_CATEGORIES = [
  "cctv",
  "access_control",
  "intercom",
  "fire_alarm",
  "public_address",
  "structured_cabling",
  "bms",
  "other",
] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const JOB_CATEGORY_LABEL: Record<JobCategory, string> = {
  cctv:               "CCTV / Video Surveillance",
  access_control:     "Access Control",
  intercom:           "Intercom / Video Door Phone",
  fire_alarm:         "Fire Alarm / Detection",
  public_address:     "Public Address / BGM",
  structured_cabling: "Structured Cabling / IT",
  bms:                "BMS / Building Automation",
  other:              "Other",
};

// Free-form JSONB grab-bag persisted in projects.contract_meta.
// Every field optional — UI only writes what the user filled in.
export interface ContractMeta {
  has_boq?:          boolean;
  has_design_phase?: boolean;
  has_tc_phase?:     boolean;
  retention_pct?:    number;
  payment_terms?:    string;
}

export interface ProjectInput {
  name: string;
  code?: string;
  customer_id: string;
  site_id?: string;
  manager_id?: string | null;
  // Lead Technician (migration 0018). Operations Manager picks at
  // creation time so the Lead sees the project immediately and can
  // start staffing Work Orders without needing a WO assignment first.
  lead_tech_id?: string | null;
  value_aed: number;
  started_at: string;
  due_at: string;
  status?: ProjectStatus;
  stage?: ProjectStage;
  // Step B (migration 0012) — Main Contractor Job specifics.
  scope_description?: string;
  job_category?: JobCategory;
  contract_meta?: ContractMeta;
  // Execution phase (migration 0020). Optional — DB default is
  // 'design' so omitting it auto-starts new projects there.
  current_phase?: ProjectPhase;
}
export async function createProject(input: ProjectInput): Promise<Result> {
  if (!input.name?.trim()) return { ok: false, error: "Project name is required." };
  if (!input.customer_id) return { ok: false, error: "Customer is required." };
  if (!input.value_aed) return { ok: false, error: "Project value is required." };
  if (!input.started_at) return { ok: false, error: "Start date is required." };
  if (!input.due_at) return { ok: false, error: "Due date is required." };

  const code = input.code?.trim() || `PRJ-${new Date().getFullYear()}-${Math.floor(Math.random() * 900 + 100)}`;
  const id = shortId("p");
  const status: ProjectStatus = input.status || "planned";
  const stage: ProjectStage = input.stage || "lead";
  const row: Project = {
    id, code, name: input.name.trim(),
    customer: input.customer_id,
    site: input.site_id || "",
    manager: input.manager_id || "",
    team: "",
    leadTechId: input.lead_tech_id || "",
    status,
    stage,
    currentPhase: input.current_phase ?? "design",
    progress: 0,
    value: input.value_aed,
    startedAt: input.started_at,
    dueAt: input.due_at,
    milestones: [],
  };

  const guard = ensureSupabase();
  if (guard) return guard;

  const scope = input.scope_description?.trim();
  // Always send contract_meta — empty object is the column default, so this
  // keeps the JSONB shape predictable for any later reader.
  const contractMeta = input.contract_meta ?? {};

  const { data, error } = await supabaseBrowser().from("projects").insert({
    code, name: input.name.trim(),
    customer_id: input.customer_id,
    site_id: input.site_id || null,
    manager_id: input.manager_id || null,
    lead_tech_id: input.lead_tech_id || null,
    status,
    stage,
    // Send current_phase only when the form explicitly picked one.
    // Omitting lets the projects.current_phase DEFAULT 'design' apply
    // server-side (migration 0020:2b) so we never write a stale value.
    ...(input.current_phase ? { current_phase: input.current_phase } : {}),
    progress: 0,
    value_aed: input.value_aed,
    started_at: input.started_at,
    due_at: input.due_at,
    scope_description: scope ? scope : null,
    job_category:      input.job_category ?? null,
    contract_meta:     contractMeta,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  row.id = data.id;

  db.PROJECTS[row.id] = row;
  return { ok: true, id: row.id };
}

// Patch an existing project. Status/stage changes are audited
// server-side by trigger trg_project_status_change (see 0008).
// Returns the updated Project so the caller can replace its
// in-memory mirror without an extra round-trip.
export interface ProjectPatch {
  name?: string;
  status?: ProjectStatus;
  stage?: ProjectStage;
  progress?: number;
  manager_id?: string | null;
  lead_tech_id?: string | null;
  value_aed?: number;
  started_at?: string;
  due_at?: string;
}
export async function updateProject(id: string, patch: ProjectPatch): Promise<{ ok: true; project: Project } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Project id is required." };
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };

  const guard = ensureSupabase();
  if (guard) return guard;

  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.stage !== undefined) body.stage = patch.stage;
  if (patch.progress !== undefined) body.progress = patch.progress;
  if (patch.manager_id !== undefined) body.manager_id = patch.manager_id;
  if (patch.lead_tech_id !== undefined) body.lead_tech_id = patch.lead_tech_id;
  if (patch.value_aed !== undefined) body.value_aed = patch.value_aed;
  if (patch.started_at !== undefined) body.started_at = patch.started_at;
  if (patch.due_at !== undefined) body.due_at = patch.due_at;

  const { data, error } = await supabaseBrowser()
    .from("projects").update(body).eq("id", id)
    .select("id, code, name, customer_id, site_id, manager_id, team_id, lead_tech_id, status, stage, current_phase, progress, value_aed, started_at, due_at")
    .single();
  if (error) return { ok: false, error: error.message };

  const current = db.PROJECTS[id];
  const next: Project = {
    id: data.id as string,
    code: data.code as string,
    name: data.name as string,
    customer: (data.customer_id as string) ?? current?.customer ?? "",
    site: (data.site_id as string) ?? current?.site ?? "",
    manager: (data.manager_id as string) ?? "",
    team: (data.team_id as string) ?? "",
    leadTechId: (data.lead_tech_id as string) ?? "",
    status: data.status as string,
    stage: data.stage as string,
    currentPhase: (data.current_phase as ProjectPhase | null) ?? null,
    progress: (data.progress as number) ?? 0,
    value: (data.value_aed as number) ?? 0,
    startedAt: (data.started_at as string) ?? "",
    dueAt: (data.due_at as string) ?? "",
    milestones: current?.milestones ?? [],
  };
  db.PROJECTS[id] = next;
  return { ok: true, project: next };
}

// ─────────────────────────────────────────────────────────
// PROJECT PHASE — manual advancement (migration 0020).
//
// Updates projects.current_phase, which fires trg_project_phase_change
// (SECURITY DEFINER) to insert a project_phase_history row capturing
// from_phase, to_phase, changed_by. If a note is provided, the app
// follows up by patching the most recent history row with the note —
// the trigger can't carry the note because it's not a column on
// projects, only on the history table.
//
// Permissions: RLS (projects_write + pph_write) already restricts to
// md/admin/manager. The UI also hides the button via canChangeProjectPhase.
//
// Optimistic mirror: caller is expected to bumpData() after success.
// ─────────────────────────────────────────────────────────
export async function advanceProjectPhase(
  projectId: string,
  newPhase: ProjectPhase,
  note?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!projectId) return { ok: false, error: "Project id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;

  const supa = supabaseBrowser();

  // 1) Update the column. Trigger logs from/to automatically.
  const { error: updateErr } = await supa
    .from("projects")
    .update({ current_phase: newPhase })
    .eq("id", projectId);
  if (updateErr) return { ok: false, error: updateErr.message };

  // 2) Attach the note to the just-created history row, if provided.
  //    Two-step rather than RPC: keeps the migration surface small and
  //    note-attachment failures are non-fatal (the phase change itself
  //    has already succeeded and been audited).
  const trimmedNote = note?.trim();
  if (trimmedNote) {
    const { data: latest } = await supa
      .from("project_phase_history")
      .select("id")
      .eq("project_id", projectId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id) {
      const { error: noteErr } = await supa
        .from("project_phase_history")
        .update({ note: trimmedNote })
        .eq("id", latest.id);
      if (noteErr) {
        // Phase advance already succeeded; surface the note failure as
        // a soft warning so the caller can toast it without rolling
        // back the (already-committed) phase change.
        // eslint-disable-next-line no-console
        console.warn("[advanceProjectPhase] note save failed:", noteErr.message);
      }
    }
  }

  // 3) Mirror in memory so list views update without a refetch.
  const existing = db.PROJECTS[projectId];
  if (existing) db.PROJECTS[projectId] = { ...existing, currentPhase: newPhase };

  return { ok: true, id: projectId };
}

// ─────────────────────────────────────────────────────────
// AMC CONTRACT
// ─────────────────────────────────────────────────────────
export interface AmcInput {
  code?: string;
  customer_id: string;
  site_id?: string;
  manager_id?: string | null;
  lead_tech_id?: string | null;
  value_aed: number;
  expires_at: string;
}
export async function createAmc(input: AmcInput): Promise<Result> {
  if (!input.customer_id) return { ok: false, error: "Customer is required." };
  if (!input.value_aed) return { ok: false, error: "Annual value is required." };
  if (!input.expires_at) return { ok: false, error: "Expiry date is required." };

  const code = input.code?.trim() || `AMC-${Math.floor(Math.random() * 900 + 100)}`;

  // Post-0027 flow: amc_contracts.signed_at defaults to current_date,
  // the BEFORE INSERT trigger populates first_payment_due_at, and the
  // AFTER INSERT trigger trg_amc_seed_first_service seeds service 1
  // anchored on signed_at. Services 2..N are created later when payment
  // is recorded (fn_amc_payment_received). We therefore insert with
  // initial status 'pending_payment' (signed, waiting for payment).
  // contract_status flips to 'active' on the payment trigger.

  const guard = ensureSupabase();
  if (guard) return guard;

  const { data, error } = await supabaseBrowser().from("amc_contracts").insert({
    code, customer_id: input.customer_id,
    site_id: input.site_id || null,
    manager_id: input.manager_id || null,
    lead_tech_id: input.lead_tech_id || null,
    contract_status: "pending_payment",
    value_aed: input.value_aed,
    expires_at: input.expires_at,
  })
  .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, expires_at, suspended_at, suspended_reason, paused_by, resumed_at, first_payment_due_at, renewed_from_id")
  .single();
  if (error) return { ok: false, error: error.message };

  const newId = data.id as string;
  // Mirror the DB-populated row (signed_at default + triggers ran already).
  const row: AmcContract = {
    id:                newId,
    code:              (data.code as string) ?? code,
    customer:          (data.customer_id as string) ?? input.customer_id,
    site:              (data.site_id as string) ?? (input.site_id || ""),
    manager:           (data.manager_id as string) ?? (input.manager_id || ""),
    leadTechId:        (data.lead_tech_id as string) ?? (input.lead_tech_id || ""),
    contract_status:   (data.contract_status as AmcStatus) ?? "pending_payment",
    value:             (data.value_aed as number) ?? input.value_aed,
    services:          { done: 0, total: 4 },
    nextDue:           (data.next_due_label as string) ?? "-",
    overdueDays:       (data.overdue_days as number) ?? 0,
    freeCalls:         (data.free_calls_used as number) ?? 0,
    expiresAt:         (data.expires_at as string) ?? input.expires_at,
    suspendedAt:       (data.suspended_at as string | null) ?? null,
    suspendedReason:   (data.suspended_reason as string | null) ?? null,
    pausedBy:          (data.paused_by as string | null) ?? null,
    resumedAt:         (data.resumed_at as string | null) ?? null,
    firstPaymentDueAt: (data.first_payment_due_at as string | null) ?? null,
    renewedFromId:     (data.renewed_from_id as string | null) ?? null,
  };

  db.AMCS[row.id] = row;
  return { ok: true, id: row.id };
}

// ─────────────────────────────────────────────────────────
// AMC label maps + lifecycle constants
// ─────────────────────────────────────────────────────────
//
// Source of truth for the amc_status enum is supabase/migrations/
// 0009a_amc_enum_setup.sql. Keep this union in sync — Supabase will
// reject any value not present in the enum.
export const AMC_STATUSES = [
  "draft", "pending_payment", "active", "suspended", "expired", "cancelled", "renewed",
] as const;
// Display labels for the DB enum. 'suspended' renders as "Paused" per
// the AMC pause spec (migration 0021) — the boss says "pause" in the
// business, the engine still keys off the existing 'suspended' value
// so the fn_amc_payment_received auto-resume trigger keeps working.
export const AMC_STATUS_LABEL: Record<AmcStatus, string> = {
  draft:           "Draft",
  pending_payment: "Pending Payment",
  active:          "Active",
  suspended:       "Paused",
  expired:         "Expired",
  cancelled:       "Cancelled",
  renewed:         "Renewed",
};

// Patch an existing AMC contract. The amc_status_history audit row is
// written automatically by the trg_amc_status_change trigger (0009b)
// when contract_status changes — no explicit insert needed.
//
// Fields NOT exposed here:
//   - name        : not a column on amc_contracts (the contract has a `code`)
//   - starts_at   : not a column (we use payment_received_at + activation_date)
// Both were named in the spec but don't exist on the table — flagged.
export interface AmcPatch {
  contract_status?: AmcStatus;
  value_aed?: number;
  auto_renewal?: boolean;
  manager_id?: string | null;
  lead_tech_id?: string | null;
  site_id?: string | null;
  expires_at?: string;
}
export async function updateAmc(id: string, patch: AmcPatch): Promise<{ ok: true; amc: AmcContract } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "AMC id is required." };
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };

  const guard = ensureSupabase();
  if (guard) return guard;

  const body: Record<string, unknown> = {};
  if (patch.contract_status !== undefined) body.contract_status = patch.contract_status;
  if (patch.value_aed       !== undefined) body.value_aed       = patch.value_aed;
  if (patch.auto_renewal    !== undefined) body.auto_renewal    = patch.auto_renewal;
  if (patch.manager_id      !== undefined) body.manager_id      = patch.manager_id;
  if (patch.lead_tech_id    !== undefined) body.lead_tech_id    = patch.lead_tech_id;
  if (patch.site_id         !== undefined) body.site_id         = patch.site_id;
  if (patch.expires_at      !== undefined) body.expires_at      = patch.expires_at;

  const { data, error } = await supabaseBrowser()
    .from("amc_contracts").update(body).eq("id", id)
    .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, expires_at, suspended_at, suspended_reason, paused_by, resumed_at, first_payment_due_at, renewed_from_id")
    .single();
  if (error) return { ok: false, error: error.message };

  const current = db.AMCS[id];
  const next: AmcContract = {
    id:                data.id as string,
    code:              data.code as string,
    customer:          (data.customer_id as string) ?? current?.customer ?? "",
    site:              (data.site_id as string) ?? current?.site ?? "",
    manager:           (data.manager_id as string) ?? "",
    leadTechId:        (data.lead_tech_id as string) ?? "",
    contract_status:   data.contract_status as AmcStatus,
    value:             (data.value_aed as number) ?? 0,
    services:          current?.services ?? { done: 0, total: 4 },
    nextDue:           (data.next_due_label as string) ?? "-",
    overdueDays:       (data.overdue_days as number) ?? 0,
    freeCalls:         (data.free_calls_used as number) ?? 0,
    expiresAt:         (data.expires_at as string) ?? "",
    suspendedAt:       (data.suspended_at as string | null) ?? null,
    suspendedReason:   (data.suspended_reason as string | null) ?? null,
    pausedBy:          (data.paused_by as string | null) ?? null,
    resumedAt:         (data.resumed_at as string | null) ?? null,
    firstPaymentDueAt: (data.first_payment_due_at as string | null) ?? null,
    renewedFromId:     (data.renewed_from_id as string | null) ?? null,
  };
  db.AMCS[id] = next;
  return { ok: true, amc: next };
}

// ─────────────────────────────────────────────────────────
// AMC PAYMENT
// ─────────────────────────────────────────────────────────
//
// Inserts a row into amc_payments and lets the database do the rest:
// trg_amc_payment (migration 0009b → 0010) fires fn_amc_payment_received,
// which flips contract_status to 'active', stamps payment_received_at,
// computes activation_date = received_at + payment_grace_days, clears
// suspension fields, and (after migration 0010 in Step C of the AMC
// engine) auto-creates the 4 quarterly amc_service_schedule rows.
//
// The frontend's job is just: INSERT → re-fetch the parent AMC row →
// mirror into db.AMCS so the in-memory view reflects the new state.
export type AmcPaymentMethod =
  | "bank_transfer" | "cash" | "cheque" | "credit_card" | "other";

export const AMC_PAYMENT_METHOD_LABEL: Record<AmcPaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  cash:          "Cash",
  cheque:        "Cheque",
  credit_card:   "Credit Card",
  other:         "Other",
};

export interface AmcPaymentInput {
  amount_aed: number;
  received_at: string;             // ISO date or datetime
  method?: AmcPaymentMethod;
  reference?: string;
  notes?: string;
}

export async function recordAmcPayment(
  amcId: string,
  payment: AmcPaymentInput,
): Promise<{ ok: true; payment_id: string; amc_updated: AmcContract } | { ok: false; error: string }> {
  if (!amcId) return { ok: false, error: "AMC id is required." };
  if (!payment.amount_aed || payment.amount_aed <= 0) {
    return { ok: false, error: "Payment amount must be greater than zero." };
  }
  if (!payment.received_at) return { ok: false, error: "Payment date is required." };

  // Reject future-dated payments — the DB doesn't, but the spec UI does,
  // and a future payment messes up activation_date math.
  const receivedMs = new Date(payment.received_at).getTime();
  if (Number.isNaN(receivedMs)) return { ok: false, error: "Payment date is invalid." };
  if (receivedMs > Date.now() + 60_000) {       // 60s clock-skew slack
    return { ok: false, error: "Payment date cannot be in the future." };
  }

  const guard = ensureSupabase();
  if (guard) return guard;

  const supa = supabaseBrowser();

  // 1. Insert payment row. The trigger fn_amc_payment_received fires AFTER
  //    INSERT and runs as SECURITY DEFINER (owner postgres) so it can update
  //    amc_contracts and amc_service_schedule even when the caller can't.
  const { data: insertRow, error: insertErr } = await supa
    .from("amc_payments")
    .insert({
      amc_id:      amcId,
      amount_aed:  payment.amount_aed,
      received_at: payment.received_at,
      method:      payment.method ?? null,
      reference:   payment.reference?.trim() || null,
      notes:       payment.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (insertErr || !insertRow) {
    return { ok: false, error: insertErr?.message ?? "Failed to record payment." };
  }

  // 2. Re-fetch the parent contract — the trigger already updated it, but the
  //    INSERT response doesn't include those columns. Single round-trip is fine.
  //    Pulls the migration-0021 fields too so the mirrored row stays correct
  //    when the payment trigger auto-resumes a paused contract.
  const { data: amcRow, error: amcErr } = await supa
    .from("amc_contracts")
    .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, expires_at, suspended_at, suspended_reason, paused_by, resumed_at, first_payment_due_at, renewed_from_id")
    .eq("id", amcId)
    .single();
  if (amcErr || !amcRow) {
    // Payment row landed; just couldn't refresh the contract view. Surface
    // a partial-success error so the caller can refetch on next bump.
    return { ok: false, error: `Payment saved but refresh failed: ${amcErr?.message ?? "unknown"}` };
  }

  const current = db.AMCS[amcId];
  const updated: AmcContract = {
    id:                amcRow.id as string,
    code:              amcRow.code as string,
    customer:          (amcRow.customer_id as string) ?? current?.customer ?? "",
    site:              (amcRow.site_id as string) ?? current?.site ?? "",
    manager:           (amcRow.manager_id as string) ?? "",
    leadTechId:        (amcRow.lead_tech_id as string) ?? "",
    contract_status:   amcRow.contract_status as AmcContract["contract_status"],
    value:             (amcRow.value_aed as number) ?? 0,
    services:          current?.services ?? { done: 0, total: 4 },
    nextDue:           (amcRow.next_due_label as string) ?? "-",
    overdueDays:       (amcRow.overdue_days as number) ?? 0,
    freeCalls:         (amcRow.free_calls_used as number) ?? 0,
    expiresAt:         (amcRow.expires_at as string) ?? "",
    suspendedAt:       (amcRow.suspended_at as string | null) ?? null,
    suspendedReason:   (amcRow.suspended_reason as string | null) ?? null,
    pausedBy:          (amcRow.paused_by as string | null) ?? null,
    resumedAt:         (amcRow.resumed_at as string | null) ?? null,
    firstPaymentDueAt: (amcRow.first_payment_due_at as string | null) ?? null,
    renewedFromId:     (amcRow.renewed_from_id as string | null) ?? null,
  };
  db.AMCS[amcId] = updated;

  return { ok: true, payment_id: insertRow.id as string, amc_updated: updated };
}

// ─────────────────────────────────────────────────────────
// AMC PAUSE / RESUME / RENEWAL (migration 0021)
// ─────────────────────────────────────────────────────────
//
// All three helpers ride on top of the existing AMC engine — they
// write to columns that already exist (suspended_at, suspended_reason)
// plus the new pause-audit columns added in 0021 (paused_by,
// resumed_at). The existing fn_amc_payment_received trigger handles
// auto-resume on payment, so no special "resume on payment" path
// here.
//
// Auto-pause: autoPauseExpiredAmcs() calls the SQL helper
// fn_check_amc_pause_eligibility() to find AMCs past their
// first_payment_due_at without a payment, then UPDATEs them to
// suspended in one batch. Called from the dashboard mount.
//
// Renewal: renewAmc() inserts a fresh amc_contracts row with the
// renewed_from_id pointer set. The BEFORE INSERT trigger
// trg_amc_set_first_payment_due_at populates first_payment_due_at
// from signed_at + grace days, so the new contract starts a fresh
// 30-day pause window automatically.
// ─────────────────────────────────────────────────────────

const AUTO_PAUSE_REASON = "Payment overdue (auto)";

/**
 * Pause an AMC contract manually. Writes to suspended_at/_reason (the
 * existing pause columns the payment trigger reads) plus paused_by
 * (new in 0021). Status flips to 'suspended' which renders as "Paused".
 *
 * Resume happens automatically when an amc_payments row is inserted
 * for this contract; the existing fn_amc_payment_received trigger
 * flips status back to 'active' and clears suspended_at/_reason.
 * Manual resume via resumeAmc() works the same way (without payment).
 */
export async function pauseAmc(
  amcId: string,
  reason: string,
  byUserId: string | null,
): Promise<{ ok: true; amc: AmcContract } | { ok: false; error: string }> {
  if (!amcId) return { ok: false, error: "AMC id is required." };
  if (!reason?.trim()) return { ok: false, error: "Pause reason is required." };
  const guard = ensureSupabase();
  if (guard) return guard;

  return updateAmcWithExtras(amcId, {
    contract_status: "suspended",
    suspended_at:    new Date().toISOString(),
    suspended_reason: reason.trim(),
    paused_by:       byUserId,
  });
}

/**
 * Resume a paused AMC manually. Sets resumed_at, clears suspended_at /
 * suspended_reason, flips status back to 'active'. The existing
 * trg_amc_status_change trigger audits the flip automatically.
 *
 * Note: paused_by is intentionally NOT cleared so the audit trail of
 * who paused remains visible alongside who resumed (resumed_by would
 * be a follow-up if needed — out of 0021 scope).
 */
export async function resumeAmc(
  amcId: string,
  _byUserId: string | null,
): Promise<{ ok: true; amc: AmcContract } | { ok: false; error: string }> {
  if (!amcId) return { ok: false, error: "AMC id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  void _byUserId; // reserved for resumed_by in a future migration

  return updateAmcWithExtras(amcId, {
    contract_status:  "active",
    suspended_at:     null,
    suspended_reason: null,
    resumed_at:       new Date().toISOString(),
  });
}

/**
 * Calls fn_check_amc_pause_eligibility() to find AMCs that should be
 * auto-paused (signed > grace_days ago, no payment, still active) and
 * batch-flips them to suspended. Returns the count flipped so the
 * caller can toast or just log silently.
 *
 * The UPDATE is gated by amc_write RLS (md/admin/manager), so this
 * silently no-ops for other roles — by design. Callers can check
 * upfront whether to even attempt the sweep.
 *
 * paused_by is left NULL so the UI can distinguish auto vs. manual
 * pauses (PhaseTracker-style logic: NULL = system, set = user).
 */
export async function autoPauseExpiredAmcs(): Promise<{ ok: true; paused: number } | { ok: false; error: string }> {
  const guard = ensureSupabase();
  if (guard) return guard;

  const supa = supabaseBrowser();
  const { data: eligible, error: rpcErr } = await supa.rpc("fn_check_amc_pause_eligibility");
  if (rpcErr) return { ok: false, error: rpcErr.message };
  const rows = (eligible ?? []) as Array<{ id: string }>;
  if (rows.length === 0) return { ok: true, paused: 0 };

  const ids = rows.map(r => r.id);
  const { error: updErr } = await supa
    .from("amc_contracts")
    .update({
      contract_status:  "suspended",
      suspended_at:     new Date().toISOString(),
      suspended_reason: AUTO_PAUSE_REASON,
      paused_by:        null,
    })
    .in("id", ids);
  if (updErr) return { ok: false, error: updErr.message };

  // Mirror in memory so the dashboard re-renders without a refetch.
  // Each row keeps its existing fields; only the pause-related ones flip.
  const nowIso = new Date().toISOString();
  for (const id of ids) {
    const cur = db.AMCS[id];
    if (cur) {
      db.AMCS[id] = {
        ...cur,
        contract_status: "suspended",
        suspendedAt:     nowIso,
        suspendedReason: AUTO_PAUSE_REASON,
        pausedBy:        null,
      };
    }
  }

  return { ok: true, paused: ids.length };
}

/**
 * Days remaining until first_payment_due_at — positive = still in
 * grace window, negative = overdue, null = no due date set yet.
 * Used by AmcPauseAlert to render "Pauses in X days" copy.
 */
export function calculateDaysUntilPause(amc: AmcContract): number | null {
  if (!amc.firstPaymentDueAt) return null;
  const due = new Date(amc.firstPaymentDueAt).getTime();
  if (Number.isNaN(due)) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((due - today.getTime()) / 86_400_000);
}

/**
 * Renew an AMC. Creates a fresh amc_contracts row pointing at the
 * previous one via renewed_from_id. Inherits the previous customer,
 * site, lead tech, manager, and value unless the caller overrides.
 *
 * The new row's first_payment_due_at is populated server-side by
 * trg_amc_set_first_payment_due_at (BEFORE INSERT) from the supplied
 * signed_at — caller doesn't need to compute it.
 *
 * Note: this does NOT change the previous contract's status. The UI
 * shows the chain link on both sides; if the boss wants the old
 * contract to flip to 'renewed' automatically, a small UPDATE here
 * would do it. Holding for now since the spec doesn't call for it.
 */
export interface AmcRenewalInput {
  code?: string;             // new contract code (auto-generated if omitted)
  value_aed: number;
  expires_at: string;        // when the renewal expires
  signed_at?: string;        // signing date — defaults to today
  manager_id?: string | null;
  lead_tech_id?: string | null;
}
export async function renewAmc(
  previousAmcId: string,
  input: AmcRenewalInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!previousAmcId) return { ok: false, error: "Previous AMC id is required." };
  if (!input.value_aed) return { ok: false, error: "Annual value is required." };
  if (!input.expires_at) return { ok: false, error: "Expiry date is required." };
  const guard = ensureSupabase();
  if (guard) return guard;

  const prev = db.AMCS[previousAmcId];
  if (!prev) return { ok: false, error: "Previous AMC not found in local mirror." };

  const supa = supabaseBrowser();
  const code = input.code?.trim() || `AMC-${Math.floor(Math.random() * 900 + 100)}`;
  const signedAt = input.signed_at || new Date().toISOString().slice(0, 10);

  const { data, error } = await supa.from("amc_contracts").insert({
    code,
    customer_id:     prev.customer,
    site_id:         prev.site || null,
    manager_id:      input.manager_id !== undefined ? input.manager_id : (prev.manager || null),
    lead_tech_id:    input.lead_tech_id !== undefined ? input.lead_tech_id : (prev.leadTechId || null),
    contract_status: "draft",
    value_aed:       input.value_aed,
    expires_at:      input.expires_at,
    signed_at:       signedAt,
    renewed_from_id: previousAmcId,
    // first_payment_due_at is populated by the BEFORE INSERT trigger
    // (trg_amc_set_first_payment_due_at) from signed_at + grace days.
  }).select("id").single();
  if (error) return { ok: false, error: error.message };

  const newId = data.id as string;
  const newRow: AmcContract = {
    id:                newId,
    code,
    customer:          prev.customer,
    site:              prev.site,
    manager:           input.manager_id !== undefined ? (input.manager_id ?? "") : prev.manager,
    leadTechId:        input.lead_tech_id !== undefined ? (input.lead_tech_id ?? "") : prev.leadTechId,
    contract_status:   "draft",
    value:             input.value_aed,
    services:          { done: 0, total: 4 },
    nextDue:           "-",
    overdueDays:       0,
    freeCalls:         0,
    expiresAt:         input.expires_at,
    suspendedAt:       null,
    suspendedReason:   null,
    pausedBy:          null,
    resumedAt:         null,
    firstPaymentDueAt: null, // server populated; UI re-fetches next paint
    renewedFromId:     previousAmcId,
  };
  db.AMCS[newId] = newRow;

  return { ok: true, id: newId };
}

// Internal helper — UPDATE amc_contracts with arbitrary extra columns
// beyond the AmcPatch contract, used by pause/resume. Splits the
// re-fetch + mirror logic out of those callers so they stay readable.
async function updateAmcWithExtras(
  amcId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; amc: AmcContract } | { ok: false; error: string }> {
  const supa = supabaseBrowser();
  const { data, error } = await supa
    .from("amc_contracts").update(body).eq("id", amcId)
    .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, expires_at, suspended_at, suspended_reason, paused_by, resumed_at, first_payment_due_at, renewed_from_id")
    .single();
  if (error) return { ok: false, error: error.message };
  const current = db.AMCS[amcId];
  const next: AmcContract = {
    id:                data.id as string,
    code:              data.code as string,
    customer:          (data.customer_id as string) ?? current?.customer ?? "",
    site:              (data.site_id as string) ?? current?.site ?? "",
    manager:           (data.manager_id as string) ?? "",
    leadTechId:        (data.lead_tech_id as string) ?? "",
    contract_status:   data.contract_status as AmcStatus,
    value:             (data.value_aed as number) ?? 0,
    services:          current?.services ?? { done: 0, total: 4 },
    nextDue:           (data.next_due_label as string) ?? "-",
    overdueDays:       (data.overdue_days as number) ?? 0,
    freeCalls:         (data.free_calls_used as number) ?? 0,
    expiresAt:         (data.expires_at as string) ?? "",
    suspendedAt:       (data.suspended_at as string | null) ?? null,
    suspendedReason:   (data.suspended_reason as string | null) ?? null,
    pausedBy:          (data.paused_by as string | null) ?? null,
    resumedAt:         (data.resumed_at as string | null) ?? null,
    firstPaymentDueAt: (data.first_payment_due_at as string | null) ?? null,
    renewedFromId:     (data.renewed_from_id as string | null) ?? null,
  };
  db.AMCS[amcId] = next;
  return { ok: true, amc: next };
}

// ─────────────────────────────────────────────────────────
// WORK ORDER
// ─────────────────────────────────────────────────────────
// 8-state lifecycle from migration 0014. Keep in lock-step with the
// wo_status enum in Postgres.
export const WORK_ORDER_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "waiting_material",
  "pending_confirmation",
  "done",
  "closed",
  "cancelled",
] as const;

export const WO_STATUS_LABEL: Record<WoStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting_material: "Waiting for Material",
  pending_confirmation: "Pending Confirmation",
  done: "Done",
  closed: "Closed",
  cancelled: "Cancelled",
};

export interface WorkOrderInput {
  title: string;
  type: WoType;
  customer_id: string;
  site_id?: string;
  scheduled_start: string;   // ISO datetime-local
  scheduled_end: string;
  assigned_lead?: string;
  additional_workers?: string[];   // user ids of additional assignees
  priority?: string;
  source_kind?: "amc" | "project" | "repair";
  source_id?: string;
}
export async function createWorkOrder(input: WorkOrderInput): Promise<Result> {
  if (!input.title?.trim()) return { ok: false, error: "Title is required." };
  if (!input.type) return { ok: false, error: "Type is required." };
  if (!input.customer_id) return { ok: false, error: "Customer is required." };
  if (!input.scheduled_start) return { ok: false, error: "Start time is required." };
  if (!input.scheduled_end) return { ok: false, error: "End time is required." };

  const code = `WO-${Math.floor(Math.random() * 9000 + 1000)}`;
  // Dedupe additional workers + drop the lead if it accidentally landed in
  // both lists. Build the final assignment set as { id, is_lead }.
  const additional = (input.additional_workers ?? [])
    .filter(uid => uid && uid !== input.assigned_lead);
  const assignmentSet = new Set<string>();
  if (input.assigned_lead) assignmentSet.add(input.assigned_lead);
  for (const uid of additional) assignmentSet.add(uid);

  const row: WorkOrder = {
    id: shortId("wo"), code, type: input.type,
    priority: input.priority || "Standard",
    title: input.title.trim(),
    source: input.source_kind && input.source_id
      ? { kind: input.source_kind, id: input.source_id }
      : { kind: "project", id: "" },
    customer: input.customer_id,
    site: input.site_id || "",
    scheduledStart: input.scheduled_start,
    scheduledEnd: input.scheduled_end,
    // New WOs start "open"; flip to "assigned" automatically when at least
    // one assignee lands. Saves a manual status change in the common path.
    status: assignmentSet.size > 0 ? "assigned" : "open",
    assignedLead: input.assigned_lead || "",
    assigned: Array.from(assignmentSet),
    progress: 0,
    slaMin: null,
    elapsedMin: 0,
    materials: [],
    // 0022 time-tracking defaults — fresh WO has never been started.
    startedAt: null,
    completedAt: null,
    durationMinutes: 0,
    actualWorkersCount: 0,
  };

  const guard = ensureSupabase();
  if (guard) return guard;

  const supa = supabaseBrowser();
  const { data, error } = await supa.from("work_orders").insert({
    code, type: input.type,
    priority: input.priority || "Standard",
    title: input.title.trim(),
    source_kind: input.source_kind || null,
    source_id: input.source_id || null,
    customer_id: input.customer_id,
    site_id: input.site_id || null,
    scheduled_start: input.scheduled_start,
    scheduled_end: input.scheduled_end,
    status: row.status,
    assigned_lead: input.assigned_lead || null,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  row.id = data.id;

  // Insert assignment rows. Lead gets is_lead=true; everyone else false.
  // RLS on work_order_assignments requires manager/lead_worker — frontend
  // gates the form to those roles, so this should always succeed for them.
  if (assignmentSet.size > 0) {
    const rows = Array.from(assignmentSet).map(uid => ({
      work_order_id: data.id,
      user_id: uid,
      is_lead: uid === input.assigned_lead,
    }));
    const { error: aErr } = await supa.from("work_order_assignments").insert(rows);
    if (aErr) {
      // Don't unwind the WO insert — surface the partial-success as a soft
      // warning. The user can re-assign from the detail view if needed.
      return { ok: false, error: `Work order created but assignments failed: ${aErr.message}` };
    }
  }

  db.WORK_ORDERS[row.id] = row;
  return { ok: true, id: row.id };
}

// Patch an existing work order. Status changes are audited server-side by
// trg_wo_status_change (see migration 0014). Optionally replaces the
// assignment set when `assigned` is provided.
export interface WorkOrderPatch {
  status?: WoStatus;
  priority?: string;
  title?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  assigned_lead?: string | null;
  // When provided, replaces the entire assignment list. Pass undefined to
  // leave assignments untouched.
  assigned?: string[];
}
export async function updateWorkOrder(
  id: string,
  patch: WorkOrderPatch,
): Promise<{ ok: true; wo: WorkOrder } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Work order id is required." };
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.title !== undefined) body.title = patch.title.trim();
  if (patch.scheduled_start !== undefined) body.scheduled_start = patch.scheduled_start;
  if (patch.scheduled_end !== undefined) body.scheduled_end = patch.scheduled_end;
  if (patch.assigned_lead !== undefined) body.assigned_lead = patch.assigned_lead;

  if (Object.keys(body).length > 0) {
    const { error } = await supa.from("work_orders").update(body).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  // Replace-and-rebuild for assignments. Simpler than diffing; same end state.
  if (patch.assigned !== undefined) {
    const leadId = patch.assigned_lead !== undefined
      ? patch.assigned_lead
      : (db.WORK_ORDERS[id]?.assignedLead || null);
    const next = Array.from(new Set(patch.assigned.filter(Boolean)));
    const { error: delErr } = await supa.from("work_order_assignments").delete().eq("work_order_id", id);
    if (delErr) return { ok: false, error: delErr.message };
    if (next.length > 0) {
      const rows = next.map(uid => ({
        work_order_id: id,
        user_id: uid,
        is_lead: uid === leadId,
      }));
      const { error: insErr } = await supa.from("work_order_assignments").insert(rows);
      if (insErr) return { ok: false, error: insErr.message };
    }
  }

  // Re-fetch so the mirror reflects what the DB stored (defaults applied,
  // trigger-side updates visible). The 0022 time-tracking columns are
  // included because they're now required on the WorkOrder type — the
  // trigger may have updated them as a side effect of a concurrent worker
  // session, so we always read them back rather than carrying stale prior
  // values forward.
  const { data: refreshed, error: rErr } = await supa
    .from("work_orders")
    .select("id, code, type, priority, title, source_kind, source_id, customer_id, site_id, scheduled_start, scheduled_end, status, assigned_lead, progress, sla_min, elapsed_min, materials, flagged, started_at, completed_at, duration_minutes, actual_workers_count")
    .eq("id", id).maybeSingle();
  if (rErr || !refreshed) return { ok: false, error: rErr?.message || "Work order disappeared after update." };

  const { data: assignRows } = await supa
    .from("work_order_assignments")
    .select("user_id")
    .eq("work_order_id", id);
  const assigned = (assignRows ?? []).map(r => (r as { user_id: string }).user_id);

  const next: WorkOrder = {
    id: refreshed.id as string,
    code: refreshed.code as string,
    type: (refreshed.type as WoType) ?? "PROJECT",
    priority: (refreshed.priority as string) ?? "Standard",
    title: refreshed.title as string,
    source: {
      kind: ((refreshed.source_kind as "amc" | "project" | "repair") ?? "project"),
      id: (refreshed.source_id as string) ?? "",
    },
    customer: (refreshed.customer_id as string) ?? "",
    site: (refreshed.site_id as string) ?? "",
    scheduledStart: (refreshed.scheduled_start as string) ?? "",
    scheduledEnd: (refreshed.scheduled_end as string) ?? "",
    status: ((refreshed.status as WoStatus) ?? "open"),
    assignedLead: (refreshed.assigned_lead as string) ?? "",
    assigned,
    progress: (refreshed.progress as number) ?? 0,
    slaMin: (refreshed.sla_min as number | null) ?? null,
    elapsedMin: (refreshed.elapsed_min as number) ?? 0,
    materials: Array.isArray(refreshed.materials) ? (refreshed.materials as string[]) : [],
    flagged: (refreshed.flagged as string | undefined) ?? undefined,
    startedAt:          (refreshed.started_at   as string | null) ?? null,
    completedAt:        (refreshed.completed_at as string | null) ?? null,
    durationMinutes:    (refreshed.duration_minutes     as number) ?? 0,
    actualWorkersCount: (refreshed.actual_workers_count as number) ?? 0,
  };
  db.WORK_ORDERS[next.id] = next;
  return { ok: true, wo: next };
}

// ─────────────────────────────────────────────────────────
// WORK ORDER — time tracking (migration 0022)
//
// Two writes per session:
//   startWorkOrder(woId, userId)       → INSERT row, ended_at = NULL
//   completeWorkOrder(woId, userId, ?) → UPDATE the open row's ended_at
//
// Both refresh the WORK_ORDER_TIME_ENTRIES mirror AND re-read the parent
// WO to pick up trigger-computed roll-ups (duration_minutes,
// actual_workers_count, started_at). No app-side math — the DB owns it.
//
// Lead workers / managers can also call markWorkOrderDone() to close the
// WO outright (sets work_orders.completed_at + status='done'); regular
// workers don't have wo_write so they can only track their own time.
// ─────────────────────────────────────────────────────────

interface TimeEntryRow {
  id: string;
  work_order_id: string;
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  note: string | null;
  created_at: string;
}

function rowToEntry(r: TimeEntryRow): WorkOrderTimeEntry {
  return {
    id:              r.id,
    workOrderId:     r.work_order_id,
    userId:          r.user_id,
    startedAt:       r.started_at,
    endedAt:         r.ended_at,
    durationMinutes: r.duration_minutes ?? 0,
    note:            r.note,
    createdAt:       r.created_at,
  };
}

/** Re-fetch the parent WO so the mirror picks up trigger-computed
 *  roll-ups after a time-entry change. Silent no-op on failure — the
 *  next page hydration will reconcile. */
async function refreshWorkOrderMirror(woId: string): Promise<void> {
  const supa = supabaseBrowser();
  const { data, error } = await supa
    .from("work_orders")
    .select("id, started_at, completed_at, duration_minutes, actual_workers_count, status")
    .eq("id", woId).maybeSingle();
  if (error || !data) return;
  const cur = db.WORK_ORDERS[woId];
  if (!cur) return;
  db.WORK_ORDERS[woId] = {
    ...cur,
    status:             ((data.status as WoStatus) ?? cur.status),
    startedAt:          (data.started_at          as string | null) ?? cur.startedAt,
    completedAt:        (data.completed_at        as string | null) ?? cur.completedAt,
    durationMinutes:    (data.duration_minutes    as number) ?? cur.durationMinutes,
    actualWorkersCount: (data.actual_workers_count as number) ?? cur.actualWorkersCount,
  };
}

/**
 * Worker clicks "Start Work". Inserts an open time entry; the
 * woe_uniq_open partial index in 0022 blocks a second concurrent
 * insert, so a stray double-click returns an error we treat as a
 * no-op (we just return the existing open entry).
 *
 * Best-effort wo.status='in_progress' bump: succeeds for
 * md/admin/manager/lead_worker via wo_write; fails silently for
 * regular workers (RLS rejects) — which is the intended design.
 * The lead can flip status separately.
 */
export async function startWorkOrder(
  woId: string,
  userId: string,
): Promise<{ ok: true; entry: WorkOrderTimeEntry } | { ok: false; error: string }> {
  if (!woId)   return { ok: false, error: "Work order id is required." };
  if (!userId) return { ok: false, error: "User id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const startedAt = new Date().toISOString();
  const { data, error } = await supa.from("work_order_time_entries").insert({
    work_order_id: woId,
    user_id:       userId,
    started_at:    startedAt,
  }).select("id, work_order_id, user_id, started_at, ended_at, duration_minutes, note, created_at")
    .maybeSingle();

  // Unique-violation on woe_uniq_open → there's already an open session.
  // Surface the existing row so the UI lands in the correct state instead
  // of erroring out (edge case 3: "Worker clicks Start twice").
  if (error) {
    if (/woe_uniq_open|duplicate key/i.test(error.message)) {
      const existing = db.openEntryFor(woId, userId);
      if (existing) return { ok: true, entry: existing };
      const { data: open } = await supa
        .from("work_order_time_entries")
        .select("id, work_order_id, user_id, started_at, ended_at, duration_minutes, note, created_at")
        .eq("work_order_id", woId).eq("user_id", userId).is("ended_at", null)
        .maybeSingle();
      if (open) {
        const entry = rowToEntry(open as TimeEntryRow);
        db.WORK_ORDER_TIME_ENTRIES[entry.id] = entry;
        return { ok: true, entry };
      }
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Time entry row missing after insert." };

  const entry = rowToEntry(data as TimeEntryRow);
  db.WORK_ORDER_TIME_ENTRIES[entry.id] = entry;

  // Best-effort status bump. Swallow RLS errors so a regular worker
  // still gets their time tracked even though wo_write rejects them.
  const cur = db.WORK_ORDERS[woId];
  if (cur && cur.status !== "in_progress"
         && cur.status !== "done" && cur.status !== "closed"
         && cur.status !== "cancelled") {
    await supa.from("work_orders").update({ status: "in_progress" }).eq("id", woId);
  }

  await refreshWorkOrderMirror(woId);
  return { ok: true, entry };
}

/**
 * Worker clicks "Done" on their own session. Closes the open entry
 * (sets ended_at = now()); the GENERATED duration_minutes + the
 * trigger-driven WO roll-up follow automatically. Does NOT flip the
 * WO status — that's the lead's call via markWorkOrderDone().
 *
 * If the worker has no open entry, returns ok with entry=null so the
 * UI can show "nothing to close".
 */
export async function completeWorkOrder(
  woId: string,
  userId: string,
  note?: string,
): Promise<{ ok: true; entry: WorkOrderTimeEntry | null } | { ok: false; error: string }> {
  if (!woId)   return { ok: false, error: "Work order id is required." };
  if (!userId) return { ok: false, error: "User id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const trimmed = note?.trim() || null;

  const { data, error } = await supa.from("work_order_time_entries")
    .update({ ended_at: new Date().toISOString(), note: trimmed })
    .eq("work_order_id", woId)
    .eq("user_id", userId)
    .is("ended_at", null)
    .select("id, work_order_id, user_id, started_at, ended_at, duration_minutes, note, created_at")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, entry: null };

  const entry = rowToEntry(data as TimeEntryRow);
  db.WORK_ORDER_TIME_ENTRIES[entry.id] = entry;
  await refreshWorkOrderMirror(woId);
  return { ok: true, entry };
}

/**
 * Lead/manager closes the WO outright. Sets work_orders.completed_at
 * + flips status='done'. Also closes any open time entries on this WO
 * so a forgotten clock-in doesn't keep accruing (edge case 1: "Worker
 * forgets to click Done"). Best-effort on the entries side; the WO
 * status flip is what matters.
 */
export async function markWorkOrderDone(
  woId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!woId) return { ok: false, error: "Work order id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const completedAt = new Date().toISOString();

  // Close any dangling open entries first so manager-override doesn't
  // leave timers running. We do this BEFORE the WO update so the
  // trigger-computed duration_minutes is final when the WO row commits.
  await supa.from("work_order_time_entries")
    .update({ ended_at: completedAt })
    .eq("work_order_id", woId)
    .is("ended_at", null);

  const { error } = await supa.from("work_orders")
    .update({ status: "done", completed_at: completedAt })
    .eq("id", woId);
  if (error) return { ok: false, error: error.message };

  // Mirror refresh: pull every closed entry for this WO so the history
  // panel reflects the manager-override.
  const { data: rows } = await supa.from("work_order_time_entries")
    .select("id, work_order_id, user_id, started_at, ended_at, duration_minutes, note, created_at")
    .eq("work_order_id", woId);
  for (const r of (rows ?? []) as TimeEntryRow[]) {
    db.WORK_ORDER_TIME_ENTRIES[r.id] = rowToEntry(r);
  }
  await refreshWorkOrderMirror(woId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// HOURS AGGREGATION HELPERS (pure reads off the mirror)
// ─────────────────────────────────────────────────────────

/** Total tracked minutes across every WO that belongs to the project,
 *  using the trigger-computed wo.durationMinutes (so it includes every
 *  worker, not just whatever entries the current role can see). */
export function getProjectTotalHours(projectId: string): number {
  if (!projectId) return 0;
  let minutes = 0;
  for (const w of Object.values(db.WORK_ORDERS)) {
    if (w.source.kind !== "project" || w.source.id !== projectId) continue;
    minutes += w.durationMinutes;
  }
  return minutes / 60;
}

/** Hours a specific user logged on a specific project, summed from
 *  individual time entries (so the breakdown is per-person rather than
 *  per-WO). NOTE: workers / drivers / subcontractors will only see
 *  their own entries due to RLS — the number is accurate for "self"
 *  reports but may under-count when called for another user from a
 *  field-role session. */
export function getUserHoursOnProject(userId: string, projectId: string): number {
  if (!userId || !projectId) return 0;
  const woIds = new Set<string>();
  for (const w of Object.values(db.WORK_ORDERS)) {
    if (w.source.kind === "project" && w.source.id === projectId) woIds.add(w.id);
  }
  let minutes = 0;
  for (const e of Object.values(db.WORK_ORDER_TIME_ENTRIES)) {
    if (e.userId !== userId) continue;
    if (!woIds.has(e.workOrderId)) continue;
    minutes += e.durationMinutes;
  }
  return minutes / 60;
}

// ─────────────────────────────────────────────────────────
// REPAIR TICKET
// ─────────────────────────────────────────────────────────
export interface RepairInput {
  title: string;
  customer_id: string;
  site_id?: string;
  lead_tech_id?: string | null;
  classification: "AMC free-call" | "Chargeable" | "Warranty";
  priority: "high" | "normal";
  sla_target_min?: number;
}
export async function createRepairTicket(input: RepairInput): Promise<Result> {
  if (!input.title?.trim()) return { ok: false, error: "Title is required." };
  if (!input.customer_id) return { ok: false, error: "Customer is required." };
  if (!input.classification) return { ok: false, error: "Classification is required." };

  const code = `TKT-${Math.floor(Math.random() * 900 + 100)}`;
  const id = shortId("r");
  const row: RepairTicket = {
    id, code, title: input.title.trim(),
    customer: input.customer_id, site: input.site_id || "",
    leadTechId: input.lead_tech_id || "",
    state: "New",
    sla: { target: input.sla_target_min || 240, elapsed: 0, breach: false },
    classification: input.classification,
    priority: input.priority || "normal",
    openedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
    assigned: null, visits: 0,
  };

  const guard = ensureSupabase();
  if (guard) return guard;

  const { data, error } = await supabaseBrowser().from("repair_tickets").insert({
    code, title: input.title.trim(),
    customer_id: input.customer_id,
    site_id: input.site_id || null,
    lead_tech_id: input.lead_tech_id || null,
    state: "New",
    classification: input.classification,
    priority: input.priority,
    sla_target_min: input.sla_target_min || 240,
    sla_elapsed_min: 0,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  row.id = data.id;

  db.REPAIRS[row.id] = row;
  return { ok: true, id: row.id };
}

// ─────────────────────────────────────────────────────────
// APPROVAL - Material Request / Quotation / Variation Order
// ─────────────────────────────────────────────────────────
export interface ApprovalInput {
  kind: Approval["kind"];
  context: string;
  amount_aed?: number | null;
  priority?: "high" | "normal";
  requester_id: string;
  target_kind?: string;
  target_id?: string;
}
export async function createApproval(input: ApprovalInput): Promise<Result> {
  if (!input.kind) return { ok: false, error: "Approval kind is required." };
  if (!input.context?.trim()) return { ok: false, error: "Context is required." };
  if (!input.requester_id) return { ok: false, error: "Requester is required." };

  const code = `AP-${Math.floor(Math.random() * 900 + 100)}`;
  const id = shortId("ap");
  const row: Approval = {
    id, code, kind: input.kind,
    amount: input.amount_aed ?? null,
    context: input.context.trim(),
    requester: input.requester_id,
    target: input.target_kind && input.target_id
      ? { kind: input.target_kind, id: input.target_id }
      : { kind: "system", id: "" },
    openedAt: "just now",
    priority: input.priority || "normal",
    pendingFor: input.requester_id,
    chain: [{ step: 1, role: "manager", user: "u_rashid", state: "pending" }],
  };

  const guard = ensureSupabase();
  if (guard) return guard;

  const { data, error } = await supabaseBrowser().from("approvals").insert({
    code, kind: input.kind,
    amount_aed: input.amount_aed ?? null,
    context: input.context.trim(),
    requester_id: input.requester_id,
    target_kind: input.target_kind || null,
    target_id: input.target_id || null,
    priority: input.priority || "normal",
    state: "pending",
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  row.id = data.id;

  db.APPROVALS[row.id] = row;
  return { ok: true, id: row.id };
}

// ─────────────────────────────────────────────────────────
// REPLACEMENT REQUEST (migration 0017)
// ─────────────────────────────────────────────────────────
// Lifecycle (Worker → Lead Tech, gated at both approval AND post-install
// confirmation): requested → approved → pending_confirmation → completed.
// Side branches: rejected (terminal) and cancelled (terminal).
//
// The helpers below mirror the updateAmc / updateProject patterns —
// optimistic concurrency via .eq("status", expected) so a second actor's
// duplicate transition fails gracefully instead of clobbering state.

export const REPLACEMENT_STATUSES: ReplacementStatus[] = [
  "requested", "approved", "rejected",
  "in_progress", "pending_confirmation", "completed", "cancelled",
];

export const REPLACEMENT_STATUS_LABEL: Record<ReplacementStatus, string> = {
  requested:            "Requested",
  approved:             "Approved",
  rejected:             "Rejected",
  in_progress:          "In Progress",
  pending_confirmation: "Pending Confirmation",
  completed:            "Completed",
  cancelled:            "Cancelled",
};

// Badge CSS class per status (consumed by ReplacementsList table + detail
// page). All classes already exist in components/shared.tsx StatusBadge.
export const REPLACEMENT_STATUS_BADGE: Record<ReplacementStatus, string> = {
  requested:            "badge-info",
  approved:             "badge-warning",
  in_progress:          "badge-info",
  pending_confirmation: "badge-violet",
  completed:            "badge-success",
  rejected:             "badge-danger",
  cancelled:            "badge-outline",
};

export const REPLACEMENT_CONTEXT_LABEL: Record<ReplacementContext, string> = {
  main_contractor: "Main Contractor Job",
  amc_free_call:   "AMC Free Call",
  amc_scheduled:   "AMC Scheduled Service",
  repair:          "Repair Ticket",
};

const RR_SELECT_COLS =
  "id, code, context, work_order_id, project_id, amc_contract_id, repair_ticket_id, " +
  "customer_id, site_id, item_name, quantity, reason, status, " +
  "requested_by, requested_at, approved_by, approved_at, approval_note, " +
  "installed_by, installed_at, installation_note, " +
  "confirmed_by, confirmed_at, confirmation_note, " +
  "rejected_by, rejected_at, rejection_reason, created_at, updated_at";

// Maps a raw Supabase row → ReplacementRequest. Kept here (and not imported
// from lib/hydrate.ts) because hydrate is server-only — duplicating the
// trivial mapper costs nothing.
function rowToRr(r: Record<string, unknown>): ReplacementRequest {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    id:               s(r.id),
    code:             s(r.code),
    context:          ((r.context as ReplacementContext) ?? "main_contractor"),
    workOrderId:      (r.work_order_id as string | null) ?? null,
    projectId:        (r.project_id as string | null) ?? null,
    amcContractId:    (r.amc_contract_id as string | null) ?? null,
    repairTicketId:   (r.repair_ticket_id as string | null) ?? null,
    customerId:       s(r.customer_id),
    siteId:           (r.site_id as string | null) ?? null,
    itemName:         s(r.item_name),
    quantity:         typeof r.quantity === "number" ? r.quantity : 1,
    reason:           sn(r.reason),
    status:           ((r.status as ReplacementStatus) ?? "requested"),
    requestedBy:      sn(r.requested_by),
    requestedAt:      s(r.requested_at),
    approvedBy:       sn(r.approved_by),
    approvedAt:       sn(r.approved_at),
    approvalNote:     sn(r.approval_note),
    installedBy:      sn(r.installed_by),
    installedAt:      sn(r.installed_at),
    installationNote: sn(r.installation_note),
    confirmedBy:      sn(r.confirmed_by),
    confirmedAt:      sn(r.confirmed_at),
    confirmationNote: sn(r.confirmation_note),
    rejectedBy:       sn(r.rejected_by),
    rejectedAt:       sn(r.rejected_at),
    rejectionReason:  sn(r.rejection_reason),
    createdAt:        s(r.created_at),
    updatedAt:        s(r.updated_at),
  };
}

export interface ReplacementRequestInput {
  context: ReplacementContext;
  customer_id: string;
  work_order_id?: string | null;
  project_id?: string | null;
  amc_contract_id?: string | null;
  repair_ticket_id?: string | null;
  site_id?: string | null;
  item_name: string;
  quantity?: number;
  reason?: string | null;
}

type RrOk = { ok: true; rr: ReplacementRequest };
type RrFail = { ok: false; error: string };
type RrResult = RrOk | RrFail;

// 23505 = unique_violation in Postgres. The code-gen trigger uses
// COUNT(*) + 1 which is racy under concurrent inserts — see the comment
// in 0017_replacement_requests.sql §7. Retry up to 3 times; each attempt
// re-runs the trigger so the count refreshes.
const UNIQUE_VIOLATION = "23505";
const MAX_CODE_RETRIES = 3;

export async function createReplacementRequest(input: ReplacementRequestInput): Promise<RrResult> {
  if (!input.item_name?.trim()) return { ok: false, error: "Item name is required." };
  if (!input.customer_id) return { ok: false, error: "Customer is required." };
  if (!input.context) return { ok: false, error: "Context is required." };
  const qty = input.quantity ?? 1;
  if (!Number.isFinite(qty) || qty < 1) return { ok: false, error: "Quantity must be at least 1." };

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const body = {
    context: input.context,
    customer_id: input.customer_id,
    work_order_id:    input.work_order_id    ?? null,
    project_id:       input.project_id       ?? null,
    amc_contract_id:  input.amc_contract_id  ?? null,
    repair_ticket_id: input.repair_ticket_id ?? null,
    site_id:          input.site_id          ?? null,
    item_name: input.item_name.trim(),
    quantity: qty,
    reason: input.reason?.trim() || null,
  };

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const { data, error } = await supa
      .from("replacement_requests")
      .insert(body)
      .select(RR_SELECT_COLS)
      .single();
    if (!error && data) {
      const rr = rowToRr(data as unknown as Record<string, unknown>);
      db.REPLACEMENTS[rr.id] = rr;
      return { ok: true, rr };
    }
    // Retry only on unique-violation against the code column. Anything else
    // (RLS denial, FK error, etc.) is reported immediately.
    const code = (error as { code?: string } | null)?.code;
    const msg  = (error as { message?: string } | null)?.message ?? "";
    if (code === UNIQUE_VIOLATION && /replacement_requests_code_key|code/.test(msg)) {
      continue;
    }
    return { ok: false, error: error?.message ?? "Couldn't create replacement request." };
  }
  return { ok: false, error: "Couldn't allocate a unique RR code after retries. Please try again." };
}

// Generic update helper used by the 5 lifecycle transitions. Uses
// optimistic concurrency: the .eq("status", expected) predicate means
// if someone else already advanced the row, our UPDATE matches 0 rows
// and we surface a friendly error instead of clobbering.
async function rrTransition(
  id: string,
  expectedStatus: ReplacementStatus,
  patch: Record<string, unknown>,
): Promise<RrResult> {
  if (!id) return { ok: false, error: "Replacement id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { data, error } = await supa
    .from("replacement_requests")
    .update(patch)
    .eq("id", id)
    .eq("status", expectedStatus)
    .select(RR_SELECT_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    // No row matched — either the id doesn't exist, RLS denied us, or the
    // status has already moved on. Refetch to give the caller something
    // useful to display.
    const { data: current } = await supa
      .from("replacement_requests")
      .select(RR_SELECT_COLS)
      .eq("id", id).maybeSingle();
    if (current) {
      const rr = rowToRr(current as unknown as Record<string, unknown>);
      db.REPLACEMENTS[rr.id] = rr;
      return {
        ok: false,
        error: `This replacement is already ${REPLACEMENT_STATUS_LABEL[rr.status]} — refresh to see the latest.`,
      };
    }
    return { ok: false, error: "Replacement not found or no permission to update." };
  }
  const rr = rowToRr(data[0] as unknown as Record<string, unknown>);
  db.REPLACEMENTS[rr.id] = rr;
  return { ok: true, rr };
}

export async function approveReplacement(id: string, note: string | null, approverId: string): Promise<RrResult> {
  // Self-approval check is performed by the UI layer (it has the
  // requester id readily available). The DB allows it — RLS gates
  // the *who can update*, not *the social rule*.
  return rrTransition(id, "requested", {
    status: "approved",
    approved_by: approverId,
    approved_at: new Date().toISOString(),
    approval_note: note?.trim() || null,
  });
}

export async function rejectReplacement(id: string, reason: string, rejecterId: string): Promise<RrResult> {
  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };
  return rrTransition(id, "requested", {
    status: "rejected",
    rejected_by: rejecterId,
    rejected_at: new Date().toISOString(),
    rejection_reason: trimmed,
  });
}

export async function markReplacementInstalled(id: string, note: string | null, installerId: string): Promise<RrResult> {
  return rrTransition(id, "approved", {
    status: "pending_confirmation",
    installed_by: installerId,
    installed_at: new Date().toISOString(),
    installation_note: note?.trim() || null,
  });
}

export async function confirmReplacement(id: string, note: string | null, confirmerId: string): Promise<RrResult> {
  return rrTransition(id, "pending_confirmation", {
    status: "completed",
    confirmed_by: confirmerId,
    confirmed_at: new Date().toISOString(),
    confirmation_note: note?.trim() || null,
  });
}

// Send-back: lead tech reverts a pending_confirmation back to approved so
// the worker can redo the install. Reason is stored in rejection_reason
// (overloaded — there's no separate sendback_reason column today).
export async function sendBackReplacement(id: string, reason: string): Promise<RrResult> {
  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, error: "Reason is required to send back." };
  return rrTransition(id, "pending_confirmation", {
    status: "approved",
    installed_by: null,
    installed_at: null,
    installation_note: null,
    rejection_reason: trimmed,  // overloaded — see comment above
  });
}

// Cancel — only valid while non-terminal. Frontend gates by role: requester
// can cancel only while 'requested'; lead+ can cancel while anything except
// completed. The DB happily updates either way; we keep the policy in code.
export async function cancelReplacement(id: string, reason: string, currentStatus: ReplacementStatus): Promise<RrResult> {
  if (currentStatus === "completed") return { ok: false, error: "Completed replacements cannot be cancelled." };
  if (currentStatus === "cancelled") return { ok: false, error: "Already cancelled." };
  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, error: "Reason is required to cancel." };
  return rrTransition(id, currentStatus, {
    status: "cancelled",
    rejection_reason: trimmed,  // overloaded reason field
  });
}

// ─────────────────────────────────────────────────────────
// SUB-CONTRACTORS  (migration 0023)
//
// External-contractor directory + per-WO assignments + time tracking.
// All writes are gated by RLS:
//   • sub_contractors.write           md / admin / manager
//   • work_order_sub_contractors.write  md / admin / manager
//                                       + lead_worker on their own WO
// The helpers below mirror the row into db.SUB_CONTRACTORS /
// db.WORK_ORDER_SUB_CONTRACTORS on success so the next render shows
// the change without waiting for a full re-hydration.
// ─────────────────────────────────────────────────────────

export interface SubContractorInput {
  name: string;
  phone?: string | null;
  emirates_id?: string | null;
  company?: string | null;
  notes?: string | null;
}

interface SubContractorRow {
  id: string;
  name: string;
  phone: string | null;
  emirates_id: string | null;
  company: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

function subRowToType(r: SubContractorRow): SubContractor {
  return {
    id:          r.id,
    name:        r.name,
    phone:       r.phone,
    emiratesId:  r.emirates_id,
    company:     r.company,
    notes:       r.notes,
    isActive:    r.is_active,
    createdAt:   r.created_at,
    createdBy:   r.created_by,
  };
}

export async function createSubContractor(
  input: SubContractorInput,
  createdBy?: string,
): Promise<{ ok: true; sub: SubContractor } | { ok: false; error: string }> {
  if (!input.name?.trim()) return { ok: false, error: "Name is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { data, error } = await supa.from("sub_contractors").insert({
    name:        input.name.trim(),
    phone:       input.phone?.trim() || null,
    emirates_id: input.emirates_id?.trim() || null,
    company:     input.company?.trim() || null,
    notes:       input.notes?.trim() || null,
    created_by:  createdBy || null,
  }).select("id, name, phone, emirates_id, company, notes, is_active, created_at, created_by")
    .maybeSingle();

  if (error) {
    // Friendly message on the partial-unique Emirates-ID constraint.
    if (/sub_uniq_emirates_id|duplicate key/i.test(error.message)) {
      return { ok: false, error: "A sub-contractor with this Emirates ID already exists." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Sub-contractor row missing after insert." };

  const sub = subRowToType(data as SubContractorRow);
  db.SUB_CONTRACTORS[sub.id] = sub;
  return { ok: true, sub };
}

export interface SubContractorPatch {
  name?: string;
  phone?: string | null;
  emirates_id?: string | null;
  company?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export async function updateSubContractor(
  id: string,
  patch: SubContractorPatch,
): Promise<{ ok: true; sub: SubContractor } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Sub-contractor id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const body: Record<string, unknown> = {};
  if (patch.name !== undefined)        body.name        = patch.name.trim();
  if (patch.phone !== undefined)       body.phone       = patch.phone?.trim() || null;
  if (patch.emirates_id !== undefined) body.emirates_id = patch.emirates_id?.trim() || null;
  if (patch.company !== undefined)     body.company     = patch.company?.trim() || null;
  if (patch.notes !== undefined)       body.notes       = patch.notes?.trim() || null;
  if (patch.is_active !== undefined)   body.is_active   = patch.is_active;

  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };

  const { data, error } = await supa.from("sub_contractors")
    .update(body)
    .eq("id", id)
    .select("id, name, phone, emirates_id, company, notes, is_active, created_at, created_by")
    .maybeSingle();

  if (error) {
    if (/sub_uniq_emirates_id|duplicate key/i.test(error.message)) {
      return { ok: false, error: "A sub-contractor with this Emirates ID already exists." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Sub-contractor not found after update." };

  const sub = subRowToType(data as SubContractorRow);
  db.SUB_CONTRACTORS[sub.id] = sub;
  return { ok: true, sub };
}

/** Soft-delete: flip is_active=false. Existing WO assignments stay
 *  visible; the UI hides this profile from the "add to WO" picker. */
export async function deactivateSubContractor(id: string) {
  return updateSubContractor(id, { is_active: false });
}

// ─── Sub-contractor × Work Order assignment + time tracking ─

interface WosRow {
  id: string;
  work_order_id: string;
  sub_contractor_id: string;
  assigned_at: string;
  assigned_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_minutes: number;
  note: string | null;
}

function wosRowToType(r: WosRow): WorkOrderSubContractor {
  return {
    id:                r.id,
    workOrderId:       r.work_order_id,
    subContractorId:   r.sub_contractor_id,
    assignedAt:        r.assigned_at,
    assignedBy:        r.assigned_by,
    startedAt:         r.started_at,
    completedAt:       r.completed_at,
    durationMinutes:   r.duration_minutes ?? 0,
    note:              r.note,
  };
}

export async function assignSubContractorToWO(
  woId: string,
  subId: string,
  assignedBy?: string,
): Promise<{ ok: true; assignment: WorkOrderSubContractor } | { ok: false; error: string }> {
  if (!woId)  return { ok: false, error: "Work order id is required." };
  if (!subId) return { ok: false, error: "Sub-contractor id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { data, error } = await supa.from("work_order_sub_contractors").insert({
    work_order_id:     woId,
    sub_contractor_id: subId,
    assigned_by:       assignedBy || null,
  }).select("id, work_order_id, sub_contractor_id, assigned_at, assigned_by, started_at, completed_at, duration_minutes, note")
    .maybeSingle();

  if (error) {
    // wos_uniq_wo_sub — same sub already on this WO.
    if (/wos_uniq_wo_sub|duplicate key/i.test(error.message)) {
      return { ok: false, error: "This sub-contractor is already assigned to this work order." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Assignment row missing after insert." };

  const assignment = wosRowToType(data as WosRow);
  db.WORK_ORDER_SUB_CONTRACTORS[assignment.id] = assignment;
  return { ok: true, assignment };
}

export async function removeSubContractorFromWO(
  woId: string,
  subId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!woId || !subId) return { ok: false, error: "Both ids required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { error } = await supa.from("work_order_sub_contractors")
    .delete()
    .eq("work_order_id", woId)
    .eq("sub_contractor_id", subId);
  if (error) return { ok: false, error: error.message };

  // Drop from mirror.
  for (const [k, v] of Object.entries(db.WORK_ORDER_SUB_CONTRACTORS)) {
    if (v.workOrderId === woId && v.subContractorId === subId) {
      delete db.WORK_ORDER_SUB_CONTRACTORS[k];
    }
  }
  return { ok: true };
}

/** Stamp started_at = now() on the (wo, sub) row. The DB CHECK
 *  constraint won't accept a completed_at without a started_at, so
 *  this is always the first time-tracking write for a sub. */
export async function startSubContractorWork(
  woId: string,
  subId: string,
): Promise<{ ok: true; assignment: WorkOrderSubContractor } | { ok: false; error: string }> {
  return updateSubAssignment(woId, subId, { started_at: new Date().toISOString() });
}

/** Stamp completed_at = now(). GENERATED duration_minutes follows. */
export async function completeSubContractorWork(
  woId: string,
  subId: string,
  note?: string,
): Promise<{ ok: true; assignment: WorkOrderSubContractor } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = { completed_at: new Date().toISOString() };
  if (note?.trim()) patch.note = note.trim();
  return updateSubAssignment(woId, subId, patch);
}

async function updateSubAssignment(
  woId: string,
  subId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; assignment: WorkOrderSubContractor } | { ok: false; error: string }> {
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { data, error } = await supa.from("work_order_sub_contractors")
    .update(body)
    .eq("work_order_id", woId)
    .eq("sub_contractor_id", subId)
    .select("id, work_order_id, sub_contractor_id, assigned_at, assigned_by, started_at, completed_at, duration_minutes, note")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Assignment not found." };

  const assignment = wosRowToType(data as WosRow);
  db.WORK_ORDER_SUB_CONTRACTORS[assignment.id] = assignment;
  return { ok: true, assignment };
}

// ─────────────────────────────────────────────────────────
// SUB-CONTRACTOR HOURS LOG  (migration 0026)
//
// Lead Tech / Manager / Admin records hours-per-day for each sub on
// each WO. Multiple entries per (WO, sub, day) are allowed — a sub may
// come and go through the day. The composite FK wosh_assignment_exists
// guarantees the sub is already on the WO; we surface a friendly
// message when callers try to log against an unassigned sub.
//
// The older startSubContractorWork / completeSubContractorWork helpers
// in this file are intentionally untouched — they remain harmless dead
// code we may revisit later. The hours log is the supported path.
// ─────────────────────────────────────────────────────────

interface WoshRow {
  id: string;
  work_order_id: string;
  sub_contractor_id: string;
  entry_date: string;
  hours: number | string;
  notes: string | null;
  logged_by: string | null;
  logged_at: string;
}

function woshRowToType(r: WoshRow): WorkOrderSubContractorHours {
  // Supabase JS sometimes returns numeric columns as strings to
  // preserve precision; numeric(5,2) is safely a JS number but we
  // coerce defensively so callers always get a primitive.
  const hours = typeof r.hours === "string" ? Number(r.hours) : r.hours;
  return {
    id:                r.id,
    workOrderId:       r.work_order_id,
    subContractorId:   r.sub_contractor_id,
    entryDate:         r.entry_date.slice(0, 10),
    hours,
    notes:             r.notes,
    loggedBy:          r.logged_by,
    loggedAt:          r.logged_at,
  };
}

export interface SubContractorHoursInput {
  workOrderId: string;
  subContractorId: string;
  entryDate: string;            // YYYY-MM-DD
  hours: number;                // 0.25 ≤ hours ≤ 24
  notes?: string | null;
}

/**
 * Insert one hours-log entry. Caller is responsible for the soft
 * validations the spec keeps in the UI (no future dates, no dates
 * before the sub's assignedAt). The DB CHECK and composite FK are the
 * hard backstops; we translate their error messages here so the toast
 * is actionable instead of raw Postgres.
 *
 * loggedBy is taken as a separate arg (matches the createSubContractor /
 * assignSubContractorToWO pattern). For lead_worker the wosh_write RLS
 * policy reads logged_by on UPDATE/DELETE — they can only edit rows
 * where logged_by = themselves.
 */
export async function logSubContractorHours(
  input: SubContractorHoursInput,
  loggedBy?: string,
): Promise<{ ok: true; entry: WorkOrderSubContractorHours } | { ok: false; error: string }> {
  if (!input.workOrderId)     return { ok: false, error: "Work order id is required." };
  if (!input.subContractorId) return { ok: false, error: "Sub-contractor id is required." };
  if (!input.entryDate)       return { ok: false, error: "Entry date is required." };
  if (!(input.hours > 0))     return { ok: false, error: "Hours must be greater than 0." };
  if (input.hours > 24)       return { ok: false, error: "Hours cannot exceed 24." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { data, error } = await supa.from("work_order_sub_contractor_hours").insert({
    work_order_id:     input.workOrderId,
    sub_contractor_id: input.subContractorId,
    entry_date:        input.entryDate,
    hours:             input.hours,
    notes:             input.notes?.trim() || null,
    logged_by:         loggedBy || null,
  }).select("id, work_order_id, sub_contractor_id, entry_date, hours, notes, logged_by, logged_at")
    .maybeSingle();

  if (error) {
    if (/wosh_assignment_exists/i.test(error.message)) {
      return { ok: false, error: "This sub-contractor is not assigned to this work order." };
    }
    if (/wosh_chk_hours_range/i.test(error.message)) {
      return { ok: false, error: "Hours must be between 0.25 and 24." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Hours entry row missing after insert." };

  const entry = woshRowToType(data as WoshRow);
  db.WORK_ORDER_SUB_CONTRACTOR_HOURS[entry.id] = entry;
  return { ok: true, entry };
}

export interface SubContractorHoursPatch {
  hours?: number;
  notes?: string | null;
  entryDate?: string;           // YYYY-MM-DD
}

/**
 * Edit a previously-logged entry. Only hours / notes / entryDate are
 * mutable — workOrderId, subContractorId and loggedBy are immutable
 * (changing them would defeat the audit trail and the RLS check that
 * lets a lead_worker edit only their own entries).
 */
export async function editSubContractorHoursEntry(
  entryId: string,
  patch: SubContractorHoursPatch,
): Promise<{ ok: true; entry: WorkOrderSubContractorHours } | { ok: false; error: string }> {
  if (!entryId) return { ok: false, error: "Entry id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const body: Record<string, unknown> = {};
  if (patch.hours !== undefined) {
    if (!(patch.hours > 0)) return { ok: false, error: "Hours must be greater than 0." };
    if (patch.hours > 24)   return { ok: false, error: "Hours cannot exceed 24." };
    body.hours = patch.hours;
  }
  if (patch.notes !== undefined)     body.notes = patch.notes?.trim() || null;
  if (patch.entryDate !== undefined) {
    if (!patch.entryDate) return { ok: false, error: "Entry date cannot be empty." };
    body.entry_date = patch.entryDate;
  }
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };

  const { data, error } = await supa.from("work_order_sub_contractor_hours")
    .update(body)
    .eq("id", entryId)
    .select("id, work_order_id, sub_contractor_id, entry_date, hours, notes, logged_by, logged_at")
    .maybeSingle();

  if (error) {
    if (/wosh_chk_hours_range/i.test(error.message)) {
      return { ok: false, error: "Hours must be between 0.25 and 24." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Hours entry not found after update." };

  const entry = woshRowToType(data as WoshRow);
  db.WORK_ORDER_SUB_CONTRACTOR_HOURS[entry.id] = entry;
  return { ok: true, entry };
}

/** Hard-delete the entry. RLS enforces who can delete: md/admin/manager
 *  always; lead_worker only where they're the logger of this row AND
 *  the lead on the parent WO. */
export async function deleteSubContractorHoursEntry(
  entryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!entryId) return { ok: false, error: "Entry id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { error } = await supa.from("work_order_sub_contractor_hours")
    .delete()
    .eq("id", entryId);
  if (error) return { ok: false, error: error.message };

  delete db.WORK_ORDER_SUB_CONTRACTOR_HOURS[entryId];
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════
// PHASE 8 — AMC FREE CALLS (table from 0009b)
// ═════════════════════════════════════════════════════════════
//
// The 0009b schema only has symptom + reported_by_customer_at — no
// dedicated description, technician_id, or notes columns. The UI
// gathers description + notes; we concat them into `symptom` with
// a separator so the data survives without touching the schema.
// Technician is shown on the form for context (auto-filled from
// session) but not persisted — the demo's "free_calls_used"
// counter on amc_contracts is the headline metric.

export interface FreeCallInput {
  amc_contract_id: string;
  description: string;      // required, lands in symptom
  reported_at?: string;     // ISO; defaults to now()
  notes?: string | null;    // optional, appended to symptom
}

interface FreeCallRow {
  id: string;
  amc_contract_id: string;
  reported_by_customer_at: string;
  symptom: string | null;
  work_order_id: string | null;
  completed_at: string | null;
  created_at: string;
}

function freeCallRowToType(r: FreeCallRow): FreeCall {
  return {
    id:              r.id,
    amcContractId:   r.amc_contract_id,
    reportedAt:      r.reported_by_customer_at,
    symptom:         r.symptom ?? "",
    workOrderId:     r.work_order_id,
    completedAt:     r.completed_at,
    createdAt:       r.created_at,
  };
}

export async function createFreeCall(
  input: FreeCallInput,
): Promise<{ ok: true; freeCall: FreeCall } | { ok: false; error: string }> {
  if (!input.amc_contract_id) return { ok: false, error: "AMC contract is required." };
  if (!input.description?.trim()) return { ok: false, error: "Description is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const symptom = input.notes?.trim()
    ? `${input.description.trim()}\n\nNotes: ${input.notes.trim()}`
    : input.description.trim();
  const reportedAt = input.reported_at || new Date().toISOString();

  const { data, error } = await supa.from("amc_free_calls").insert({
    amc_contract_id:         input.amc_contract_id,
    reported_by_customer_at: reportedAt,
    symptom,
  }).select("id, amc_contract_id, reported_by_customer_at, symptom, work_order_id, completed_at, created_at")
    .maybeSingle();

  if (error)   return { ok: false, error: error.message };
  if (!data)   return { ok: false, error: "Free-call row missing after insert." };

  const freeCall = freeCallRowToType(data as FreeCallRow);
  db.FREE_CALLS[freeCall.id] = freeCall;

  // Best-effort: increment amc_contracts.free_calls_used. Failure
  // (e.g. RLS) is non-fatal — the count refreshes on next hydrate.
  const cur = db.AMCS[input.amc_contract_id];
  if (cur) {
    const nextCount = (cur.freeCalls || 0) + 1;
    const { error: incErr } = await supa
      .from("amc_contracts")
      .update({ free_calls_used: nextCount })
      .eq("id", input.amc_contract_id);
    if (!incErr) {
      db.AMCS[input.amc_contract_id] = { ...cur, freeCalls: nextCount };
    }
  }

  return { ok: true, freeCall };
}

// ═════════════════════════════════════════════════════════════
// PHASE 11 — QUOTATIONS (migration 0028)
// ═════════════════════════════════════════════════════════════

export interface QuotationInput {
  code?: string;
  customer_id?: string | null;
  title: string;
  value_aed?: number;
  valid_until?: string | null;
  notes?: string | null;
}

interface QuotationRow {
  id: string;
  code: string;
  customer_id: string | null;
  title: string;
  value_aed: number | string;
  status: string;
  valid_until: string | null;
  converted_to_project_id: string | null;
  converted_to_amc_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function quotationRowToType(r: QuotationRow): Quotation {
  const v = typeof r.value_aed === "number" ? r.value_aed : Number(r.value_aed);
  return {
    id:                    r.id,
    code:                  r.code,
    customerId:            r.customer_id,
    title:                 r.title,
    valueAed:              Number.isFinite(v) ? v : 0,
    status:                (r.status as QuotationStatus) ?? "draft",
    validUntil:            r.valid_until,
    convertedToProjectId:  r.converted_to_project_id,
    convertedToAmcId:      r.converted_to_amc_id,
    notes:                 r.notes,
    createdBy:             r.created_by,
    createdAt:             r.created_at,
    updatedAt:             r.updated_at,
  };
}

export async function createQuotation(
  input: QuotationInput,
  createdBy?: string,
): Promise<{ ok: true; quotation: Quotation } | { ok: false; error: string }> {
  if (!input.title?.trim()) return { ok: false, error: "Title is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const code = input.code?.trim() || `QTN-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const { data, error } = await supa.from("quotations").insert({
    code,
    customer_id: input.customer_id || null,
    title:       input.title.trim(),
    value_aed:   input.value_aed ?? 0,
    valid_until: input.valid_until || null,
    notes:       input.notes?.trim() || null,
    created_by:  createdBy || null,
  })
  .select("id, code, customer_id, title, value_aed, status, valid_until, converted_to_project_id, converted_to_amc_id, notes, created_by, created_at, updated_at")
  .maybeSingle();

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return { ok: false, error: "A quotation with this code already exists." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Quotation row missing after insert." };

  const quotation = quotationRowToType(data as QuotationRow);
  db.QUOTATIONS[quotation.id] = quotation;
  return { ok: true, quotation };
}

export async function updateQuotationStatus(
  id: string,
  status: QuotationStatus,
): Promise<{ ok: true; quotation: Quotation } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Quotation id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { data, error } = await supa.from("quotations")
    .update({ status })
    .eq("id", id)
    .select("id, code, customer_id, title, value_aed, status, valid_until, converted_to_project_id, converted_to_amc_id, notes, created_by, created_at, updated_at")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Quotation not found." };

  const quotation = quotationRowToType(data as QuotationRow);
  db.QUOTATIONS[quotation.id] = quotation;
  return { ok: true, quotation };
}

/**
 * Convert a quotation. Creates a downstream project OR AMC contract
 * using the quotation's title + value + customer, then UPDATEs the
 * quotation row to status='converted' with the appropriate FK.
 *
 * Both downstream creates go through the same helpers normal users use
 * (createProject / createAmc), so they inherit all RLS gating and
 * downstream triggers (e.g. AMC service-1 seeding from 0027).
 */
export async function convertQuotation(
  id: string,
  target: "project" | "amc",
): Promise<{ ok: true; targetId: string; quotation: Quotation } | { ok: false; error: string }> {
  const q = db.QUOTATIONS[id];
  if (!q) return { ok: false, error: "Quotation not found." };
  if (q.status === "converted") return { ok: false, error: "Quotation already converted." };
  if (!q.customerId) return { ok: false, error: "Set a customer on the quotation before converting." };

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  let targetId: string | null = null;
  const patch: Record<string, unknown> = { status: "converted" };

  if (target === "project") {
    const today = new Date().toISOString().slice(0, 10);
    const due   = new Date(); due.setMonth(due.getMonth() + 6);
    const res = await createProject({
      name: q.title,
      customer_id: q.customerId,
      value_aed: q.valueAed,
      started_at: today,
      due_at: due.toISOString().slice(0, 10),
    });
    if (!res.ok) return { ok: false, error: `Project create failed: ${res.error}` };
    targetId = res.id;
    patch.converted_to_project_id = targetId;
  } else {
    const exp = new Date(); exp.setFullYear(exp.getFullYear() + 1);
    const res = await createAmc({
      customer_id: q.customerId,
      value_aed: q.valueAed,
      expires_at: exp.toISOString().slice(0, 10),
    });
    if (!res.ok) return { ok: false, error: `AMC create failed: ${res.error}` };
    targetId = res.id;
    patch.converted_to_amc_id = targetId;
  }

  const { data, error } = await supa.from("quotations")
    .update(patch)
    .eq("id", id)
    .select("id, code, customer_id, title, value_aed, status, valid_until, converted_to_project_id, converted_to_amc_id, notes, created_by, created_at, updated_at")
    .maybeSingle();
  if (error) return { ok: false, error: `Created ${target} but couldn't flip quotation: ${error.message}` };
  if (!data) return { ok: false, error: "Quotation update returned no row." };

  const quotation = quotationRowToType(data as QuotationRow);
  db.QUOTATIONS[quotation.id] = quotation;
  return { ok: true, targetId: targetId!, quotation };
}
