"use client";
// ============================================================
// Installation — Phase 3 (migration 0202).
//
// Two exports:
//   • InstallationSummaryCard — status card on the project detail page,
//     mirrors the Material Supply summary pattern.
//   • InstallationPage — full management UI at
//     /projects/[id]/installation.
//
// A manually-built, zone-grouped checklist of on-site tasks (mount a
// camera, terminate a rack, configure an NVR). Status workflow:
//   pending → in_progress → completed
//   any → blocked (with a reason) → in_progress (resume)
//   any → not_applicable
// Photos (proof-of-install) per task, append-only audit trail.
//
// Roles (mirrors lib/permissions.ts):
//   VIEW_INSTALLATION   — admin/md/manager/lead_worker/worker/sales
//   MANAGE_INSTALLATION — admin/md/manager/lead_worker/worker
// A Worker is further scoped IN THIS UI to tasks assigned to them (the
// DB RLS is role-coarse — see the slice report's honest flagging).
// Managers (admin/md/manager/lead_worker) manage all tasks; Sales is
// read-only.
//
// Responsive (field workers use phones heavily):
//   zone-grouped CARDS at every width (never a table)
//   44px tap targets on every action button
//   modals render as bottom sheets <640px via the shared .modal CSS
//   no hover-only affordances — all actions are taps/clicks
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { phaseIndex } from "@/lib/phases";
import {
  createInstallationTask,
  updateInstallationTaskStatus,
  updateInstallationTaskDetails,
  assignInstallationTask,
  linkInstallationTaskToMaterial,
  addInstallationTaskPhoto,
  deleteInstallationTaskPhoto,
  getInstallPhotoUrl,
  advanceProjectPhase,
} from "@/lib/create";
import { formatLongDateTime } from "@/lib/dates";
import type {
  InstallationTask,
  InstallationTaskCategory,
  InstallationTaskHistory,
  InstallationTaskPhoto,
  InstallationTaskStatus,
  Role,
} from "@/lib/types";
import {
  INSTALLATION_TASK_CATEGORIES,
  INSTALLATION_TASK_CATEGORY_LABEL,
  INSTALLATION_TASK_STATUS_LABEL,
  computeInstallationProgress,
  groupTasksByZone,
  isReadyForTesting,
  pendingTasksForGate,
} from "@/lib/projects/installation";
import { CardHead, EmptyState, Modal, PageHeader } from "../../shared";

// ── Status → badge tone ─────────────────────────────────────
const STATUS_BADGE_CLS: Record<InstallationTaskStatus, string> = {
  pending: "badge-outline",
  in_progress: "badge-info",
  blocked: "badge-danger",
  completed: "badge-success",
  not_applicable: "badge-outline",
};

// ── Category → icon (all names exist in components/Icon) ────
const CATEGORY_ICON: Record<InstallationTaskCategory, string> = {
  cabling: "cable",
  device_mounting: "hardHat",
  termination: "wrench",
  configuration: "layers",
  testing: "refresh",
  other: "package",
};

const MANAGER_ROLES: Role[] = ["admin", "md", "manager", "lead_worker"];
function isManagerRole(role: Role): boolean {
  return MANAGER_ROLES.includes(role);
}

