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
  AmcContract, AmcDocument, AmcService, AmcServiceStatus, AmcStatus, Approval, ApprovalStep, Customer, FreeCall,
  MaterialRequest, MaterialRequestStatus, MaterialRequestUrgency,
  MaterialSubmittal, MaterialSubmittalRevision, MaterialSubmittalStatus, MaterialItem,
  ShopDrawing, ShopDrawingRevision, ShopDrawingStatus, ShopDrawingFile,
  ProjectJca, ProjectJcaHistory,
  ProjectMaterial, ProjectMaterialHistory,
  InstallationTask, InstallationTaskHistory, InstallationTaskPhoto,
  SnaggingItem, SnaggingPhoto, ZoneAcceptance, AcceptanceCertificate, TcHistory,
  HandoverDocument, HandoverChecklistItem, HandoverSignoff, HandoverHistory,
  DlpTicket, DlpTicketPhoto, DlpHistory,
  ClosureChecklistItem, ClosureSummary, ClosureHistory,
  Milestone, Project, ProjectPhase, Quotation, QuotationStatus, RepairTicket, ReplacementContext,
  ReplacementRequest, ReplacementDocument, ReplacementStatus, Site, SubContractor, Team, WorkOrder,
  WorkOrderSubContractor, WorkOrderSubContractorHours, WorkOrderTimeEntry, WoStatus, WoType, WoTask,
} from "./types";
import { formatShortDate } from "./dates";
import { mapNotificationRow, NOTIFICATION_COLUMNS } from "./notifications";
import {
  PROJECT_MATERIAL_COLUMNS, PROJECT_MATERIAL_HISTORY_COLUMNS,
  mapProjectMaterialRow, mapProjectMaterialHistoryRow,
} from "./projects/materialSupply";
import {
  INSTALLATION_TASK_COLUMNS, INSTALLATION_TASK_HISTORY_COLUMNS, INSTALLATION_TASK_PHOTO_COLUMNS,
  mapInstallationTaskRow, mapInstallationTaskHistoryRow, mapInstallationTaskPhotoRow,
} from "./projects/installation";
import {
  SNAGGING_ITEM_COLUMNS, SNAGGING_PHOTO_COLUMNS, ZONE_ACCEPTANCE_COLUMNS,
  ACCEPTANCE_CERTIFICATE_COLUMNS, TC_HISTORY_COLUMNS,
  mapSnaggingItemRow, mapSnaggingPhotoRow, mapZoneAcceptanceRow,
  mapAcceptanceCertificateRow, mapTcHistoryRow,
} from "./projects/tc";
import {
  HANDOVER_DOCUMENT_COLUMNS, HANDOVER_CHECKLIST_COLUMNS, HANDOVER_SIGNOFF_COLUMNS, HANDOVER_HISTORY_COLUMNS,
  mapHandoverDocumentRow, mapHandoverChecklistRow, mapHandoverSignoffRow, mapHandoverHistoryRow,
} from "./projects/handover";
import {
  DLP_TICKET_COLUMNS, DLP_TICKET_PHOTO_COLUMNS, DLP_HISTORY_COLUMNS,
  mapDlpTicketRow, mapDlpTicketPhotoRow, mapDlpHistoryRow,
} from "./projects/dlp";
import {
  CLOSURE_CHECKLIST_COLUMNS, CLOSURE_SUMMARY_COLUMNS, CLOSURE_HISTORY_COLUMNS,
  mapClosureChecklistRow, mapClosureSummaryRow, mapClosureHistoryRow,
} from "./projects/closed";
import type { Notification } from "./types";

