"use client";
// ============================================================
// DLP — Phase 6 (migration 0205).
//
// Two exports:
//   • DlpSummaryCard — status card on the project detail page (visible
//     only when handover is signed off and current_phase = 'dlp').
//   • DlpPage — full management UI at /projects/[id]/dlp.
//
// The warranty period after handover: a countdown from
// handoverCompletedAt for dlpDurationMonths, plus a warranty-ticket
// list. Closing the project (dlp → closed) is gated on the period
// elapsing AND every ticket being closed.
//
// Roles (mirrors lib/permissions.ts):
//   VIEW_DLP   — admin/md/manager/lead_worker/worker/accounts/sales
//   MANAGE_DLP — admin/md/manager/lead_worker (assign / resolve)
//   Report a ticket — any field role; Close the project — admin/md/manager.
//
// Responsive: cards everywhere, 44px tap targets, bottom-sheet modals.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { phaseIndex } from "@/lib/phases";
import {
  createDlpTicket,
  updateDlpTicketStatus,
  assignDlpTicket,
  addDlpTicketPhoto,
  deleteDlpTicketPhoto,
  getDlpPhotoUrl,
  updateDlpDuration,
  advanceProjectPhase,
} from "@/lib/create";
import { formatLongDateTime } from "@/lib/dates";
import type { DlpTicket, DlpTicketPhoto, DlpTicketStatus, Role, SnaggingSeverity } from "@/lib/types";
import {
  DLP_TICKET_STATUS_LABEL,
  computeDlpProgress,
  computeDlpWindow,
  isReadyForClosed,
  pendingForClosed,
} from "@/lib/projects/dlp";
import { SNAGGING_SEVERITIES, SNAGGING_SEVERITY_LABEL } from "@/lib/projects/tc";
import { CardHead, EmptyState, Modal, PageHeader } from "../../shared";

const STATUS_BADGE: Record<DlpTicketStatus, string> = {
  open: "badge-danger",
  in_progress: "badge-info",
  fixed: "badge-warning",
  verified: "badge-info",
  closed: "badge-success",
};
const SEVERITY_BADGE: Record<SnaggingSeverity, string> = {
  low: "badge-outline", medium: "badge-info", high: "badge-warning", critical: "badge-danger",
};
const ADVANCE_ROLES: Role[] = ["admin", "md", "manager"];
const REPORT_ROLES: Role[] = ["admin", "md", "manager", "lead_worker", "worker"];

