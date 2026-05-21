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
  AmcContract, AmcStatus, Approval, Customer, Organization, Project, RepairTicket,
  ReplacementContext, ReplacementRequest, ReplacementStatus,
  Role, Site, Tint, User, WorkOrder, WoStatus, WoType,
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
    .select("id, code, name, customer_id, site_id, manager_id, team_id, lead_tech_id, status, stage, progress, value_aed, started_at, due_at")
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
  const id = shortId("amc");
  // Per AMC engine spec (migration 0009): new contracts start as 'draft' and
  // move to 'pending_payment' when signed, then auto-activate when payment
  // arrives (fn_amc_payment_received trigger).
  const row: AmcContract = {
    id, code,
    customer: input.customer_id,
    site: input.site_id || "",
    manager: input.manager_id || "",
    leadTechId: input.lead_tech_id || "",
    contract_status: "draft",
    value: input.value_aed,
    services: { done: 0, total: 4 },
    nextDue: "-",
    overdueDays: 0,
    freeCalls: 0,
    expiresAt: input.expires_at,
  };

  const guard = ensureSupabase();
  if (guard) return guard;

  const { data, error } = await supabaseBrowser().from("amc_contracts").insert({
    code, customer_id: input.customer_id,
    site_id: input.site_id || null,
    manager_id: input.manager_id || null,
    lead_tech_id: input.lead_tech_id || null,
    contract_status: "draft",
    value_aed: input.value_aed,
    expires_at: input.expires_at,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  row.id = data.id;

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
export const AMC_STATUS_LABEL: Record<AmcStatus, string> = {
  draft:           "Draft",
  pending_payment: "Pending Payment",
  active:          "Active",
  suspended:       "Suspended",
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
    .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, expires_at")
    .single();
  if (error) return { ok: false, error: error.message };

  const current = db.AMCS[id];
  const next: AmcContract = {
    id:              data.id as string,
    code:            data.code as string,
    customer:        (data.customer_id as string) ?? current?.customer ?? "",
    site:            (data.site_id as string) ?? current?.site ?? "",
    manager:         (data.manager_id as string) ?? "",
    leadTechId:      (data.lead_tech_id as string) ?? "",
    contract_status: data.contract_status as AmcStatus,
    value:           (data.value_aed as number) ?? 0,
    services:        current?.services ?? { done: 0, total: 4 },
    nextDue:         (data.next_due_label as string) ?? "-",
    overdueDays:     (data.overdue_days as number) ?? 0,
    freeCalls:       (data.free_calls_used as number) ?? 0,
    expiresAt:       (data.expires_at as string) ?? "",
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
  const { data: amcRow, error: amcErr } = await supa
    .from("amc_contracts")
    .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, expires_at")
    .eq("id", amcId)
    .single();
  if (amcErr || !amcRow) {
    // Payment row landed; just couldn't refresh the contract view. Surface
    // a partial-success error so the caller can refetch on next bump.
    return { ok: false, error: `Payment saved but refresh failed: ${amcErr?.message ?? "unknown"}` };
  }

  const current = db.AMCS[amcId];
  const updated: AmcContract = {
    id:              amcRow.id as string,
    code:            amcRow.code as string,
    customer:        (amcRow.customer_id as string) ?? current?.customer ?? "",
    site:            (amcRow.site_id as string) ?? current?.site ?? "",
    manager:         (amcRow.manager_id as string) ?? "",
    leadTechId:      (amcRow.lead_tech_id as string) ?? "",
    contract_status: amcRow.contract_status as AmcContract["contract_status"],
    value:           (amcRow.value_aed as number) ?? 0,
    services:        current?.services ?? { done: 0, total: 4 },
    nextDue:         (amcRow.next_due_label as string) ?? "-",
    overdueDays:     (amcRow.overdue_days as number) ?? 0,
    freeCalls:       (amcRow.free_calls_used as number) ?? 0,
    expiresAt:       (amcRow.expires_at as string) ?? "",
  };
  db.AMCS[amcId] = updated;

  return { ok: true, payment_id: insertRow.id as string, amc_updated: updated };
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
  // trigger-side updates visible).
  const { data: refreshed, error: rErr } = await supa
    .from("work_orders")
    .select("id, code, type, priority, title, source_kind, source_id, customer_id, site_id, scheduled_start, scheduled_end, status, assigned_lead, progress, sla_min, elapsed_min, materials, flagged")
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
  };
  db.WORK_ORDERS[next.id] = next;
  return { ok: true, wo: next };
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
