"use client";
// ============================================================
// Material Submittal — Design phase activity 1 (migration 0040).
//
// Two exports:
//   • MaterialSubmittalSummaryCard — the status card shown on the
//     project detail page; links into the dedicated sub-route.
//   • MaterialSubmittalPage — the full management page at
//     /projects/[id]/material-submittal.
//
// Client communication happens OUTSIDE the app (email/WhatsApp). This
// page only records state: build a draft list → Submit to Client →
// record the client's response (Approved / Returned / Rejected) →
// start the next revision if needed. Full revision history is kept.
//
// Roles: VIEW_DESIGN_DOCS can view; MANAGE_DESIGN can edit. Once the
// project advances past Design the activity is permanently read-only.
// ============================================================

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { phaseIndex } from "@/lib/phases";
import {
  createMaterialSubmittal, addMaterialItem, deleteMaterialItem,
  submitSubmittalRevision, markSubmittalApproved, markSubmittalReturned,
  markSubmittalRejected, startNextSubmittalRevision, getDesignDocUrl,
} from "@/lib/create";
import type { MaterialSubmittal, MaterialSubmittalRevision } from "@/lib/types";
import { CardHead, EmptyState, PageHeader, Modal } from "../../shared";

// ── in-app confirm dialog ───────────────────────────────────
// Replaces the native window.confirm() so destructive / one-way
// actions get a styled popup consistent with the rest of the app.
type ConfirmConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  action: () => void;
};

