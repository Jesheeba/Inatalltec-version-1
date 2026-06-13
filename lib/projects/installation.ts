// ============================================================
// Phase 3 — Installation data layer.
//
// Pure helpers for the installation_tasks, installation_task_history and
// installation_task_photos tables (migration 0202). Mirrors the shape of
// lib/projects/materialSupply.ts:
//   • COLUMN constants — keep server SELECT lists and client mappers
//     in lock-step.
//   • Row mappers — DB shape → UI shape (lib/types.ts).
//   • Status / category metadata — labels + order for the INST-B UI.
//   • Pure compute helpers — progress summary, phase-gate readiness.
//
// Selectors that traverse the in-memory mirror will live in lib/db.ts
// (tasksForProject / taskHistoryForTask), consistent with how the
// Phase 2 selectors are exposed — added in INST-B when the UI consumes
// them. The computational utilities here operate on already-resolved
// arrays so the same logic can serve any caller (UI, the INST-C
// phase-advance button, reports).
// ============================================================

import type {
  InstallationTask,
  InstallationTaskCategory,
  InstallationTaskHistory,
  InstallationTaskPhoto,
  InstallationTaskStatus,
} from "../types";

// ── Columns ─────────────────────────────────────────────────
export const INSTALLATION_TASK_COLUMNS =
  "id, project_id, title, description, zone, category, status, " +
  "assigned_to, source_material_id, sort_order, completed_at, completed_by, " +
  "notes, last_action_by, created_by, created_at, updated_at";

export const INSTALLATION_TASK_HISTORY_COLUMNS =
  "id, task_id, action, detail, from_status, to_status, changed_by, changed_at";

export const INSTALLATION_TASK_PHOTO_COLUMNS =
  "id, task_id, storage_path, caption, uploaded_by, uploaded_at";

// ── Row mappers (DB row → UI shape) ─────────────────────────
export function mapInstallationTaskRow(row: Record<string, unknown>): InstallationTask {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    title: (row.title as string) ?? "",
    description: (row.description as string | null) ?? null,
    zone: (row.zone as string | null) ?? null,
    category: ((row.category as InstallationTaskCategory) ?? "other"),
    status: ((row.status as InstallationTaskStatus) ?? "pending"),
    assignedTo: (row.assigned_to as string | null) ?? null,
    sourceMaterialId: (row.source_material_id as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    completedAt: (row.completed_at as string | null) ?? null,
    completedBy: (row.completed_by as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    lastActionBy: (row.last_action_by as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function mapInstallationTaskHistoryRow(
  row: Record<string, unknown>,
): InstallationTaskHistory {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    action: (row.action as string) ?? "",
    detail: (row.detail as string | null) ?? null,
    fromStatus: (row.from_status as InstallationTaskStatus | null) ?? null,
    toStatus: (row.to_status as InstallationTaskStatus | null) ?? null,
    changedBy: (row.changed_by as string | null) ?? null,
    changedAt: (row.changed_at as string) ?? "",
  };
}

export function mapInstallationTaskPhotoRow(
  row: Record<string, unknown>,
): InstallationTaskPhoto {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    storagePath: (row.storage_path as string) ?? "",
    caption: (row.caption as string | null) ?? null,
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    uploadedAt: (row.uploaded_at as string) ?? "",
  };
}

// ── Status + category metadata (used by the INST-B UI) ──────
// Centralizing the label / order here lets the UI pick a chip or pill
// style without re-declaring the enum mapping at the render site. Order
// matches the natural workflow so progress strips render correctly.
export const INSTALLATION_TASK_STATUSES: readonly InstallationTaskStatus[] = [
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "not_applicable",
] as const;

export const INSTALLATION_TASK_STATUS_LABEL: Record<InstallationTaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  not_applicable: "Not applicable",
};

export const INSTALLATION_TASK_CATEGORIES: readonly InstallationTaskCategory[] = [
  "cabling",
  "device_mounting",
  "termination",
  "configuration",
  "testing",
  "other",
] as const;

export const INSTALLATION_TASK_CATEGORY_LABEL: Record<InstallationTaskCategory, string> = {
  cabling: "Cabling",
  device_mounting: "Device mounting",
  termination: "Termination",
  configuration: "Configuration",
  testing: "Testing",
  other: "Other",
};

// ── Progress + readiness helpers ────────────────────────────
export interface InstallationProgress {
  total: number;
  pending: number;
  inProgress: number;
  blocked: number;
  completed: number;
  notApplicable: number;
  /**
   * Percent complete, EXCLUDING not_applicable from the denominator
   * (a task marked N/A isn't work that has to be done). Counts both
   * completed and not_applicable as "resolved", so a checklist of all
   * N/A reads as 100%. 0 when there are no tasks.
   */
  percentComplete: number;
}

export function computeInstallationProgress(
  tasks: readonly InstallationTask[],
): InstallationProgress {
  const total = tasks.length;
  let pending = 0;
  let inProgress = 0;
  let blocked = 0;
  let completed = 0;
  let notApplicable = 0;
  for (const t of tasks) {
    switch (t.status) {
      case "pending":        pending++;       break;
      case "in_progress":    inProgress++;    break;
      case "blocked":        blocked++;       break;
      case "completed":      completed++;     break;
      case "not_applicable": notApplicable++; break;
    }
  }
  // Resolved = completed + not_applicable; both clear the phase gate.
  const resolved = completed + notApplicable;
  const percentComplete =
    total === 0 ? 0 : Math.round((resolved / total) * 100);
  return {
    total, pending, inProgress, blocked, completed, notApplicable,
    percentComplete,
  };
}

// Mirror of fn_check_installation_gate (migration 0202). The DB trigger
// is the authoritative check; this is the user-facing mirror used to
// disable the "Advance to Testing & Commissioning" button in INST-C and
// render a "what's pending" hint. Empty task list passes (defensive
// no-op — matches the trigger's behaviour).
export function isReadyForTesting(
  tasks: readonly InstallationTask[],
): boolean {
  if (tasks.length === 0) return true;
  return tasks.every(
    t => t.status === "completed" || t.status === "not_applicable",
  );
}

// Lists the tasks still blocking the phase advance. Empty array means
// the gate passes. Used by the INST-C hint panel.
export function pendingTasksForGate(
  tasks: readonly InstallationTask[],
): InstallationTask[] {
  return tasks.filter(
    t => t.status !== "completed" && t.status !== "not_applicable",
  );
}

// Groups tasks by zone for the INST-B checklist UI. Tasks with no zone
// land under a stable null key the caller can render as "Unzoned".
// Insertion order of zones follows first-seen, then each group keeps the
// caller's incoming order (sort by sort_order upstream if needed).
export function groupTasksByZone(
  tasks: readonly InstallationTask[],
): Map<string | null, InstallationTask[]> {
  const groups = new Map<string | null, InstallationTask[]>();
  for (const t of tasks) {
    const key = t.zone && t.zone.trim() !== "" ? t.zone : null;
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}
