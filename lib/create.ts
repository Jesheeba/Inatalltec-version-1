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
  AmcContract, AmcStatus, Approval, Customer, FreeCall, FreeCallsMode,
  MaterialRequest, MaterialRequestStatus, MaterialRequestUrgency,
  Organization, Project, ProjectPhase,
  Quotation, QuotationStatus, RepairTicket, ReplacementContext, ReplacementRequest,
  ReplacementStatus, Role, Site, SubContractor, Tint, User, WorkOrder, WorkOrderSubContractor,
  WorkOrderSubContractorHours, WorkOrderTimeEntry, WoStatus, WoType, WoTask,
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

// Project lifecycle "stage" (Quote · Won · Mobilization · …) was
// retired in favour of the richer Phase tracker (migration 0020). The
// DB column `projects.stage` is left dormant — its NOT NULL default of
// 'mobilization' keeps INSERTs alive, and `project_status_history`
// stage-change rows stay readable for audit. No reads or writes from
// the application.

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
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
  const row: Project = {
    id, code, name: input.name.trim(),
    customer: input.customer_id,
    site: input.site_id || "",
    manager: input.manager_id || "",
    team: "",
    leadTechId: input.lead_tech_id || "",
    status,
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

  // Migration 0035 — auto-generate a starter quotation linked to this
  // project. Non-fatal: if quotation create fails (RLS, network), the
  // project create still succeeds and Sales can author a quotation
  // manually later. The caller's UI is unaffected by this side-effect.
  void autoGenerateQuotationForProject(row).catch(err => {
    console.warn("[createProject] auto-quotation failed:", err);
  });

  return { ok: true, id: row.id };
}

// Patch an existing project. Status changes are audited server-side
// by trigger trg_project_status_change (see 0008). The legacy stage
// column is retired from the application (migration 0008 keeps it on
// the DB with a NOT NULL default so existing rows still validate),
// so updateProject no longer accepts or writes a stage value.
// Returns the updated Project so the caller can replace its
// in-memory mirror without an extra round-trip.
export interface ProjectPatch {
  name?: string;
  status?: ProjectStatus;
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
  if (patch.progress !== undefined) body.progress = patch.progress;
  if (patch.manager_id !== undefined) body.manager_id = patch.manager_id;
  if (patch.lead_tech_id !== undefined) body.lead_tech_id = patch.lead_tech_id;
  if (patch.value_aed !== undefined) body.value_aed = patch.value_aed;
  if (patch.started_at !== undefined) body.started_at = patch.started_at;
  if (patch.due_at !== undefined) body.due_at = patch.due_at;

  const { data, error } = await supabaseBrowser()
    .from("projects").update(body).eq("id", id)
    .select("id, code, name, customer_id, site_id, manager_id, team_id, lead_tech_id, status, current_phase, progress, value_aed, started_at, due_at")
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
  // Free-call entitlement (migration 0037). Optional — omit / null to
  // leave the contract "unset" (UI flags it for later configuration).
  free_calls_mode?: FreeCallsMode | null;
  free_calls_included?: number | null; // the cap, only used when mode='limited'
}
export async function createAmc(input: AmcInput): Promise<Result> {
  if (!input.customer_id) return { ok: false, error: "Customer is required." };
  if (!input.value_aed) return { ok: false, error: "Annual value is required." };
  if (!input.expires_at) return { ok: false, error: "Expiry date is required." };

  const code = input.code?.trim() || `AMC-${Math.floor(Math.random() * 900 + 100)}`;

  // Post-0033 flow: amc_contracts.signed_at default is dropped and
  // first_visit_date starts NULL. The contract sits in 'pending_payment'
  // (UI labels it "Draft — first visit not booked" while first_visit_date
  // IS NULL). The Operations Manager later clicks "Book first visit date"
  // which calls bookAmcFirstVisitDate(); that UPDATE fires the seed and
  // first_payment_due_at triggers and the contract becomes a proper
  // "Pending Payment" until payment is recorded.

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
    free_calls_mode: input.free_calls_mode ?? null,
    // Only meaningful for 'limited'; otherwise leave the DB default in place.
    ...(input.free_calls_mode === "limited" && input.free_calls_included != null
      ? { free_calls_included: input.free_calls_included }
      : {}),
  })
  .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, free_calls_mode, free_calls_included, expires_at, suspended_at, suspended_reason, paused_by, resumed_at, first_payment_due_at, renewed_from_id, first_visit_date")
  .single();
  if (error) return { ok: false, error: error.message };

  const newId = data.id as string;
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
    freeCallsMode:     (data.free_calls_mode as AmcContract["freeCallsMode"]) ?? null,
    freeCallsIncluded: data.free_calls_included == null ? null : (data.free_calls_included as number),
    expiresAt:         (data.expires_at as string) ?? input.expires_at,
    suspendedAt:       (data.suspended_at as string | null) ?? null,
    suspendedReason:   (data.suspended_reason as string | null) ?? null,
    pausedBy:          (data.paused_by as string | null) ?? null,
    resumedAt:         (data.resumed_at as string | null) ?? null,
    firstPaymentDueAt: (data.first_payment_due_at as string | null) ?? null,
    renewedFromId:     (data.renewed_from_id as string | null) ?? null,
    firstVisitDate:    (data.first_visit_date as string | null) ?? null,
  };

  db.AMCS[row.id] = row;
  return { ok: true, id: row.id };
}

// ─────────────────────────────────────────────────────────
// bookAmcFirstVisitDate — Step 1 of the post-0033 AMC flow.
//
// Sets amc_contracts.first_visit_date to a user-picked date. The DB
// triggers populate first_payment_due_at and seed service 1 on the
// schedule. Status stays 'pending_payment' (the UI label flips from
// "Draft — first visit not booked" to "Pending Payment").
//
// Permission: admin · md · manager.
// ─────────────────────────────────────────────────────────
export async function bookAmcFirstVisitDate(
  amcId: string,
  date: string,        // YYYY-MM-DD
): Promise<Result> {
  if (!amcId) return { ok: false, error: "Contract id is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Pick a valid date." };
  }
  const guard = ensureSupabase();
  if (guard) return guard;

  // Optimistic mirror update so the UI flips immediately.
  const prev = db.AMCS[amcId];
  if (prev) {
    db.AMCS[amcId] = { ...prev, firstVisitDate: date };
  }

  const { data, error } = await supabaseBrowser()
    .from("amc_contracts")
    .update({ first_visit_date: date })
    .eq("id", amcId)
    .select("first_visit_date, first_payment_due_at")
    .single();

  if (error || !data) {
    if (prev) db.AMCS[amcId] = prev;
    return { ok: false, error: error?.message || "Update failed." };
  }

  if (prev) {
    db.AMCS[amcId] = {
      ...prev,
      firstVisitDate:    (data.first_visit_date as string | null) ?? date,
      firstPaymentDueAt: (data.first_payment_due_at as string | null) ?? prev.firstPaymentDueAt,
    };
  }
  return { ok: true, id: amcId };
}

// ─────────────────────────────────────────────────────────
// AMC document upload / delete
//
// Bucket: 'amc-documents' (private, created in migration 0034).
// Permission: admin · md · manager · sales (enforced by RLS on
// amc_documents + storage.objects).
//
// File constraints (client-side):
//   • 25 MB cap
//   • Any mime type
//
// Path convention: <amc_id>/<random>-<sanitized_name>
// ─────────────────────────────────────────────────────────
export const AMC_DOC_MAX_BYTES = 25 * 1024 * 1024;

export interface UploadAmcDocResult {
  ok: boolean;
  doc?: import("./types").AmcDocument;
  error?: string;
}