function ConfirmDialog({ config, busy, onClose }: {
  config: ConfirmConfig | null;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={!!config} onClose={onClose}>
      {config && (
        <div className="col gap-3" style={{ padding: 22 }}>
          <div style={{ font: "var(--t-h3)" }}>{config.title}</div>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {config.message}
          </div>
          <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className={"btn " + (config.tone === "danger" ? "btn-danger" : "btn-primary")}
              disabled={busy}
              onClick={() => { config.action(); onClose(); }}>
              {config.confirmLabel}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── status badge ────────────────────────────────────────────
function submittalBadge(
  submittal: MaterialSubmittal | null,
  current: MaterialSubmittalRevision | null,
): { label: string; cls: string } {
  if (!submittal) return { label: "Not started", cls: "badge-outline" };
  if (submittal.approvedRevision != null) return { label: `Approved at Rev ${submittal.approvedRevision}`, cls: "badge-success" };
  if (!current) return { label: "Draft", cls: "badge-outline" };
  switch (current.status) {
    case "submitted": return { label: `Rev ${current.revisionNumber} · Submitted to client`, cls: "badge-warning" };
    case "returned":  return { label: `Rev ${current.revisionNumber} · Returned with comments`, cls: "badge-warning" };
    case "rejected":  return { label: `Rev ${current.revisionNumber} · Rejected`, cls: "badge-danger" };
    case "approved":  return { label: `Approved at Rev ${current.revisionNumber}`, cls: "badge-success" };
    default:          return { label: `Rev ${current.revisionNumber} · Draft`, cls: "badge-outline" };
  }
}

function currentRevisionOf(submittalId: string | undefined): MaterialSubmittalRevision | null {
  if (!submittalId) return null;
  const revs = db.revisionsForSubmittal(submittalId);
  return revs.length ? revs[revs.length - 1] : null;
}

/* ─── Summary card (project detail page) ─────────────────── */
export function MaterialSubmittalSummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_DESIGN_DOCS")) return null;

  const submittal = db.submittalForProject(projectId);
  const current = currentRevisionOf(submittal?.id);
  const badge = submittalBadge(submittal, current);

  return (
    <section className="card card-pad card-hover" style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/material-submittal`)}>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="row gap-3" style={{ alignItems: "center", minWidth: 0 }}>
          <Icon name="package" size={18} style={{ color: "var(--ink-mute)" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Material Submittal</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {submittal ? submittal.code : "Equipment list for client approval"}
            </div>
          </div>
        </div>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <span className={"badge " + badge.cls}>{badge.label}</span>
          <Icon name="chevronRight" size={16} style={{ color: "var(--ink-mute)" }} />
        </div>
      </div>
    </section>
  );
}

/* ─── Full management page (sub-route) ───────────────────── */
export function MaterialSubmittalPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_DESIGN_DOCS")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Design" title="Material Submittal" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Material submittals are managed by Operations Manager / Admin / MD." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const submittal = db.submittalForProject(projectId);
  const revisions = submittal ? db.revisionsForSubmittal(submittal.id) : [];
  const current = revisions.length ? revisions[revisions.length - 1] : null;

  const phaseLocked = !!project && phaseIndex(project.currentPhase) > phaseIndex("design");
  const canManage = can(role, "MANAGE_DESIGN") && !phaseLocked;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setErr(null); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Something went wrong"); return; }
    bumpData(); if (ok) fireToast(ok);
  };

  const badge = submittalBadge(submittal, current);

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => router.push(`/projects/${projectId}`)}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> {project ? project.code + " · " + project.name : "Back to project"}
        </a>
      </div>

      <PageHeader eyebrow="Design · Activity 1" title="Material Submittal"
        sub={current ? `Revision ${current.revisionNumber}` : "Equipment list for client approval"}
        right={<span className={"badge " + badge.cls} style={{ fontWeight: 600 }}>{badge.label}</span>} />

      {phaseLocked && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="lock" size={16} /></div>
          <div className="text"><div className="h">Design phase locked</div>
            <div className="d">This project has moved past Design — the submittal is read-only.</div></div>
        </div>
      )}
      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {!submittal ? (
        <section className="card card-pad">
          <EmptyState icon="package" title="No material submittal yet"
            sub={canManage ? "Create it to start listing materials for the client." : "Not started yet."}
            action={canManage ? (
              <button className="btn btn-primary" disabled={busy}
                onClick={() => run(() => createMaterialSubmittal(projectId, me.id), "Material submittal created")}>
                <Icon name="plus" size={14} /> Create material submittal
              </button>
            ) : undefined} />
        </section>
      ) : (
        <>
          {current && (
            <CurrentRevisionPanel
              revision={current} submittal={submittal} canManage={canManage} busy={busy}
              onAddItem={(input, file) => run(() => addMaterialItem(current.id, input, file, me.id), "Material added")}
              onDeleteItem={(itemId) => run(() => deleteMaterialItem(itemId), "Item removed")}
              onSubmit={() => run(() => submitSubmittalRevision(current.id), "Submitted to client")}
              onApprove={() => run(() => markSubmittalApproved(current.id), "Marked approved")}
              onReturn={(c) => run(() => markSubmittalReturned(current.id, c), "Recorded client comments")}
              onReject={(c) => run(() => markSubmittalRejected(current.id, c), "Marked rejected")}
              onNextRevision={() => run(() => startNextSubmittalRevision(submittal.id, me.id), "New revision started")}
              fireToast={fireToast} />
          )}

          {/* Revision history */}
          <section className="card card-pad" style={{ marginTop: 20 }}>
            <CardHead title={`Revision history · ${revisions.length}`} sub="Audit trail of every submittal and client response" />
            <div className="col gap-2">
              {[...revisions].reverse().map(r => <RevisionHistoryRow key={r.id} r={r} fireToast={fireToast} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ─── Current revision panel ─────────────────────────────── */
function CurrentRevisionPanel({
  revision, canManage, busy, onAddItem, onDeleteItem, onSubmit, onApprove,
  onReturn, onReject, onNextRevision, fireToast,
}: {
  revision: MaterialSubmittalRevision;
  submittal: MaterialSubmittal;
  canManage: boolean; busy: boolean;
  onAddItem: (input: { description: string; model_number?: string; quantity?: number }, file: File | null) => void;
  onDeleteItem: (itemId: string) => void;
  onSubmit: () => void; onApprove: () => void;
  onReturn: (comments: string) => void; onReject: (reason: string) => void;
  onNextRevision: () => void;
  fireToast: (m: string) => void;
}) {
  const items = db.itemsForRevision(revision.id);
  const isDraft = revision.status === "draft";
  const isSubmitted = revision.status === "submitted";
  const isClosed = revision.status === "returned" || revision.status === "rejected";

  const [adding, setAdding] = useState(false);
  const [respMode, setRespMode] = useState<null | "return" | "reject">(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  return (
    <section className="card card-pad">
      <CardHead title={`Revision ${revision.revisionNumber}`}
        sub={revision.status === "draft" ? "Draft — add materials, then submit to the client"
          : revision.status === "submitted" ? "Submitted — record the client's response"
          : revision.status === "approved" ? "Approved by the client"
          : revision.status === "returned" ? "Returned with comments" : "Rejected"}
        right={canManage && isDraft ? (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setAdding(a => !a)}>
            <Icon name="plus" size={13} /> Add Material
          </button>
        ) : undefined} />

      {/* Add-material form (draft only) */}
      {canManage && isDraft && adding && (
        <AddMaterialForm busy={busy} onCancel={() => setAdding(false)}
          onSave={(input, file) => { onAddItem(input, file); setAdding(false); }} />
      )}

      {/* Items table */}
      {items.length === 0 ? (
        <EmptyState icon="package" title="No materials yet"
          sub={canManage && isDraft ? "Click “Add Material” to list the first item." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>#</th><th>Description</th><th className="hide-mobile">Model</th>
                <th style={{ textAlign: "right" }}>Qty</th><th>Datasheet</th>
                {canManage && isDraft && <th style={{ width: 44 }}></th>}
              </tr></thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id}>
                    <td data-th="#" className="numeric" style={{ color: "var(--ink-mute)" }}>{idx + 1}</td>
                    <td data-th="Description" style={{ font: "var(--t-body-md)" }}>{it.description}</td>
                    <td data-th="Model" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{it.modelNumber ?? "—"}</td>
                    <td data-th="Qty" className="numeric" style={{ textAlign: "right" }}>{it.quantity}</td>
                    <td data-th="Datasheet">
                      {it.datasheetPath ? (
                        <button className="btn btn-ghost btn-sm" onClick={async () => {
                          const res = await getDesignDocUrl(it.datasheetPath!, 60);
                          if (!res.ok) { fireToast(`Couldn't open: ${res.error}`); return; }
                          window.open(res.url, "_blank", "noopener");
                        }}><Icon name="fileText" size={12} /> View</button>
                      ) : <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>—</span>}
                    </td>
                    {canManage && isDraft && (
                      <td data-th="" style={{ textAlign: "right" }}>
                        <button className="btn btn-ghost btn-sm" disabled={busy} aria-label="Remove"
                          onClick={() => setConfirm({
                            title: "Remove material",
                            message: `Remove “${it.description}” from this list?`,
                            confirmLabel: "Remove",
                            tone: "danger",
                            action: () => onDeleteItem(it.id),
                          })}>
                          <Icon name="trash" size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Client comments (when returned/rejected) */}
      {isClosed && revision.clientComments && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-muted)" }}>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>Client comments</div>
          <div style={{ font: "var(--t-small)", whiteSpace: "pre-wrap" }}>{revision.clientComments}</div>
        </div>
      )}

      {/* Actions */}
      {canManage && (
        <div className="row gap-2" style={{ marginTop: 16, flexWrap: "wrap" }}>
          {isDraft && (
            <button className="btn btn-primary" disabled={busy || items.length === 0}
              onClick={() => setConfirm({
                title: "Submit to client",
                message: "Submit this material list to the client for approval?\n\nYou won't be able to edit it until the client responds.",
                confirmLabel: "Submit to client",
                action: onSubmit,
              })}>
              <Icon name="arrowRight" size={14} /> Submit to Client
            </button>
          )}
          {isSubmitted && respMode === null && (
            <>
              <button className="btn btn-primary" disabled={busy}
                onClick={() => setConfirm({
                  title: "Mark as approved",
                  message: "Mark this submittal as approved by the client?\n\nThe revision will be locked permanently.",
                  confirmLabel: "Mark approved",
                  action: onApprove,
                })}>
                <Icon name="check" size={14} /> Mark as Approved
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => { setNote(""); setRespMode("return"); }}>
                <Icon name="refresh" size={14} /> Returned with Comments
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => { setNote(""); setRespMode("reject"); }}>
                <Icon name="x" size={14} /> Rejected
              </button>
            </>
          )}
          {isSubmitted && respMode !== null && (
            <div className="col gap-2" style={{ width: "100%" }}>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                {respMode === "return" ? "Client's requested changes" : "Reason for rejection"}
              </label>
              <textarea className="textarea" rows={3} value={note} onChange={e => setNote(e.target.value)}
                placeholder={respMode === "return" ? "e.g. Change cameras to Dahua, cable to CAT6…" : "e.g. Wrong brands across the board"} />
              <div className="row gap-2">
                <button className="btn btn-primary" disabled={busy}
                  onClick={() => { respMode === "return" ? onReturn(note) : onReject(note); setRespMode(null); }}>
                  Save response
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => setRespMode(null)}>Cancel</button>
              </div>
            </div>
          )}
          {isClosed && (
            <button className="btn btn-primary" disabled={busy} onClick={onNextRevision}>
              <Icon name="plus" size={14} /> Start Revision {revision.revisionNumber + 1}
            </button>
          )}
        </div>
      )}

      <ConfirmDialog config={confirm} busy={busy} onClose={() => setConfirm(null)} />
    </section>
  );
}