export interface HydrationBundle {
  customers: Customer[];
  sites: Site[];
  teams: Team[];
  projects: Project[];
  amcs: AmcContract[];
  // Individual AMC quarterly service visits from amc_service_schedule.
  // The aggregated done/total counts on AmcContract are not enough for the
  // Growth Plan calendar — it needs one event per visit. Added in the 1B
  // calendar build; older code that only consumes `amcs` is unaffected.
  amcServices: AmcService[];
  repairs: RepairTicket[];
  workOrders: WorkOrder[];
  // Per-worker × per-session time entries from work_order_time_entries
  // (migration 0022). Open sessions (endedAt = null) drive the
  // "Active Work" dashboard widget; closed sessions sum into reports.
  // RLS restricts what each role sees here:
  //   • md / admin / manager / accounts / service_support → every row
  //   • lead_worker → entries on WOs they lead OR are assigned to
  //   • worker / driver / subcontractor → only their own entries
  workOrderTimeEntries: WorkOrderTimeEntry[];
  // Migration 0023 — sub-contractor directory + per-WO assignments.
  // Hydrated separately because they're not derivable from workOrders
  // alone (the join carries its own time-tracking columns).
  subContractors: SubContractor[];
  workOrderSubContractors: WorkOrderSubContractor[];
  // Migration 0026 — per-day hours log for sub-contractors. The
  // assignment row in workOrderSubContractors says "this sub is on
  // this WO"; the hours log says "and worked these sessions on these
  // days". Lead Tech writes via lib/create.logSubContractorHours.
  workOrderSubContractorHours: WorkOrderSubContractorHours[];
  // Phase 8 — AMC free calls. Existing table from 0009b. The detail
  // page renders the count + a Log button.
  freeCalls: FreeCall[];
  // Phase 11 — quotations (migration 0028). Independent module; rows
  // power the /quotations list + convert flow.
  quotations: Quotation[];
  // v1.1.0 — persisted WO checklist tasks (table from migration 0001).
  // Previously the Tasks tab held a local-state checklist that vanished
  // on refresh. Now hydrated like everything else.
  woTasks: WoTask[];
  // Migration 0034 — uploaded paperwork against AMC contracts. Optional
  // per spec; rows here are metadata only (binaries in Storage bucket
  // 'amc-documents'). Hydrated for everyone who can read amc_contracts.
  amcDocuments: AmcDocument[];
  approvals: Approval[];
  replacements: ReplacementRequest[];
  materialRequests: MaterialRequest[];
  // Migration 0039 — supporting documents attached to replacements. The
  // refund photo itself lives on the replacement row (refundPhoto* fields),
  // not here. Hydrated for everyone who can read replacement_requests.
  replacementDocuments: ReplacementDocument[];
  // Migration 0040 — Material Submittal (Design phase). RLS restricts these
  // to admin/md/manager/lead_worker/sales.
  materialSubmittals: MaterialSubmittal[];
  materialSubmittalRevisions: MaterialSubmittalRevision[];
  materialItems: MaterialItem[];
  // Migration 0042 — Shop Drawing (Design phase). Same RLS matrix.
  shopDrawings: ShopDrawing[];
  shopDrawingRevisions: ShopDrawingRevision[];
  shopDrawingFiles: ShopDrawingFile[];
  // Migration 0043 — JCA. RLS restricts to admin/md/manager/accounts.
  projectJca: ProjectJca[];
  projectJcaHistory: ProjectJcaHistory[];
  // Migration 0201 — Phase 2 Material Supply. Auto-seeded from the
  // approved submittal at phase advance; updated by lead tech / accountant.
  projectMaterials: ProjectMaterial[];
  projectMaterialHistory: ProjectMaterialHistory[];
  // Migration 0202 — Phase 3 Installation. Manually-built task checklist
  // + append-only history + proof-of-install photos. RLS restricts to
  // admin/md/manager/lead_worker/worker/sales.
  installationTasks: InstallationTask[];
  installationTaskHistory: InstallationTaskHistory[];
  installationTaskPhotos: InstallationTaskPhoto[];
  // Migration 0203 — Phase 4 Testing & Commissioning. RLS restricts to
  // admin/md/manager/lead_worker/accounts/sales.
  snaggingItems: SnaggingItem[];
  snaggingPhotos: SnaggingPhoto[];
  zoneAcceptances: ZoneAcceptance[];
  acceptanceCertificates: AcceptanceCertificate[];
  tcHistory: TcHistory[];
  // Migration 0204 — Phase 5 Handover. RLS restricts to
  // admin/md/manager/lead_worker/accounts/sales.
  handoverDocuments: HandoverDocument[];
  handoverChecklistItems: HandoverChecklistItem[];
  handoverSignoffs: HandoverSignoff[];
  handoverHistory: HandoverHistory[];
  // Migration 0205 — Phase 6 DLP.
  dlpTickets: DlpTicket[];
  dlpTicketPhotos: DlpTicketPhoto[];
  dlpHistory: DlpHistory[];
  // Migration 0206 — Phase 7 Closed.
  closureChecklistItems: ClosureChecklistItem[];
  closureSummaries: ClosureSummary[];
  closureHistory: ClosureHistory[];
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
    // Execution phase (migration 0020). Pre-0020 rows have no column
    // and rows created after but never advanced have NULL — both
    // hydrate as null and trigger the "Set Phase" UI.
    currentPhase: (r.current_phase as ProjectPhase | null) ?? null,
    handoverCompletedAt: (r.handover_completed_at as string | null) ?? null,
    dlpDurationMonths: asNumber(r.dlp_duration_months) || 12,
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
    // Free-call entitlement config (migration 0037). NULL mode = unset.
    freeCallsMode: ((r.free_calls_mode as AmcContract["freeCallsMode"]) ?? null),
    freeCallsIncluded: r.free_calls_included == null ? null : asNumber(r.free_calls_included),
    expiresAt: asString(r.expires_at),
    // Pause/renewal fields. suspendedAt / suspendedReason exist since
    // 0009b; pausedBy / resumedAt / firstPaymentDueAt / renewedFromId
    // are new in 0021. All nullable.
    suspendedAt:       (r.suspended_at          as string | null) ?? null,
    suspendedReason:   (r.suspended_reason      as string | null) ?? null,
    pausedBy:          (r.paused_by             as string | null) ?? null,
    resumedAt:         (r.resumed_at            as string | null) ?? null,
    firstPaymentDueAt: (r.first_payment_due_at  as string | null) ?? null,
    renewedFromId:     (r.renewed_from_id       as string | null) ?? null,
    // Migration 0033 — OM-selected first visit date. NULL until booked.
    firstVisitDate:    (r.first_visit_date      as string | null) ?? null,
  };
}

