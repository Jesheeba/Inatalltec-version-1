// ============================================================
// Server-side entity hydration.
// Called once per page-load from app/(app)/layout.tsx via the
// service-role Supabase client. Returns UI-shaped bundles that
// AppProvider mirrors into db.* dictionaries so list views render
// with real data on first paint. The mock-data fallback is gone.
//
// This file is server-only - never import from a client component.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AmcContract, AmcStatus, Approval, ApprovalStep, Customer, Milestone,
  Project, RepairTicket, ReplacementContext, ReplacementRequest, ReplacementStatus,
  Site, Team, WorkOrder, WoStatus, WoType,
} from "./types";

export interface HydrationBundle {
  customers: Customer[];
  sites: Site[];
  teams: Team[];
  projects: Project[];
  amcs: AmcContract[];
  repairs: RepairTicket[];
  workOrders: WorkOrder[];
  approvals: Approval[];
  replacements: ReplacementRequest[];
}

type Row = Record<string, unknown>;

// Best-effort fetch - if the table is missing or RLS blocks, return [] and
// log the issue server-side. The UI will render an empty list rather than
// crash the whole page.
async function fetchAll(admin: SupabaseClient, table: string, columns = "*"): Promise<Row[]> {
  const { data, error } = await admin.from(table).select(columns);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[hydrate] ${table}: ${error.message}`);
    return [];
  }
  // PostgREST returns `data` typed loosely when columns is dynamic; cast
  // through unknown to satisfy the strict typed client.
  return (data ?? []) as unknown as Row[];
}

function asString(v: unknown, dflt = ""): string { return typeof v === "string" ? v : dflt; }
function asNumber(v: unknown, dflt = 0): number { return typeof v === "number" ? v : dflt; }
function asArray<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

function mapCustomer(r: Row): Customer {
  const since = asString(r.customer_since).slice(0, 7) || asString(r.since).slice(0, 7);
  return {
    id: asString(r.id),
    name: asString(r.name),
    tier: ((r.tier as Customer["tier"]) ?? "Standard"),
    region: asString(r.region, "UAE"),
    sector: asString(r.sector, "-"),
    owner: asString(r.owner_id),
    since,
    tags: asArray<string>(r.tags),
  };
}

function mapSite(r: Row): Site {
  return {
    id: asString(r.id),
    name: asString(r.name),
    customer: asString(r.customer_id),
    area: asString(r.area),
    access: asString(r.access_instructions),
    // Optional Step-B fields from migration 0013. Use undefined when blank
    // so the UI can tell "user never set this" from "user set empty string".
    address_line_1: (r.address_line_1 as string | undefined) || undefined,
    address_line_2: (r.address_line_2 as string | undefined) || undefined,
    emirate:        (r.emirate as string | undefined) || undefined,
    contact_name:   (r.contact_name as string | undefined) || undefined,
    contact_phone:  (r.contact_phone as string | undefined) || undefined,
    contact_email:  (r.contact_email as string | undefined) || undefined,
    geo_lat:        typeof r.geo_lat === "number" ? r.geo_lat : undefined,
    geo_lng:        typeof r.geo_lng === "number" ? r.geo_lng : undefined,
    is_active:      r.is_active === false ? false : true,
  };
}

function mapTeam(r: Row, memberIds: string[]): Team {
  return {
    id: asString(r.id),
    name: asString(r.name),
    lead: asString(r.lead_worker_id),
    manager: asString(r.manager_id),
    members: memberIds,
    skills: asArray<string>(r.skills),
    region: asString(r.region, "UAE"),
  };
}

function mapMilestone(r: Row): Milestone {
  return {
    id: asString(r.id),
    name: asString(r.name),
    done: r.is_done === true,
    pct: asNumber(r.pct),
  };
}

function mapProject(r: Row, milestones: Milestone[]): Project {
  return {
    id: asString(r.id),
    code: asString(r.code),
    name: asString(r.name),
    customer: asString(r.customer_id),
    site: asString(r.site_id),
    manager: asString(r.manager_id),
    team: asString(r.team_id),
    leadTechId: asString(r.lead_tech_id),
    status: asString(r.status, "In Progress"),
    stage: asString(r.stage, "Mobilisation"),
    progress: asNumber(r.progress),
    value: asNumber(r.value_aed),
    startedAt: asString(r.started_at),
    dueAt: asString(r.due_at),
    milestones,
  };
}

function mapAmc(r: Row): AmcContract {
  // Migration 0009 renamed amc_contracts.state → contract_status and rewrote
  // every value to lowercase enum (draft/pending_payment/active/suspended/
  // expired/cancelled/renewed). Default to "draft" when the column is
  // unexpectedly missing so an undefined badge never crashes downstream.
  return {
    id: asString(r.id),
    code: asString(r.code),
    customer: asString(r.customer_id),
    site: asString(r.site_id),
    manager: asString(r.manager_id),
    leadTechId: asString(r.lead_tech_id),
    contract_status: ((r.contract_status as AmcStatus) ?? "draft"),
    value: asNumber(r.value_aed),
    services: { done: 0, total: 4 }, // derive from amc_service_schedule in Phase 2
    nextDue: asString(r.next_due_label, "-"),
    overdueDays: asNumber(r.overdue_days),
    freeCalls: asNumber(r.free_calls_used),
    expiresAt: asString(r.expires_at),
  };
}

function mapRepair(r: Row): RepairTicket {
  const target = asNumber(r.sla_target_min, 240);
  const elapsed = asNumber(r.sla_elapsed_min);
  return {
    id: asString(r.id),
    code: asString(r.code),
    title: asString(r.title),
    customer: asString(r.customer_id),
    site: asString(r.site_id),
    leadTechId: asString(r.lead_tech_id),
    state: ((r.state as RepairTicket["state"]) ?? "New"),
    sla: { target, elapsed, breach: elapsed > target },
    classification: asString(r.classification),
    priority: ((r.priority as RepairTicket["priority"]) ?? "normal"),
    openedAt: asString(r.opened_at).replace("T", " ").slice(0, 16),
    assigned: (r.assigned_to as string | null) ?? null,
    visits: asNumber(r.visits),
    flagged: (r.flagged as string | undefined) ?? undefined,
  };
}

function mapWorkOrder(r: Row, assignedIds: string[]): WorkOrder {
  return {
    id: asString(r.id),
    code: asString(r.code),
    type: ((r.type as WoType) ?? "PROJECT"),
    priority: asString(r.priority, "Standard"),
    title: asString(r.title),
    source: {
      kind: ((r.source_kind as "amc" | "project" | "repair") ?? "project"),
      id: asString(r.source_id),
    },
    customer: asString(r.customer_id),
    site: asString(r.site_id),
    scheduledStart: asString(r.scheduled_start),
    scheduledEnd: asString(r.scheduled_end),
    status: ((r.status as WoStatus) ?? "open"),
    assignedLead: asString(r.assigned_lead),
    assigned: assignedIds,
    progress: asNumber(r.progress),
    slaMin: (r.sla_min as number | null) ?? null,
    elapsedMin: asNumber(r.elapsed_min),
    materials: asArray<string>(r.materials),
    flagged: (r.flagged as string | undefined) ?? undefined,
  };
}

function mapReplacement(r: Row): ReplacementRequest {
  return {
    id:               asString(r.id),
    code:             asString(r.code),
    context:          ((r.context as ReplacementContext) ?? "main_contractor"),
    workOrderId:      (r.work_order_id as string | null) ?? null,
    projectId:        (r.project_id as string | null) ?? null,
    amcContractId:    (r.amc_contract_id as string | null) ?? null,
    repairTicketId:   (r.repair_ticket_id as string | null) ?? null,
    customerId:       asString(r.customer_id),
    siteId:           (r.site_id as string | null) ?? null,
    itemName:         asString(r.item_name),
    quantity:         asNumber(r.quantity, 1),
    reason:           (r.reason as string | null) ?? null,
    status:           ((r.status as ReplacementStatus) ?? "requested"),
    requestedBy:      (r.requested_by as string | null) ?? null,
    requestedAt:      asString(r.requested_at),
    approvedBy:       (r.approved_by as string | null) ?? null,
    approvedAt:       (r.approved_at as string | null) ?? null,
    approvalNote:     (r.approval_note as string | null) ?? null,
    installedBy:      (r.installed_by as string | null) ?? null,
    installedAt:      (r.installed_at as string | null) ?? null,
    installationNote: (r.installation_note as string | null) ?? null,
    confirmedBy:      (r.confirmed_by as string | null) ?? null,
    confirmedAt:      (r.confirmed_at as string | null) ?? null,
    confirmationNote: (r.confirmation_note as string | null) ?? null,
    rejectedBy:       (r.rejected_by as string | null) ?? null,
    rejectedAt:       (r.rejected_at as string | null) ?? null,
    rejectionReason:  (r.rejection_reason as string | null) ?? null,
    createdAt:        asString(r.created_at),
    updatedAt:        asString(r.updated_at),
  };
}

function mapApproval(r: Row, chain: ApprovalStep[]): Approval {
  const pending = chain.find(s => s.state === "pending");
  return {
    id: asString(r.id),
    code: asString(r.code),
    kind: (r.kind as Approval["kind"]) ?? "Material Request",
    amount: (r.amount_aed as number | null) ?? null,
    context: asString(r.context),
    requester: r.is_system_trigger === true ? "system" : asString(r.requester_id),
    target: {
      kind: asString(r.target_kind, "system"),
      id: asString(r.target_id),
    },
    openedAt: relativeOpenedAt(asString(r.opened_at)),
    priority: ((r.priority as Approval["priority"]) ?? "normal"),
    pendingFor: pending?.user ?? "",
    chain,
    notes: (r.notes as string | undefined) ?? undefined,
  };
}

function relativeOpenedAt(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "-";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
  return new Date(iso).toLocaleDateString();
}

export async function hydrateAll(admin: SupabaseClient): Promise<HydrationBundle> {
  // Fan out all reads in parallel - these are independent.
  const [
    customersRaw, sitesRaw, teamsRaw, projectsRaw, milestonesRaw,
    amcsRaw, repairsRaw, workOrdersRaw, woAssignRaw, approvalsRaw, approvalStepsRaw, usersRaw,
    replacementsRaw,
  ] = await Promise.all([
    fetchAll(admin, "customers"),
    fetchAll(admin, "sites"),
    fetchAll(admin, "teams"),
    fetchAll(admin, "projects"),
    fetchAll(admin, "milestones"),
    fetchAll(admin, "amc_contracts"),
    fetchAll(admin, "repair_tickets"),
    fetchAll(admin, "work_orders"),
    fetchAll(admin, "work_order_assignments"),
    fetchAll(admin, "approvals"),
    fetchAll(admin, "approval_steps"),
    fetchAll(admin, "users", "id, team_id"),
    fetchAll(admin, "replacement_requests"),
  ]);

  // Group milestones by project_id.
  const milestonesByProject = new Map<string, Milestone[]>();
  for (const row of milestonesRaw) {
    const pid = asString(row.project_id);
    if (!pid) continue;
    const list = milestonesByProject.get(pid) ?? [];
    list.push(mapMilestone(row));
    milestonesByProject.set(pid, list);
  }

  // Group team members by team_id (from users.team_id).
  const membersByTeam = new Map<string, string[]>();
  for (const u of usersRaw) {
    const tid = asString(u.team_id);
    if (!tid) continue;
    const list = membersByTeam.get(tid) ?? [];
    list.push(asString(u.id));
    membersByTeam.set(tid, list);
  }

  // Group work-order assignments by work_order_id.
  const assignByWo = new Map<string, string[]>();
  for (const a of woAssignRaw) {
    const wid = asString(a.work_order_id);
    if (!wid) continue;
    const list = assignByWo.get(wid) ?? [];
    list.push(asString(a.user_id));
    assignByWo.set(wid, list);
  }

  // Group approval steps by approval_id (sorted by step number).
  const stepsByApproval = new Map<string, ApprovalStep[]>();
  for (const s of approvalStepsRaw) {
    const aid = asString(s.approval_id);
    if (!aid) continue;
    const list = stepsByApproval.get(aid) ?? [];
    list.push({
      step: asNumber(s.step),
      role: s.step_role as ApprovalStep["role"],
      user: asString(s.approver_id),
      state: ((s.state as ApprovalStep["state"]) ?? "queued"),
      at: (s.decided_at as string | undefined) ?? undefined,
    });
    stepsByApproval.set(aid, list);
  }
  for (const [, list] of stepsByApproval) list.sort((a, b) => a.step - b.step);

  return {
    customers: customersRaw.map(mapCustomer),
    sites: sitesRaw.map(mapSite),
    teams: teamsRaw.map(r => mapTeam(r, membersByTeam.get(asString(r.id)) ?? [])),
    projects: projectsRaw.map(r => mapProject(r, milestonesByProject.get(asString(r.id)) ?? [])),
    amcs: amcsRaw.map(mapAmc),
    repairs: repairsRaw.map(mapRepair),
    workOrders: workOrdersRaw.map(r => mapWorkOrder(r, assignByWo.get(asString(r.id)) ?? [])),
    approvals: approvalsRaw.map(r => mapApproval(r, stepsByApproval.get(asString(r.id)) ?? [])),
    replacements: replacementsRaw.map(mapReplacement),
  };
}