/* ─── Summary card ───────────────────────────────────────── */
export function DlpSummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_DLP")) return null;

  const project = db.proj(projectId);
  // Only when handed over AND currently in DLP.
  if (project?.currentPhase !== "dlp" || !project?.handoverCompletedAt) return null;

  const tickets = db.dlpTicketsForProject(projectId);
  const progress = computeDlpProgress(tickets);
  const window = computeDlpWindow(project.handoverCompletedAt, project.dlpDurationMonths);

  const badge = window.expired
    ? { label: "Period ended", cls: progress.unresolved > 0 ? "badge-warning" : "badge-success" }
    : { label: `${window.daysRemaining}d left`, cls: "badge-info" };

  return (
    <section className="card card-pad card-hover" style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/dlp`)}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
          <Icon name="shield" size={18} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>DLP (Warranty)</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {window.expired ? "Warranty period ended" : `${window.daysRemaining} day${window.daysRemaining === 1 ? "" : "s"} remaining`}
              {` · ${progress.unresolved} open ticket${progress.unresolved === 1 ? "" : "s"}`}
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

/* ─── Full page ──────────────────────────────────────────── */
export function DlpPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_DLP")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="DLP" title="Defects Liability Period" />
        <EmptyState icon="shield" title="Not available for your role" sub="DLP is visible to project staff." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const tickets = db.dlpTicketsForProject(projectId);
  const progress = computeDlpProgress(tickets);
  const handoverAt = project?.handoverCompletedAt ?? null;
  const window = computeDlpWindow(handoverAt, project?.dlpDurationMonths ?? 12);

  const phaseIdx = phaseIndex(project?.currentPhase);
  const beforePhase = phaseIdx < phaseIndex("dlp");
  const isDlp = project?.currentPhase === "dlp";
  const handedOver = !!handoverAt;

  const canManage = can(role, "MANAGE_DLP") && isDlp;
  const canReport = isDlp && handedOver && REPORT_ROLES.includes(role);
  const canAdvance = isDlp && ADVANCE_ROLES.includes(role);
  const ready = isReadyForClosed(handoverAt, project?.dlpDurationMonths ?? 12, tickets);

  const [addOpen, setAddOpen] = useState(false);
  const [statusFor, setStatusFor] = useState<{ ticket: DlpTicket; to: DlpTicketStatus } | null>(null);
  const [assignFor, setAssignFor] = useState<DlpTicket | null>(null);
  const [photoFor, setPhotoFor] = useState<DlpTicket | null>(null);
  const [durationOpen, setDurationOpen] = useState(false);

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => router.push(`/projects/${projectId}`)}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> {project ? project.code + " · " + project.name : "Back to project"}
        </a>
      </div>

      <PageHeader eyebrow="Phase 6" title="Defects Liability Period"
        sub="Warranty window + defect tickets after handover"
        right={<span className={"badge " + (window.expired ? "badge-success" : "badge-info")} style={{ fontWeight: 600 }}>
          {!handedOver ? "Not handed over" : window.expired ? "Period ended" : `${window.daysRemaining}d left`}
        </span>} />

      {beforePhase && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="clock" size={16} /></div>
          <div className="text"><div className="h">Project hasn&apos;t reached DLP</div>
            <div className="d">The warranty period starts after handover.</div></div>
        </div>
      )}
      {isDlp && !handedOver && (
        <div className="alert-banner tone-warning" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="alertCircle" size={16} /></div>
          <div className="text"><div className="h">Handover not signed off yet</div>
            <div className="d">The DLP countdown begins once the customer handover sign-off is recorded on the Handover page.</div></div>
        </div>
      )}
      {!isDlp && !beforePhase && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="check" size={16} /></div>
          <div className="text"><div className="h">DLP complete</div>
            <div className="d">This project has moved to Closed — DLP records are read-only.</div></div>
        </div>
      )}

      {/* Countdown */}
      {handedOver && (
        <section className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row between" style={{ alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <CardHead title="Warranty countdown" sub={`${project?.dlpDurationMonths ?? 12}-month DLP`} />
            {canManage && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDurationOpen(true)} style={{ minHeight: 44 }}>
                <Icon name="pen" size={13} /> Duration
              </button>
            )}
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", marginBottom: 12 }}>
            <Tile label="Days remaining" value={window.expired ? "0" : String(window.daysRemaining)} accent={!window.expired} />
            <Tile label="Started" value={window.startDate ? window.startDate.toLocaleDateString() : "—"} />
            <Tile label="Ends" value={window.endDate ? window.endDate.toLocaleDateString() : "—"} />
            <Tile label="Open tickets" value={String(progress.unresolved)} danger={progress.unresolved > 0} />
          </div>
          {/* progress bar */}
          <div style={{ height: 8, borderRadius: 4, background: "var(--bg-muted)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${window.totalDays === 0 ? 0 : Math.min(100, Math.round((window.elapsedDays / window.totalDays) * 100))}%`,
              background: window.expired ? "var(--suc-500)" : "var(--info-500)",
            }} />
          </div>
        </section>
      )}

      {/* Tickets */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <CardHead title={`Warranty tickets · ${tickets.length}`} sub="Defects reported during the DLP" />
          {canReport && (
            <button className="btn btn-soft btn-sm" onClick={() => setAddOpen(true)} style={{ minHeight: 44 }}>
              <Icon name="plus" size={13} /> Report ticket
            </button>
          )}
        </div>

        {tickets.length === 0 ? (
          <EmptyState icon="shield" title="No tickets"
            sub={canReport ? "Report any defect raised by the client during the warranty period." : "No warranty defects have been reported."} />
        ) : (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {tickets.map(t => (
              <TicketCard key={t.id} ticket={t} canManage={canManage}
                photoCount={db.dlpPhotosForTicket(t.id).length}
                onStatus={(to) => setStatusFor({ ticket: t, to })}
                onAssign={() => setAssignFor(t)}
                onPhotos={() => setPhotoFor(t)} />
            ))}
          </div>
        )}
      </section>

      {/* Advance to Closed */}
      {canAdvance && (
        <AdvanceToClosedSection projectId={projectId} projectCode={project?.code ?? ""} projectName={project?.name ?? ""}
          handoverAt={handoverAt} durationMonths={project?.dlpDurationMonths ?? 12} tickets={tickets} ready={ready} />
      )}

      <HistorySection projectId={projectId} />

      {addOpen && (
        <AddTicketModal projectId={projectId} userId={me.id}
          onDone={(r) => { setAddOpen(false); if (r === "ok") { bumpData(); fireToast("Ticket reported"); } else if (r) fireToast(r); }} />
      )}
      {statusFor && (
        <StatusModal ticket={statusFor.ticket} to={statusFor.to} userId={me.id}
          onDone={(r) => { setStatusFor(null); if (r === "ok") { bumpData(); fireToast("Ticket updated"); } else if (r) fireToast(r); }} />
      )}
      {assignFor && (
        <AssignModal ticket={assignFor} userId={me.id}
          onDone={(r) => { setAssignFor(null); if (r === "ok") { bumpData(); fireToast("Assignment updated"); } else if (r) fireToast(r); }} />
      )}
      {photoFor && (
        <PhotosModal ticket={photoFor} projectId={projectId} userId={me.id} canManage={canManage}
          onDone={(changed) => { setPhotoFor(null); if (changed) bumpData(); }} onToast={fireToast} />
      )}
      {durationOpen && (
        <DurationModal projectId={projectId} current={project?.dlpDurationMonths ?? 12} userId={me.id}
          onDone={(r) => { setDurationOpen(false); if (r === "ok") { bumpData(); fireToast("Duration updated"); } else if (r) fireToast(r); }} />
      )}
    </div>
  );
}