export async function uploadAmcDocument(
  amcId: string,
  file: File,
  uploaderId: string | null,
): Promise<UploadAmcDocResult> {
  if (!amcId) return { ok: false, error: "Contract id is required." };
  if (!file)  return { ok: false, error: "Pick a file to upload." };
  if (file.size > AMC_DOC_MAX_BYTES) {
    return { ok: false, error: `File is over the 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }

  const guard = ensureSupabase();
  if (guard) return { ok: false, error: guard.error };

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "document";
  const random = Math.random().toString(36).slice(2, 10);
  const filePath = `${amcId}/${random}-${safeName}`;

  const supa = supabaseBrowser();
  const { error: storageErr } = await supa.storage
    .from("amc-documents")
    .upload(filePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
  if (storageErr) {
    return { ok: false, error: `Upload failed: ${storageErr.message}` };
  }

  const { data, error: insertErr } = await supa
    .from("amc_documents")
    .insert({
      amc_id:          amcId,
      file_name:       file.name,
      file_path:       filePath,
      file_size_bytes: file.size,
      mime_type:       file.type || null,
      uploaded_by:     uploaderId,
    })
    .select("id, amc_id, file_name, file_path, file_size_bytes, mime_type, uploaded_by, uploaded_at")
    .single();

  if (insertErr || !data) {
    // Rollback the storage upload so we don't orphan the blob.
    await supa.storage.from("amc-documents").remove([filePath]);
    return { ok: false, error: insertErr?.message || "Failed to record document." };
  }

  const doc: import("./types").AmcDocument = {
    id:            data.id as string,
    amcId:         data.amc_id as string,
    fileName:      data.file_name as string,
    filePath:      data.file_path as string,
    fileSizeBytes: (data.file_size_bytes as number | null) ?? null,
    mimeType:      (data.mime_type as string | null) ?? null,
    uploadedBy:    (data.uploaded_by as string | null) ?? null,
    uploadedAt:    data.uploaded_at as string,
  };
  db.AMC_DOCUMENTS[doc.id] = doc;
  return { ok: true, doc };
}

export async function deleteAmcDocument(docId: string): Promise<Result> {
  if (!docId) return { ok: false, error: "Document id is required." };
  const doc = db.AMC_DOCUMENTS[docId];
  if (!doc) return { ok: false, error: "Document not found." };

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  // Optimistic mirror delete.
  delete db.AMC_DOCUMENTS[docId];

  const { error: rowErr } = await supa
    .from("amc_documents")
    .delete()
    .eq("id", docId);
  if (rowErr) {
    db.AMC_DOCUMENTS[docId] = doc; // revert
    return { ok: false, error: rowErr.message };
  }

  // Best-effort Storage cleanup. If this fails the row is already gone,
  // so we just log; an orphaned blob is not user-visible.
  const { error: storageErr } = await supa.storage
    .from("amc-documents")
    .remove([doc.filePath]);
  if (storageErr) {
    console.warn("[deleteAmcDocument] storage cleanup failed:", storageErr.message);
  }

  return { ok: true, id: docId };
}

// Returns a short-lived signed URL for downloading a document. Bucket
// is private so direct URLs don't work; a signed URL gives the browser
// a one-time download link.
export async function getAmcDocumentDownloadUrl(
  filePath: string,
  expiresInSeconds: number = 60,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!filePath) return { ok: false, error: "filePath required" };
  const guard = ensureSupabase();
  if (guard) return { ok: false, error: guard.error };

  const { data, error } = await supabaseBrowser()
    .storage.from("amc-documents")
    .createSignedUrl(filePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message || "Could not create signed URL." };
  }
  return { ok: true, url: data.signedUrl };
}

// ─────────────────────────────────────────────────────────
// REPLACEMENT DOCUMENTS + REFUND PHOTO (migration 0039)
// Mirrors the AMC-documents pattern above. Both general documents and
// the single refund photo share the private 'replacement-documents'
// bucket. Docs are rows in replacement_documents; the refund photo is
// stored as columns on the replacement_requests row.
// ─────────────────────────────────────────────────────────
export const REPLACEMENT_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const REPLACEMENT_BUCKET = "replacement-documents";

const DOC_EXTS = ["pdf", "docx", "jpg", "jpeg", "png"];
const IMG_EXTS = ["jpg", "jpeg", "png"];
function fileExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export interface UploadReplacementDocResult {
  ok: boolean;
  doc?: import("./types").ReplacementDocument;
  error?: string;
}

export async function uploadReplacementDocument(
  rrId: string,
  file: File,
  uploaderId: string | null,
): Promise<UploadReplacementDocResult> {
  if (!rrId) return { ok: false, error: "Replacement id is required." };
  if (!file)  return { ok: false, error: "Pick a file to upload." };
  if (file.size > REPLACEMENT_DOC_MAX_BYTES) {
    return { ok: false, error: `File is over the 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }
  if (!DOC_EXTS.includes(fileExt(file.name))) {
    return { ok: false, error: "Allowed types: PDF, DOCX, JPG, PNG." };
  }

  const guard = ensureSupabase();
  if (guard) return { ok: false, error: guard.error };

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "document";
  const random = Math.random().toString(36).slice(2, 10);
  const filePath = `${rrId}/${random}-${safeName}`;

  const supa = supabaseBrowser();
  const { error: storageErr } = await supa.storage
    .from(REPLACEMENT_BUCKET)
    .upload(filePath, file, { contentType: file.type || undefined, upsert: false });
  if (storageErr) return { ok: false, error: `Upload failed: ${storageErr.message}` };

  const { data, error: insertErr } = await supa
    .from("replacement_documents")
    .insert({
      replacement_request_id: rrId,
      file_name:       file.name,
      file_path:       filePath,
      file_size_bytes: file.size,
      mime_type:       file.type || null,
      uploaded_by:     uploaderId,
    })
    .select("id, replacement_request_id, file_name, file_path, file_size_bytes, mime_type, uploaded_by, uploaded_at")
    .single();

  if (insertErr || !data) {
    await supa.storage.from(REPLACEMENT_BUCKET).remove([filePath]);
    return { ok: false, error: insertErr?.message || "Failed to record document." };
  }

  const doc: import("./types").ReplacementDocument = {
    id:                   data.id as string,
    replacementRequestId: data.replacement_request_id as string,
    fileName:             data.file_name as string,
    filePath:             data.file_path as string,
    fileSizeBytes:        (data.file_size_bytes as number | null) ?? null,
    mimeType:             (data.mime_type as string | null) ?? null,
    uploadedBy:           (data.uploaded_by as string | null) ?? null,
    uploadedAt:           data.uploaded_at as string,
  };
  db.REPLACEMENT_DOCUMENTS[doc.id] = doc;
  return { ok: true, doc };
}

export async function deleteReplacementDocument(docId: string): Promise<Result> {
  if (!docId) return { ok: false, error: "Document id is required." };
  const doc = db.REPLACEMENT_DOCUMENTS[docId];
  if (!doc) return { ok: false, error: "Document not found." };

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  delete db.REPLACEMENT_DOCUMENTS[docId]; // optimistic

  const { error: rowErr } = await supa.from("replacement_documents").delete().eq("id", docId);
  if (rowErr) {
    db.REPLACEMENT_DOCUMENTS[docId] = doc; // revert
    return { ok: false, error: rowErr.message };
  }

  const { error: storageErr } = await supa.storage.from(REPLACEMENT_BUCKET).remove([doc.filePath]);
  if (storageErr) console.warn("[deleteReplacementDocument] storage cleanup failed:", storageErr.message);

  return { ok: true, id: docId };
}

export async function getReplacementDocumentDownloadUrl(
  filePath: string,
  expiresInSeconds: number = 60,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!filePath) return { ok: false, error: "filePath required" };
  const guard = ensureSupabase();
  if (guard) return { ok: false, error: guard.error };

  const { data, error } = await supabaseBrowser()
    .storage.from(REPLACEMENT_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message || "Could not create signed URL." };
  }
  return { ok: true, url: data.signedUrl };
}