// Migration 0034 — AMC document metadata row.
function mapAmcDocument(r: Row): AmcDocument {
  return {
    id:            asString(r.id),
    amcId:         asString(r.amc_id),
    fileName:      asString(r.file_name),
    filePath:      asString(r.file_path),
    fileSizeBytes: (r.file_size_bytes as number | null) ?? null,
    mimeType:      (r.mime_type as string | null) ?? null,
    uploadedBy:    (r.uploaded_by as string | null) ?? null,
    uploadedAt:    asString(r.uploaded_at),
  };
}

// Migration 0040 — Material Submittal mappers.
function mapMaterialSubmittal(r: Row): MaterialSubmittal {
  return {
    id: asString(r.id), projectId: asString(r.project_id), code: asString(r.code),
    currentRevision: asNumber(r.current_revision, 1),
    approvedRevision: (r.approved_revision as number | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: asString(r.created_at), updatedAt: asString(r.updated_at),
  };
}
function mapMaterialSubmittalRevision(r: Row): MaterialSubmittalRevision {
  return {
    id: asString(r.id), submittalId: asString(r.submittal_id),
    revisionNumber: asNumber(r.revision_number, 1),
    status: ((r.status as MaterialSubmittalStatus) ?? "draft"),
    submittedAt: (r.submitted_at as string | null) ?? null,
    respondedAt: (r.responded_at as string | null) ?? null,
    clientComments: (r.client_comments as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: asString(r.created_at), updatedAt: asString(r.updated_at),
  };
}
function mapMaterialItem(r: Row): MaterialItem {
  return {
    id: asString(r.id), revisionId: asString(r.revision_id),
    description: asString(r.description),
    modelNumber: (r.model_number as string | null) ?? null,
    quantity: asNumber(r.quantity, 1),
    datasheetPath: (r.datasheet_path as string | null) ?? null,
    datasheetName: (r.datasheet_name as string | null) ?? null,
    sortOrder: asNumber(r.sort_order, 0),
    createdAt: asString(r.created_at),
  };
}

// Migration 0042 — Shop Drawing.
function mapShopDrawing(r: Row): ShopDrawing {
  return {
    id: asString(r.id), projectId: asString(r.project_id), code: asString(r.code),
    currentRevision: asNumber(r.current_revision, 1),
    approvedRevision: (r.approved_revision as number | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: asString(r.created_at), updatedAt: asString(r.updated_at),
  };
}
function mapShopDrawingRevision(r: Row): ShopDrawingRevision {
  return {
    id: asString(r.id), drawingId: asString(r.drawing_id),
    revisionNumber: asNumber(r.revision_number, 1),
    status: ((r.status as ShopDrawingStatus) ?? "draft"),
    description: (r.description as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
    respondedAt: (r.responded_at as string | null) ?? null,
    clientComments: (r.client_comments as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: asString(r.created_at), updatedAt: asString(r.updated_at),
  };
}
function mapShopDrawingFile(r: Row): ShopDrawingFile {
  const kind = r.kind === "pdf" || r.kind === "dwg" ? r.kind : "other";
  return {
    id: asString(r.id), revisionId: asString(r.revision_id),
    filePath: asString(r.file_path), fileName: asString(r.file_name),
    fileSize: asNumber(r.file_size, 0),
    mimeType: (r.mime_type as string | null) ?? null,
    kind: kind as ShopDrawingFile["kind"],
    sortOrder: asNumber(r.sort_order, 0),
    createdAt: asString(r.created_at),
  };
}

// Migration 0043 — JCA. Numeric columns arrive as strings from PostgREST
// (numeric type), so coerce via Number rather than the typeof-number asNumber.
function jcaNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function mapProjectJca(r: Row): ProjectJca {
  return {
    id: asString(r.id), projectId: asString(r.project_id),
    materialsBudget: jcaNumber(r.materials_budget),
    manpowerBudget: jcaNumber(r.manpower_budget),
    subcontractorBudget: jcaNumber(r.subcontractor_budget),
    otherCharges: jcaNumber(r.other_charges),
    profitMarginPct: jcaNumber(r.profit_margin_pct),
    createdBy: (r.created_by as string | null) ?? null,
    updatedBy: (r.updated_by as string | null) ?? null,
    createdAt: asString(r.created_at), updatedAt: asString(r.updated_at),
  };
}
function mapProjectJcaHistory(r: Row): ProjectJcaHistory {
  return {
    id: asString(r.id), jcaId: asString(r.jca_id),
    materialsBudget: jcaNumber(r.materials_budget),
    manpowerBudget: jcaNumber(r.manpower_budget),
    subcontractorBudget: jcaNumber(r.subcontractor_budget),
    otherCharges: jcaNumber(r.other_charges),
    profitMarginPct: jcaNumber(r.profit_margin_pct),
    note: (r.note as string | null) ?? null,
    editedBy: (r.edited_by as string | null) ?? null,
    editedAt: asString(r.edited_at),
  };
}

// Migration 0039 — replacement document metadata row.
function mapReplacementDocument(r: Row): ReplacementDocument {
  return {
    id:                   asString(r.id),
    replacementRequestId: asString(r.replacement_request_id),
    fileName:             asString(r.file_name),
    filePath:             asString(r.file_path),
    fileSizeBytes:        (r.file_size_bytes as number | null) ?? null,
    mimeType:             (r.mime_type as string | null) ?? null,
    uploadedBy:           (r.uploaded_by as string | null) ?? null,
    uploadedAt:           asString(r.uploaded_at),
  };
}

// One row of amc_service_schedule → AmcService. The DB carries
// scheduled_date as a Postgres `date` (YYYY-MM-DD); we keep the same
// string shape so the calendar can build a Date in the local timezone
// without timezone-shift surprises that ISO timestamps cause.
function mapAmcService(r: Row): AmcService {
  return {
    id:              asString(r.id),
    amcContractId:   asString(r.amc_contract_id),
    serviceNumber:   asNumber(r.service_number),
    scheduledDate:   asString(r.scheduled_date).slice(0, 10),
    status:          ((r.status as AmcServiceStatus) ?? "scheduled"),
    workOrderId:    (r.work_order_id as string | null) ?? null,
    completedAt:    (r.completed_at as string | null) ?? null,
    notes:          (r.notes as string | null) ?? null,
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
    // Migration 0022 fields. Trigger-maintained on the server.
    startedAt:          (r.started_at   as string | null) ?? null,
    completedAt:        (r.completed_at as string | null) ?? null,
    durationMinutes:    asNumber(r.duration_minutes),
    actualWorkersCount: asNumber(r.actual_workers_count),
  };
}

function mapWorkOrderTimeEntry(r: Row): WorkOrderTimeEntry {
  return {
    id:              asString(r.id),
    workOrderId:     asString(r.work_order_id),
    userId:         (r.user_id as string | null) ?? null,
    startedAt:       asString(r.started_at),
    endedAt:        (r.ended_at as string | null) ?? null,
    durationMinutes: asNumber(r.duration_minutes),
    note:           (r.note as string | null) ?? null,
    createdAt:       asString(r.created_at),
  };
}

function mapSubContractor(r: Row): SubContractor {
  return {
    id:          asString(r.id),
    name:        asString(r.name),
    phone:      (r.phone        as string | null) ?? null,
    emiratesId: (r.emirates_id  as string | null) ?? null,
    company:    (r.company      as string | null) ?? null,
    notes:      (r.notes        as string | null) ?? null,
    isActive:   (r.is_active    as boolean | null) ?? true,
    createdAt:   asString(r.created_at),
    createdBy:  (r.created_by   as string | null) ?? null,
  };
}

function mapWorkOrderSubContractor(r: Row): WorkOrderSubContractor {
  return {
    id:                asString(r.id),
    workOrderId:       asString(r.work_order_id),
    subContractorId:   asString(r.sub_contractor_id),
    assignedAt:        asString(r.assigned_at),
    assignedBy:       (r.assigned_by  as string | null) ?? null,
    startedAt:        (r.started_at   as string | null) ?? null,
    completedAt:      (r.completed_at as string | null) ?? null,
    durationMinutes:   asNumber(r.duration_minutes),
    note:             (r.note         as string | null) ?? null,
  };
}

// Migration 0026. hours is numeric(5,2); PostgREST returns numerics
// either as number or as string depending on size — coerce defensively.
// entry_date is a Postgres `date` and arrives as a 'YYYY-MM-DD' string.
function mapWorkOrderSubContractorHours(r: Row): WorkOrderSubContractorHours {
  const rawHours = r.hours;
  const hours = typeof rawHours === "number"
    ? rawHours
    : typeof rawHours === "string" ? Number(rawHours) : 0;
  return {
    id:                asString(r.id),
    workOrderId:       asString(r.work_order_id),
    subContractorId:   asString(r.sub_contractor_id),
    entryDate:         asString(r.entry_date).slice(0, 10),
    hours,
    notes:            (r.notes      as string | null) ?? null,
    loggedBy:         (r.logged_by  as string | null) ?? null,
    loggedAt:          asString(r.logged_at),
  };
}

function mapFreeCall(r: Row): FreeCall {
  return {
    id:              asString(r.id),
    amcContractId:   asString(r.amc_contract_id),
    reportedAt:      asString(r.reported_by_customer_at),
    symptom:         asString(r.symptom),
    workOrderId:    (r.work_order_id as string | null) ?? null,
    completedAt:    (r.completed_at  as string | null) ?? null,
    createdAt:       asString(r.created_at),
  };
}

function mapWoTask(r: Row): WoTask {
  return {
    id:           asString(r.id),
    workOrderId:  asString(r.work_order_id),
    label:        asString(r.label),
    done:         Boolean(r.is_done),
    position:     asNumber(r.position),
    count:       (r.count_label as string | null) ?? undefined,
  };
}

function mapQuotation(r: Row): Quotation {
  const rawVal = r.value_aed;
  const value = typeof rawVal === "number" ? rawVal
              : typeof rawVal === "string" ? Number(rawVal) : 0;
  return {
    id:                    asString(r.id),
    code:                  asString(r.code),
    customerId:           (r.customer_id as string | null) ?? null,
    title:                 asString(r.title),
    valueAed:              value,
    status:               ((r.status as QuotationStatus) ?? "draft"),
    validUntil:           (r.valid_until as string | null) ?? null,
    convertedToProjectId: (r.converted_to_project_id as string | null) ?? null,
    convertedToAmcId:     (r.converted_to_amc_id     as string | null) ?? null,
    notes:                (r.notes      as string | null) ?? null,
    createdBy:            (r.created_by as string | null) ?? null,
    createdAt:             asString(r.created_at),
    updatedAt:             asString(r.updated_at),
    // Migration 0035 — quotation template fields.
    projectId:            (r.project_id  as string | null) ?? null,
    description:          (r.description as string | null) ?? null,
    terms:                (r.terms       as string | null) ?? null,
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
    refundPhotoPath:       (r.refund_photo_path as string | null) ?? null,
    refundPhotoName:       (r.refund_photo_name as string | null) ?? null,
    refundPhotoUploadedBy: (r.refund_photo_uploaded_by as string | null) ?? null,
    refundPhotoUploadedAt: (r.refund_photo_uploaded_at as string | null) ?? null,
    createdAt:        asString(r.created_at),
    updatedAt:        asString(r.updated_at),
  };
}

function mapMaterialRequest(r: Row): MaterialRequest {
  return {
    id:               asString(r.id),
    code:             asString(r.code),
    workOrderId:      (r.work_order_id as string | null) ?? null,
    projectId:        (r.project_id as string | null) ?? null,
    amcContractId:    (r.amc_contract_id as string | null) ?? null,
    repairTicketId:   (r.repair_ticket_id as string | null) ?? null,
    customerId:       asString(r.customer_id),
    siteId:           (r.site_id as string | null) ?? null,
    itemName:         asString(r.item_name),
    quantity:         asNumber(r.quantity, 1),
    urgency:          ((r.urgency as MaterialRequestUrgency) ?? "normal"),
    notes:            (r.notes as string | null) ?? null,
    status:           ((r.status as MaterialRequestStatus) ?? "pending"),
    requestedBy:      (r.requested_by as string | null) ?? null,
    requestedAt:      asString(r.requested_at),
    approvedBy:       (r.approved_by as string | null) ?? null,
    approvedAt:       (r.approved_at as string | null) ?? null,
    approvalNote:     (r.approval_note as string | null) ?? null,
    rejectedBy:       (r.rejected_by as string | null) ?? null,
    rejectedAt:       (r.rejected_at as string | null) ?? null,
    rejectionReason:  (r.rejection_reason as string | null) ?? null,
    fulfilledBy:      (r.fulfilled_by as string | null) ?? null,
    fulfilledAt:      (r.fulfilled_at as string | null) ?? null,
    fulfillmentNote:  (r.fulfillment_note as string | null) ?? null,
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
  // Hydration runs on the server — use a stable English formatter so
  // the string matches across SSR + CSR and React doesn't blow up.
  return formatShortDate(new Date(iso));
}

// Fetch one user's recent notifications. Scoped explicitly by user_id —
// the service-role client bypasses RLS, so we must NOT fetch all rows here
// (that would leak every user's notifications). Newest first, capped.
export async function fetchNotifications(
  admin: SupabaseClient,
  userId: string,
): Promise<Notification[]> {
  if (!userId) return [];
  const { data, error } = await admin
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data as Row[]).map(mapNotificationRow);
}

export async function hydrateAll(admin: SupabaseClient): Promise<HydrationBundle> {
  // Fan out all reads in parallel - these are independent.
  const [
    customersRaw, sitesRaw, teamsRaw, projectsRaw, milestonesRaw,
    amcsRaw, amcServicesRaw, repairsRaw, workOrdersRaw, woAssignRaw, approvalsRaw, approvalStepsRaw, usersRaw,
    replacementsRaw, woTimeEntriesRaw, subContractorsRaw, woSubContractorsRaw, woSubHoursRaw,
    freeCallsRaw, quotationsRaw, woTasksRaw, amcDocumentsRaw, materialRequestsRaw,
    replacementDocumentsRaw,
    materialSubmittalsRaw, materialSubmittalRevisionsRaw, materialItemsRaw,
    shopDrawingsRaw, shopDrawingRevisionsRaw, shopDrawingFilesRaw,
    projectJcaRaw, projectJcaHistoryRaw,
    projectMaterialsRaw, projectMaterialHistoryRaw,
    installationTasksRaw, installationTaskHistoryRaw, installationTaskPhotosRaw,
    snaggingItemsRaw, snaggingPhotosRaw, zoneAcceptancesRaw, acceptanceCertificatesRaw, tcHistoryRaw,
    handoverDocumentsRaw, handoverChecklistItemsRaw, handoverSignoffsRaw, handoverHistoryRaw,
    dlpTicketsRaw, dlpTicketPhotosRaw, dlpHistoryRaw,
    closureChecklistItemsRaw, closureSummariesRaw, closureHistoryRaw,
  ] = await Promise.all([
    fetchAll(admin, "customers"),
    fetchAll(admin, "sites"),
    fetchAll(admin, "teams"),
    fetchAll(admin, "projects"),
    fetchAll(admin, "milestones"),
    fetchAll(admin, "amc_contracts"),
    fetchAll(admin, "amc_service_schedule"),
    fetchAll(admin, "repair_tickets"),
    fetchAll(admin, "work_orders"),
    fetchAll(admin, "work_order_assignments"),
    fetchAll(admin, "approvals"),
    fetchAll(admin, "approval_steps"),
    fetchAll(admin, "users", "id, team_id"),
    fetchAll(admin, "replacement_requests"),
    fetchAll(admin, "work_order_time_entries"),
    fetchAll(admin, "sub_contractors"),
    fetchAll(admin, "work_order_sub_contractors"),
    fetchAll(admin, "work_order_sub_contractor_hours"),
    fetchAll(admin, "amc_free_calls"),
    fetchAll(admin, "quotations"),
    fetchAll(admin, "work_order_tasks"),
    fetchAll(admin, "amc_documents"),
    fetchAll(admin, "material_requests"),
    fetchAll(admin, "replacement_documents"),
    fetchAll(admin, "material_submittals"),
    fetchAll(admin, "material_submittal_revisions"),
    fetchAll(admin, "material_items"),
    fetchAll(admin, "shop_drawings"),
    fetchAll(admin, "shop_drawing_revisions"),
    fetchAll(admin, "shop_drawing_files"),
    fetchAll(admin, "project_jca"),
    fetchAll(admin, "project_jca_history"),
    fetchAll(admin, "project_materials", PROJECT_MATERIAL_COLUMNS),
    fetchAll(admin, "project_material_history", PROJECT_MATERIAL_HISTORY_COLUMNS),
    fetchAll(admin, "installation_tasks", INSTALLATION_TASK_COLUMNS),
    fetchAll(admin, "installation_task_history", INSTALLATION_TASK_HISTORY_COLUMNS),
    fetchAll(admin, "installation_task_photos", INSTALLATION_TASK_PHOTO_COLUMNS),
    fetchAll(admin, "snagging_items", SNAGGING_ITEM_COLUMNS),
    fetchAll(admin, "snagging_photos", SNAGGING_PHOTO_COLUMNS),
    fetchAll(admin, "zone_acceptances", ZONE_ACCEPTANCE_COLUMNS),
    fetchAll(admin, "acceptance_certificates", ACCEPTANCE_CERTIFICATE_COLUMNS),
    fetchAll(admin, "tc_history", TC_HISTORY_COLUMNS),
    fetchAll(admin, "handover_documents", HANDOVER_DOCUMENT_COLUMNS),
    fetchAll(admin, "handover_checklist_items", HANDOVER_CHECKLIST_COLUMNS),
    fetchAll(admin, "handover_signoff", HANDOVER_SIGNOFF_COLUMNS),
    fetchAll(admin, "handover_history", HANDOVER_HISTORY_COLUMNS),
    fetchAll(admin, "dlp_tickets", DLP_TICKET_COLUMNS),
    fetchAll(admin, "dlp_ticket_photos", DLP_TICKET_PHOTO_COLUMNS),
    fetchAll(admin, "dlp_history", DLP_HISTORY_COLUMNS),
    fetchAll(admin, "closure_checklist", CLOSURE_CHECKLIST_COLUMNS),
    fetchAll(admin, "closure_summary", CLOSURE_SUMMARY_COLUMNS),
    fetchAll(admin, "closure_history", CLOSURE_HISTORY_COLUMNS),
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
    amcServices: amcServicesRaw.map(mapAmcService),
    repairs: repairsRaw.map(mapRepair),
    workOrders: workOrdersRaw.map(r => mapWorkOrder(r, assignByWo.get(asString(r.id)) ?? [])),
    workOrderTimeEntries: woTimeEntriesRaw.map(mapWorkOrderTimeEntry),
    subContractors: subContractorsRaw.map(mapSubContractor),
    workOrderSubContractors: woSubContractorsRaw.map(mapWorkOrderSubContractor),
    workOrderSubContractorHours: woSubHoursRaw.map(mapWorkOrderSubContractorHours),
    freeCalls: freeCallsRaw.map(mapFreeCall),
    quotations: quotationsRaw.map(mapQuotation),
    woTasks: woTasksRaw.map(mapWoTask),
    amcDocuments: amcDocumentsRaw.map(mapAmcDocument),
    approvals: approvalsRaw.map(r => mapApproval(r, stepsByApproval.get(asString(r.id)) ?? [])),
    replacements: replacementsRaw.map(mapReplacement),
    materialRequests: materialRequestsRaw.map(mapMaterialRequest),
    replacementDocuments: replacementDocumentsRaw.map(mapReplacementDocument),
    materialSubmittals: materialSubmittalsRaw.map(mapMaterialSubmittal),
    materialSubmittalRevisions: materialSubmittalRevisionsRaw.map(mapMaterialSubmittalRevision),
    materialItems: materialItemsRaw.map(mapMaterialItem),
    shopDrawings: shopDrawingsRaw.map(mapShopDrawing),
    shopDrawingRevisions: shopDrawingRevisionsRaw.map(mapShopDrawingRevision),
    shopDrawingFiles: shopDrawingFilesRaw.map(mapShopDrawingFile),
    projectJca: projectJcaRaw.map(mapProjectJca),
    projectJcaHistory: projectJcaHistoryRaw.map(mapProjectJcaHistory),
    projectMaterials: projectMaterialsRaw.map(mapProjectMaterialRow),
    projectMaterialHistory: projectMaterialHistoryRaw.map(mapProjectMaterialHistoryRow),
    installationTasks: installationTasksRaw.map(mapInstallationTaskRow),
    installationTaskHistory: installationTaskHistoryRaw.map(mapInstallationTaskHistoryRow),
    installationTaskPhotos: installationTaskPhotosRaw.map(mapInstallationTaskPhotoRow),
    snaggingItems: snaggingItemsRaw.map(mapSnaggingItemRow),
    snaggingPhotos: snaggingPhotosRaw.map(mapSnaggingPhotoRow),
    zoneAcceptances: zoneAcceptancesRaw.map(mapZoneAcceptanceRow),
    acceptanceCertificates: acceptanceCertificatesRaw.map(mapAcceptanceCertificateRow),
    tcHistory: tcHistoryRaw.map(mapTcHistoryRow),
    handoverDocuments: handoverDocumentsRaw.map(mapHandoverDocumentRow),
    handoverChecklistItems: handoverChecklistItemsRaw.map(mapHandoverChecklistRow),
    handoverSignoffs: handoverSignoffsRaw.map(mapHandoverSignoffRow),
    handoverHistory: handoverHistoryRaw.map(mapHandoverHistoryRow),
    dlpTickets: dlpTicketsRaw.map(mapDlpTicketRow),
    dlpTicketPhotos: dlpTicketPhotosRaw.map(mapDlpTicketPhotoRow),
    dlpHistory: dlpHistoryRaw.map(mapDlpHistoryRow),
    closureChecklistItems: closureChecklistItemsRaw.map(mapClosureChecklistRow),
    closureSummaries: closureSummariesRaw.map(mapClosureSummaryRow),
    closureHistory: closureHistoryRaw.map(mapClosureHistoryRow),
  };
}