/* ─── Add-material form ──────────────────────────────────── */
function AddMaterialForm({ busy, onSave, onCancel }: {
  busy: boolean;
  onSave: (input: { description: string; model_number?: string; quantity?: number }, file: File | null) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [qty, setQty] = useState("1");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="card" style={{ padding: 14, margin: "12px 0", background: "var(--bg-muted)" }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Material description *</label>
          <input className="input input-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="Dahua 2MP IP Camera" />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Model number</label>
          <input className="input input-sm" value={model} onChange={e => setModel(e.target.value)} placeholder="DH-IPC-HFW2230S" />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Quantity</label>
          <input className="input input-sm" type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Datasheet (PDF/JPG/PNG)</label>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }}
            onChange={e => setFileName(e.target.files?.[0]?.name ?? null)} />
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            <Icon name="paperclip" size={12} /> {fileName ? fileName.slice(0, 22) : "Attach"}
          </button>
        </div>
      </div>
      <div className="row gap-2" style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !description.trim()}
          onClick={() => onSave(
            { description, model_number: model || undefined, quantity: Number(qty) || 1 },
            fileRef.current?.files?.[0] ?? null,
          )}>Save item</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Revision history row (expandable) ──────────────────── */
function RevisionHistoryRow({ r, fireToast }: { r: MaterialSubmittalRevision; fireToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const items = db.itemsForRevision(r.id);
  const badge = submittalBadge(null, r); // status-only label
  const label = r.status === "approved" ? { label: `Approved`, cls: "badge-success" }
    : r.status === "submitted" ? { label: "Submitted", cls: "badge-warning" }
    : r.status === "returned" ? { label: "Returned", cls: "badge-warning" }
    : r.status === "rejected" ? { label: "Rejected", cls: "badge-danger" }
    : { label: "Draft", cls: "badge-outline" };
  void badge;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", width: "100%",
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, rowGap: 2, padding: "10px 12px" }}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
        <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Revision {r.revisionNumber}</span>
        <span className={"badge " + label.cls}>{label.label}</span>
        <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textAlign: "right", marginLeft: "auto", paddingLeft: 8 }}>
          {r.submittedAt ? `Submitted ${r.submittedAt.slice(0, 10)}` : ""}
          {r.respondedAt ? ` · Responded ${r.respondedAt.slice(0, 10)}` : ""}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--divider)" }}>
          {r.clientComments && (
            <div style={{ margin: "10px 0", padding: 10, borderRadius: "var(--r-sm)", background: "var(--bg-muted)", font: "var(--t-small)", whiteSpace: "pre-wrap" }}>
              <strong>Client:</strong> {r.clientComments}
            </div>
          )}
          {items.length === 0 ? (
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 10 }}>No items.</div>
          ) : (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, font: "var(--t-small)" }}>
              {items.map(it => (
                <li key={it.id} style={{ marginBottom: 4 }}>
                  {it.quantity}× {it.description}{it.modelNumber ? ` (${it.modelNumber})` : ""}
                  {it.datasheetPath && (
                    <button className="btn-link" style={{ marginLeft: 8, font: "var(--t-micro)", color: "var(--pri-700)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      onClick={async () => { const res = await getDesignDocUrl(it.datasheetPath!, 60); if (res.ok) window.open(res.url, "_blank", "noopener"); else fireToast(res.error); }}>
                      datasheet
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
