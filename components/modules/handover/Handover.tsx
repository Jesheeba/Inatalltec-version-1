"use client";
// ============================================================
// Handover — Phase 5 (migration 0204).
//
// Two exports:
//   • HandoverSummaryCard — status card on the project detail page.
//   • HandoverPage — full management UI at /projects/[id]/handover.
//
// The formal delivery of deliverables during the DLP phase: documents
// by category, a mandatory checklist (auto-seeded on entry to DLP), and
// a one-time customer sign-off that stamps projects.handoverCompletedAt
// (the DLP warranty clock starts there). Option B: handover is a
// sub-state of 'dlp', not its own phase value.
//
// Roles (mirrors lib/permissions.ts):
//   VIEW_HANDOVER   — admin/md/manager/lead_worker/accounts/sales
//   MANAGE_HANDOVER — admin/md/manager/lead_worker
// Editing locks once the sign-off is recorded (handover is final).
//
// Responsive: cards at every width, 44px tap targets, bottom-sheet
// modals (<640px via shared .modal CSS), forms stack on mobile.
// ============================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { phaseIndex } from "@/lib/phases";
import {
  uploadHandoverDocument,
  deleteHandoverDocument,
  getHandoverDocUrl,
  setHandoverChecklistItem,
  recordHandoverSignoff,
} from "@/lib/create";
import { formatLongDateTime } from "@/lib/dates";
import type {
  HandoverChecklistItem,
  HandoverDocCategory,
  HandoverDocument,
  HandoverHistory,
} from "@/lib/types";
import {
  HANDOVER_CATEGORIES,
  HANDOVER_CATEGORY_LABEL,
  REQUIRED_HANDOVER_CATEGORIES,
  computeHandoverProgress,
  formatFileSize,
  isReadyForSignoff,
  pendingItemsForSignoff,
} from "@/lib/projects/handover";
import { CardHead, EmptyState, Modal, PageHeader } from "../../shared";

const CATEGORY_ICON: Record<HandoverDocCategory, string> = {
  drawings: "layers",
  manuals: "fileText",
  certificates: "shieldCheck",
  warranty: "shield",
  other: "package",
};

const REQUIRED_CATEGORY_SET = new Set<HandoverDocCategory>(REQUIRED_HANDOVER_CATEGORIES);

