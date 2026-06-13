"use client";
// ============================================================
// Closed — Phase 7 (migration 0206).
//
// Two exports:
//   • ClosedSummaryCard — status card on the project detail page
//     (visible only when current_phase = 'closed').
//   • ClosedPage — full UI at /projects/[id]/closed.
//
// The terminal phase: a close-out checklist (auto-seeded), a financial
// closure snapshot, and an audit feed. Every earlier phase page is
// already read-only once the project is closed (each page self-locks on
// phase index). Admin/MD can reopen (moves the phase back to 'dlp').
//
// Roles (mirrors lib/permissions.ts):
//   VIEW_CLOSED   — admin/md/manager/lead_worker/accounts/sales
//   MANAGE_CLOSED — admin/md/manager (checklist + figures)
//   REOPEN_PROJECT — admin/md only
//
// Responsive: cards everywhere, 44px tap targets, bottom-sheet modals.
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  setClosureChecklistItem,
  saveClosureSummary,
  reopenProject,
} from "@/lib/create";
import { formatLongDateTime } from "@/lib/dates";
import type { ClosureChecklistItem, ClosureSummary } from "@/lib/types";
import { computeClosureProgress } from "@/lib/projects/closed";
import { CardHead, EmptyState, Modal, PageHeader } from "../../shared";

function fmtAED(n: number): string {
  return "AED " + (Number.isFinite(n) ? n : 0).toLocaleString("en-AE", { maximumFractionDigits: 2 });
}