// Upload (or replace) the single refund photo for a replacement. The
// previous photo, if any, is removed from storage so we don't orphan
// blobs. Metadata is written to columns on replacement_requests.
export async function setRefundPhoto(
  rrId: string,
  file: File,
  uploaderId: string | null,
): Promise<Result> {
  if (!rrId) return { ok: false, error: "Replacement id is required." };
  if (!file)  return { ok: false, error: "Pick a photo to upload." };
  if (file.size > REPLACEMENT_DOC_MAX_BYTES) {
    return { ok: false, error: `Photo is over the 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }
  if (!IMG_EXTS.includes(fileExt(file.name))) {
    return { ok: false, error: "Refund photo must be a JPG or PNG image." };
  }

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();
  const prevPath = db.REPLACEMENTS[rrId]?.refundPhotoPath ?? null;

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "refund-photo";
  const random = Math.random().toString(36).slice(2, 10);
  const filePath = `${rrId}/refund-${random}-${safeName}`;

  const { error: storageErr } = await supa.storage
    .from(REPLACEMENT_BUCKET)
    .upload(filePath, file, { contentType: file.type || undefined, upsert: false });
  if (storageErr) return { ok: false, error: `Upload failed: ${storageErr.message}` };

  const { data, error: updErr } = await supa
    .from("replacement_requests")
    .update({
      refund_photo_path:        filePath,
      refund_photo_name:        file.name,
      refund_photo_uploaded_by: uploaderId,
      refund_photo_uploaded_at: new Date().toISOString(),
    })
    .eq("id", rrId)
    .select("refund_photo_path, refund_photo_name, refund_photo_uploaded_by, refund_photo_uploaded_at")
    .single();

  if (updErr || !data) {
    await supa.storage.from(REPLACEMENT_BUCKET).remove([filePath]); // rollback
    return { ok: false, error: updErr?.message || "Failed to save refund photo." };
  }

  // Mirror + clean up the old blob (best-effort).
  const rr = db.REPLACEMENTS[rrId];
  if (rr) {
    rr.refundPhotoPath       = data.refund_photo_path as string | null;
    rr.refundPhotoName       = data.refund_photo_name as string | null;
    rr.refundPhotoUploadedBy = data.refund_photo_uploaded_by as string | null;
    rr.refundPhotoUploadedAt = data.refund_photo_uploaded_at as string | null;
  }
  if (prevPath && prevPath !== filePath) {
    await supa.storage.from(REPLACEMENT_BUCKET).remove([prevPath]);
  }
  return { ok: true, id: rrId };
}

export async function deleteRefundPhoto(rrId: string): Promise<Result> {
  if (!rrId) return { ok: false, error: "Replacement id is required." };
  const rr = db.REPLACEMENTS[rrId];
  const prevPath = rr?.refundPhotoPath ?? null;
  if (!prevPath) return { ok: false, error: "No refund photo to remove." };

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { error: updErr } = await supa
    .from("replacement_requests")
    .update({
      refund_photo_path:        null,
      refund_photo_name:        null,
      refund_photo_uploaded_by: null,
      refund_photo_uploaded_at: null,
    })
    .eq("id", rrId);
  if (updErr) return { ok: false, error: updErr.message };

  if (rr) {
    rr.refundPhotoPath = null; rr.refundPhotoName = null;
    rr.refundPhotoUploadedBy = null; rr.refundPhotoUploadedAt = null;
  }
  const { error: storageErr } = await supa.storage.from(REPLACEMENT_BUCKET).remove([prevPath]);
  if (storageErr) console.warn("[deleteRefundPhoto] storage cleanup failed:", storageErr.message);

  return { ok: true, id: rrId };
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
  // Free-call entitlement (migration 0037). Editable after creation by
  // admin / md / manager. Pass mode=null to clear back to "unset".
  free_calls_mode?: FreeCallsMode | null;
  free_calls_included?: number | null;
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
  if (patch.free_calls_mode     !== undefined) body.free_calls_mode     = patch.free_calls_mode;
  if (patch.free_calls_included !== undefined) body.free_calls_included = patch.free_calls_included;

  const { data, error } = await supabaseBrowser()
    .from("amc_contracts").update(body).eq("id", id)
    .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, free_calls_mode, free_calls_included, expires_at, suspended_at, suspended_reason, paused_by, resumed_at, first_payment_due_at, renewed_from_id, first_visit_date")
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
    firstVisitDate:    (data.first_visit_date as string | null) ?? current?.firstVisitDate ?? null,
    services:          current?.services ?? { done: 0, total: 4 },
    nextDue:           (data.next_due_label as string) ?? "-",
    overdueDays:       (data.overdue_days as number) ?? 0,
    freeCalls:         (data.free_calls_used as number) ?? 0,
    freeCallsMode:     (data.free_calls_mode as AmcContract["freeCallsMode"]) ?? null,
    freeCallsIncluded: data.free_calls_included == null ? null : (data.free_calls_included as number),
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
    .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, free_calls_mode, free_calls_included, expires_at, suspended_at, suspended_reason, paused_by, resumed_at, first_payment_due_at, renewed_from_id, first_visit_date")
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
    firstVisitDate:    (amcRow.first_visit_date as string | null) ?? current?.firstVisitDate ?? null,
    services:          current?.services ?? { done: 0, total: 4 },
    nextDue:           (amcRow.next_due_label as string) ?? "-",
    overdueDays:       (amcRow.overdue_days as number) ?? 0,
    freeCalls:         (amcRow.free_calls_used as number) ?? 0,
    freeCallsMode:     (amcRow.free_calls_mode as AmcContract["freeCallsMode"]) ?? current?.freeCallsMode ?? null,
    freeCallsIncluded: amcRow.free_calls_included == null ? (current?.freeCallsIncluded ?? null) : (amcRow.free_calls_included as number),
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
    // Carry the customer's negotiated free-call terms forward to the
    // renewal (migration 0037). If the source was unset, the renewal is
    // unset too and the UI prompts the OM to configure it.
    free_calls_mode: prev.freeCallsMode ?? null,
    ...(prev.freeCallsMode === "limited" && prev.freeCallsIncluded != null
      ? { free_calls_included: prev.freeCallsIncluded }
      : {}),
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
    freeCallsMode:     prev.freeCallsMode ?? null,
    freeCallsIncluded: prev.freeCallsIncluded ?? null,
    expiresAt:         input.expires_at,
    suspendedAt:       null,
    suspendedReason:   null,
    pausedBy:          null,
    resumedAt:         null,
    firstPaymentDueAt: null, // populated only after bookAmcFirstVisitDate fires (0033)
    renewedFromId:     previousAmcId,
    firstVisitDate:    null, // renewal starts fresh; OM books a new first visit date
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
    .select("id, code, customer_id, site_id, manager_id, lead_tech_id, contract_status, value_aed, next_due_label, overdue_days, free_calls_used, free_calls_mode, free_calls_included, expires_at, suspended_at, suspended_reason, paused_by, resumed_at, first_payment_due_at, renewed_from_id, first_visit_date")
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
    freeCallsMode:     (data.free_calls_mode as AmcContract["freeCallsMode"]) ?? current?.freeCallsMode ?? null,
    freeCallsIncluded: data.free_calls_included == null ? (current?.freeCallsIncluded ?? null) : (data.free_calls_included as number),
    expiresAt:         (data.expires_at as string) ?? "",
    suspendedAt:       (data.suspended_at as string | null) ?? null,
    suspendedReason:   (data.suspended_reason as string | null) ?? null,
    pausedBy:          (data.paused_by as string | null) ?? null,
    resumedAt:         (data.resumed_at as string | null) ?? null,
    firstPaymentDueAt: (data.first_payment_due_at as string | null) ?? null,
    renewedFromId:     (data.renewed_from_id as string | null) ?? null,
    firstVisitDate:    (data.first_visit_date as string | null) ?? current?.firstVisitDate ?? null,
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
  main_contractor: "Project",
  amc_free_call:   "AMC Free Call",
  amc_scheduled:   "AMC Scheduled Service",
  repair:          "Repair Service",
};

const RR_SELECT_COLS =
  "id, code, context, work_order_id, project_id, amc_contract_id, repair_ticket_id, " +
  "customer_id, site_id, item_name, quantity, reason, status, " +
  "requested_by, requested_at, approved_by, approved_at, approval_note, " +
  "installed_by, installed_at, installation_note, " +
  "confirmed_by, confirmed_at, confirmation_note, " +
  "rejected_by, rejected_at, rejection_reason, " +
  "refund_photo_path, refund_photo_name, refund_photo_uploaded_by, refund_photo_uploaded_at, " +
  "created_at, updated_at";

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
    refundPhotoPath:       sn(r.refund_photo_path),
    refundPhotoName:       sn(r.refund_photo_name),
    refundPhotoUploadedBy: sn(r.refund_photo_uploaded_by),
    refundPhotoUploadedAt: sn(r.refund_photo_uploaded_at),
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
// MATERIAL REQUESTS  (migration 0038)
//
// On-site materials/parts procurement. A technician raises a request
// from a Work Order; managers approve / reject / fulfil. Mirrors the
// replacement-request helpers above: optimistic concurrency via
// .eq("status", expected); the DB code/touch/notify triggers handle
// code generation, updated_at, and the in-app notifications.
//
// Lifecycle: pending → approved → fulfilled; pending → rejected.
// ─────────────────────────────────────────────────────────

export const MATERIAL_REQUEST_STATUSES: MaterialRequestStatus[] = [
  "pending", "approved", "rejected", "fulfilled",
];

export const MATERIAL_REQUEST_STATUS_LABEL: Record<MaterialRequestStatus, string> = {
  pending:   "Pending",
  approved:  "Approved",
  rejected:  "Rejected",
  fulfilled: "Fulfilled",
};

// Badge CSS class per status — all exist in shared.tsx StatusBadge.
export const MATERIAL_REQUEST_STATUS_BADGE: Record<MaterialRequestStatus, string> = {
  pending:   "badge-warning",
  approved:  "badge-info",
  rejected:  "badge-danger",
  fulfilled: "badge-success",
};

export const MATERIAL_REQUEST_URGENCY_LABEL: Record<MaterialRequestUrgency, string> = {
  low:    "Low",
  normal: "Normal",
  high:   "High",
};

const MR_SELECT_COLS =
  "id, code, work_order_id, project_id, amc_contract_id, repair_ticket_id, " +
  "customer_id, site_id, item_name, quantity, urgency, notes, status, " +
  "requested_by, requested_at, approved_by, approved_at, approval_note, " +
  "rejected_by, rejected_at, rejection_reason, " +
  "fulfilled_by, fulfilled_at, fulfillment_note, created_at, updated_at";

function rowToMr(r: Record<string, unknown>): MaterialRequest {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    id:               s(r.id),
    code:             s(r.code),
    workOrderId:      (r.work_order_id as string | null) ?? null,
    projectId:        (r.project_id as string | null) ?? null,
    amcContractId:    (r.amc_contract_id as string | null) ?? null,
    repairTicketId:   (r.repair_ticket_id as string | null) ?? null,
    customerId:       s(r.customer_id),
    siteId:           (r.site_id as string | null) ?? null,
    itemName:         s(r.item_name),
    quantity:         typeof r.quantity === "number" ? r.quantity : 1,
    urgency:          ((r.urgency as MaterialRequestUrgency) ?? "normal"),
    notes:            sn(r.notes),
    status:           ((r.status as MaterialRequestStatus) ?? "pending"),
    requestedBy:      sn(r.requested_by),
    requestedAt:      s(r.requested_at),
    approvedBy:       sn(r.approved_by),
    approvedAt:       sn(r.approved_at),
    approvalNote:     sn(r.approval_note),
    rejectedBy:       sn(r.rejected_by),
    rejectedAt:       sn(r.rejected_at),
    rejectionReason:  sn(r.rejection_reason),
    fulfilledBy:      sn(r.fulfilled_by),
    fulfilledAt:      sn(r.fulfilled_at),
    fulfillmentNote:  sn(r.fulfillment_note),
    createdAt:        s(r.created_at),
    updatedAt:        s(r.updated_at),
  };
}

export interface MaterialRequestInput {
  customer_id: string;
  work_order_id?: string | null;
  project_id?: string | null;
  amc_contract_id?: string | null;
  repair_ticket_id?: string | null;
  site_id?: string | null;
  item_name: string;
  quantity?: number;
  urgency?: MaterialRequestUrgency;
  notes?: string | null;
  requested_by?: string | null;
}

type MrOk = { ok: true; mr: MaterialRequest };
type MrFail = { ok: false; error: string };
type MrResult = MrOk | MrFail;

// ─────────────────────────────────────────────────────────
// MATERIAL SUBMITTAL — Design phase activity 1 (migration 0040)
// All functions here are NEW. Client communication happens outside the
// app; we only record state. Mirrors the replacement lifecycle +
// document-upload patterns (rrTransition / uploadReplacementDocument).
// ─────────────────────────────────────────────────────────
const DESIGN_BUCKET = "project-design-docs";

const MS_COLS  = "id, project_id, code, current_revision, approved_revision, created_by, created_at, updated_at";
const MSR_COLS = "id, submittal_id, revision_number, status, submitted_at, responded_at, client_comments, created_by, created_at, updated_at";
const MI_COLS  = "id, revision_id, description, model_number, quantity, datasheet_path, datasheet_name, sort_order, created_at";

type MsT  = import("./types").MaterialSubmittal;
type MsrT = import("./types").MaterialSubmittalRevision;
type MiT  = import("./types").MaterialItem;
type MsrStatus = import("./types").MaterialSubmittalStatus;

function rowToMs(r: Record<string, unknown>): MsT {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const n = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    id: s(r.id), projectId: s(r.project_id), code: s(r.code),
    currentRevision: typeof r.current_revision === "number" ? r.current_revision : 1,
    approvedRevision: n(r.approved_revision),
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToMsr(r: Record<string, unknown>): MsrT {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    id: s(r.id), submittalId: s(r.submittal_id),
    revisionNumber: typeof r.revision_number === "number" ? r.revision_number : 1,
    status: ((r.status as MsrStatus) ?? "draft"),
    submittedAt: sn(r.submitted_at), respondedAt: sn(r.responded_at),
    clientComments: sn(r.client_comments),
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToMi(r: Record<string, unknown>): MiT {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    id: s(r.id), revisionId: s(r.revision_id),
    description: s(r.description), modelNumber: sn(r.model_number),
    quantity: typeof r.quantity === "number" ? r.quantity : 1,
    datasheetPath: sn(r.datasheet_path), datasheetName: sn(r.datasheet_name),
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
    createdAt: s(r.created_at),
  };
}

// Signed download URL for any file in the shared design-docs bucket.
export async function getDesignDocUrl(
  filePath: string, expiresInSeconds = 60,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!filePath) return { ok: false, error: "filePath required" };
  const guard = ensureSupabase();
  if (guard) return { ok: false, error: guard.error };
  const { data, error } = await supabaseBrowser()
    .storage.from(DESIGN_BUCKET).createSignedUrl(filePath, expiresInSeconds);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message || "Could not create signed URL." };
  return { ok: true, url: data.signedUrl };
}

export type MsResult  = { ok: true; submittal: MsT } | { ok: false; error: string };
export type MsrResult = { ok: true; revision: MsrT } | { ok: false; error: string };
export type MiResult  = { ok: true; item: MiT } | { ok: false; error: string };

// Create the submittal + its first (draft) revision for a project.
export async function createMaterialSubmittal(
  projectId: string, createdBy: string | null,
): Promise<{ ok: true; submittal: MsT; revision: MsrT } | { ok: false; error: string }> {
  if (!projectId) return { ok: false, error: "Project id is required." };
  if (db.MATERIAL_SUBMITTALS && Object.values(db.MATERIAL_SUBMITTALS).some(s => s.projectId === projectId)) {
    return { ok: false, error: "This project already has a material submittal." };
  }
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  let submittal: MsT | null = null;
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const { data, error } = await supa.from("material_submittals")
      .insert({ project_id: projectId, current_revision: 1, created_by: createdBy })
      .select(MS_COLS).single();
    if (!error && data) { submittal = rowToMs(data as Record<string, unknown>); break; }
    const code = (error as { code?: string } | null)?.code;
    if (code === UNIQUE_VIOLATION && /code/.test((error as { message?: string } | null)?.message ?? "")) continue;
    return { ok: false, error: error?.message || "Failed to create submittal." };
  }
  if (!submittal) return { ok: false, error: "Could not allocate a submittal code — try again." };

  const { data: revData, error: revErr } = await supa.from("material_submittal_revisions")
    .insert({ submittal_id: submittal.id, revision_number: 1, status: "draft", created_by: createdBy })
    .select(MSR_COLS).single();
  if (revErr || !revData) return { ok: false, error: revErr?.message || "Failed to create revision 1." };

  const revision = rowToMsr(revData as Record<string, unknown>);
  db.MATERIAL_SUBMITTALS[submittal.id] = submittal;
  db.MATERIAL_SUBMITTAL_REVISIONS[revision.id] = revision;
  return { ok: true, submittal, revision };
}

export interface MaterialItemInput { description: string; model_number?: string; quantity?: number; }

// Add an item to a DRAFT revision, optionally with a datasheet upload.
export async function addMaterialItem(
  revisionId: string, input: MaterialItemInput,
  datasheet: File | null, uploaderId: string | null,
): Promise<MiResult> {
  if (!revisionId) return { ok: false, error: "Revision id is required." };
  if (!input.description?.trim()) return { ok: false, error: "Material description is required." };
  const rev = db.MATERIAL_SUBMITTAL_REVISIONS[revisionId];
  if (rev && rev.status !== "draft") return { ok: false, error: "This revision is locked — items can only be added while it's a draft." };
  const projectId = rev ? db.MATERIAL_SUBMITTALS[rev.submittalId]?.projectId ?? "" : "";

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  let datasheetPath: string | null = null;
  let datasheetName: string | null = null;
  if (datasheet) {
    if (datasheet.size > REPLACEMENT_DOC_MAX_BYTES) {
      return { ok: false, error: `Datasheet is over the 10 MB limit (${(datasheet.size / 1024 / 1024).toFixed(1)} MB).` };
    }
    if (!["pdf", "jpg", "jpeg", "png"].includes(fileExt(datasheet.name))) {
      return { ok: false, error: "Datasheet must be a PDF, JPG, or PNG." };
    }
    const safe = datasheet.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "datasheet";
    const rand = Math.random().toString(36).slice(2, 10);
    datasheetPath = `submittal/${projectId || "unknown"}/${rand}-${safe}`;
    const { error: upErr } = await supa.storage.from(DESIGN_BUCKET)
      .upload(datasheetPath, datasheet, { contentType: datasheet.type || undefined, upsert: false });
    if (upErr) return { ok: false, error: `Datasheet upload failed: ${upErr.message}` };
    datasheetName = datasheet.name;
  }

  const { data, error } = await supa.from("material_items").insert({
    revision_id: revisionId,
    description: input.description.trim(),
    model_number: input.model_number?.trim() || null,
    quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
    datasheet_path: datasheetPath,
    datasheet_name: datasheetName,
  }).select(MI_COLS).single();

  if (error || !data) {
    if (datasheetPath) await supa.storage.from(DESIGN_BUCKET).remove([datasheetPath]);
    return { ok: false, error: error?.message || "Failed to add item." };
  }
  const item = rowToMi(data as Record<string, unknown>);
  db.MATERIAL_ITEMS[item.id] = item;
  return { ok: true, item };
}

export async function updateMaterialItem(
  itemId: string, input: MaterialItemInput,
): Promise<MiResult> {
  if (!itemId) return { ok: false, error: "Item id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const { data, error } = await supabaseBrowser().from("material_items").update({
    description: input.description.trim(),
    model_number: input.model_number?.trim() || null,
    quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
  }).eq("id", itemId).select(MI_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update item." };
  const item = rowToMi(data as Record<string, unknown>);
  db.MATERIAL_ITEMS[item.id] = item;
  return { ok: true, item };
}

// Delete an item row. NOTE: we intentionally do NOT remove the datasheet
// blob from storage — startNextSubmittalRevision copies items (and their
// datasheet_path) into new revisions, so a blob can be shared across the
// revision history. Orphaned datasheets are small and private; leaving
// them avoids breaking an older revision's audit trail.
export async function deleteMaterialItem(itemId: string): Promise<Result> {
  if (!itemId) return { ok: false, error: "Item id is required." };
  const item = db.MATERIAL_ITEMS[itemId];
  const guard = ensureSupabase();
  if (guard) return guard;
  delete db.MATERIAL_ITEMS[itemId]; // optimistic
  const { error } = await supabaseBrowser().from("material_items").delete().eq("id", itemId);
  if (error) { if (item) db.MATERIAL_ITEMS[itemId] = item; return { ok: false, error: error.message }; }
  return { ok: true, id: itemId };
}

// Generic guarded revision transition (optimistic concurrency on status).
async function msrTransition(
  revisionId: string, expected: MsrStatus, patch: Record<string, unknown>,
): Promise<MsrResult> {
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();
  const { data, error } = await supa.from("material_submittal_revisions")
    .update(patch).eq("id", revisionId).eq("status", expected).select(MSR_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    const { data: cur } = await supa.from("material_submittal_revisions").select(MSR_COLS).eq("id", revisionId).maybeSingle();
    if (cur) { const r = rowToMsr(cur as Record<string, unknown>); db.MATERIAL_SUBMITTAL_REVISIONS[r.id] = r;
      return { ok: false, error: `This revision is already "${r.status}".` }; }
    return { ok: false, error: "Revision not found." };
  }
  const revision = rowToMsr(data[0] as Record<string, unknown>);
  db.MATERIAL_SUBMITTAL_REVISIONS[revision.id] = revision;
  return { ok: true, revision };
}

export async function submitSubmittalRevision(revisionId: string): Promise<MsrResult> {
  return msrTransition(revisionId, "draft", { status: "submitted", submitted_at: new Date().toISOString() });
}

export async function markSubmittalApproved(revisionId: string): Promise<MsrResult> {
  const res = await msrTransition(revisionId, "submitted", { status: "approved", responded_at: new Date().toISOString() });
  if (res.ok) {
    // Stamp the approved revision number on the parent submittal.
    const sub = db.MATERIAL_SUBMITTALS[res.revision.submittalId];
    if (sub) {
      const { data } = await supabaseBrowser().from("material_submittals")
        .update({ approved_revision: res.revision.revisionNumber }).eq("id", sub.id).select(MS_COLS).maybeSingle();
      if (data) db.MATERIAL_SUBMITTALS[sub.id] = rowToMs(data as Record<string, unknown>);
    }
  }
  return res;
}

export async function markSubmittalReturned(revisionId: string, comments: string): Promise<MsrResult> {
  return msrTransition(revisionId, "submitted", {
    status: "returned", responded_at: new Date().toISOString(), client_comments: comments?.trim() || null,
  });
}

export async function markSubmittalRejected(revisionId: string, reason: string): Promise<MsrResult> {
  return msrTransition(revisionId, "submitted", {
    status: "rejected", responded_at: new Date().toISOString(), client_comments: reason?.trim() || null,
  });
}

// Start a new draft revision, copying items (incl. datasheet refs) from
// the latest existing revision so the OM edits rather than re-enters.
export async function startNextSubmittalRevision(
  submittalId: string, createdBy: string | null,
): Promise<MsrResult> {
  if (!submittalId) return { ok: false, error: "Submittal id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const revs = Object.values(db.MATERIAL_SUBMITTAL_REVISIONS).filter(r => r.submittalId === submittalId);
  const latest = revs.sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
  const nextNum = (latest?.revisionNumber ?? 0) + 1;

  const { data: revData, error: revErr } = await supa.from("material_submittal_revisions")
    .insert({ submittal_id: submittalId, revision_number: nextNum, status: "draft", created_by: createdBy })
    .select(MSR_COLS).single();
  if (revErr || !revData) return { ok: false, error: revErr?.message || "Failed to start the next revision." };
  const revision = rowToMsr(revData as Record<string, unknown>);

  // Copy the latest revision's items into the new draft.
  if (latest) {
    const srcItems = Object.values(db.MATERIAL_ITEMS).filter(i => i.revisionId === latest.id);
    if (srcItems.length > 0) {
      const rows = srcItems
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(i => ({
          revision_id: revision.id, description: i.description, model_number: i.modelNumber,
          quantity: i.quantity, datasheet_path: i.datasheetPath, datasheet_name: i.datasheetName,
          sort_order: i.sortOrder,
        }));
      const { data: copied } = await supa.from("material_items").insert(rows).select(MI_COLS);
      for (const r of (copied ?? [])) { const it = rowToMi(r as Record<string, unknown>); db.MATERIAL_ITEMS[it.id] = it; }
    }
  }

  // Point the submittal at the new current revision.
  const { data: msData } = await supa.from("material_submittals")
    .update({ current_revision: nextNum }).eq("id", submittalId).select(MS_COLS).maybeSingle();
  if (msData) db.MATERIAL_SUBMITTALS[submittalId] = rowToMs(msData as Record<string, unknown>);

  db.MATERIAL_SUBMITTAL_REVISIONS[revision.id] = revision;
  return { ok: true, revision };
}

// ─────────────────────────────────────────────────────────
// SHOP DRAWING — Design phase activity 2 (migration 0042)
// All functions here are NEW. Mirrors the Material Submittal lifecycle
// above; the payload is uploaded drawing FILES (PDF + DWG) instead of a
// materials list. Reuses the shared project-design-docs bucket (files
// under drawing/<projectId>/…) and getDesignDocUrl for downloads.
// ─────────────────────────────────────────────────────────
const SHOP_DRAWING_MAX_BYTES = 25 * 1024 * 1024; // 25 MB — DWG files run large

const SD_COLS  = "id, project_id, code, current_revision, approved_revision, created_by, created_at, updated_at";
const SDR_COLS = "id, drawing_id, revision_number, status, description, submitted_at, responded_at, client_comments, created_by, created_at, updated_at";
const SDF_COLS = "id, revision_id, file_path, file_name, file_size, mime_type, kind, sort_order, created_at";

type SdT  = import("./types").ShopDrawing;
type SdrT = import("./types").ShopDrawingRevision;
type SdfT = import("./types").ShopDrawingFile;
type SdrStatus = import("./types").ShopDrawingStatus;

function rowToSd(r: Record<string, unknown>): SdT {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const n = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    id: s(r.id), projectId: s(r.project_id), code: s(r.code),
    currentRevision: typeof r.current_revision === "number" ? r.current_revision : 1,
    approvedRevision: n(r.approved_revision),
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToSdr(r: Record<string, unknown>): SdrT {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    id: s(r.id), drawingId: s(r.drawing_id),
    revisionNumber: typeof r.revision_number === "number" ? r.revision_number : 1,
    status: ((r.status as SdrStatus) ?? "draft"),
    description: sn(r.description),
    submittedAt: sn(r.submitted_at), respondedAt: sn(r.responded_at),
    clientComments: sn(r.client_comments),
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToSdf(r: Record<string, unknown>): SdfT {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const kind = r.kind === "pdf" || r.kind === "dwg" ? r.kind : "other";
  return {
    id: s(r.id), revisionId: s(r.revision_id),
    filePath: s(r.file_path), fileName: s(r.file_name),
    fileSize: typeof r.file_size === "number" ? r.file_size : 0,
    mimeType: sn(r.mime_type), kind: kind as SdfT["kind"],
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
    createdAt: s(r.created_at),
  };
}

export type SdResult  = { ok: true; drawing: SdT } | { ok: false; error: string };
export type SdrResult = { ok: true; revision: SdrT } | { ok: false; error: string };

// Create the shop drawing + its first (draft) revision for a project.
export async function createShopDrawing(
  projectId: string, createdBy: string | null,
): Promise<{ ok: true; drawing: SdT; revision: SdrT } | { ok: false; error: string }> {
  if (!projectId) return { ok: false, error: "Project id is required." };
  if (db.SHOP_DRAWINGS && Object.values(db.SHOP_DRAWINGS).some(d => d.projectId === projectId)) {
    return { ok: false, error: "This project already has a shop drawing." };
  }
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  let drawing: SdT | null = null;
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const { data, error } = await supa.from("shop_drawings")
      .insert({ project_id: projectId, current_revision: 1, created_by: createdBy })
      .select(SD_COLS).single();
    if (!error && data) { drawing = rowToSd(data as Record<string, unknown>); break; }
    const code = (error as { code?: string } | null)?.code;
    if (code === UNIQUE_VIOLATION && /code/.test((error as { message?: string } | null)?.message ?? "")) continue;
    return { ok: false, error: error?.message || "Failed to create shop drawing." };
  }
  if (!drawing) return { ok: false, error: "Could not allocate a drawing code — try again." };

  const { data: revData, error: revErr } = await supa.from("shop_drawing_revisions")
    .insert({ drawing_id: drawing.id, revision_number: 1, status: "draft", created_by: createdBy })
    .select(SDR_COLS).single();
  if (revErr || !revData) return { ok: false, error: revErr?.message || "Failed to create revision 1." };

  const revision = rowToSdr(revData as Record<string, unknown>);
  db.SHOP_DRAWINGS[drawing.id] = drawing;
  db.SHOP_DRAWING_REVISIONS[revision.id] = revision;
  return { ok: true, drawing, revision };
}

// Upload one or more files to a DRAFT revision and/or set its description.
// At least one file or a description change must be supplied.
export async function addShopDrawingFiles(
  revisionId: string, files: File[], description: string | null, _uploaderId: string | null,
): Promise<{ ok: true; files: SdfT[] } | { ok: false; error: string }> {
  void _uploaderId;
  if (!revisionId) return { ok: false, error: "Revision id is required." };
  const rev = db.SHOP_DRAWING_REVISIONS[revisionId];
  if (rev && rev.status !== "draft") return { ok: false, error: "This revision is locked — files can only be added while it's a draft." };
  const list = (files ?? []).filter(Boolean);
  const hasDesc = description != null;
  if (list.length === 0 && !hasDesc) return { ok: false, error: "Attach at least one file (or edit the description)." };

  const projectId = rev ? db.SHOP_DRAWINGS[rev.drawingId]?.projectId ?? "" : "";
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  // Validate every file up-front before uploading any.
  for (const f of list) {
    if (f.size > SHOP_DRAWING_MAX_BYTES) {
      return { ok: false, error: `"${f.name}" is over the 25 MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB).` };
    }
    if (!["pdf", "dwg"].includes(fileExt(f.name))) {
      return { ok: false, error: `"${f.name}" must be a PDF or DWG file.` };
    }
  }

  // Persist the description first (so it sticks even if a file fails).
  if (hasDesc) {
    const { data, error } = await supa.from("shop_drawing_revisions")
      .update({ description: description?.trim() || null }).eq("id", revisionId).select(SDR_COLS).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (data) db.SHOP_DRAWING_REVISIONS[revisionId] = rowToSdr(data as Record<string, unknown>);
  }

  const baseOrder = Object.values(db.SHOP_DRAWING_FILES).filter(f => f.revisionId === revisionId).length;
  const saved: SdfT[] = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const ext = fileExt(f.name);
    const kind = ext === "pdf" ? "pdf" : ext === "dwg" ? "dwg" : "other";
    const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "drawing";
    const rand = Math.random().toString(36).slice(2, 10);
    const filePath = `drawing/${projectId || "unknown"}/${rand}-${safe}`;
    const { error: upErr } = await supa.storage.from(DESIGN_BUCKET)
      .upload(filePath, f, { contentType: f.type || undefined, upsert: false });
    if (upErr) return saved.length
      ? { ok: true, files: saved } // some succeeded; surface those, stop on first failure
      : { ok: false, error: `Upload failed: ${upErr.message}` };

    const { data, error } = await supa.from("shop_drawing_files").insert({
      revision_id: revisionId, file_path: filePath, file_name: f.name,
      file_size: f.size, mime_type: f.type || null, kind, sort_order: baseOrder + i,
    }).select(SDF_COLS).single();
    if (error || !data) {
      await supa.storage.from(DESIGN_BUCKET).remove([filePath]);
      return saved.length ? { ok: true, files: saved } : { ok: false, error: error?.message || "Failed to record file." };
    }
    const file = rowToSdf(data as Record<string, unknown>);
    db.SHOP_DRAWING_FILES[file.id] = file;
    saved.push(file);
  }
  return { ok: true, files: saved };
}

// Delete a file row. Like deleteMaterialItem we leave the storage blob —
// startNextShopDrawingRevision does NOT copy files, but keeping the blob
// is harmless and avoids races; orphans are small and private.
export async function deleteShopDrawingFile(fileId: string): Promise<Result> {
  if (!fileId) return { ok: false, error: "File id is required." };
  const file = db.SHOP_DRAWING_FILES[fileId];
  const guard = ensureSupabase();
  if (guard) return guard;
  delete db.SHOP_DRAWING_FILES[fileId]; // optimistic
  const { error } = await supabaseBrowser().from("shop_drawing_files").delete().eq("id", fileId);
  if (error) { if (file) db.SHOP_DRAWING_FILES[fileId] = file; return { ok: false, error: error.message }; }
  return { ok: true, id: fileId };
}

// Generic guarded revision transition (optimistic concurrency on status).
async function sdrTransition(
  revisionId: string, expected: SdrStatus, patch: Record<string, unknown>,
): Promise<SdrResult> {
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();
  const { data, error } = await supa.from("shop_drawing_revisions")
    .update(patch).eq("id", revisionId).eq("status", expected).select(SDR_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    const { data: cur } = await supa.from("shop_drawing_revisions").select(SDR_COLS).eq("id", revisionId).maybeSingle();
    if (cur) { const r = rowToSdr(cur as Record<string, unknown>); db.SHOP_DRAWING_REVISIONS[r.id] = r;
      return { ok: false, error: `This revision is already "${r.status}".` }; }
    return { ok: false, error: "Revision not found." };
  }
  const revision = rowToSdr(data[0] as Record<string, unknown>);
  db.SHOP_DRAWING_REVISIONS[revision.id] = revision;
  return { ok: true, revision };
}

export async function submitShopDrawingRevision(revisionId: string): Promise<SdrResult> {
  const files = Object.values(db.SHOP_DRAWING_FILES).filter(f => f.revisionId === revisionId);
  if (files.length === 0) return { ok: false, error: "Upload at least one drawing file before submitting." };
  return sdrTransition(revisionId, "draft", { status: "submitted", submitted_at: new Date().toISOString() });
}

export async function markShopDrawingApproved(revisionId: string): Promise<SdrResult> {
  const res = await sdrTransition(revisionId, "submitted", { status: "approved", responded_at: new Date().toISOString() });
  if (res.ok) {
    const draw = db.SHOP_DRAWINGS[res.revision.drawingId];
    if (draw) {
      const { data } = await supabaseBrowser().from("shop_drawings")
        .update({ approved_revision: res.revision.revisionNumber }).eq("id", draw.id).select(SD_COLS).maybeSingle();
      if (data) db.SHOP_DRAWINGS[draw.id] = rowToSd(data as Record<string, unknown>);
    }
  }
  return res;
}

export async function markShopDrawingReturned(revisionId: string, comments: string): Promise<SdrResult> {
  return sdrTransition(revisionId, "submitted", {
    status: "returned", responded_at: new Date().toISOString(), client_comments: comments?.trim() || null,
  });
}

export async function markShopDrawingRejected(revisionId: string, reason: string): Promise<SdrResult> {
  return sdrTransition(revisionId, "submitted", {
    status: "rejected", responded_at: new Date().toISOString(), client_comments: reason?.trim() || null,
  });
}

// Start a new draft revision, inheriting the latest revision's description
// (the OM re-uploads the corrected files; files are NOT copied forward).
export async function startNextShopDrawingRevision(
  drawingId: string, createdBy: string | null,
): Promise<SdrResult> {
  if (!drawingId) return { ok: false, error: "Drawing id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const revs = Object.values(db.SHOP_DRAWING_REVISIONS).filter(r => r.drawingId === drawingId);
  const latest = revs.sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
  const nextNum = (latest?.revisionNumber ?? 0) + 1;

  const { data: revData, error: revErr } = await supa.from("shop_drawing_revisions")
    .insert({ drawing_id: drawingId, revision_number: nextNum, status: "draft",
              description: latest?.description ?? null, created_by: createdBy })
    .select(SDR_COLS).single();
  if (revErr || !revData) return { ok: false, error: revErr?.message || "Failed to start the next revision." };
  const revision = rowToSdr(revData as Record<string, unknown>);

  const { data: sdData } = await supa.from("shop_drawings")
    .update({ current_revision: nextNum }).eq("id", drawingId).select(SD_COLS).maybeSingle();
  if (sdData) db.SHOP_DRAWINGS[drawingId] = rowToSd(sdData as Record<string, unknown>);

  db.SHOP_DRAWING_REVISIONS[revision.id] = revision;
  return { ok: true, revision };
}

// ─────────────────────────────────────────────────────────
// JOB COST ANALYSIS / JCA — Design phase activity 3 (migration 0043)
// All functions here are NEW. Internal budget, no revision/client cycle.
// One JCA per project; every save appends a permanent history snapshot.
// Subtotal/profit/total are derived in the UI, never stored.
// ─────────────────────────────────────────────────────────
const JCA_COLS      = "id, project_id, materials_budget, manpower_budget, subcontractor_budget, other_charges, profit_margin_pct, created_by, updated_by, created_at, updated_at";
const JCA_HIST_COLS = "id, jca_id, materials_budget, manpower_budget, subcontractor_budget, other_charges, profit_margin_pct, note, edited_by, edited_at";

type JcaT     = import("./types").ProjectJca;
type JcaHistT = import("./types").ProjectJcaHistory;

const jcaNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function rowToJca(r: Record<string, unknown>): JcaT {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    id: s(r.id), projectId: s(r.project_id),
    materialsBudget: jcaNum(r.materials_budget),
    manpowerBudget: jcaNum(r.manpower_budget),
    subcontractorBudget: jcaNum(r.subcontractor_budget),
    otherCharges: jcaNum(r.other_charges),
    profitMarginPct: jcaNum(r.profit_margin_pct),
    createdBy: (r.created_by as string | null) ?? null,
    updatedBy: (r.updated_by as string | null) ?? null,
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
function rowToJcaHist(r: Record<string, unknown>): JcaHistT {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    id: s(r.id), jcaId: s(r.jca_id),
    materialsBudget: jcaNum(r.materials_budget),
    manpowerBudget: jcaNum(r.manpower_budget),
    subcontractorBudget: jcaNum(r.subcontractor_budget),
    otherCharges: jcaNum(r.other_charges),
    profitMarginPct: jcaNum(r.profit_margin_pct),
    note: (r.note as string | null) ?? null,
    editedBy: (r.edited_by as string | null) ?? null,
    editedAt: s(r.edited_at),
  };
}

export interface JcaInput {
  materials_budget: number;
  manpower_budget: number;
  subcontractor_budget: number;
  other_charges: number;
  profit_margin_pct: number;
}

export type JcaResult = { ok: true; jca: JcaT } | { ok: false; error: string };

// Create-or-update the project's JCA, then append a history snapshot.
// The snapshot (with an optional note/reason) is the permanent audit row.
export async function saveJca(
  projectId: string, input: JcaInput, note: string | null, userId: string | null,
): Promise<JcaResult> {
  if (!projectId) return { ok: false, error: "Project id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const values = {
    materials_budget:     jcaNum(input.materials_budget),
    manpower_budget:      jcaNum(input.manpower_budget),
    subcontractor_budget: jcaNum(input.subcontractor_budget),
    other_charges:        jcaNum(input.other_charges),
    profit_margin_pct:    jcaNum(input.profit_margin_pct),
  };

  const existing = Object.values(db.PROJECT_JCA).find(j => j.projectId === projectId) ?? null;

  let jca: JcaT;
  if (existing) {
    const { data, error } = await supa.from("project_jca")
      .update({ ...values, updated_by: userId }).eq("id", existing.id).select(JCA_COLS).single();
    if (error || !data) return { ok: false, error: error?.message || "Failed to update the JCA." };
    jca = rowToJca(data as Record<string, unknown>);
  } else {
    const { data, error } = await supa.from("project_jca")
      .insert({ project_id: projectId, ...values, created_by: userId, updated_by: userId })
      .select(JCA_COLS).single();
    if (error || !data) return { ok: false, error: error?.message || "Failed to create the JCA." };
    jca = rowToJca(data as Record<string, unknown>);
  }
  db.PROJECT_JCA[jca.id] = jca;

  // Append the audit snapshot. Best-effort: a save that succeeded should
  // not be reported as failed just because the history row didn't land,
  // but record any successful row into the mirror so the UI updates.
  const { data: histData, error: histErr } = await supa.from("project_jca_history")
    .insert({ jca_id: jca.id, ...values, note: note?.trim() || null, edited_by: userId })
    .select(JCA_HIST_COLS).single();
  if (!histErr && histData) {
    const hist = rowToJcaHist(histData as Record<string, unknown>);
    db.PROJECT_JCA_HISTORY[hist.id] = hist;
  }

  return { ok: true, jca };
}

export async function createMaterialRequest(input: MaterialRequestInput): Promise<MrResult> {
  if (!input.item_name?.trim()) return { ok: false, error: "Material name is required." };
  if (!input.customer_id) return { ok: false, error: "Customer is required." };
  const qty = input.quantity ?? 1;
  if (!Number.isFinite(qty) || qty < 1) return { ok: false, error: "Quantity must be at least 1." };

  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const body = {
    customer_id:      input.customer_id,
    work_order_id:    input.work_order_id    ?? null,
    project_id:       input.project_id       ?? null,
    amc_contract_id:  input.amc_contract_id  ?? null,
    repair_ticket_id: input.repair_ticket_id ?? null,
    site_id:          input.site_id          ?? null,
    item_name:        input.item_name.trim(),
    quantity:         qty,
    urgency:          input.urgency ?? "normal",
    notes:            input.notes?.trim() || null,
    requested_by:     input.requested_by ?? null,
  };

  // Code-gen trigger is racy (COUNT+1) — retry on unique-violation. Same
  // pattern + reasoning as createReplacementRequest above.
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const { data, error } = await supa
      .from("material_requests")
      .insert(body)
      .select(MR_SELECT_COLS)
      .single();
    if (!error && data) {
      const mr = rowToMr(data as unknown as Record<string, unknown>);
      db.MATERIAL_REQUESTS[mr.id] = mr;
      return { ok: true, mr };
    }
    const code = (error as { code?: string } | null)?.code;
    const msg  = (error as { message?: string } | null)?.message ?? "";
    if (code === UNIQUE_VIOLATION && /material_requests_code_key|code/.test(msg)) continue;
    return { ok: false, error: error?.message ?? "Couldn't create material request." };
  }
  return { ok: false, error: "Couldn't allocate a unique MR code after retries. Please try again." };
}

// Generic status transition with optimistic concurrency (mirrors rrTransition).
async function mrTransition(
  id: string,
  expectedStatus: MaterialRequestStatus,
  patch: Record<string, unknown>,
): Promise<MrResult> {
  if (!id) return { ok: false, error: "Material request id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { data, error } = await supa
    .from("material_requests")
    .update(patch)
    .eq("id", id)
    .eq("status", expectedStatus)
    .select(MR_SELECT_COLS);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    const { data: current } = await supa
      .from("material_requests")
      .select(MR_SELECT_COLS)
      .eq("id", id).maybeSingle();
    if (current) {
      const mr = rowToMr(current as unknown as Record<string, unknown>);
      db.MATERIAL_REQUESTS[mr.id] = mr;
      return {
        ok: false,
        error: `This request is already ${MATERIAL_REQUEST_STATUS_LABEL[mr.status]} — refresh to see the latest.`,
      };
    }
    return { ok: false, error: "Material request not found or no permission to update." };
  }
  const mr = rowToMr(data[0] as unknown as Record<string, unknown>);
  db.MATERIAL_REQUESTS[mr.id] = mr;
  return { ok: true, mr };
}

export async function approveMaterialRequest(id: string, note: string | null, approverId: string): Promise<MrResult> {
  return mrTransition(id, "pending", {
    status: "approved",
    approved_by: approverId,
    approved_at: new Date().toISOString(),
    approval_note: note?.trim() || null,
  });
}

export async function rejectMaterialRequest(id: string, reason: string, rejecterId: string): Promise<MrResult> {
  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };
  return mrTransition(id, "pending", {
    status: "rejected",
    rejected_by: rejecterId,
    rejected_at: new Date().toISOString(),
    rejection_reason: trimmed,
  });
}

export async function fulfillMaterialRequest(id: string, note: string | null, fulfillerId: string): Promise<MrResult> {
  return mrTransition(id, "approved", {
    status: "fulfilled",
    fulfilled_by: fulfillerId,
    fulfilled_at: new Date().toISOString(),
    fulfillment_note: note?.trim() || null,
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
  // Migration 0037: contracts explicitly configured with no free calls
  // cannot have one logged — the visit is billable. Other modes (limited /
  // unlimited / unset) all permit logging.
  const targetAmc = db.AMCS[input.amc_contract_id];
  if (targetAmc && targetAmc.freeCallsMode === "none") {
    return { ok: false, error: "This contract includes no free calls — log a billable work order instead." };
  }
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

/**
 * Link an existing free call to an existing work order. Used by the
 * "+ Create Work Order" button on the FreeCallsCard — after the user
 * submits the WorkOrderForm, we run this to populate
 * amc_free_calls.work_order_id and update the local mirror so the
 * entry's view-WO link appears without a full re-hydrate.
 */
export async function linkFreeCallToWorkOrder(
  freeCallId: string,
  workOrderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!freeCallId)   return { ok: false, error: "Free call id is required." };
  if (!workOrderId)  return { ok: false, error: "Work order id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const { error } = await supa
    .from("amc_free_calls")
    .update({ work_order_id: workOrderId })
    .eq("id", freeCallId);
  if (error) return { ok: false, error: error.message };

  const cur = db.FREE_CALLS[freeCallId];
  if (cur) db.FREE_CALLS[freeCallId] = { ...cur, workOrderId };
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════
// v1.1.0 — WO CHECKLIST TASKS (table from migration 0001)
// ═════════════════════════════════════════════════════════════
//
// Three helpers — add, toggle, delete — that mirror the table's tiny
// shape (id / work_order_id / label / is_done / position / count_label).
// Each helper updates the mirror optimistically so the UI reflects the
// change without waiting for the round-trip, then reverts on failure.

interface WoTaskRow {
  id: string;
  work_order_id: string;
  label: string;
  is_done: boolean;
  position: number;
  count_label: string | null;
}

function woTaskRowToType(r: WoTaskRow): WoTask {
  return {
    id:          r.id,
    workOrderId: r.work_order_id,
    label:       r.label,
    done:        r.is_done,
    position:    r.position,
    count:       r.count_label ?? undefined,
  };
}

export async function addWoTask(
  woId: string,
  label: string,
): Promise<{ ok: true; task: WoTask } | { ok: false; error: string }> {
  if (!woId)             return { ok: false, error: "Work order id is required." };
  if (!label.trim())     return { ok: false, error: "Task label is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const nextPos = db.tasksForWO(woId).reduce((m, t) => Math.max(m, t.position), -1) + 1;
  const { data, error } = await supa
    .from("work_order_tasks")
    .insert({ work_order_id: woId, label: label.trim(), is_done: false, position: nextPos })
    .select("id, work_order_id, label, is_done, position, count_label")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Task row missing after insert." };

  const task = woTaskRowToType(data as WoTaskRow);
  db.WO_TASKS[task.id] = task;
  return { ok: true, task };
}

export async function toggleWoTask(
  taskId: string,
  nextDone: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!taskId) return { ok: false, error: "Task id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const cur = db.WO_TASKS[taskId];
  // Optimistic local update so the checkbox flips instantly.
  if (cur) db.WO_TASKS[taskId] = { ...cur, done: nextDone };
  const { error } = await supa
    .from("work_order_tasks")
    .update({ is_done: nextDone })
    .eq("id", taskId);
  if (error) {
    if (cur) db.WO_TASKS[taskId] = cur;
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteWoTask(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!taskId) return { ok: false, error: "Task id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const cur = db.WO_TASKS[taskId];
  if (cur) delete db.WO_TASKS[taskId];
  const { error } = await supa
    .from("work_order_tasks")
    .delete()
    .eq("id", taskId);
  if (error) {
    if (cur) db.WO_TASKS[taskId] = cur;
    return { ok: false, error: error.message };
  }
  return { ok: true };
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
  // Migration 0035 — quotation template fields.
  project_id?: string | null;
  description?: string | null;
  terms?: string | null;
}

// Column list shared by every SELECT that hydrates a Quotation row from
// the DB. Migration 0035 added project_id / description / terms.
const QUOTATION_SELECT_COLS =
  "id, code, customer_id, title, value_aed, status, valid_until, " +
  "converted_to_project_id, converted_to_amc_id, notes, created_by, " +
  "created_at, updated_at, project_id, description, terms";

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
    projectId:             r.project_id ?? null,
    description:           r.description ?? null,
    terms:                 r.terms ?? null,
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
  .select(QUOTATION_SELECT_COLS)
  .maybeSingle();

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return { ok: false, error: "A quotation with this code already exists." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Quotation row missing after insert." };

  const quotation = quotationRowToType(data as unknown as QuotationRow);
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
    .select(QUOTATION_SELECT_COLS)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Quotation not found." };

  const quotation = quotationRowToType(data as unknown as QuotationRow);
  db.QUOTATIONS[quotation.id] = quotation;
  return { ok: true, quotation };
}

// ─────────────────────────────────────────────────────────
// updateQuotation — patch editable fields on the detail view.
//
// Covers the six fields Sales edits after the auto-generate hook:
// title, value_aed, valid_until, description, terms, notes.
// (Status changes still go through updateQuotationStatus; conversion
// still goes through convertQuotation — those have their own rules.)
// ─────────────────────────────────────────────────────────
export interface QuotationPatch {
  title?: string;
  value_aed?: number;
  valid_until?: string | null;
  description?: string | null;
  terms?: string | null;
  notes?: string | null;
}

export async function updateQuotation(
  id: string,
  patch: QuotationPatch,
): Promise<{ ok: true; quotation: Quotation } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Quotation id is required." };
  const guard = ensureSupabase();
  if (guard) return guard;

  const body: Record<string, unknown> = {};
  if (patch.title       !== undefined) body.title       = patch.title.trim();
  if (patch.value_aed   !== undefined) body.value_aed   = patch.value_aed;
  if (patch.valid_until !== undefined) body.valid_until = patch.valid_until || null;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.terms       !== undefined) body.terms       = patch.terms;
  if (patch.notes       !== undefined) body.notes       = patch.notes;
  if (Object.keys(body).length === 0) {
    const q = db.QUOTATIONS[id];
    return q ? { ok: true, quotation: q } : { ok: false, error: "No changes." };
  }

  const supa = supabaseBrowser();
  const prev = db.QUOTATIONS[id];

  // Optimistic mirror update so the edit form reflects the save instantly.
  if (prev) {
    db.QUOTATIONS[id] = {
      ...prev,
      title:       patch.title       !== undefined ? patch.title.trim()  : prev.title,
      valueAed:    patch.value_aed   !== undefined ? patch.value_aed     : prev.valueAed,
      validUntil:  patch.valid_until !== undefined ? (patch.valid_until || null) : prev.validUntil,
      description: patch.description !== undefined ? patch.description   : prev.description,
      terms:       patch.terms       !== undefined ? patch.terms         : prev.terms,
      notes:       patch.notes       !== undefined ? patch.notes         : prev.notes,
    };
  }

  const { data, error } = await supa.from("quotations")
    .update(body)
    .eq("id", id)
    .select(QUOTATION_SELECT_COLS)
    .maybeSingle();
  if (error || !data) {
    if (prev) db.QUOTATIONS[id] = prev; // revert
    return { ok: false, error: error?.message || "Update failed." };
  }
  const quotation = quotationRowToType(data as unknown as QuotationRow);
  db.QUOTATIONS[quotation.id] = quotation;
  return { ok: true, quotation };
}

// ─────────────────────────────────────────────────────────
// autoGenerateQuotationForProject — Migration 0035.
//
// Side-effect of createProject: drops a starter quotation into the
// quotations table linked to the freshly-created project. Pre-fills
// title, value, validity (today + 30 days), and bullet-point
// placeholder text for description + terms that Sales replaces.
//
// Non-fatal: createProject() catches rejections. If RLS denies the
// insert (e.g. role doesn't have quote_write), the project still
// lands; Sales can author the quotation manually.
// ─────────────────────────────────────────────────────────
const AUTO_QUOTE_VALIDITY_DAYS = 30;

function placeholderDescription(projectName: string): string {
  return (
    `Scope of work for ${projectName}:\n\n` +
    `• [Describe deliverable 1 — replace this text]\n` +
    `• [Describe deliverable 2 — replace this text]\n` +
    `• [Describe deliverable 3 — replace this text]\n\n` +
    `Replace this placeholder with the actual scope before sending.`
  );
}

function placeholderTerms(): string {
  return (
    `Payment terms:\n` +
    `• 50% advance on contract signing\n` +
    `• 40% on milestone delivery\n` +
    `• 10% on project completion\n\n` +
    `Validity: 30 days from quotation date.\n` +
    `Replace this placeholder with the agreed commercial terms.`
  );
}

async function autoGenerateQuotationForProject(
  project: Project,
): Promise<{ ok: true; quotation: Quotation } | { ok: false; error: string }> {
  const guard = ensureSupabase();
  if (guard) return guard;
  const supa = supabaseBrowser();

  const code = `QTN-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const validUntil = (() => {
    const d = new Date();
    d.setDate(d.getDate() + AUTO_QUOTE_VALIDITY_DAYS);
    return d.toISOString().slice(0, 10);
  })();

  const { data, error } = await supa.from("quotations").insert({
    code,
    customer_id: project.customer || null,
    project_id:  project.id,
    title:       `Quotation for ${project.name}`,
    value_aed:   project.value ?? 0,
    valid_until: validUntil,
    description: placeholderDescription(project.name),
    terms:       placeholderTerms(),
    notes:       null,
    status:      "draft",
  })
  .select(QUOTATION_SELECT_COLS)
  .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data)  return { ok: false, error: "Quotation row missing after insert." };

  const quotation = quotationRowToType(data as unknown as QuotationRow);
  db.QUOTATIONS[quotation.id] = quotation;
  return { ok: true, quotation };
}