/* ─── Summary card (project detail page) ─────────────────── */
export function HandoverSummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_HANDOVER")) return null;

  const project = db.proj(projectId);
  const phaseIdx = phaseIndex(project?.currentPhase);
  if (phaseIdx < phaseIndex("dlp")) return null;

  const docs = db.handoverDocsForProject(projectId);
  const checklist = db.handoverChecklistForProject(projectId);
  const signoff = db.handoverSignoffForProject(projectId);
  const progress = computeHandoverProgress(docs, checklist, signoff);
  const ready = isReadyForSignoff(docs, checklist);

  const badge = progress.signedOff
    ? { label: "Handed over", cls: "badge-success" }
    : ready
      ? { label: "Ready to sign off", cls: "badge-info" }
      : { label: "In progress", cls: "badge-warning" };

  return (
    <section className="card card-pad card-hover" style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/handover`)}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
          <Icon name="fileText" size={18} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Handover</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {`${progress.totalDocuments} doc${progress.totalDocuments === 1 ? "" : "s"} · `}
              {`${progress.mandatoryCompleted}/${progress.mandatoryTotal} checklist · `}
              {progress.signedOff ? "signed off" : "awaiting sign-off"}
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
export function HandoverPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_HANDOVER")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Handover" title="Handover" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Handover is visible to project management, accounts and sales." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const docs = db.handoverDocsForProject(projectId);
  const checklist = db.handoverChecklistForProject(projectId);
  const signoff = db.handoverSignoffForProject(projectId);
  const progress = computeHandoverProgress(docs, checklist, signoff);
  const ready = isReadyForSignoff(docs, checklist);

  const phaseIdx = phaseIndex(project?.currentPhase);
  const beforePhase = phaseIdx < phaseIndex("dlp");
  const isDlp = project?.currentPhase === "dlp";
  const signedOff = progress.signedOff;
  // Edit window: project is in DLP, role can manage, and not yet signed off.
  const editable = can(role, "MANAGE_HANDOVER") && isDlp && !signedOff;

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => router.push(`/projects/${projectId}`)}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> {project ? project.code + " · " + project.name : "Back to project"}
        </a>
      </div>

      <PageHeader
        eyebrow="Phase 5"
        title="Handover"
        sub="Deliverables, checklist and customer sign-off"
        right={
          <span className={"badge " + (signedOff ? "badge-success" : "badge-info")} style={{ fontWeight: 600 }}>
            {signedOff ? "Handed over" : `${progress.percentComplete}% ready`}
          </span>
        }
      />

      {beforePhase && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="clock" size={16} /></div>
          <div className="text"><div className="h">Project hasn&apos;t reached Handover</div>
            <div className="d">Handover is collected once the project advances to the DLP phase (after T&amp;C).</div></div>
        </div>
      )}
      {signedOff && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="checkCircle" size={16} /></div>
          <div className="text"><div className="h">Handover complete</div>
            <div className="d">Signed off{progress.signedAt ? ` on ${(() => { const d = new Date(progress.signedAt!); return Number.isNaN(d.getTime()) ? progress.signedAt : formatLongDateTime(d); })()}` : ""} — these records are now read-only.</div></div>
        </div>
      )}
      {isDlp && !signedOff && !can(role, "MANAGE_HANDOVER") && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="eye" size={16} /></div>
          <div className="text"><div className="h">View only</div>
            <div className="d">You can review handover progress but only project management / lead tech can edit.</div></div>
        </div>
      )}

      {/* Progress tiles */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Progress" sub="Checklist + required document categories" />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          <ProgressTile label="Documents" value={progress.totalDocuments} />
          <ProgressTile label="Checklist" value={`${progress.mandatoryCompleted}/${progress.mandatoryTotal}`} accent={progress.mandatoryTotal > 0 && progress.mandatoryCompleted === progress.mandatoryTotal} />
          <ProgressTile label="Categories" value={`${progress.categoriesCovered}/${progress.requiredCategories}`} accent={progress.categoriesCovered === progress.requiredCategories} />
          <ProgressTile label="Sign-off" value={signedOff ? "Done" : "Pending"} accent={signedOff} />
        </div>
      </section>

      <DocumentsSection projectId={projectId} docs={docs} editable={editable} userId={me.id}
        onChange={() => bumpData()} onToast={fireToast} />

      <ChecklistSection checklist={checklist} editable={editable} userId={me.id}
        onChange={() => bumpData()} onToast={fireToast} />

      <SignoffSection projectId={projectId} signoff={signoff} ready={ready} editable={editable}
        pending={pendingItemsForSignoff(docs, checklist)} userId={me.id}
        defaultCustomer={project?.customer ? (db.cust(project.customer)?.name ?? "") : ""}
        onChange={() => bumpData()} onToast={fireToast} />

      <HandoverHistorySection projectId={projectId} />
    </div>
  );
}

/* ─── Shared bits ────────────────────────────────────────── */
function ProgressTile({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  const bg = accent ? "var(--pri-50)" : "var(--bg-muted)";
  const fg = accent ? "var(--pri-700)" : "var(--ink)";
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

/* ─── Documents ──────────────────────────────────────────── */
function DocumentsSection({ projectId, docs, editable, userId, onChange, onToast }: {
  projectId: string; docs: HandoverDocument[]; editable: boolean; userId: string;
  onChange: () => void; onToast: (m: string) => void;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);

  const byCategory = useMemo(() => {
    const map = new Map<HandoverDocCategory, HandoverDocument[]>();
    for (const c of HANDOVER_CATEGORIES) map.set(c, []);
    for (const d of docs) (map.get(d.category) ?? []).push(d);
    return map;
  }, [docs]);

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="row between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <CardHead title={`Documents · ${docs.length}`} sub="Drawings, manuals, certificates, warranty & more" />
        {editable && (
          <button className="btn btn-soft btn-sm" onClick={() => setUploadOpen(true)} style={{ minHeight: 44 }}>
            <Icon name="plus" size={13} /> Upload
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {HANDOVER_CATEGORIES.map(cat => {
          const list = byCategory.get(cat) ?? [];
          const required = REQUIRED_CATEGORY_SET.has(cat);
          return (
            <div key={cat}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon name={CATEGORY_ICON[cat]} size={14} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
                <span style={{ font: "var(--t-body-md)", fontWeight: 700 }}>{HANDOVER_CATEGORY_LABEL[cat]}</span>
                <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>· {list.length}</span>
                {required && (
                  <span className={"badge " + (list.length > 0 ? "badge-success" : "badge-outline")} style={{ marginLeft: 4 }}>
                    {list.length > 0 ? "Provided" : "Required"}
                  </span>
                )}
              </div>
              {list.length === 0 ? (
                <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", paddingLeft: 22 }}>No documents.</div>
              ) : (
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                  {list.map(d => (
                    <DocRow key={d.id} doc={d} editable={editable}
                      onDelete={async () => {
                        const res = await deleteHandoverDocument(d.id);
                        if (res.ok) { onChange(); onToast("Document removed"); } else onToast(res.error);
                      }}
                      onToast={onToast} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {uploadOpen && (
        <UploadDocModal projectId={projectId} userId={userId}
          onDone={(r) => { setUploadOpen(false); if (r === "ok") { onChange(); onToast("Document uploaded"); } else if (r) onToast(r); }} />
      )}
    </section>
  );
}

function DocRow({ doc, editable, onDelete, onToast }: {
  doc: HandoverDocument; editable: boolean; onDelete: () => void; onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const res = await getHandoverDocUrl(doc.filePath);
    setBusy(false);
    if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
    else onToast(res.error);
  };
  const size = formatFileSize(doc.fileSize);
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Icon name="fileText" size={16} style={{ color: "var(--ink-mute)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ font: "var(--t-small)", fontWeight: 600, overflowWrap: "anywhere" }}>{doc.fileName}</div>
          {(size || doc.description) && (
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", overflowWrap: "anywhere" }}>
              {size}{size && doc.description ? " · " : ""}{doc.description ?? ""}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={open} disabled={busy}
          style={{ minHeight: 44, flex: "1 1 100px", justifyContent: "center" }}>
          <Icon name="arrowDown" size={13} /> {busy ? "Opening…" : "Download"}
        </button>
        {editable && (
          <button className="btn btn-ghost btn-sm" onClick={onDelete}
            style={{ minHeight: 44, flex: "1 1 90px", justifyContent: "center", color: "var(--dan-700)" }}>
            <Icon name="trash" size={13} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

function UploadDocModal({ projectId, userId, onDone }: { projectId: string; userId: string; onDone: (r: "ok" | string | null) => void }) {
  const [category, setCategory] = useState<HandoverDocCategory>("drawings");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!file) { onDone("Choose a file to upload."); return; }
    setBusy(true);
    const res = await uploadHandoverDocument(projectId, category, file, description || null, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Upload handover document" sub="PDF, Office docs, images, DWG or ZIP (max 25 MB)." onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !file} style={{ minHeight: 44 }}>
            <Icon name="plus" size={14} /> {busy ? "Uploading…" : "Upload"}
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Category" required>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as HandoverDocCategory)}>
              {HANDOVER_CATEGORIES.map(c => <option key={c} value={c}>{HANDOVER_CATEGORY_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="File" required>
            <label className="btn btn-soft" style={{ minHeight: 44, justifyContent: "center", cursor: "pointer" }}>
              <Icon name="fileText" size={14} /> {file ? "Change file" : "Choose file"}
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.dwg,.zip,image/*"
                onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
            </label>
            {file && <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginTop: 4, overflowWrap: "anywhere" }}>{file.name} · {formatFileSize(file.size)}</div>}
          </Field>
          <Field label="Description">
            <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes" />
          </Field>
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Checklist ──────────────────────────────────────────── */
function ChecklistSection({ checklist, editable, userId, onChange, onToast }: {
  checklist: HandoverChecklistItem[]; editable: boolean; userId: string;
  onChange: () => void; onToast: (m: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (item: HandoverChecklistItem) => {
    setBusyId(item.id);
    const res = await setHandoverChecklistItem(item.id, !item.isCompleted, userId);
    setBusyId(null);
    if (res.ok) { onChange(); onToast(item.isCompleted ? "Item reopened" : "Item completed"); }
    else onToast(res.error);
  };

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <CardHead title={`Checklist · ${checklist.filter(c => c.isCompleted).length}/${checklist.length}`}
        sub="Mandatory items must be completed before sign-off" />
      {checklist.length === 0 ? (
        <EmptyState icon="list" title="No checklist yet"
          sub="The handover checklist is auto-seeded when the project enters the DLP phase." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {checklist.map(item => (
            <div key={item.id} className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Icon name={item.isCompleted ? "checkCircle" : "clock"} size={18}
                style={{ color: item.isCompleted ? "var(--suc-700)" : "var(--ink-quiet)", flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: "1 1 160px" }}>
                <div style={{ font: "var(--t-small)", fontWeight: 600, overflowWrap: "anywhere", textDecoration: item.isCompleted ? "line-through" : "none", color: item.isCompleted ? "var(--ink-mute)" : "var(--ink)" }}>
                  {item.itemDescription}
                </div>
                <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                  {item.category ? HANDOVER_CATEGORY_LABEL[item.category] : "General"}
                  {item.isRequired ? " · Mandatory" : " · Optional"}
                </div>
              </div>
              {editable ? (
                <button className={"btn btn-sm " + (item.isCompleted ? "btn-ghost" : "btn-primary")}
                  onClick={() => toggle(item)} disabled={busyId === item.id}
                  style={{ minHeight: 44, flex: "0 0 auto", justifyContent: "center" }}>
                  <Icon name={item.isCompleted ? "refresh" : "check"} size={13} /> {item.isCompleted ? "Reopen" : "Mark done"}
                </button>
              ) : (
                <span className={"badge " + (item.isCompleted ? "badge-success" : "badge-outline")}>
                  {item.isCompleted ? "Done" : "Pending"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Sign-off ───────────────────────────────────────────── */
function SignoffSection({ projectId, signoff, ready, editable, pending, userId, defaultCustomer, onChange, onToast }: {
  projectId: string;
  signoff: ReturnType<typeof db.handoverSignoffForProject>;
  ready: boolean; editable: boolean;
  pending: ReturnType<typeof pendingItemsForSignoff>;
  userId: string; defaultCustomer: string;
  onChange: () => void; onToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const blockingCount = pending.incompleteMandatory.length + pending.missingCategories.length;

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <CardHead title="Customer sign-off" sub="Formal acceptance of the handover" />

      {signoff ? (
        <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--suc-50)", border: "1px solid var(--suc-100)", borderRadius: "var(--r-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Icon name="checkCircle" size={16} style={{ color: "var(--suc-700)", flexShrink: 0 }} />
            <span style={{ font: "var(--t-body-md)", fontWeight: 700, color: "var(--suc-700)" }}>Handover signed off</span>
          </div>
          <div style={{ font: "var(--t-small)", color: "var(--ink)" }}>
            By <span style={{ fontWeight: 600 }}>{signoff.customerName}</span>
            {signoff.customerEmail ? ` · ${signoff.customerEmail}` : ""}
          </div>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginTop: 2 }}>
            {(() => { const d = new Date(signoff.signedAt); return Number.isNaN(d.getTime()) ? signoff.signedAt : formatLongDateTime(d); })()} · typed sign-off
          </div>
          {signoff.notes && <div style={{ font: "var(--t-small)", marginTop: 6, overflowWrap: "anywhere" }}>{signoff.notes}</div>}
        </div>
      ) : (
        <>
          <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={!editable || !ready} aria-disabled={!editable || !ready}
            style={{ minHeight: 44, width: "100%", justifyContent: "center", marginTop: 10 }}>
            <Icon name="check" size={14} /> Record customer sign-off
          </button>

          {!ready && blockingCount > 0 && (
            <div role="status" style={{ marginTop: 12, padding: "12px 14px", background: "var(--warn-50)", color: "var(--warn-700)", border: "1px solid var(--warn-100)", borderRadius: "var(--r-md)", font: "var(--t-small)", overflowWrap: "anywhere" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{blockingCount} item{blockingCount === 1 ? "" : "s"} before sign-off</div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                    {pending.incompleteMandatory.map(i => (
                      <li key={"c-" + i.id}><span style={{ fontWeight: 600 }}>Checklist:</span> {i.itemDescription}</li>
                    ))}
                    {pending.missingCategories.map(c => (
                      <li key={"d-" + c}><span style={{ fontWeight: 600 }}>Missing document:</span> {HANDOVER_CATEGORY_LABEL[c]}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {open && (
        <RecordSignoffModal projectId={projectId} userId={userId} defaultCustomer={defaultCustomer}
          onDone={(r) => { setOpen(false); if (r === "ok") { onChange(); onToast("Handover signed off"); } else if (r) onToast(r); }} />
      )}
    </section>
  );
}

function RecordSignoffModal({ projectId, userId, defaultCustomer, onDone }: {
  projectId: string; userId: string; defaultCustomer: string; onDone: (r: "ok" | string | null) => void;
}) {
  const [customerName, setCustomerName] = useState(defaultCustomer);
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await recordHandoverSignoff({ projectId, customerName, customerEmail: customerEmail || null, notes: notes || null }, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => !busy && onDone(null)}>
      <ModalShell title="Record handover sign-off" sub="Typed customer acceptance — this finalises the handover." onClose={() => !busy && onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !customerName.trim() || !confirmed} style={{ minHeight: 44 }}>
            <Icon name="check" size={14} /> Confirm sign-off
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Customer name" required>
            <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name of the signing customer" autoFocus />
          </Field>
          <Field label="Customer email">
            <input className="input" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Notes">
            <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ resize: "vertical" }} placeholder="Any conditions or comments" />
          </Field>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, font: "var(--t-small)", cursor: "pointer" }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
            <span>I confirm the customer named above has formally accepted the project handover. The DLP warranty period begins from this date. (Typed sign-off — digital signature is a future enhancement.)</span>
          </label>
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Audit history ──────────────────────────────────────── */
function HandoverHistorySection({ projectId }: { projectId: string }) {
  const history = db.handoverHistoryForProject(projectId);
  if (history.length === 0) return null;
  return (
    <section className="card card-pad" style={{ marginTop: 4 }}>
      <CardHead title={`Activity · ${history.length}`} sub="Append-only audit trail across documents, checklist and sign-off" />
      <div className="col gap-2">
        {history.map(h => <HandoverHistoryEntry key={h.id} row={h} />)}
      </div>
    </section>
  );
}

function HandoverHistoryEntry({ row }: { row: HandoverHistory }) {
  const actor = row.changedBy ? db.user(row.changedBy) : null;
  const when = (() => { const d = new Date(row.changedAt); return Number.isNaN(d.getTime()) ? row.changedAt : formatLongDateTime(d); })();
  const kindLabel = row.entityKind === "document" ? "Document" : row.entityKind === "checklist" ? "Checklist" : "Sign-off";
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