/* ─── Summary card (project detail page) ─────────────────── */
export function InstallationSummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_INSTALLATION")) return null;

  const project = db.proj(projectId);
  const tasks = db.tasksForProject(projectId);
  const progress = computeInstallationProgress(tasks);

  // Hide until the project has reached (or passed) Installation.
  const phaseIdx = phaseIndex(project?.currentPhase);
  if (phaseIdx < phaseIndex("installation")) return null;

  const badge =
    tasks.length === 0
      ? { label: "Awaiting setup", cls: "badge-outline" }
      : progress.percentComplete === 100
        ? { label: "All complete", cls: "badge-success" }
        : progress.completed > 0
          ? { label: `${progress.percentComplete}% complete`, cls: "badge-info" }
          : { label: "In progress", cls: "badge-warning" };

  return (
    <section
      className="card card-pad card-hover"
      style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/installation`)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
          <Icon name="hardHat" size={18} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Installation</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {`${progress.completed} of ${progress.total} tasks complete`}
              {progress.blocked > 0 ? ` · ${progress.blocked} blocked` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span className={"badge " + badge.cls} style={{ whiteSpace: "nowrap" }}>{badge.label}</span>
          <Icon name="chevronRight" size={16} style={{ color: "var(--ink-mute)" }} />
        </div>
      </div>
    </section>
  );
}

/* ─── Full management page (sub-route) ───────────────────── */
export function InstallationPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_INSTALLATION")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Installation" title="Installation" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Installation is visible to project management and field staff." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const tasks = db.tasksForProject(projectId);
  const progress = computeInstallationProgress(tasks);

  const phaseIdx = phaseIndex(project?.currentPhase);
  const beforePhase = phaseIdx < phaseIndex("installation");
  const phaseLocked = phaseIdx > phaseIndex("installation");
  const inPhase = !beforePhase && !phaseLocked;

  const manager = isManagerRole(role);
  // Managers manage everything; a Worker manages only tasks assigned to
  // them. Both gated by MANAGE_INSTALLATION + being in-phase.
  const canManageAll = can(role, "MANAGE_INSTALLATION") && manager && inPhase;
  const canManageTask = (t: InstallationTask): boolean => {
    if (!can(role, "MANAGE_INSTALLATION") || !inPhase) return false;
    if (manager) return true;
    return role === "worker" && t.assignedTo === me.id;
  };

  // Zone grouping — alphabetical, Unzoned last.
  const zoneGroups = useMemo(() => {
    const groups = groupTasksByZone(tasks);
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [tasks]);

  const [addOpen, setAddOpen] = useState(false);
  const [editTask, setEditTask] = useState<InstallationTask | null>(null);
  const [assignTask, setAssignTask] = useState<InstallationTask | null>(null);
  const [photoTask, setPhotoTask] = useState<InstallationTask | null>(null);
  const [statusChange, setStatusChange] =
    useState<{ task: InstallationTask; to: InstallationTaskStatus } | null>(null);

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a
          onClick={() => router.push(`/projects/${projectId}`)}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Icon name="chevronLeft" size={14} /> {project ? project.code + " · " + project.name : "Back to project"}
        </a>
      </div>

      <PageHeader
        eyebrow="Phase 3"
        title="Installation"
        sub="On-site task checklist — mount, cable, terminate, configure, test"
        right={
          <span className={"badge " + (progress.total === 0 ? "badge-outline" : "badge-info")} style={{ fontWeight: 600 }}>
            {progress.total === 0 ? "No tasks yet" : `${progress.percentComplete}% complete`}
          </span>
        }
      />

      {beforePhase && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="clock" size={16} /></div>
          <div className="text"><div className="h">Project hasn&apos;t reached Installation</div>
            <div className="d">Tasks can be added once the project advances to the Installation phase.</div></div>
        </div>
      )}
      {phaseLocked && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="check" size={16} /></div>
          <div className="text"><div className="h">Installation complete</div>
            <div className="d">This project has moved past Installation — the checklist is read-only.</div></div>
        </div>
      )}
      {inPhase && !manager && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="eye" size={16} /></div>
          <div className="text"><div className="h">{role === "worker" ? "Field view" : "View only"}</div>
            <div className="d">{role === "worker"
              ? "You can update the status and add photos for tasks assigned to you."
              : "You can review installation progress but not edit it."}</div></div>
        </div>
      )}

      {/* Progress tiles */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Progress" sub={`${progress.total} task${progress.total === 1 ? "" : "s"} in scope`} />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          <ProgressTile label="Pending" value={progress.pending} />
          <ProgressTile label="In progress" value={progress.inProgress} />
          <ProgressTile label="Blocked" value={progress.blocked} danger={progress.blocked > 0} />
          <ProgressTile label="Completed" value={progress.completed} accent />
          <ProgressTile label="N/A" value={progress.notApplicable} muted />
        </div>
      </section>

      {/* Tasks, grouped by zone */}
      <section className="card card-pad">
        <div className="row between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <CardHead title={`Tasks · ${tasks.length}`} sub="Grouped by site zone" />
          {canManageAll && (
            <button className="btn btn-soft btn-sm" onClick={() => setAddOpen(true)} style={{ minHeight: 44 }}>
              <Icon name="plus" size={13} /> Add task
            </button>
          )}
        </div>

        {tasks.length === 0 ? (
          <EmptyState icon="hardHat" title="No tasks yet"
            sub={beforePhase
              ? "Add tasks once the project reaches the Installation phase."
              : canManageAll
                ? "Add the first installation task to start building the checklist."
                : "The project lead will add installation tasks here."} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {zoneGroups.map(([zone, zoneTasks]) => (
              <div key={zone ?? "__unzoned"}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Icon name="mapPin" size={14} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
                  <span style={{ font: "var(--t-body-md)", fontWeight: 700 }}>{zone ?? "Unzoned"}</span>
                  <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>· {zoneTasks.length}</span>
                </div>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                  {zoneTasks.map(t => (
                    <TaskCard key={t.id} task={t}
                      canManage={canManageTask(t)}
                      canManageAll={canManageAll}
                      photoCount={db.photosForTask(t.id).length}
                      onStatus={(to) => setStatusChange({ task: t, to })}
                      onAssign={() => setAssignTask(t)}
                      onPhotos={() => setPhotoTask(t)}
                      onEdit={() => setEditTask(t)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Advance to Testing & Commissioning — shown to MANAGE_INSTALLATION
          managers while the project is in the Installation phase. */}
      {canManageAll && (
        <AdvanceToTestingSection
          projectId={projectId}
          projectCode={project?.code ?? ""}
          projectName={project?.name ?? ""}
          tasks={tasks}
        />
      )}

      {/* History feed — managers only (per slice spec) */}
      {tasks.length > 0 && manager && (
        <HistorySection tasks={tasks} />
      )}

      {/* Modals */}
      {addOpen && (
        <AddTaskModal projectId={projectId} userId={me.id}
          onDone={(result) => {
            setAddOpen(false);
            if (result === "ok") { bumpData(); fireToast("Task added"); }
            else if (result) { fireToast(result); }
          }} />
      )}
      {editTask && (
        <EditTaskModal task={editTask} projectId={projectId} userId={me.id}
          onDone={(result) => {
            setEditTask(null);
            if (result === "ok") { bumpData(); fireToast("Task updated"); }
            else if (result) { fireToast(result); }
          }} />
      )}
      {assignTask && (
        <AssignModal task={assignTask} userId={me.id}
          onDone={(result) => {
            setAssignTask(null);
            if (result === "ok") { bumpData(); fireToast("Assignment updated"); }
            else if (result) { fireToast(result); }
          }} />
      )}
      {photoTask && (
        <PhotosModal task={photoTask} projectId={projectId} userId={me.id} canManage={canManageTask(photoTask)}
          onDone={(changed) => {
            setPhotoTask(null);
            if (changed) bumpData();
          }}
          onToast={(m) => fireToast(m)} />
      )}
      {statusChange && (
        <StatusChangeModal task={statusChange.task} to={statusChange.to} userId={me.id}
          onDone={(result) => {
            setStatusChange(null);
            if (result === "ok") { bumpData(); fireToast("Status updated"); }
            else if (result) { fireToast(result); }
          }} />
      )}
    </div>
  );
}

/* ─── Progress tile ──────────────────────────────────────── */
function ProgressTile({ label, value, accent, muted, danger }: { label: string; value: number; accent?: boolean; muted?: boolean; danger?: boolean }) {
  const bg = danger ? "var(--dan-50)" : accent ? "var(--pri-50)" : muted ? "var(--bg-deep)" : "var(--bg-muted)";
  const fg = danger ? "var(--dan-700)" : accent ? "var(--pri-700)" : "var(--ink)";
  return (
    <div style={{ padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: bg }}>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700, marginTop: 4, color: fg }}>{value}</div>
    </div>
  );
}

/* ─── Task card ──────────────────────────────────────────── */
// Transitions available from each status. Quick-forward actions
// (Start / Complete / Resume) and the dialog actions (Block / N/A /
// Reopen) are all routed through the StatusChangeModal so the mobile
// experience is consistent (bottom-sheet confirm, reason on Block).
function nextActions(status: InstallationTaskStatus): { to: InstallationTaskStatus; label: string; icon: string; tone?: "primary" | "danger" | "soft" }[] {
  switch (status) {
    case "pending":
      return [
        { to: "in_progress", label: "Start", icon: "play", tone: "primary" },
        { to: "blocked", label: "Block", icon: "ban", tone: "danger" },
        { to: "not_applicable", label: "N/A", icon: "x", tone: "soft" },
      ];
    case "in_progress":
      return [
        { to: "completed", label: "Complete", icon: "check", tone: "primary" },
        { to: "blocked", label: "Block", icon: "ban", tone: "danger" },
        { to: "not_applicable", label: "N/A", icon: "x", tone: "soft" },
      ];
    case "blocked":
      return [
        { to: "in_progress", label: "Resume", icon: "play", tone: "primary" },
        { to: "not_applicable", label: "N/A", icon: "x", tone: "soft" },
      ];
    case "completed":
      return [{ to: "pending", label: "Reopen", icon: "refresh", tone: "soft" }];
    case "not_applicable":
      return [{ to: "pending", label: "Reopen", icon: "refresh", tone: "soft" }];
  }
}

interface TaskCardProps {
  task: InstallationTask;
  canManage: boolean;
  canManageAll: boolean;
  photoCount: number;
  onStatus: (to: InstallationTaskStatus) => void;
  onAssign: () => void;
  onPhotos: () => void;
  onEdit: () => void;
}

function TaskCard({ task, canManage, canManageAll, photoCount, onStatus, onAssign, onPhotos, onEdit }: TaskCardProps) {
  const assignee = task.assignedTo ? db.user(task.assignedTo) : null;
  // Reopen is a manager-only undo; field workers don't reopen.
  const actions = nextActions(task.status).filter(a =>
    a.to === "pending" ? canManageAll : canManage,
  );

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 160px" }}>
          <div style={{ font: "var(--t-body-md)", fontWeight: 600, overflowWrap: "anywhere" }}>{task.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, font: "var(--t-micro)", color: "var(--ink-mute)" }}>
            <Icon name={CATEGORY_ICON[task.category]} size={12} />
            {INSTALLATION_TASK_CATEGORY_LABEL[task.category]}
          </div>
        </div>
        <span className={"badge " + STATUS_BADGE_CLS[task.status]} style={{ flexShrink: 0 }}>
          {INSTALLATION_TASK_STATUS_LABEL[task.status]}
        </span>
      </div>

      {task.description && (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", overflowWrap: "anywhere" }}>{task.description}</div>
      )}

      {/* Block reason / notes */}
      {task.notes && (
        <div style={{
          font: "var(--t-micro)", padding: "8px 10px", borderRadius: "var(--r-sm)",
          background: task.status === "blocked" ? "var(--dan-50)" : "var(--bg-muted)",
          color: task.status === "blocked" ? "var(--dan-700)" : "var(--ink-mute)",
          overflowWrap: "anywhere",
        }}>
          {task.status === "blocked" ? "Blocked: " : "Note: "}{task.notes}
        </div>
      )}

      {/* Meta row: assignee + photo count + completed time (plain text) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", font: "var(--t-micro)", color: "var(--ink-mute)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="user" size={12} />
          {assignee ? assignee.name : "Unassigned"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="camera" size={12} /> {photoCount} photo{photoCount === 1 ? "" : "s"}
        </span>
        {task.status === "completed" && task.completedAt && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="check" size={12} style={{ color: "var(--suc-700)" }} />
            {formatLongDateTime(new Date(task.completedAt))}
          </span>
        )}
      </div>

      {/* Actions — every control is a 44px tap target. Photos is always
          available (view for read-only roles; upload gated inside the
          modal). Status / Assign / Edit gate by role. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map(a => (
          <button key={a.to} onClick={() => onStatus(a.to)}
            className={"btn btn-sm " + (a.tone === "primary" ? "btn-primary" : a.tone === "danger" ? "btn-danger" : "btn-soft")}
            style={{ minHeight: 44, flex: "1 1 92px", justifyContent: "center" }}>
            <Icon name={a.icon} size={13} /> {a.label}
          </button>
        ))}
        <button onClick={onPhotos} className="btn btn-ghost btn-sm"
          style={{ minHeight: 44, flex: "1 1 92px", justifyContent: "center" }}>
          <Icon name="camera" size={13} /> Photos
        </button>
        {canManageAll && (
          <button onClick={onAssign} className="btn btn-ghost btn-sm"
            style={{ minHeight: 44, flex: "1 1 92px", justifyContent: "center" }}>
            <Icon name="user" size={13} /> Assign
          </button>
        )}
        {canManageAll && (
          <button onClick={onEdit} className="btn btn-ghost btn-sm"
            style={{ minHeight: 44, flex: "1 1 92px", justifyContent: "center" }}>
            <Icon name="pen" size={13} /> Edit
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Modal shell (padding + header the bare Modal lacks) ─── */
function ModalShell({ title, sub, onClose, children, footer }: {
  title: string; sub?: string; onClose: () => void;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{
        padding: "18px 20px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "flex-start", gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--t-h3)", fontWeight: 700, overflowWrap: "anywhere" }}>{title}</div>
          {sub && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4, overflowWrap: "anywhere" }}>{sub}</div>}
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close" style={{ flexShrink: 0 }}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <div style={{ padding: 20, overflow: "auto" }}>
        {children}
      </div>
      <div style={{
        padding: "12px 20px 18px",
        borderTop: "1px solid var(--border)",
        display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap",
      }}>
        {footer}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
        {label}{required && <span style={{ color: "var(--dan-600)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// Field-staff pool for assignment dropdowns.
function useAssignableUsers() {
  return useMemo(
    () => Object.values(db.USERS)
      .filter(u => u.role === "worker" || u.role === "lead_worker")
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

/* ─── Add task modal ─────────────────────────────────────── */
function AddTaskModal({ projectId, userId, onDone }: { projectId: string; userId: string; onDone: (result: "ok" | string | null) => void }) {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [category, setCategory] = useState<InstallationTaskCategory>("device_mounting");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const users = useAssignableUsers();

  const save = async () => {
    setBusy(true);
    const res = await createInstallationTask(
      {
        projectId, title, zone: zone || null, category,
        description: description || null, assignedTo: assignedTo || null,
      },
      userId,
    );
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell
        title="Add installation task"
        sub="A discrete on-site activity — grouped by zone."
        onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !title.trim()} style={{ minHeight: 44 }}>
            <Icon name="plus" size={14} /> Add
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Task title" required>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Mount camera at reception" autoFocus />
          </Field>
          <Field label="Zone / area">
            <input className="input" value={zone} onChange={e => setZone(e.target.value)}
              placeholder="e.g. Zone A - Reception" />
          </Field>
          <Field label="Category">
            <select className="input" value={category} onChange={e => setCategory(e.target.value as InstallationTaskCategory)}>
              {INSTALLATION_TASK_CATEGORIES.map(c => (
                <option key={c} value={c}>{INSTALLATION_TASK_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Assign to">
            <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Description">
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Optional details" style={{ resize: "vertical" }} />
          </Field>
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Edit task modal (manager) ──────────────────────────── */
function EditTaskModal({ task, projectId, userId, onDone }: { task: InstallationTask; projectId: string; userId: string; onDone: (result: "ok" | string | null) => void }) {
  const [title, setTitle] = useState(task.title);
  const [zone, setZone] = useState(task.zone ?? "");
  const [category, setCategory] = useState<InstallationTaskCategory>(task.category);
  const [description, setDescription] = useState(task.description ?? "");
  const [sourceMaterialId, setSourceMaterialId] = useState(task.sourceMaterialId ?? "");
  const [busy, setBusy] = useState(false);
  const materials = useMemo(() => db.materialsForProject(projectId), [projectId]);

  const save = async () => {
    setBusy(true);
    // Details (title/zone/category/description), then the optional
    // material link if it changed.
    const detailsRes = await updateInstallationTaskDetails(task.id, {
      title, zone: zone || null, category, description: description || null,
    }, userId);
    if (!detailsRes.ok) { setBusy(false); onDone(detailsRes.error); return; }
    if ((task.sourceMaterialId ?? "") !== sourceMaterialId) {
      const linkRes = await linkInstallationTaskToMaterial(task.id, sourceMaterialId || null, userId);
      if (!linkRes.ok) { setBusy(false); onDone(linkRes.error); return; }
    }
    setBusy(false);
    onDone("ok");
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell
        title="Edit task"
        sub={task.title}
        onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !title.trim()} style={{ minHeight: 44 }}>
            <Icon name="check" size={14} /> Save
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Task title" required>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </Field>
          <Field label="Zone / area">
            <input className="input" value={zone} onChange={e => setZone(e.target.value)} placeholder="e.g. Zone A - Reception" />
          </Field>
          <Field label="Category">
            <select className="input" value={category} onChange={e => setCategory(e.target.value as InstallationTaskCategory)}>
              {INSTALLATION_TASK_CATEGORIES.map(c => (
                <option key={c} value={c}>{INSTALLATION_TASK_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)}
              rows={3} style={{ resize: "vertical" }} />
          </Field>
          <Field label="Linked material (optional)">
            <select className="input" value={sourceMaterialId} onChange={e => setSourceMaterialId(e.target.value)}>
              <option value="">None</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.description}{m.modelNumber ? ` · ${m.modelNumber}` : ""}</option>
              ))}
            </select>
          </Field>
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Assign modal ───────────────────────────────────────── */
function AssignModal({ task, userId, onDone }: { task: InstallationTask; userId: string; onDone: (result: "ok" | string | null) => void }) {
  const [picked, setPicked] = useState(task.assignedTo ?? "");
  const [busy, setBusy] = useState(false);
  const users = useAssignableUsers();

  const save = async () => {
    if ((task.assignedTo ?? "") === picked) { onDone(null); return; }
    setBusy(true);
    const res = await assignInstallationTask(task.id, picked || null, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell
        title="Assign task"
        sub={task.title}
        onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}>
            <Icon name="check" size={14} /> Save
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button"
            className={"btn " + (picked === "" ? "btn-primary" : "btn-ghost")}
            onClick={() => setPicked("")}
            style={{ justifyContent: "flex-start", minHeight: 44 }}>
            Unassigned
          </button>
          {users.map(u => (
            <button key={u.id} type="button"
              className={"btn " + (picked === u.id ? "btn-primary" : "btn-ghost")}
              onClick={() => setPicked(u.id)}
              style={{ justifyContent: "flex-start", minHeight: 44, gap: 8 }}>
              <Icon name="user" size={13} /> {u.name}
              <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginLeft: "auto" }}>{u.role === "lead_worker" ? "Lead" : "Worker"}</span>
            </button>
          ))}
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Status change modal (bottom sheet; reason on Block) ── */
function StatusChangeModal({ task, to, userId, onDone }: { task: InstallationTask; to: InstallationTaskStatus; userId: string; onDone: (result: "ok" | string | null) => void }) {
  const [reason, setReason] = useState(to === "blocked" ? (task.notes ?? "") : "");
  const [busy, setBusy] = useState(false);
  const needsReason = to === "blocked";

  const verb: Record<InstallationTaskStatus, string> = {
    pending: "Reopen",
    in_progress: task.status === "blocked" ? "Resume" : "Start",
    blocked: "Block",
    completed: "Complete",
    not_applicable: "Mark not applicable",
  };

  const save = async () => {
    if (needsReason && !reason.trim()) { onDone("A reason is required to block a task."); return; }
    setBusy(true);
    // Clear stale block note when leaving the blocked state via Resume.
    const notesArg = needsReason ? reason : (task.status === "blocked" ? null : undefined);
    const res = await updateInstallationTaskStatus(task.id, to, userId, notesArg);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => !busy && onDone(null)}>
      <ModalShell
        title={`${verb[to]} task`}
        sub={task.title}
        onClose={() => !busy && onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className={"btn " + (to === "blocked" ? "btn-danger" : "btn-primary")} onClick={save}
            disabled={busy || (needsReason && !reason.trim())} style={{ minHeight: 44 }}>
            <Icon name={to === "blocked" ? "ban" : "check"} size={14} /> {verb[to]}
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
            {to === "completed" && "Marks this task complete — the completion time and your name are recorded automatically."}
            {to === "in_progress" && (task.status === "blocked" ? "Resumes work — the blocker is cleared." : "Marks this task as in progress.")}
            {to === "blocked" && "Flags this task as blocked. Add the reason so the team knows what's needed."}
            {to === "not_applicable" && "Marks this task as not applicable — it won't block phase advancement."}
            {to === "pending" && "Reopens this task back to pending."}
          </div>
          {needsReason && (
            <Field label="Block reason" required>
              <textarea className="input" value={reason} onChange={e => setReason(e.target.value)}
                rows={3} autoFocus placeholder="e.g. Cable not available yet" style={{ resize: "vertical" }} />
            </Field>
          )}
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Photos modal (view + upload + delete) ──────────────── */
function PhotosModal({ task, projectId, userId, canManage, onDone, onToast }: {
  task: InstallationTask; projectId: string; userId: string; canManage: boolean;
  onDone: (changed: boolean) => void; onToast: (m: string) => void;
}) {
  const [photos, setPhotos] = useState<InstallationTaskPhoto[]>(() => db.photosForTask(task.id));
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => setPhotos(db.photosForTask(task.id));

  const onPick = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    const res = await addInstallationTaskPhoto(task.id, projectId, file, null, userId);
    setBusy(false);
    if (res.ok) { setChanged(true); refresh(); onToast("Photo uploaded"); }
    else onToast(res.error);
  };

  const onDelete = async (photoId: string) => {
    setBusy(true);
    const res = await deleteInstallationTaskPhoto(photoId);
    setBusy(false);
    if (res.ok) { setChanged(true); refresh(); onToast("Photo removed"); }
    else onToast(res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(changed)}>
      <ModalShell
        title="Photos"
        sub={task.title}
        onClose={() => onDone(changed)}
        footer={
          <button className="btn btn-ghost" onClick={() => onDone(changed)} disabled={busy} style={{ minHeight: 44 }}>Done</button>
        }>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {canManage && (
            <label className="btn btn-soft" style={{ minHeight: 44, justifyContent: "center", cursor: busy ? "default" : "pointer" }}>
              <Icon name="camera" size={14} /> {busy ? "Uploading…" : "Add photo"}
              <input type="file" accept="image/png,image/jpeg" disabled={busy}
                onChange={e => { onPick(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
                style={{ display: "none" }} />
            </label>
          )}

          {photos.length === 0 ? (
            <EmptyState icon="camera" title="No photos yet"
              sub={canManage ? "Add proof-of-install photos for this task." : "No photos have been uploaded for this task."} />
          ) : (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
              {photos.map(p => (
                <PhotoThumb key={p.id} photo={p} canManage={canManage} onDelete={() => onDelete(p.id)} />
              ))}
            </div>
          )}
        </div>
      </ModalShell>
    </Modal>
  );
}

function PhotoThumb({ photo, canManage, onDelete }: { photo: InstallationTaskPhoto; canManage: boolean; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    getInstallPhotoUrl(photo.storagePath).then(res => {
      if (!alive) return;
      if (res.ok) setUrl(res.url); else setErr(true);
    });
    return () => { alive = false; };
  }, [photo.storagePath]);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--bg-muted)" }}>
      <div style={{ aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={photo.caption ?? "Installation photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </a>
        ) : (
          <Icon name={err ? "alertCircle" : "camera"} size={20} style={{ color: "var(--ink-quiet)" }} />
        )}
      </div>
      {canManage && (
        <button className="btn btn-ghost btn-sm" onClick={onDelete}
          style={{ width: "100%", minHeight: 36, justifyContent: "center", color: "var(--dan-700)", borderTop: "1px solid var(--border)", borderRadius: 0 }}>
          <Icon name="trash" size={12} /> Remove
        </button>
      )}
    </div>
  );
}

/* ─── Advance to Testing & Commissioning ─────────────────── */
// Renders the "Advance to Testing & Commissioning" CTA + readiness hint
// panel + confirmation modal. Self-contained — manages its own confirm
// state. Visibility is gated by the page (canManageAll = manager role,
// in the installation phase). The DB trigger fn_check_installation_gate
// (migration 0202) is the last-line enforcer; this UI mirrors that rule
// via isReadyForTesting so users don't see a button they'd be blocked on.
//
// Mobile (<560px): button + actions go full-width; the pending-tasks
// hint scrolls vertically inside the card.
function AdvanceToTestingSection({
  projectId, projectCode, projectName, tasks,
}: {
  projectId: string; projectCode: string; projectName: string; tasks: InstallationTask[];
}) {
  const { fireToast, bumpData } = useApp();
  const ready = isReadyForTesting(tasks);
  const pending = pendingTasksForGate(tasks);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await advanceProjectPhase(projectId, "tc");
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setConfirmOpen(false);
    bumpData();
    fireToast("Project advanced to Testing & Commissioning");
  };

  return (
    <>
      <section className="card card-pad" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Icon name="arrowRight" size={20} style={{ color: ready ? "var(--suc-700)" : "var(--ink-mute)", marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ font: "var(--t-h3)", fontWeight: 700 }}>Advance to Testing &amp; Commissioning</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
              {ready
                ? tasks.length === 0
                  ? "No installation tasks — phase advance allowed."
                  : `${tasks.length} task${tasks.length === 1 ? "" : "s"}, all completed or marked N/A. Ready to move on.`
                : `${pending.length} task${pending.length === 1 ? "" : "s"} still open. Complete them or mark N/A to proceed.`}
            </div>
          </div>
        </div>

        {/* Primary CTA — full width on every viewport, 44px tap target. */}
        <button
          className="btn btn-primary"
          onClick={() => setConfirmOpen(true)}
          disabled={!ready}
          aria-disabled={!ready}
          style={{ minHeight: 44, width: "100%", justifyContent: "center" }}>
          <Icon name="arrowRight" size={14} />
          Advance to Testing &amp; Commissioning
        </button>

        {!ready && pending.length > 0 && (
          <div
            role="status"
            style={{
              marginTop: 12,
              padding: "12px 14px",
              background: "var(--warn-50)",
              color: "var(--warn-700)",
              border: "1px solid var(--warn-100)",
              borderRadius: "var(--r-md)",
              font: "var(--t-small)",
              overflowWrap: "anywhere",
            }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {pending.length} task{pending.length === 1 ? "" : "s"} blocking advancement
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {pending.map(p => (
                    <li key={p.id}>
                      <span style={{ fontWeight: 600 }}>{p.title}</span>
                      <span style={{ color: "var(--ink-mute)" }}>
                        {" "}— {INSTALLATION_TASK_STATUS_LABEL[p.status]}
                        {p.zone ? ` · ${p.zone}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 8, font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                  Mark each task completed or not applicable to proceed.
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {confirmOpen && (
        <Modal open={true} onClose={() => !busy && setConfirmOpen(false)}>
          <ModalShell
            title="Advance to Testing & Commissioning"
            sub={projectCode && projectName ? `${projectCode} · ${projectName}` : projectCode || projectName}
            onClose={() => !busy && setConfirmOpen(false)}
            footer={<>
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)} disabled={busy}
                style={{ minHeight: 44 }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}
                style={{ minHeight: 44 }}>
                {busy
                  ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Advancing…</>
                  : <><Icon name="check" size={14} /> Confirm</>}
              </button>
            </>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{
                padding: "12px 14px", background: "var(--info-50)", color: "var(--info-700)",
                border: "1px solid var(--info-100)", borderRadius: "var(--r-md)",
                font: "var(--t-small)",
              }}>
                {tasks.length === 0
                  ? "No installation tasks — phase advance allowed."
                  : `${tasks.length} task${tasks.length === 1 ? "" : "s"}, all completed or marked N/A.`}
              </div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                Once advanced, the Installation checklist becomes read-only and the project enters
                Testing &amp; Commissioning. The project&apos;s lead technician will be notified automatically.
              </div>
              {err && (
                <div style={{
                  padding: "10px 12px", background: "var(--dan-50)", color: "var(--dan-700)",
                  border: "1px solid var(--dan-100)", borderRadius: "var(--r-md)",
                  font: "var(--t-small)", display: "flex", alignItems: "flex-start", gap: 8, overflowWrap: "anywhere",
                }}>
                  <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {err}
                </div>
              )}
            </div>
          </ModalShell>
        </Modal>
      )}
    </>
  );
}

