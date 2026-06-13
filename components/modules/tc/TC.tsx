"use client";
// ============================================================
// Testing & Commissioning — Phase 4 (migration 0203).
//
// Two exports:
//   • TcSummaryCard — status card on the project detail page.
//   • TcPage — full management UI at /projects/[id]/tc.
//
// The customer walkthrough phase: per-zone sign-off, a snagging
// (defect) list with a status workflow + photos, and a final
// Acceptance Certificate once every installation zone is signed and no
// snag is still open/in-progress. Advancing past T&C moves the project
// into DLP (the post-handover warranty phase — the enum has no separate
// 'handover' value).
//
// Roles (mirrors lib/permissions.ts):
//   VIEW_TC   — admin/md/manager/lead_worker/accounts/sales
//   MANAGE_TC — admin/md/manager/lead_worker
//   Phase advance (tc → dlp) — admin/md/manager only (projects_write).
//
// Responsive: cards at every width, 44px tap targets, bottom-sheet
// modals (<640px via shared .modal CSS), no hover-only affordances.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { phaseIndex } from "@/lib/phases";
import {
  createSnaggingItem,
  updateSnaggingStatus,
  assignSnaggingItem,
  addSnaggingPhoto,
  deleteSnaggingPhoto,
  getSnaggingPhotoUrl,
  recordZoneAcceptance,
  generateAcceptanceCertificate,
  advanceProjectPhase,
} from "@/lib/create";
import { formatLongDateTime } from "@/lib/dates";
import type {
  AcceptanceCertificate,
  Role,
  SnaggingItem,
  SnaggingPhoto,
  SnaggingSeverity,
  SnaggingStatus,
  TcHistory,
  ZoneAcceptance,
} from "@/lib/types";
import {
  SNAGGING_SEVERITIES,
  SNAGGING_SEVERITY_LABEL,
  SNAGGING_STATUS_LABEL,
  computeTcProgress,
  distinctZones,
  isReadyForHandover,
  pendingItemsForGate,
} from "@/lib/projects/tc";
import { CardHead, EmptyState, Modal, PageHeader } from "../../shared";

// ── Badge tones ─────────────────────────────────────────────
const SNAG_STATUS_BADGE: Record<SnaggingStatus, string> = {
  open: "badge-danger",
  in_progress: "badge-info",
  fixed: "badge-warning",
  verified: "badge-success",
};
const SNAG_SEVERITY_BADGE: Record<SnaggingSeverity, string> = {
  low: "badge-outline",
  medium: "badge-info",
  high: "badge-warning",
  critical: "badge-danger",
};

const ADVANCE_ROLES: Role[] = ["admin", "md", "manager"];

// Compute the zone universe + required (installation) zones for a project.
// Plain reader (not a hook) so it can run after the role guard returns.
function gatherZones(projectId: string) {
  const tasks = db.tasksForProject(projectId);
  const snags = db.snaggingForProject(projectId);
  const acceptances = db.zoneAcceptancesForProject(projectId);
  const requiredZones = distinctZones(tasks.map(t => t.zone));
  const allZones = distinctZones([
    ...tasks.map(t => t.zone),
    ...snags.map(s => s.zone),
    ...acceptances.map(a => a.zone),
  ]);
  return { tasks, snags, acceptances, requiredZones, allZones };
}