/* ─── Shared bits ────────────────────────────────────────── */
function Tile({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  const bg = danger ? "var(--dan-50)" : accent ? "var(--pri-50)" : "var(--bg-muted)";
  const fg = danger ? "var(--dan-700)" : accent ? "var(--pri-700)" : "var(--ink)";
  return (
    <div style={{ padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: bg }}>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700, marginTop: 4, color: fg }}>{value}</div>
    </div>
  );
}

function ModalShell({ title, sub, onClose, children, footer }: {
  title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
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
      <div style={{ padding: "12px 20px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>{footer}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{label}{required && <span style={{ color: "var(--dan-600)", marginLeft: 4 }}>*</span>}</label>
      {children}
    </div>
  );
}

function useAssignableUsers() {
  return useMemo(() => Object.values(db.USERS).filter(u => u.role === "worker" || u.role === "lead_worker").sort((a, b) => a.name.localeCompare(b.name)), []);
}

function dlpNextActions(status: DlpTicketStatus): { to: DlpTicketStatus; label: string; icon: string; tone: "primary" | "soft" }[] {
  switch (status) {
    case "open":        return [{ to: "in_progress", label: "Start", icon: "play", tone: "primary" }];
    case "in_progress": return [{ to: "fixed", label: "Mark fixed", icon: "check", tone: "primary" }];
    case "fixed":       return [{ to: "verified", label: "Verify", icon: "check", tone: "primary" }, { to: "in_progress", label: "Reopen", icon: "refresh", tone: "soft" }];
    case "verified":    return [{ to: "closed", label: "Close", icon: "check", tone: "primary" }, { to: "in_progress", label: "Reopen", icon: "refresh", tone: "soft" }];
    case "closed":      return [{ to: "in_progress", label: "Reopen", icon: "refresh", tone: "soft" }];
  }
}

function TicketCard({ ticket, canManage, photoCount, onStatus, onAssign, onPhotos }: {
  ticket: DlpTicket; canManage: boolean; photoCount: number;
  onStatus: (to: DlpTicketStatus) => void; onAssign: () => void; onPhotos: () => void;
}) {
  const assignee = ticket.assignedTo ? db.user(ticket.assignedTo) : null;
  const actions = canManage ? dlpNextActions(ticket.status) : [];
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 160px" }}>
          <div style={{ font: "var(--t-body-md)", fontWeight: 600, overflowWrap: "anywhere" }}>{ticket.description}</div>
          <div style={{ marginTop: 4 }}>
            <span className={"badge " + SEVERITY_BADGE[ticket.severity]}>{SNAGGING_SEVERITY_LABEL[ticket.severity]}</span>
          </div>
        </div>
        <span className={"badge " + STATUS_BADGE[ticket.status]} style={{ flexShrink: 0 }}>{DLP_TICKET_STATUS_LABEL[ticket.status]}</span>
      </div>

      {ticket.resolutionNotes && (
        <div style={{ font: "var(--t-micro)", padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--bg-muted)", color: "var(--ink-mute)", overflowWrap: "anywhere" }}>
          {ticket.resolutionNotes}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", font: "var(--t-micro)", color: "var(--ink-mute)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="user" size={12} /> {assignee ? assignee.name : "Unassigned"}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="camera" size={12} /> {photoCount} photo{photoCount === 1 ? "" : "s"}</span>
        {ticket.status === "closed" && ticket.resolvedAt && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} style={{ color: "var(--suc-700)" }} /> {formatLongDateTime(new Date(ticket.resolvedAt))}</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map(a => (
          <button key={a.to} onClick={() => onStatus(a.to)} className={"btn btn-sm " + (a.tone === "primary" ? "btn-primary" : "btn-soft")}
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

function AddTicketModal({ projectId, userId, onDone }: { projectId: string; userId: string; onDone: (r: "ok" | string | null) => void }) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SnaggingSeverity>("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const users = useAssignableUsers();
  const save = async () => {
    setBusy(true);
    const res = await createDlpTicket({ projectId, description, severity, assignedTo: assignedTo || null }, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };
  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Report warranty ticket" sub="A defect raised during the DLP." onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !description.trim()} style={{ minHeight: 44 }}><Icon name="plus" size={14} /> Report</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Description" required>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)} rows={2} autoFocus placeholder="e.g. Camera 2 intermittent at night" style={{ resize: "vertical" }} />
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

function StatusModal({ ticket, to, userId, onDone }: { ticket: DlpTicket; to: DlpTicketStatus; userId: string; onDone: (r: "ok" | string | null) => void }) {
  const [note, setNote] = useState(ticket.resolutionNotes ?? "");
  const [busy, setBusy] = useState(false);
  const verb: Record<DlpTicketStatus, string> = { open: "Reopen", in_progress: ticket.status === "open" ? "Start" : "Reopen", fixed: "Mark fixed", verified: "Verify", closed: "Close" };
  const save = async () => {
    setBusy(true);
    const res = await updateDlpTicketStatus(ticket.id, to, userId, note.trim() ? note : undefined);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };
  return (
    <Modal open={true} onClose={() => !busy && onDone(null)}>
      <ModalShell title={`${verb[to]} ticket`} sub={ticket.description} onClose={() => !busy && onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}><Icon name="check" size={14} /> {verb[to]}</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
            {to === "closed" && "Closing the ticket — only closed tickets clear the path to project closure."}
            {to === "verified" && "Confirms the fix has been checked."}
            {to === "fixed" && "Marks the defect as fixed; still needs verification."}
            {to === "in_progress" && "Marks the ticket as being worked on."}
          </div>
          <Field label="Resolution note (optional)">
            <textarea className="input" value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ resize: "vertical" }} />
          </Field>
        </div>
      </ModalShell>
    </Modal>
  );
}

function AssignModal({ ticket, userId, onDone }: { ticket: DlpTicket; userId: string; onDone: (r: "ok" | string | null) => void }) {
  const [picked, setPicked] = useState(ticket.assignedTo ?? "");
  const [busy, setBusy] = useState(false);
  const users = useAssignableUsers();
  const save = async () => {
    if ((ticket.assignedTo ?? "") === picked) { onDone(null); return; }
    setBusy(true);
    const res = await assignDlpTicket(ticket.id, picked || null, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };
  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Assign ticket" sub={ticket.description} onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}><Icon name="check" size={14} /> Save</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className={"btn " + (picked === "" ? "btn-primary" : "btn-ghost")} onClick={() => setPicked("")} style={{ justifyContent: "flex-start", minHeight: 44 }}>Unassigned</button>
          {users.map(u => (
            <button key={u.id} type="button" className={"btn " + (picked === u.id ? "btn-primary" : "btn-ghost")} onClick={() => setPicked(u.id)} style={{ justifyContent: "flex-start", minHeight: 44, gap: 8 }}>
              <Icon name="user" size={13} /> {u.name}
            </button>
          ))}
        </div>
      </ModalShell>
    </Modal>
  );
}

function DurationModal({ projectId, current, userId, onDone }: { projectId: string; current: number; userId: string; onDone: (r: "ok" | string | null) => void }) {
  const [v, setV] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await updateDlpDuration(projectId, Number(v), userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };
  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="DLP duration" sub="Warranty period length in months." onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}><Icon name="check" size={14} /> Save</button>
        </>}>
        <Field label="Months" required>
          <input className="input numeric" type="number" min={1} step={1} inputMode="numeric" value={v} onChange={e => setV(e.target.value)} autoFocus style={{ font: "var(--t-h3)", padding: "12px 14px" }} />
        </Field>
      </ModalShell>
    </Modal>
  );
}

/* ─── Photos ─────────────────────────────────────────────── */
function PhotosModal({ ticket, projectId, userId, canManage, onDone, onToast }: {
  ticket: DlpTicket; projectId: string; userId: string; canManage: boolean; onDone: (changed: boolean) => void; onToast: (m: string) => void;
}) {
  const [photos, setPhotos] = useState<DlpTicketPhoto[]>(() => db.dlpPhotosForTicket(ticket.id));
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => setPhotos(db.dlpPhotosForTicket(ticket.id));
  const onPick = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    const res = await addDlpTicketPhoto(ticket.id, projectId, file, null, userId);
    setBusy(false);
    if (res.ok) { setChanged(true); refresh(); onToast("Photo uploaded"); } else onToast(res.error);
  };
  const onDelete = async (id: string) => {
    setBusy(true);
    const res = await deleteDlpTicketPhoto(id);
    setBusy(false);
    if (res.ok) { setChanged(true); refresh(); onToast("Photo removed"); } else onToast(res.error);
  };
  return (
    <Modal open={true} onClose={() => onDone(changed)}>
      <ModalShell title="Ticket photos" sub={ticket.description} onClose={() => onDone(changed)}
        footer={<button className="btn btn-ghost" onClick={() => onDone(changed)} disabled={busy} style={{ minHeight: 44 }}>Done</button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {canManage && (
            <label className="btn btn-soft" style={{ minHeight: 44, justifyContent: "center", cursor: busy ? "default" : "pointer" }}>
              <Icon name="camera" size={14} /> {busy ? "Uploading…" : "Add photo"}
              <input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e => { onPick(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }} style={{ display: "none" }} />
            </label>
          )}
          {photos.length === 0 ? (
            <EmptyState icon="camera" title="No photos yet" sub={canManage ? "Add a photo of the defect or fix." : "No photos uploaded."} />
          ) : (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
              {photos.map(p => <PhotoThumb key={p.id} photo={p} canManage={canManage} onDelete={() => onDelete(p.id)} />)}
            </div>
          )}
        </div>
      </ModalShell>
    </Modal>
  );
}

function PhotoThumb({ photo, canManage, onDelete }: { photo: DlpTicketPhoto; canManage: boolean; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    getDlpPhotoUrl(photo.storagePath).then(res => { if (!alive) return; if (res.ok) setUrl(res.url); else setErr(true); });
    return () => { alive = false; };
  }, [photo.storagePath]);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--bg-muted)" }}>
      <div style={{ aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={photo.caption ?? "DLP photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </a>
        ) : <Icon name={err ? "alertCircle" : "camera"} size={20} style={{ color: "var(--ink-quiet)" }} />}
      </div>
      {canManage && (
        <button className="btn btn-ghost btn-sm" onClick={onDelete} style={{ width: "100%", minHeight: 36, justifyContent: "center", color: "var(--dan-700)", borderTop: "1px solid var(--border)", borderRadius: 0 }}>
          <Icon name="trash" size={12} /> Remove
        </button>
      )}
    </div>
  );
}

/* ─── Advance to Closed ──────────────────────────────────── */
function AdvanceToClosedSection({ projectId, projectCode, projectName, handoverAt, durationMonths, tickets, ready }: {
  projectId: string; projectCode: string; projectName: string;
  handoverAt: string | null; durationMonths: number; tickets: DlpTicket[]; ready: boolean;
}) {
  const { fireToast, bumpData } = useApp();
  const pending = pendingForClosed(handoverAt, durationMonths, tickets);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await advanceProjectPhase(projectId, "closed");
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setConfirmOpen(false);
    bumpData();
    fireToast("Project closed");
  };

  return (
    <>
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Icon name="arrowRight" size={20} style={{ color: ready ? "var(--suc-700)" : "var(--ink-mute)", marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ font: "var(--t-h3)", fontWeight: 700 }}>Close project</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
              {ready ? "DLP period ended and all tickets closed. Ready to close the project." : "The project can be closed once the DLP period ends and all tickets are closed."}
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setConfirmOpen(true)} disabled={!ready} aria-disabled={!ready}
          style={{ minHeight: 44, width: "100%", justifyContent: "center" }}>
          <Icon name="arrowRight" size={14} /> Close project
        </button>

        {!ready && (
          <div role="status" style={{ marginTop: 12, padding: "12px 14px", background: "var(--warn-50)", color: "var(--warn-700)", border: "1px solid var(--warn-100)", borderRadius: "var(--r-md)", font: "var(--t-small)", overflowWrap: "anywhere" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Blocking closure</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {!pending.handoverDone && <li>Handover not signed off yet</li>}
                  {pending.periodActive && <li>DLP period still active — {pending.daysRemaining} day{pending.daysRemaining === 1 ? "" : "s"} remaining{pending.endDate ? ` (ends ${pending.endDate.toLocaleDateString()})` : ""}</li>}
                  {pending.openTickets.map(t => (
                    <li key={t.id}><span style={{ fontWeight: 600 }}>Open ticket:</span> {t.description} <span style={{ color: "var(--ink-mute)" }}>— {DLP_TICKET_STATUS_LABEL[t.status]}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {confirmOpen && (
        <Modal open={true} onClose={() => !busy && setConfirmOpen(false)}>
          <ModalShell title="Close project" sub={projectCode && projectName ? `${projectCode} · ${projectName}` : projectCode || projectName} onClose={() => !busy && setConfirmOpen(false)}
            footer={<>
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ minHeight: 44 }}>
                {busy ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Closing…</> : <><Icon name="check" size={14} /> Confirm</>}
              </button>
            </>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: "12px 14px", background: "var(--info-50)", color: "var(--info-700)", border: "1px solid var(--info-100)", borderRadius: "var(--r-md)", font: "var(--t-small)" }}>
                The DLP period has ended and all tickets are closed.
              </div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                Closing finalises the project: a close-out checklist is generated and all project records become read-only. Admin/MD can reopen if needed.
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

/* ─── History ────────────────────────────────────────────── */
function HistorySection({ projectId }: { projectId: string }) {
  const history = db.dlpHistoryForProject(projectId);
  if (history.length === 0) return null;
  return (
    <section className="card card-pad" style={{ marginTop: 4 }}>
      <CardHead title={`Activity · ${history.length}`} sub="Append-only audit trail" />
      <div className="col gap-2">
        {history.map(h => {
          const actor = h.changedBy ? db.user(h.changedBy) : null;
          const when = (() => { const d = new Date(h.changedAt); return Number.isNaN(d.getTime()) ? h.changedAt : formatLongDateTime(d); })();
          return (
            <div key={h.id} style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <Icon name="clock" size={13} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
                <span style={{ font: "var(--t-body-md)", fontWeight: 600, overflowWrap: "anywhere" }}>{actor ? actor.name : "Unknown user"}</span>
                <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginLeft: "auto", whiteSpace: "nowrap" }}>{when}</span>
              </div>
              <div style={{ font: "var(--t-small)", overflowWrap: "anywhere" }}>{h.detail ?? h.action}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