/* ─── History feed (managers only) ───────────────────────── */
function HistorySection({ tasks }: { tasks: InstallationTask[] }) {
  const history = useMemo(() => {
    const taskIds = new Set(tasks.map(t => t.id));
    const all: InstallationTaskHistory[] = [];
    for (const id of Object.keys(db.INSTALLATION_TASK_HISTORY)) {
      const h = db.INSTALLATION_TASK_HISTORY[id];
      if (h && taskIds.has(h.taskId)) all.push(h);
    }
    return all.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  }, [tasks]);

  if (history.length === 0) return null;

  const byTask = new Map<string, InstallationTask>();
  for (const t of tasks) byTask.set(t.id, t);

  return (
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <CardHead title={`Activity · ${history.length}`} sub="Append-only audit trail — every change with actor and timestamp" />
      <div className="col gap-2">
        {history.map(h => (
          <HistoryEntry key={h.id} row={h} taskTitle={byTask.get(h.taskId)?.title ?? "—"} />
        ))}
      </div>
    </section>
  );
}

function HistoryEntry({ row, taskTitle }: { row: InstallationTaskHistory; taskTitle: string }) {
  const actor = row.changedBy ? db.user(row.changedBy) : null;
  const when = (() => {
    const d = new Date(row.changedAt);
    return Number.isNaN(d.getTime()) ? row.changedAt : formatLongDateTime(d);
  })();
  return (
    <div style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <Icon name="clock" size={13} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
        <span style={{ font: "var(--t-body-md)", fontWeight: 600, overflowWrap: "anywhere" }}>{actor ? actor.name : "Unknown user"}</span>
        <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginLeft: "auto", whiteSpace: "nowrap" }}>{when}</span>
      </div>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", overflowWrap: "anywhere", marginBottom: 4 }}>
        {taskTitle}
      </div>
      <div style={{ font: "var(--t-small)", overflowWrap: "anywhere" }}>{row.detail ?? row.action}</div>
    </div>
  );
}