/* ─── Summary card (project detail page) ─────────────────── */
export function TcSummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_TC")) return null;

  const project = db.proj(projectId);
  const { snags, acceptances, allZones } = gatherZones(projectId);
  const progress = computeTcProgress(allZones, acceptances, snags);

  const phaseIdx = phaseIndex(project?.currentPhase);
  if (phaseIdx < phaseIndex("tc")) return null;

  const allSigned = progress.totalZones > 0 && progress.signedZones === progress.totalZones;
  const badge =
    progress.blockingSnags > 0
      ? { label: `${progress.blockingSnags} open snag${progress.blockingSnags === 1 ? "" : "s"}`, cls: "badge-warning" }
      : allSigned
        ? { label: "All zones signed", cls: "badge-success" }
        : { label: "In progress", cls: "badge-info" };

  return (
    <section
      className="card card-pad card-hover"
      style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/tc`)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
          <Icon name="checkCircle" size={18} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Testing &amp; Commissioning</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {`${progress.signedZones} of ${progress.totalZones} zones signed`}
              {` · ${progress.blockingSnags} open snag${progress.blockingSnags === 1 ? "" : "s"}`}
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
export function TcPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_TC")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Testing & Commissioning" title="Testing & Commissioning" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="T&C is visible to project management, accounts and sales." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const { snags, acceptances, requiredZones, allZones } = gatherZones(projectId);
  const progress = computeTcProgress(allZones, acceptances, snags);
  const certificates = db.certificatesForProject(projectId);

  const phaseIdx = phaseIndex(project?.currentPhase);
  const beforePhase = phaseIdx < phaseIndex("tc");
  const phaseLocked = phaseIdx > phaseIndex("tc");
  const inPhase = !beforePhase && !phaseLocked;
  const canManage = can(role, "MANAGE_TC") && inPhase;
  const canAdvance = inPhase && ADVANCE_ROLES.includes(role);

  const ready = isReadyForHandover(requiredZones, acceptances, snags);

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
        eyebrow="Phase 4"
        title="Testing & Commissioning"
        sub="Customer walkthrough — per-zone sign-off, snagging, acceptance certificate"
        right={
          <span className={"badge " + (ready ? "badge-success" : "badge-info")} style={{ fontWeight: 600 }}>
            {`${progress.signedZones}/${progress.totalZones} zones · ${progress.blockingSnags} open`}
          </span>
        }
      />

      {beforePhase && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="clock" size={16} /></div>
          <div className="text"><div className="h">Project hasn&apos;t reached T&amp;C</div>
            <div className="d">Sign-offs and snagging become available once the project advances to Testing &amp; Commissioning.</div></div>
        </div>
      )}
      {phaseLocked && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="check" size={16} /></div>
          <div className="text"><div className="h">T&amp;C complete</div>
            <div className="d">This project has moved past T&amp;C — these records are read-only.</div></div>
        </div>
      )}
      {inPhase && !canManage && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="eye" size={16} /></div>
          <div className="text"><div className="h">View only</div>
            <div className="d">You can review walkthrough progress but only project management / lead tech can edit.</div></div>
        </div>
      )}

      {/* Progress tiles */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Progress" sub="Zones signed and snagging status" />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          <ProgressTile label="Zones signed" value={`${progress.signedZones}/${progress.totalZones}`} accent={progress.totalZones > 0 && progress.signedZones === progress.totalZones} />
          <ProgressTile label="Open" value={progress.openSnags} danger={progress.openSnags > 0} />
          <ProgressTile label="In progress" value={progress.inProgressSnags} />
          <ProgressTile label="Fixed" value={progress.fixedSnags} />
          <ProgressTile label="Verified" value={progress.verifiedSnags} accent={progress.verifiedSnags > 0} />
        </div>
      </section>

      <SnaggingSection projectId={projectId} snags={snags} canManage={canManage} me={me}
        onChange={() => bumpData()} onToast={fireToast} />

      <ZoneAcceptancesSection projectId={projectId} zones={allZones} acceptances={acceptances}
        requiredZones={requiredZones} canManage={canManage} userId={me.id}
        onChange={() => bumpData()} onToast={fireToast} />

      <CertificateSection projectId={projectId} certificates={certificates} project={project}
        progress={progress} ready={ready} canManage={canManage} userId={me.id}
        onChange={() => bumpData()} onToast={fireToast} />

      {canAdvance && (
        <AdvanceToHandoverSection
          projectId={projectId}
          projectCode={project?.code ?? ""}
          projectName={project?.name ?? ""}
          requiredZones={requiredZones}
          acceptances={acceptances}
          snags={snags}
        />
      )}

      <TcHistorySection projectId={projectId} />
    </div>
  );
}

/* ─── Shared bits ────────────────────────────────────────── */
function ProgressTile({ label, value, accent, muted, danger }: { label: string; value: number | string; accent?: boolean; muted?: boolean; danger?: boolean }) {
  const bg = danger ? "var(--dan-50)" : accent ? "var(--pri-50)" : muted ? "var(--bg-deep)" : "var(--bg-muted)";
  const fg = danger ? "var(--dan-700)" : accent ? "var(--pri-700)" : "var(--ink)";
  return (
    <div style={{ padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: bg }}>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700, marginTop: 4, color: fg }}>{value}</div>
    </div>
  );
}

function ModalShell({ title, sub, onClose, children, footer }: {
  title: string; sub?: string; onClose: () => void;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--t-h3)", fontWeight: 700, overflowWrap: "anywhere" }}>{title}</div>
          {sub && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4, overflowWrap: "anywhere" }}>{sub}</div>}
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close" style={{ flexShrink: 0 }}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <div style={{ padding: 20, overflow: "auto" }}>{children}</div>
      <div style={{ padding: "12px 20px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
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

function useAssignableUsers() {
  return useMemo(
    () => Object.values(db.USERS)
      .filter(u => u.role === "worker" || u.role === "lead_worker")
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

interface MeShape { id: string }

/* ─── Snagging section ───────────────────────────────────── */
function SnaggingSection({ projectId, snags, canManage, me, onChange, onToast }: {
  projectId: string; snags: SnaggingItem[]; canManage: boolean; me: MeShape;
  onChange: () => void; onToast: (m: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [statusFor, setStatusFor] = useState<{ item: SnaggingItem; to: SnaggingStatus } | null>(null);
  const [assignFor, setAssignFor] = useState<SnaggingItem | null>(null);
  const [photoFor, setPhotoFor] = useState<SnaggingItem | null>(null);

  // Group by zone (Unzoned last).
  const groups = useMemo(() => {
    const map = new Map<string | null, SnaggingItem[]>();
    for (const s of snags) {
      const key = s.zone && s.zone.trim() !== "" ? s.zone : null;
      const bucket = map.get(key);
      if (bucket) bucket.push(s); else map.set(key, [s]);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [snags]);

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="row between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <CardHead title={`Snagging · ${snags.length}`} sub="Defects found during the walkthrough" />
        {canManage && (
          <button className="btn btn-soft btn-sm" onClick={() => setAddOpen(true)} style={{ minHeight: 44 }}>
            <Icon name="plus" size={13} /> Add snag
          </button>
        )}
      </div>

      {snags.length === 0 ? (
        <EmptyState icon="checkCircle" title="No snags raised"
          sub={canManage ? "Log any defect found during the customer walkthrough." : "No defects have been logged for this project."} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map(([zone, items]) => (
            <div key={zone ?? "__unzoned"}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Icon name="mapPin" size={14} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
                <span style={{ font: "var(--t-body-md)", fontWeight: 700 }}>{zone ?? "Unzoned"}</span>
                <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>· {items.length}</span>
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                {items.map(s => (
                  <SnagCard key={s.id} snag={s} canManage={canManage}
                    photoCount={db.snaggingPhotosForItem(s.id).length}
                    onStatus={(to) => setStatusFor({ item: s, to })}
                    onAssign={() => setAssignFor(s)}
                    onPhotos={() => setPhotoFor(s)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddSnagModal projectId={projectId} userId={me.id}
          onDone={(r) => { setAddOpen(false); if (r === "ok") { onChange(); onToast("Snag raised"); } else if (r) onToast(r); }} />
      )}
      {statusFor && (
        <SnagStatusModal item={statusFor.item} to={statusFor.to} userId={me.id}
          onDone={(r) => { setStatusFor(null); if (r === "ok") { onChange(); onToast("Snag updated"); } else if (r) onToast(r); }} />
      )}
      {assignFor && (
        <AssignSnagModal item={assignFor} userId={me.id}
          onDone={(r) => { setAssignFor(null); if (r === "ok") { onChange(); onToast("Assignment updated"); } else if (r) onToast(r); }} />
      )}
      {photoFor && (
        <SnagPhotosModal item={photoFor} projectId={projectId} userId={me.id} canManage={canManage}
          onDone={(changed) => { setPhotoFor(null); if (changed) onChange(); }} onToast={onToast} />
      )}
    </section>
  );
}

function snagNextActions(status: SnaggingStatus): { to: SnaggingStatus; label: string; icon: string; tone: "primary" | "soft" }[] {
  switch (status) {
    case "open":        return [{ to: "in_progress", label: "Start", icon: "play", tone: "primary" }, { to: "fixed", label: "Mark fixed", icon: "check", tone: "soft" }];
    case "in_progress": return [{ to: "fixed", label: "Mark fixed", icon: "check", tone: "primary" }];
    case "fixed":       return [{ to: "verified", label: "Verify", icon: "check", tone: "primary" }, { to: "in_progress", label: "Reopen", icon: "refresh", tone: "soft" }];
    case "verified":    return [{ to: "in_progress", label: "Reopen", icon: "refresh", tone: "soft" }];
  }
}

function SnagCard({ snag, canManage, photoCount, onStatus, onAssign, onPhotos }: {
  snag: SnaggingItem; canManage: boolean; photoCount: number;
  onStatus: (to: SnaggingStatus) => void; onAssign: () => void; onPhotos: () => void;
}) {
  const assignee = snag.assignedTo ? db.user(snag.assignedTo) : null;
  const actions = canManage ? snagNextActions(snag.status) : [];
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 160px" }}>
          <div style={{ font: "var(--t-body-md)", fontWeight: 600, overflowWrap: "anywhere" }}>{snag.description}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span className={"badge " + SNAG_SEVERITY_BADGE[snag.severity]}>{SNAGGING_SEVERITY_LABEL[snag.severity]}</span>
          </div>
        </div>
        <span className={"badge " + SNAG_STATUS_BADGE[snag.status]} style={{ flexShrink: 0 }}>
          {SNAGGING_STATUS_LABEL[snag.status]}
        </span>
      </div>

      {snag.notes && (
        <div style={{ font: "var(--t-micro)", padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--bg-muted)", color: "var(--ink-mute)", overflowWrap: "anywhere" }}>
          Note: {snag.notes}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", font: "var(--t-micro)", color: "var(--ink-mute)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="user" size={12} /> {assignee ? assignee.name : "Unassigned"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="camera" size={12} /> {photoCount} photo{photoCount === 1 ? "" : "s"}
        </span>
        {(snag.status === "fixed" || snag.status === "verified") && snag.completedAt && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="check" size={12} style={{ color: "var(--suc-700)" }} /> {formatLongDateTime(new Date(snag.completedAt))}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map(a => (
          <button key={a.to} onClick={() => onStatus(a.to)}
            className={"btn btn-sm " + (a.tone === "primary" ? "btn-primary" : "btn-soft")}
            style={{ minHeight: 44, flex: "1 1 92px", justifyContent: "center" }}>
            <Icon name={a.icon} size={13} /> {a.label}
          </button>
        ))}
        <button onClick={onPhotos} className="btn btn-ghost btn-sm" style={{ minHeight: 44, flex: "1 1 92px", justifyContent: "center" }}>
          <Icon name="camera" size={13} /> Photos
        </button>
        {canManage && (
          <button onClick={onAssign} className="btn btn-ghost btn-sm" style={{ minHeight: 44, flex: "1 1 92px", justifyContent: "center" }}>
            <Icon name="user" size={13} /> Assign
          </button>
        )}
      </div>
    </div>
  );
}

function AddSnagModal({ projectId, userId, onDone }: { projectId: string; userId: string; onDone: (r: "ok" | string | null) => void }) {
  const [description, setDescription] = useState("");
  const [zone, setZone] = useState("");
  const [severity, setSeverity] = useState<SnaggingSeverity>("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const users = useAssignableUsers();

  const save = async () => {
    setBusy(true);
    const res = await createSnaggingItem({ projectId, description, zone: zone || null, severity, assignedTo: assignedTo || null }, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Add snag" sub="A defect found during the walkthrough." onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !description.trim()} style={{ minHeight: 44 }}>
            <Icon name="plus" size={14} /> Add
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Description" required>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)} rows={2} autoFocus
              placeholder="e.g. Camera 3 not aligned to entrance" style={{ resize: "vertical" }} />
          </Field>
          <Field label="Zone / area">
            <input className="input" value={zone} onChange={e => setZone(e.target.value)} placeholder="e.g. Zone A - Reception" />
          </Field>
          <Field label="Severity">
            <select className="input" value={severity} onChange={e => setSeverity(e.target.value as SnaggingSeverity)}>
              {SNAGGING_SEVERITIES.map(s => <option key={s} value={s}>{SNAGGING_SEVERITY_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Assign to">
            <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>
      </ModalShell>
    </Modal>
  );
}

function SnagStatusModal({ item, to, userId, onDone }: { item: SnaggingItem; to: SnaggingStatus; userId: string; onDone: (r: "ok" | string | null) => void }) {
  const [note, setNote] = useState(item.notes ?? "");
  const [busy, setBusy] = useState(false);
  const verb: Record<SnaggingStatus, string> = {
    open: "Reopen", in_progress: item.status === "open" ? "Start" : "Reopen", fixed: "Mark fixed", verified: "Verify",
  };
  const save = async () => {
    setBusy(true);
    const res = await updateSnaggingStatus(item.id, to, userId, note.trim() ? note : undefined);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };
  return (
    <Modal open={true} onClose={() => !busy && onDone(null)}>
      <ModalShell title={`${verb[to]} snag`} sub={item.description} onClose={() => !busy && onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}>
            <Icon name="check" size={14} /> {verb[to]}
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
            {to === "in_progress" && "Marks this snag as being worked on."}
            {to === "fixed" && "Marks this snag as fixed — completion is stamped automatically. It still needs verification."}
            {to === "verified" && "Confirms the fix has been checked. Verified snags no longer block handover."}
          </div>
          <Field label={to === "fixed" ? "Fix note (optional)" : "Note (optional)"}>
            <textarea className="input" value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ resize: "vertical" }} />
          </Field>
        </div>
      </ModalShell>
    </Modal>
  );
}

function AssignSnagModal({ item, userId, onDone }: { item: SnaggingItem; userId: string; onDone: (r: "ok" | string | null) => void }) {
  const [picked, setPicked] = useState(item.assignedTo ?? "");
  const [busy, setBusy] = useState(false);
  const users = useAssignableUsers();
  const save = async () => {
    if ((item.assignedTo ?? "") === picked) { onDone(null); return; }
    setBusy(true);
    const res = await assignSnaggingItem(item.id, picked || null, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };
  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Assign snag" sub={item.description} onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}>
            <Icon name="check" size={14} /> Save
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className={"btn " + (picked === "" ? "btn-primary" : "btn-ghost")} onClick={() => setPicked("")}
            style={{ justifyContent: "flex-start", minHeight: 44 }}>Unassigned</button>
          {users.map(u => (
            <button key={u.id} type="button" className={"btn " + (picked === u.id ? "btn-primary" : "btn-ghost")} onClick={() => setPicked(u.id)}
              style={{ justifyContent: "flex-start", minHeight: 44, gap: 8 }}>
              <Icon name="user" size={13} /> {u.name}
            </button>
          ))}
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Snag photos ────────────────────────────────────────── */
function SnagPhotosModal({ item, projectId, userId, canManage, onDone, onToast }: {
  item: SnaggingItem; projectId: string; userId: string; canManage: boolean;
  onDone: (changed: boolean) => void; onToast: (m: string) => void;
}) {
  const [photos, setPhotos] = useState<SnaggingPhoto[]>(() => db.snaggingPhotosForItem(item.id));
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => setPhotos(db.snaggingPhotosForItem(item.id));

  const onPick = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    const res = await addSnaggingPhoto(item.id, projectId, file, null, userId);
    setBusy(false);
    if (res.ok) { setChanged(true); refresh(); onToast("Photo uploaded"); } else onToast(res.error);
  };
  const onDelete = async (photoId: string) => {
    setBusy(true);
    const res = await deleteSnaggingPhoto(photoId);
    setBusy(false);
    if (res.ok) { setChanged(true); refresh(); onToast("Photo removed"); } else onToast(res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(changed)}>
      <ModalShell title="Snag photos" sub={item.description} onClose={() => onDone(changed)}
        footer={<button className="btn btn-ghost" onClick={() => onDone(changed)} disabled={busy} style={{ minHeight: 44 }}>Done</button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {canManage && (
            <label className="btn btn-soft" style={{ minHeight: 44, justifyContent: "center", cursor: busy ? "default" : "pointer" }}>
              <Icon name="camera" size={14} /> {busy ? "Uploading…" : "Add photo"}
              <input type="file" accept="image/png,image/jpeg" disabled={busy}
                onChange={e => { onPick(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }} style={{ display: "none" }} />
            </label>
          )}
          {photos.length === 0 ? (
            <EmptyState icon="camera" title="No photos yet"
              sub={canManage ? "Add a photo of the defect or the completed fix." : "No photos uploaded for this snag."} />
          ) : (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
              {photos.map(p => <SnagPhotoThumb key={p.id} photo={p} canManage={canManage} onDelete={() => onDelete(p.id)} />)}
            </div>
          )}
        </div>
      </ModalShell>
    </Modal>
  );
}

function SnagPhotoThumb({ photo, canManage, onDelete }: { photo: SnaggingPhoto; canManage: boolean; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    getSnaggingPhotoUrl(photo.storagePath).then(res => { if (!alive) return; if (res.ok) setUrl(res.url); else setErr(true); });
    return () => { alive = false; };
  }, [photo.storagePath]);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--bg-muted)" }}>
      <div style={{ aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={photo.caption ?? "Snag photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

/* ─── Zone acceptances ───────────────────────────────────── */
function ZoneAcceptancesSection({ projectId, zones, acceptances, requiredZones, canManage, userId, onChange, onToast }: {
  projectId: string; zones: string[]; acceptances: ZoneAcceptance[]; requiredZones: string[];
  canManage: boolean; userId: string; onChange: () => void; onToast: (m: string) => void;
}) {
  const [signFor, setSignFor] = useState<{ zone: string } | null>(null);
  const requiredSet = useMemo(() => new Set(requiredZones.map(z => z.trim().toLowerCase())), [requiredZones]);
  const acceptByZone = useMemo(() => {
    const m = new Map<string, ZoneAcceptance>();
    for (const a of acceptances) m.set(a.zone.trim().toLowerCase(), a);
    return m;
  }, [acceptances]);

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="row between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <CardHead title={`Zone sign-off · ${zones.length}`} sub="Customer acceptance per area" />
        {canManage && (
          <button className="btn btn-soft btn-sm" onClick={() => setSignFor({ zone: "" })} style={{ minHeight: 44 }}>
            <Icon name="plus" size={13} /> Record sign-off
          </button>
        )}
      </div>

      {zones.length === 0 ? (
        <EmptyState icon="mapPin" title="No zones yet"
          sub="Zones come from the installation checklist. Add zoned installation tasks, or record a sign-off for a named area." />
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {zones.map(z => {
            const accept = acceptByZone.get(z.trim().toLowerCase()) ?? null;
            const required = requiredSet.has(z.trim().toLowerCase());
            return (
              <div key={z} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Icon name={accept ? "checkCircle" : "clock"} size={16} style={{ color: accept ? "var(--suc-700)" : "var(--ink-quiet)", flexShrink: 0 }} />
                    <span style={{ font: "var(--t-body-md)", fontWeight: 600, overflowWrap: "anywhere" }}>{z}</span>
                  </div>
                  <span className={"badge " + (accept ? "badge-success" : "badge-outline")} style={{ flexShrink: 0 }}>
                    {accept ? "Signed" : required ? "Required" : "Unsigned"}
                  </span>
                </div>
                {accept ? (
                  <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                    <div>By <span style={{ fontWeight: 600, color: "var(--ink)" }}>{accept.customerName}</span></div>
                    {accept.customerEmail && <div style={{ overflowWrap: "anywhere" }}>{accept.customerEmail}</div>}
                    <div>{(() => { const d = new Date(accept.signedAt); return Number.isNaN(d.getTime()) ? accept.signedAt : formatLongDateTime(d); })()}</div>
                    {accept.notes && <div style={{ marginTop: 4, overflowWrap: "anywhere" }}>{accept.notes}</div>}
                  </div>
                ) : (
                  <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Awaiting customer sign-off.</div>
                )}
                {canManage && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setSignFor({ zone: z })}
                    style={{ minHeight: 44, justifyContent: "center" }}>
                    <Icon name="pen" size={13} /> {accept ? "Re-record" : "Record sign-off"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {signFor && (
        <RecordAcceptanceModal projectId={projectId} userId={userId} initialZone={signFor.zone}
          existing={signFor.zone ? (acceptByZone.get(signFor.zone.trim().toLowerCase()) ?? null) : null}
          onDone={(r) => { setSignFor(null); if (r === "ok") { onChange(); onToast("Zone sign-off recorded"); } else if (r) onToast(r); }} />
      )}
    </section>
  );
}

function RecordAcceptanceModal({ projectId, userId, initialZone, existing, onDone }: {
  projectId: string; userId: string; initialZone: string; existing: ZoneAcceptance | null;
  onDone: (r: "ok" | string | null) => void;
}) {
  const [zone, setZone] = useState(initialZone);
  const [customerName, setCustomerName] = useState(existing?.customerName ?? "");
  const [customerEmail, setCustomerEmail] = useState(existing?.customerEmail ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await recordZoneAcceptance({ projectId, zone, customerName, customerEmail: customerEmail || null, notes: notes || null }, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Record zone sign-off" sub="Typed customer acceptance for this area." onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !zone.trim() || !customerName.trim() || !confirmed} style={{ minHeight: 44 }}>
            <Icon name="check" size={14} /> Record sign-off
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Zone / area" required>
            <input className="input" value={zone} onChange={e => setZone(e.target.value)} placeholder="e.g. Zone A - Reception" autoFocus={!initialZone} />
          </Field>
          <Field label="Customer name" required>
            <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name of the signing customer" autoFocus={!!initialZone} />
          </Field>
          <Field label="Customer email">
            <input className="input" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Notes">
            <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ resize: "vertical" }} placeholder="Any conditions or comments" />
          </Field>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, font: "var(--t-small)", cursor: "pointer" }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
            <span>I confirm the customer named above has accepted the completed work in this zone. (Typed sign-off — digital signature is a future enhancement.)</span>
          </label>
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Acceptance certificate ─────────────────────────────── */
function buildCertificateText(cert: AcceptanceCertificate, projectLabel: string, signedZones: string[]): string {
  const when = (() => { const d = new Date(cert.generatedAt); return Number.isNaN(d.getTime()) ? cert.generatedAt : d.toUTCString(); })();
  return [
    "ACCEPTANCE CERTIFICATE",
    "======================",
    "",
    `Certificate No : ${cert.certificateNumber ?? "—"}`,
    `Project        : ${projectLabel}`,
    `Issued to      : ${cert.issuedTo ?? "—"}`,
    `Generated      : ${when}`,
    "",
    "Scope summary",
    "-------------",
    cert.scopeSummary ?? "—",
    "",
    "Zones accepted",
    "--------------",
    signedZones.length ? signedZones.map(z => ` - ${z}`).join("\n") : " - (none recorded)",
    "",
    "This certifies that the works described above have been tested,",
    "commissioned, and accepted by the customer.",
  ].join("\n");
}

function CertificateSection({ projectId, certificates, project, progress, ready, canManage, userId, onChange, onToast }: {
  projectId: string;
  certificates: AcceptanceCertificate[];
  project: ReturnType<typeof db.proj>;
  progress: ReturnType<typeof computeTcProgress>;
  ready: boolean; canManage: boolean; userId: string;
  onChange: () => void; onToast: (m: string) => void;
}) {
  const [genOpen, setGenOpen] = useState(false);
  const [viewCert, setViewCert] = useState<AcceptanceCertificate | null>(null);
  const projectLabel = project ? `${project.code} · ${project.name}` : projectId;
  const signedZones = db.zoneAcceptancesForProject(projectId).map(a => a.zone);

  const download = (cert: AcceptanceCertificate) => {
    const text = buildCertificateText(cert, projectLabel, signedZones);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cert.certificateNumber ?? "acceptance-certificate"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="row between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <CardHead title={`Acceptance certificate · ${certificates.length}`} sub="Issued when all zones are signed and snags cleared" />
        {canManage && (
          <button className="btn btn-soft btn-sm" onClick={() => setGenOpen(true)} disabled={!ready} aria-disabled={!ready} style={{ minHeight: 44 }}>
            <Icon name="plus" size={13} /> Generate
          </button>
        )}
      </div>

      {!ready && canManage && (
        <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 12 }}>
          The certificate can be generated once every zone is signed and no snag is still open or in-progress.
        </div>
      )}

      {certificates.length === 0 ? (
        <EmptyState icon="checkCircle" title="No certificate yet"
          sub="Generate the acceptance certificate after the walkthrough is fully signed off." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {certificates.map(c => (
            <div key={c.id} className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 180px" }}>
                <div style={{ font: "var(--t-body-md)", fontWeight: 700 }} className="numeric">{c.certificateNumber ?? "—"}</div>
                <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", overflowWrap: "anywhere" }}>
                  {c.issuedTo ? `Issued to ${c.issuedTo} · ` : ""}
                  {(() => { const d = new Date(c.generatedAt); return Number.isNaN(d.getTime()) ? c.generatedAt : formatLongDateTime(d); })()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setViewCert(c)} style={{ minHeight: 44 }}>
                  <Icon name="eye" size={13} /> View
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => download(c)} style={{ minHeight: 44 }}>
                  <Icon name="arrowDown" size={13} /> Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {genOpen && (
        <GenerateCertModal projectId={projectId} userId={userId} progress={progress}
          defaultIssuedTo={project?.customer ? (db.cust(project.customer)?.name ?? "") : ""}
          onDone={(r) => { setGenOpen(false); if (r === "ok") { onChange(); onToast("Certificate generated"); } else if (r) onToast(r); }} />
      )}
      {viewCert && (
        <ViewCertModal cert={viewCert} projectLabel={projectLabel} signedZones={signedZones}
          onClose={() => setViewCert(null)} onDownload={() => download(viewCert)} />
      )}
    </section>
  );
}

function GenerateCertModal({ projectId, userId, progress, defaultIssuedTo, onDone }: {
  projectId: string; userId: string; progress: ReturnType<typeof computeTcProgress>; defaultIssuedTo: string;
  onDone: (r: "ok" | string | null) => void;
}) {
  const [issuedTo, setIssuedTo] = useState(defaultIssuedTo);
  const [scope, setScope] = useState(`${progress.signedZones} zone(s) accepted; ${progress.verifiedSnags + progress.fixedSnags} snag(s) closed.`);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await generateAcceptanceCertificate(projectId, { issuedTo: issuedTo || null, scopeSummary: scope || null }, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };
  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Generate acceptance certificate" sub="Auto-numbered AC-YYYY-NNNN." onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}>
            <Icon name="check" size={14} /> Generate
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Issued to"><input className="input" value={issuedTo} onChange={e => setIssuedTo(e.target.value)} placeholder="Customer / company name" /></Field>
          <Field label="Scope summary"><textarea className="input" value={scope} onChange={e => setScope(e.target.value)} rows={3} style={{ resize: "vertical" }} /></Field>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
            A simple text certificate is produced for download. A rich PDF template is a future enhancement.
          </div>
        </div>
      </ModalShell>
    </Modal>
  );
}

function ViewCertModal({ cert, projectLabel, signedZones, onClose, onDownload }: {
  cert: AcceptanceCertificate; projectLabel: string; signedZones: string[]; onClose: () => void; onDownload: () => void;
}) {
  return (
    <Modal open={true} onClose={onClose}>
      <ModalShell title={cert.certificateNumber ?? "Acceptance certificate"} sub={projectLabel} onClose={onClose}
        footer={<>
          <button className="btn btn-ghost" onClick={onClose} style={{ minHeight: 44 }}>Close</button>
          <button className="btn btn-primary" onClick={onDownload} style={{ minHeight: 44 }}><Icon name="arrowDown" size={14} /> Download</button>
        </>}>
        <pre style={{
          font: "var(--t-small)", fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          background: "var(--bg-muted)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 14, margin: 0,
        }}>
          {buildCertificateText(cert, projectLabel, signedZones)}
        </pre>
      </ModalShell>
    </Modal>
  );
}

/* ─── Advance to Handover (tc → dlp) ─────────────────────── */
function AdvanceToHandoverSection({ projectId, projectCode, projectName, requiredZones, acceptances, snags }: {
  projectId: string; projectCode: string; projectName: string;
  requiredZones: string[]; acceptances: ZoneAcceptance[]; snags: SnaggingItem[];
}) {
  const { fireToast, bumpData } = useApp();
  const ready = isReadyForHandover(requiredZones, acceptances, snags);
  const pending = pendingItemsForGate(requiredZones, acceptances, snags);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await advanceProjectPhase(projectId, "dlp");
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setConfirmOpen(false);
    bumpData();
    fireToast("Project advanced to Handover (DLP)");
  };

  const blockingCount = pending.unsignedZones.length + pending.blockingSnags.length;

  return (
    <>
      <section className="card card-pad" style={{ marginTop: 4, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Icon name="arrowRight" size={20} style={{ color: ready ? "var(--suc-700)" : "var(--ink-mute)", marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ font: "var(--t-h3)", fontWeight: 700 }}>Advance to Handover</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
              {ready
                ? "All zones signed and snagging cleared. Ready to hand over (project enters DLP)."
                : `${blockingCount} item${blockingCount === 1 ? "" : "s"} still blocking handover.`}
            </div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => setConfirmOpen(true)} disabled={!ready} aria-disabled={!ready}
          style={{ minHeight: 44, width: "100%", justifyContent: "center" }}>
          <Icon name="arrowRight" size={14} /> Advance to Handover
        </button>

        {!ready && blockingCount > 0 && (
          <div role="status" style={{
            marginTop: 12, padding: "12px 14px", background: "var(--warn-50)", color: "var(--warn-700)",
            border: "1px solid var(--warn-100)", borderRadius: "var(--r-md)", font: "var(--t-small)", overflowWrap: "anywhere",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{blockingCount} item{blockingCount === 1 ? "" : "s"} blocking handover</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {pending.unsignedZones.map(z => (
                    <li key={"z-" + z}><span style={{ fontWeight: 600 }}>Unsigned zone:</span> {z}</li>
                  ))}
                  {pending.blockingSnags.map(s => (
                    <li key={"s-" + s.id}>
                      <span style={{ fontWeight: 600 }}>Open snag:</span> {s.description}
                      <span style={{ color: "var(--ink-mute)" }}> — {SNAGGING_STATUS_LABEL[s.status]}{s.zone ? ` · ${s.zone}` : ""}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 8, font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                  Sign off every zone and close all snags to proceed.
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {confirmOpen && (
        <Modal open={true} onClose={() => !busy && setConfirmOpen(false)}>
          <ModalShell title="Advance to Handover" sub={projectCode && projectName ? `${projectCode} · ${projectName}` : projectCode || projectName}
            onClose={() => !busy && setConfirmOpen(false)}
            footer={<>
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ minHeight: 44 }}>
                {busy ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Advancing…</> : <><Icon name="check" size={14} /> Confirm</>}
              </button>
            </>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: "12px 14px", background: "var(--info-50)", color: "var(--info-700)", border: "1px solid var(--info-100)", borderRadius: "var(--r-md)", font: "var(--t-small)" }}>
                All zones signed and snagging cleared.
              </div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                Once advanced, T&amp;C becomes read-only and the project enters DLP (the post-handover warranty period).
                The project&apos;s lead technician will be notified automatically.
              </div>
              {err && (
                <div style={{ padding: "10px 12px", background: "var(--dan-50)", color: "var(--dan-700)", border: "1px solid var(--dan-100)", borderRadius: "var(--r-md)", font: "var(--t-small)", display: "flex", alignItems: "flex-start", gap: 8, overflowWrap: "anywhere" }}>
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

/* ─── Audit history feed ─────────────────────────────────── */
function TcHistorySection({ projectId }: { projectId: string }) {
  const history = db.tcHistoryForProject(projectId);
  if (history.length === 0) return null;
  return (
    <section className="card card-pad" style={{ marginTop: 4 }}>
      <CardHead title={`Activity · ${history.length}`} sub="Append-only audit trail across snagging, sign-offs and certificates" />
      <div className="col gap-2">
        {history.map(h => <TcHistoryEntry key={h.id} row={h} />)}
      </div>
    </section>
  );
}

function TcHistoryEntry({ row }: { row: TcHistory }) {
  const actor = row.changedBy ? db.user(row.changedBy) : null;
  const when = (() => { const d = new Date(row.changedAt); return Number.isNaN(d.getTime()) ? row.changedAt : formatLongDateTime(d); })();
  const kindLabel = row.entityKind === "snagging" ? "Snag" : row.entityKind === "zone" ? "Zone" : "Certificate";
  return (
    <div style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <Icon name="clock" size={13} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
        <span style={{ font: "var(--t-body-md)", fontWeight: 600, overflowWrap: "anywhere" }}>{actor ? actor.name : "Unknown user"}</span>
        <span className="badge badge-outline" style={{ flexShrink: 0 }}>{kindLabel}</span>
        <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginLeft: "auto", whiteSpace: "nowrap" }}>{when}</span>
      </div>
      <div style={{ font: "var(--t-small)", overflowWrap: "anywhere" }}>{row.detail ?? row.action}</div>
    </div>
  );
}