// ─────────────────────────────────────────────────────────
// downloadQuotationFile — Migration 0035.
//
// Browser-native export. No PDF/DOCX library in package.json:
//   • "pdf"  → opens a print-styled HTML doc in a new window and
//              auto-triggers window.print(). The user picks
//              "Save as PDF" in the system print dialog.
//   • "word" → downloads an .doc file containing Word-friendly HTML.
//              Microsoft Word and LibreOffice both open .doc HTML
//              natively without extra dependencies.
//
// The customer name is looked up from the in-memory mirror so the
// printed document has a proper "To: Acme LLC" header instead of a
// raw UUID. Falls back to "—" when the customer isn't on the mirror.
// ─────────────────────────────────────────────────────────
export type QuotationExportFormat = "pdf" | "word";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function quotationToHtmlDocument(q: Quotation): string {
  const customer = q.customerId ? db.cust(q.customerId)?.name ?? "—" : "—";
  const total = (q.valueAed ?? 0).toLocaleString("en-AE", {
    style: "currency", currency: "AED", maximumFractionDigits: 2,
  });
  const today = new Date().toISOString().slice(0, 10);
  const desc  = (q.description ?? "").trim() || "(no scope provided)";
  const terms = (q.terms ?? "").trim() || "(no terms provided)";
  const notes = (q.notes ?? "").trim();
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(q.code)} · ${escapeHtml(q.title)}</title>
<style>
  body { font: 14px/1.55 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
         color: #1f2937; max-width: 760px; margin: 32px auto; padding: 0 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em;
       color: #6b7280; margin: 28px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .meta { display: grid; grid-template-columns: 120px 1fr; gap: 4px 16px;
          font-size: 13px; margin: 16px 0 8px; }
  .meta dt { color: #6b7280; }
  .meta dd { margin: 0; font-weight: 600; }
  pre { white-space: pre-wrap; font: inherit; margin: 0; }
  .total { font-size: 18px; font-weight: 700; padding: 12px 16px;
           background: #f3f4f6; border-radius: 8px; margin: 16px 0; }
  @media print {
    body { margin: 0; padding: 16mm; max-width: none; }
    h2 { break-after: avoid; }
  }
</style></head><body>
  <h1>${escapeHtml(q.title)}</h1>
  <div style="color:#6b7280; font-size:13px;">Quotation · ${escapeHtml(q.code)}</div>

  <dl class="meta">
    <dt>Customer</dt>      <dd>${escapeHtml(customer)}</dd>
    <dt>Date</dt>          <dd>${escapeHtml(today)}</dd>
    <dt>Valid until</dt>   <dd>${escapeHtml(q.validUntil ?? "—")}</dd>
    <dt>Status</dt>        <dd>${escapeHtml(q.status)}</dd>
  </dl>

  <h2>Scope of work</h2>
  <pre>${escapeHtml(desc)}</pre>

  <div class="total">Total: ${escapeHtml(total)}</div>

  <h2>Terms</h2>
  <pre>${escapeHtml(terms)}</pre>

  ${notes ? `<h2>Notes</h2><pre>${escapeHtml(notes)}</pre>` : ""}
</body></html>`;
}

export function downloadQuotationFile(
  quotation: Quotation,
  format: QuotationExportFormat,
): void {
  if (typeof window === "undefined") return;
  const html = quotationToHtmlDocument(quotation);

  if (format === "pdf") {
    // Open in a new window so the user sees an unloaded document, then
    // trigger the print dialog. They pick "Save as PDF" from the system.
    const w = window.open("", "_blank", "noopener,width=820,height=900");
    if (!w) {
      // Pop-up blocked — fall back to opening as a data URL in the same tab.
      const blob = new Blob([html], { type: "text/html" });
      window.location.href = URL.createObjectURL(blob);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Slight delay so the new window finishes parsing before printing.
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 250);
    return;
  }

  // Word: download as .doc — MS Word and LibreOffice both render HTML
  // files served with this extension. No DOCX library needed.
  const blob = new Blob(
    ["﻿" + html],
    { type: "application/msword;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const safeCode = quotation.code.replace(/[^\w\-]+/g, "_");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeCode}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
    .select(QUOTATION_SELECT_COLS)
    .maybeSingle();
  if (error) return { ok: false, error: `Created ${target} but couldn't flip quotation: ${error.message}` };
  if (!data) return { ok: false, error: "Quotation update returned no row." };

  const quotation = quotationRowToType(data as unknown as QuotationRow);
  db.QUOTATIONS[quotation.id] = quotation;
  return { ok: true, targetId: targetId!, quotation };
}
