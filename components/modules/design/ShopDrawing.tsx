"use client";
// ============================================================
// Shop Drawing — Design phase activity 2 (migration 0042).
//
// Two exports:
//   • ShopDrawingSummaryCard — the status card shown on the project
//     detail page; links into the dedicated sub-route.
//   • ShopDrawingPage — the full management page at
//     /projects/[id]/shop-drawing.
//
// Identical lifecycle to Material Submittal; the payload is uploaded
// DRAWING FILES (PDF for sharing + DWG AutoCAD source) plus a per-
// revision description, instead of a list of materials. Client
// communication happens OUTSIDE the app — this page only records state.
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
  createShopDrawing, addShopDrawingFiles, deleteShopDrawingFile,
  submitShopDrawingRevision, markShopDrawingApproved, markShopDrawingReturned,
  markShopDrawingRejected, startNextShopDrawingRevision, getDesignDocUrl,
} from "@/lib/create";
import type { ShopDrawing, ShopDrawingRevision } from "@/lib/types";
import { CardHead, EmptyState, PageHeader } from "../../shared";
import { ConfirmDialog, type ConfirmConfig } from "./MaterialSubmittal";

// ── helpers ─────────────────────────────────────────────────
function formatBytes(n: number): string {
  if (!n || n < 1) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function drawingBadge(
  drawing: ShopDrawing | null,
  current: ShopDrawingRevision | null,
): { label: string; cls: string } {
  if (!drawing) return { label: "Not started", cls: "badge-outline" };
  if (drawing.approvedRevision != null) return { label: `Approved at Rev ${drawing.approvedRevision}`, cls: "badge-success" };
  if (!current) return { label: "Draft", cls: "badge-outline" };
  switch (current.status) {
    case "submitted": return { label: `Rev ${current.revisionNumber} · Submitted to client`, cls: "badge-warning" };
    case "returned":  return { label: `Rev ${current.revisionNumber} · Returned with comments`, cls: "badge-warning" };
    case "rejected":  return { label: `Rev ${current.revisionNumber} · Rejected`, cls: "badge-danger" };
    case "approved":  return { label: `Approved at Rev ${current.revisionNumber}`, cls: "badge-success" };
    default:          return { label: `Rev ${current.revisionNumber} · Draft`, cls: "badge-outline" };
  }
}

function currentRevisionOf(drawingId: string | undefined): ShopDrawingRevision | null {
  if (!drawingId) return null;
  const revs = db.revisionsForDrawing(drawingId);
  return revs.length ? revs[revs.length - 1] : null;
}

async function openFile(filePath: string, fireToast: (m: string) => void) {
  const res = await getDesignDocUrl(filePath, 60);
  if (!res.ok) { fireToast(`Couldn't open: ${res.error}`); return; }
  window.open(res.url, "_blank", "noopener");
}

/* ─── Summary card (project detail page) ─────────────────── */
export function ShopDrawingSummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_DESIGN_DOCS")) return null;

  const drawing = db.drawingForProject(projectId);
  const current = currentRevisionOf(drawing?.id);
  const badge = drawingBadge(drawing, current);

  return (
    <section className="card card-pad card-hover" style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/shop-drawing`)}>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="row gap-3" style={{ alignItems: "center", minWidth: 0 }}>
          <Icon name="fileText" size={18} style={{ color: "var(--ink-mute)" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Shop Drawing</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {drawing ? drawing.code : "Technical drawings for client approval"}
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
export function ShopDrawingPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_DESIGN_DOCS")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Design" title="Shop Drawing" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Shop drawings are managed by Operations Manager / Admin / MD." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const drawing = db.drawingForProject(projectId);
  const revisions = drawing ? db.revisionsForDrawing(drawing.id) : [];
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

  const badge = drawingBadge(drawing, current);

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => router.push(`/projects/${projectId}`)}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> {project ? project.code + " · " + project.name : "Back to project"}
        </a>
      </div>

      <PageHeader eyebrow="Design · Activity 2" title="Shop Drawing"
        sub={current ? `Revision ${current.revisionNumber}` : "Technical drawings for client approval"}
        right={<span className={"badge " + badge.cls} style={{ fontWeight: 600 }}>{badge.label}</span>} />

      {phaseLocked && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="lock" size={16} /></div>
          <div className="text"><div className="h">Design phase locked</div>
            <div className="d">This project has moved past Design — the shop drawing is read-only.</div></div>
        </div>
      )}
      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {!drawing ? (
        <section className="card card-pad">
          <EmptyState icon="fileText" title="No shop drawing yet"
            sub={canManage ? "Create it to start uploading drawing files for the client." : "Not started yet."}
            action={canManage ? (
              <button className="btn btn-primary" disabled={busy}
                onClick={() => run(() => createShopDrawing(projectId, me.id), "Shop drawing created")}>
                <Icon name="plus" size={14} /> Create shop drawing
              </button>
            ) : undefined} />
        </section>
      ) : (
        <>
          {current && (
            <CurrentRevisionPanel
              revision={current} canManage={canManage} busy={busy}
              onAddFiles={(files, description) => run(() => addShopDrawingFiles(current.id, files, description, me.id), "Files uploaded")}
              onDeleteFile={(fileId) => run(() => deleteShopDrawingFile(fileId), "File removed")}
              onSubmit={() => run(() => submitShopDrawingRevision(current.id), "Submitted to client")}
              onApprove={() => run(() => markShopDrawingApproved(current.id), "Marked approved")}
              onReturn={(c) => run(() => markShopDrawingReturned(current.id, c), "Recorded client comments")}
              onReject={(c) => run(() => markShopDrawingRejected(current.id, c), "Marked rejected")}
              onNextRevision={() => run(() => startNextShopDrawingRevision(drawing.id, me.id), "New revision started")}
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
  revision, canManage, busy, onAddFiles, onDeleteFile, onSubmit, onApprove,
  onReturn, onReject, onNextRevision, fireToast,
}: {
  revision: ShopDrawingRevision;
  canManage: boolean; busy: boolean;
  onAddFiles: (files: File[], description: string | null) => void;
  onDeleteFile: (fileId: string) => void;
  onSubmit: () => void; onApprove: () => void;
  onReturn: (comments: string) => void; onReject: (reason: string) => void;
  onNextRevision: () => void;
  fireToast: (m: string) => void;
}) {
  const files = db.filesForRevision(revision.id);
  const isDraft = revision.status === "draft";
  const isSubmitted = revision.status === "submitted";
  const isClosed = revision.status === "returned" || revision.status === "rejected";

  const [uploading, setUploading] = useState(false);
  const [respMode, setRespMode] = useState<null | "return" | "reject">(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  return (
    <section className="card card-pad">
      <CardHead title={`Revision ${revision.revisionNumber}`}
        sub={revision.status === "draft" ? "Draft — upload drawings, then submit to the client"
          : revision.status === "submitted" ? "Submitted — record the client's response"
          : revision.status === "approved" ? "Approved by the client"
          : revision.status === "returned" ? "Returned with comments" : "Rejected"}
        right={canManage && isDraft ? (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setUploading(u => !u)}>
            <Icon name="paperclip" size={13} /> Upload Files
          </button>
        ) : undefined} />

      {/* Description */}
      {revision.description && (
        <div style={{ marginTop: 4, marginBottom: 12, padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-muted)" }}>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>Description</div>
          <div style={{ font: "var(--t-small)", whiteSpace: "pre-wrap" }}>{revision.description}</div>
        </div>
      )}

      {/* Upload form (draft only) */}
      {canManage && isDraft && uploading && (
        <UploadFilesForm busy={busy} initialDescription={revision.description ?? ""}
          onCancel={() => setUploading(false)}
          onSave={(files, description) => { onAddFiles(files, description); setUploading(false); }} />
      )}

      {/* Files table */}
      {files.length === 0 ? (
        <EmptyState icon="fileText" title="No files yet"
          sub={canManage && isDraft ? "Click “Upload Files” to attach the drawing PDFs and DWG sources." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>#</th><th>File</th><th className="hide-mobile">Type</th>
                <th style={{ textAlign: "right" }}>Size</th><th>Open</th>
                {canManage && isDraft && <th style={{ width: 44 }}></th>}
              </tr></thead>
              <tbody>
                {files.map((f, idx) => (
                  <tr key={f.id}>
                    <td data-th="#" className="numeric" style={{ color: "var(--ink-mute)" }}>{idx + 1}</td>
                    <td data-th="File" style={{ font: "var(--t-body-md)", wordBreak: "break-word" }}>{f.fileName}</td>
                    <td data-th="Type" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)", textTransform: "uppercase" }}>{f.kind}</td>
                    <td data-th="Size" className="numeric" style={{ textAlign: "right" }}>{formatBytes(f.fileSize)}</td>
                    <td data-th="Open">
                      <button className="btn btn-ghost btn-sm" onClick={() => openFile(f.filePath, fireToast)}>
                        <Icon name={f.kind === "pdf" ? "fileText" : "externalLink"} size={12} /> {f.kind === "pdf" ? "View" : "Download"}
                      </button>
                    </td>
                    {canManage && isDraft && (
                      <td data-th="" style={{ textAlign: "right" }}>
                        <button className="btn btn-ghost btn-sm" disabled={busy} aria-label="Remove"
                          onClick={() => setConfirm({
                            title: "Remove file",
                            message: `Remove “${f.fileName}” from this revision?`,
                            confirmLabel: "Remove",
                            tone: "danger",
                            action: () => onDeleteFile(f.id),
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
            <button className="btn btn-primary" disabled={busy || files.length === 0}
              onClick={() => setConfirm({
                title: "Submit to client",
                message: "Submit these drawings to the client for approval?\n\nYou won't be able to add or remove files until the client responds.",
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
                  message: "Mark this shop drawing as approved by the client?\n\nThe revision will be locked permanently.",
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
                placeholder={respMode === "return" ? "e.g. Move camera 23 to the corridor, reroute the main cable through the ceiling…" : "e.g. Layout doesn't match the approved BOQ"} />
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

/* ─── Upload-files form ──────────────────────────────────── */
function UploadFilesForm({ busy, initialDescription, onSave, onCancel }: {
  busy: boolean;
  initialDescription: string;
  onSave: (files: File[], description: string | null) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(initialDescription);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);

  const pickedFiles = (): File[] => Array.from(fileRef.current?.files ?? []);
  const canSave = !busy && (fileNames.length > 0 || description.trim() !== initialDescription.trim());

  return (
    <div className="card" style={{ padding: 14, margin: "12px 0", background: "var(--bg-muted)" }}>
      <div className="col" style={{ gap: 12 }}>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Drawing files (PDF / DWG) — you can pick several at once</label>
          <input ref={fileRef} type="file" accept=".pdf,.dwg" multiple style={{ display: "none" }}
            onChange={e => setFileNames(Array.from(e.target.files ?? []).map(f => f.name))} />
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => fileRef.current?.click()}>
            <Icon name="paperclip" size={12} /> {fileNames.length ? `${fileNames.length} file${fileNames.length > 1 ? "s" : ""} selected` : "Select files"}
          </button>
          {fileNames.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {fileNames.map((n, i) => <li key={i} style={{ wordBreak: "break-word" }}>{n}</li>)}
            </ul>
          )}
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Description</label>
          <textarea className="textarea" rows={2} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Initial floor plan with 40 camera positions across 3 floors" />
        </div>
      </div>
      <div className="row gap-2" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" disabled={!canSave}
          onClick={() => onSave(pickedFiles(), description)}>Save</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Revision history row (expandable) ──────────────────── */
function RevisionHistoryRow({ r, fireToast }: { r: ShopDrawingRevision; fireToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const files = db.filesForRevision(r.id);
  const label = r.status === "approved" ? { label: `Approved`, cls: "badge-success" }
    : r.status === "submitted" ? { label: "Submitted", cls: "badge-warning" }
    : r.status === "returned" ? { label: "Returned", cls: "badge-warning" }
    : r.status === "rejected" ? { label: "Rejected", cls: "badge-danger" }
    : { label: "Draft", cls: "badge-outline" };

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
          {r.description && (
            <div style={{ margin: "10px 0 0", font: "var(--t-small)", whiteSpace: "pre-wrap" }}>
              <strong>Description:</strong> {r.description}
            </div>
          )}
          {r.clientComments && (
            <div style={{ margin: "10px 0 0", padding: 10, borderRadius: "var(--r-sm)", background: "var(--bg-muted)", font: "var(--t-small)", whiteSpace: "pre-wrap" }}>
              <strong>Client:</strong> {r.clientComments}
            </div>
          )}
          {files.length === 0 ? (
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 10 }}>No files.</div>
          ) : (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, font: "var(--t-small)" }}>
              {files.map(f => (
                <li key={f.id} style={{ marginBottom: 4, wordBreak: "break-word" }}>
                  {f.fileName} <span style={{ color: "var(--ink-quiet)" }}>({f.kind.toUpperCase()} · {formatBytes(f.fileSize)})</span>
                  <button className="btn-link" style={{ marginLeft: 8, font: "var(--t-micro)", color: "var(--pri-700)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    onClick={() => openFile(f.filePath, fireToast)}>
                    open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
