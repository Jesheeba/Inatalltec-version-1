// ============================================================
// Phase 5 — Handover data layer.
//
// Pure helpers for the handover_documents, handover_checklist_items,
// handover_signoff and handover_history tables (migration 0204).
// Mirrors lib/projects/tc.ts:
//   • COLUMN constants — keep server SELECT lists and client mappers
//     in lock-step.
//   • Row mappers — DB shape → UI shape (lib/types.ts).
//   • Category metadata.
//   • Pure compute helpers — progress + sign-off readiness (mirror of
//     the DB gate fn_handover_signoff_gate).
// ============================================================

import type {
  HandoverChecklistItem,
  HandoverDocCategory,
  HandoverDocument,
  HandoverHistory,
  HandoverSignoff,
} from "../types";

// ── Columns ─────────────────────────────────────────────────
export const HANDOVER_DOCUMENT_COLUMNS =
  "id, project_id, category, file_path, file_name, file_size, mime_type, " +
  "description, is_required, uploaded_by, uploaded_at, created_at";

export const HANDOVER_CHECKLIST_COLUMNS =
  "id, project_id, category, item_description, is_required, is_completed, " +
  "completed_at, completed_by, sort_order, last_action_by, created_at, updated_at";

export const HANDOVER_SIGNOFF_COLUMNS =
  "id, project_id, customer_name, customer_email, notes, signature_method, " +
  "signed_at, signed_by_user_id, created_at";

export const HANDOVER_HISTORY_COLUMNS =
  "id, project_id, entity_kind, entity_id, action, detail, changed_by, changed_at";

// ── Row mappers ─────────────────────────────────────────────
export function mapHandoverDocumentRow(row: Record<string, unknown>): HandoverDocument {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    category: ((row.category as HandoverDocCategory) ?? "other"),
    filePath: (row.file_path as string) ?? "",
    fileName: (row.file_name as string) ?? "",
    fileSize: row.file_size == null ? null : Number(row.file_size),
    mimeType: (row.mime_type as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    isRequired: Boolean(row.is_required),
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    uploadedAt: (row.uploaded_at as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
  };
}

export function mapHandoverChecklistRow(row: Record<string, unknown>): HandoverChecklistItem {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    category: (row.category as HandoverDocCategory | null) ?? null,
    itemDescription: (row.item_description as string) ?? "",
    isRequired: Boolean(row.is_required),
    isCompleted: Boolean(row.is_completed),
    completedAt: (row.completed_at as string | null) ?? null,
    completedBy: (row.completed_by as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    lastActionBy: (row.last_action_by as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function mapHandoverSignoffRow(row: Record<string, unknown>): HandoverSignoff {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    customerName: (row.customer_name as string) ?? "",
    customerEmail: (row.customer_email as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    signatureMethod: (row.signature_method as string) ?? "typed",
    signedAt: (row.signed_at as string) ?? "",
    signedByUserId: (row.signed_by_user_id as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
  };
}

export function mapHandoverHistoryRow(row: Record<string, unknown>): HandoverHistory {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    entityKind: (row.entity_kind as string) ?? "",
    entityId: (row.entity_id as string | null) ?? null,
    action: (row.action as string) ?? "",
    detail: (row.detail as string | null) ?? null,
    changedBy: (row.changed_by as string | null) ?? null,
    changedAt: (row.changed_at as string) ?? "",
  };
}

// ── Category metadata ───────────────────────────────────────
export const HANDOVER_CATEGORIES: readonly HandoverDocCategory[] = [
  "drawings",
  "manuals",
  "certificates",
  "warranty",
  "other",
] as const;

export const HANDOVER_CATEGORY_LABEL: Record<HandoverDocCategory, string> = {
  drawings: "Drawings",
  manuals: "Manuals",
  certificates: "Certificates",
  warranty: "Warranty",
  other: "Other",
};

// Categories that must have at least one document before sign-off.
// Mirrors the array in fn_handover_signoff_gate (migration 0204).
export const REQUIRED_HANDOVER_CATEGORIES: readonly HandoverDocCategory[] = [
  "drawings",
  "manuals",
  "certificates",
  "warranty",
] as const;

// ── Progress + readiness helpers ────────────────────────────
export interface HandoverProgress {
  totalDocuments: number;
  checklistTotal: number;
  checklistCompleted: number;
  mandatoryTotal: number;
  mandatoryCompleted: number;
  requiredCategories: number;
  categoriesCovered: number;
  signedOff: boolean;
  signedAt: string | null;
  /** 0–100 across mandatory checklist items + required-category coverage. */
  percentComplete: number;
}

function coveredCategories(documents: readonly HandoverDocument[]): Set<HandoverDocCategory> {
  const set = new Set<HandoverDocCategory>();
  for (const d of documents) set.add(d.category);
  return set;
}

export function computeHandoverProgress(
  documents: readonly HandoverDocument[],
  checklist: readonly HandoverChecklistItem[],
  signoff: HandoverSignoff | null,
): HandoverProgress {
  const mandatory = checklist.filter(c => c.isRequired);
  const mandatoryCompleted = mandatory.filter(c => c.isCompleted).length;
  const checklistCompleted = checklist.filter(c => c.isCompleted).length;
  const covered = coveredCategories(documents);
  const categoriesCovered = REQUIRED_HANDOVER_CATEGORIES.filter(c => covered.has(c)).length;

  const steps = mandatory.length + REQUIRED_HANDOVER_CATEGORIES.length;
  const done = mandatoryCompleted + categoriesCovered;
  const percentComplete = signoff ? 100 : steps === 0 ? 0 : Math.round((done / steps) * 100);

  return {
    totalDocuments: documents.length,
    checklistTotal: checklist.length,
    checklistCompleted,
    mandatoryTotal: mandatory.length,
    mandatoryCompleted,
    requiredCategories: REQUIRED_HANDOVER_CATEGORIES.length,
    categoriesCovered,
    signedOff: !!signoff,
    signedAt: signoff?.signedAt ?? null,
    percentComplete,
  };
}

// Mirror of fn_handover_signoff_gate (migration 0204). Ready when every
// mandatory checklist item is complete AND every required category has
// at least one document. The DB trigger is authoritative; this disables
// the sign-off button and drives the hint panel.
export function isReadyForSignoff(
  documents: readonly HandoverDocument[],
  checklist: readonly HandoverChecklistItem[],
): boolean {
  const allMandatoryDone = checklist.every(c => !c.isRequired || c.isCompleted);
  const covered = coveredCategories(documents);
  const allCategoriesCovered = REQUIRED_HANDOVER_CATEGORIES.every(c => covered.has(c));
  return allMandatoryDone && allCategoriesCovered;
}

export interface HandoverSignoffPending {
  incompleteMandatory: HandoverChecklistItem[];
  missingCategories: HandoverDocCategory[];
}

export function pendingItemsForSignoff(
  documents: readonly HandoverDocument[],
  checklist: readonly HandoverChecklistItem[],
): HandoverSignoffPending {
  const covered = coveredCategories(documents);
  return {
    incompleteMandatory: checklist.filter(c => c.isRequired && !c.isCompleted),
    missingCategories: REQUIRED_HANDOVER_CATEGORIES.filter(c => !covered.has(c)),
  };
}

// Human-readable file size for the document list.
export function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