/* ─── Summary card ───────────────────────────────────────── */
export function ClosedSummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_CLOSED")) return null;

  const project = db.proj(projectId);
  if (project?.currentPhase !== "closed") return null;

  const checklist = db.closureChecklistForProject(projectId);
  const progress = computeClosureProgress(checklist);
  const summary = db.closureSummaryForProject(projectId);

  return (
    <section className="card card-pad card-hover" style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/closed`)}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
          <Icon name="checkCircle" size={18} style={{ color: "var(--suc-700)", flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Closed</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {summary ? `${fmtAED(summary.finalTotalCost)} · ` : ""}
              {`${progress.completed}/${progress.total} close-out items`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span className="badge badge-success" style={{ whiteSpace: "nowrap" }}>Closed</span>
          <Icon name="chevronRight" size={16} style={{ color: "var(--ink-mute)" }} />
        </div>
      </div>
    </section>
  );
}

/* ─── Full page ──────────────────────────────────────────── */
export function ClosedPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_CLOSED")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Closed" title="Project Closure" />
        <EmptyState icon="shield" title="Not available for your role" sub="Closure is visible to project management, accounts and sales." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const isClosed = project?.currentPhase === "closed";
  const checklist = db.closureChecklistForProject(projectId);
  const progress = computeClosureProgress(checklist);
  const summary = db.closureSummaryForProject(projectId);

  const canManage = can(role, "MANAGE_CLOSED") && isClosed;
  const canReopen = can(role, "REOPEN_PROJECT") && isClosed;

  const [editOpen, setEditOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (item: ClosureChecklistItem) => {
    setBusyId(item.id);
    const res = await setClosureChecklistItem(item.id, !item.isCompleted, me.id);
    setBusyId(null);
    if (res.ok) { bumpData(); fireToast(item.isCompleted ? "Item reopened" : "Item completed"); }
    else fireToast(res.error);
  };

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => router.push(`/projects/${projectId}`)}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> {project ? project.code + " · " + project.name : "Back to project"}
        </a>
      </div>

      <PageHeader eyebrow="Phase 7" title="Project Closure"
        sub="Final close-out checklist and summary"
        right={<span className={"badge " + (isClosed ? "badge-success" : "badge-outline")} style={{ fontWeight: 600 }}>
          {isClosed ? "Closed" : "Not closed"}
        </span>} />

      {!isClosed && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="clock" size={16} /></div>
          <div className="text"><div className="h">Project is not closed</div>
            <div className="d">Closure details appear once the project is advanced to Closed from the DLP page.</div></div>
        </div>
      )}

      {/* Financial summary */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <CardHead title="Closure summary" sub={summary?.closedAt
            ? `Closed ${(() => { const d = new Date(summary.closedAt); return Number.isNaN(d.getTime()) ? summary.closedAt : formatLongDateTime(d); })()}`
            : "Final project figures"} />
          {canManage && summary && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)} style={{ minHeight: 44 }}>
              <Icon name="pen" size={13} /> Edit figures
            </button>
          )}
        </div>
        {summary ? (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <Money label="Final total cost" value={summary.finalTotalCost} accent />
            <Money label="Total invoiced" value={summary.totalInvoiced} />
            <Money label="Total received" value={summary.totalReceived} />
            <Money label="Total paid out" value={summary.totalPaidOut} />
          </div>
        ) : (
          <EmptyState icon="banknote" title="No summary yet" sub="The closure summary is created when the project is closed." />
        )}
        {summary?.notes && (
          <div style={{ marginTop: 10, font: "var(--t-small)", color: "var(--ink-mute)", overflowWrap: "anywhere" }}>{summary.notes}</div>
        )}
      </section>

      {/* Checklist */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title={`Close-out checklist · ${progress.completed}/${progress.total}`} sub={`${progress.percentComplete}% complete`} />
        {checklist.length === 0 ? (
          <EmptyState icon="list" title="No checklist yet" sub="The close-out checklist is auto-seeded when the project is closed." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {checklist.map(item => (
              <div key={item.id} className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Icon name={item.isCompleted ? "checkCircle" : "clock"} size={18}
                  style={{ color: item.isCompleted ? "var(--suc-700)" : "var(--ink-quiet)", flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: "1 1 160px", font: "var(--t-small)", fontWeight: 600, overflowWrap: "anywhere",
                  textDecoration: item.isCompleted ? "line-through" : "none", color: item.isCompleted ? "var(--ink-mute)" : "var(--ink)" }}>
                  {item.item}
                </div>
                {canManage ? (
                  <button className={"btn btn-sm " + (item.isCompleted ? "btn-ghost" : "btn-primary")} onClick={() => toggle(item)} disabled={busyId === item.id}
                    style={{ minHeight: 44, flex: "0 0 auto", justifyContent: "center" }}>
                    <Icon name={item.isCompleted ? "refresh" : "check"} size={13} /> {item.isCompleted ? "Reopen" : "Mark done"}
                  </button>
                ) : (
                  <span className={"badge " + (item.isCompleted ? "badge-success" : "badge-outline")}>{item.isCompleted ? "Done" : "Pending"}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reopen */}
      {canReopen && (
        <section className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Icon name="refresh" size={20} style={{ color: "var(--ink-mute)", marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ font: "var(--t-h3)", fontWeight: 700 }}>Reopen project</div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
                Returns the project to the DLP phase so further work can be recorded. Admin / MD only.
              </div>
            </div>
          </div>
          <button className="btn btn-soft" onClick={() => setReopenOpen(true)} style={{ minHeight: 44, width: "100%", justifyContent: "center" }}>
            <Icon name="refresh" size={14} /> Reopen project
          </button>
        </section>
      )}

      <HistorySection projectId={projectId} />

      {editOpen && summary && (
        <EditSummaryModal projectId={projectId} summary={summary} userId={me.id}
          onDone={(r) => { setEditOpen(false); if (r === "ok") { bumpData(); fireToast("Figures updated"); } else if (r) fireToast(r); }} />
      )}
      {reopenOpen && (
        <ReopenModal projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : projectId} userId={me.id}
          onDone={(ok) => { setReopenOpen(false); if (ok) { bumpData(); fireToast("Project reopened"); router.push(`/projects/${projectId}`); } }}
          onToast={fireToast} />
      )}
    </div>
  );
}

/* ─── Bits ───────────────────────────────────────────────── */
function Money({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: accent ? "var(--pri-50)" : "var(--bg-muted)" }}>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700, marginTop: 4, color: accent ? "var(--pri-700)" : "var(--ink)" }}>{fmtAED(value)}</div>
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
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close" style={{ flexShrink: 0 }}><Icon name="x" size={14} /></button>
      </div>
      <div style={{ padding: 20, overflow: "auto" }}>{children}</div>
      <div style={{ padding: "12px 20px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>{footer}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{label}</label>
      {children}
    </div>
  );
}

function EditSummaryModal({ projectId, summary, userId, onDone }: {
  projectId: string; summary: ClosureSummary; userId: string; onDone: (r: "ok" | string | null) => void;
}) {
  const [cost, setCost] = useState(String(summary.finalTotalCost));
  const [invoiced, setInvoiced] = useState(String(summary.totalInvoiced));
  const [received, setReceived] = useState(String(summary.totalReceived));
  const [paidOut, setPaidOut] = useState(String(summary.totalPaidOut));
  const [notes, setNotes] = useState(summary.notes ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await saveClosureSummary(projectId, {
      finalTotalCost: Number(cost), totalInvoiced: Number(invoiced), totalReceived: Number(received), totalPaidOut: Number(paidOut), notes: notes || null,
    }, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  const numInput = (v: string, set: (s: string) => void) => (
    <input className="input numeric" type="number" min={0} step="any" inputMode="decimal" value={v} onChange={e => set(e.target.value)} />
  );

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Edit closure figures" sub="Final financial snapshot for this project." onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}><Icon name="check" size={14} /> Save</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Final total cost (AED)">{numInput(cost, setCost)}</Field>
          <Field label="Total invoiced (AED)">{numInput(invoiced, setInvoiced)}</Field>
          <Field label="Total received (AED)">{numInput(received, setReceived)}</Field>
          <Field label="Total paid out (AED)">{numInput(paidOut, setPaidOut)}</Field>
          <Field label="Notes"><textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ resize: "vertical" }} /></Field>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
            Figures are entered here as the closure snapshot. Auto-pulling invoiced / received / paid from the Accountant module is a future enhancement.
          </div>
        </div>
      </ModalShell>
    </Modal>
  );
}

function ReopenModal({ projectId, projectLabel, userId, onDone, onToast }: {
  projectId: string; projectLabel: string; userId: string; onDone: (ok: boolean) => void; onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const res = await reopenProject(projectId, userId);
    setBusy(false);
    if (res.ok) onDone(true); else { onToast(res.error); onDone(false); }
  };
  return (
    <Modal open={true} onClose={() => !busy && onDone(false)}>
      <ModalShell title="Reopen project" sub={projectLabel} onClose={() => !busy && onDone(false)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(false)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ minHeight: 44 }}>
            {busy ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Reopening…</> : <><Icon name="refresh" size={14} /> Reopen</>}
          </button>
        </>}>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          This returns the project to the <strong>DLP</strong> phase. The closure checklist and summary are kept and reused if the project is closed again.
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── History ────────────────────────────────────────────── */
function HistorySection({ projectId }: { projectId: string }) {
  const history = db.closureHistoryForProject(projectId);
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
