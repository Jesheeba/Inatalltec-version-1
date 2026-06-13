"use client";
// ============================================================
// Material Supply — Phase 2 (migration 0201).
//
// Two exports:
//   • MaterialSupplySummaryCard — status card on the project detail
//     page, mirrors the JCA / Submittal / Drawing summary pattern.
//   • MaterialSupplyPage — full management UI at
//     /projects/[id]/material-supply.
//
// Auto-seeded at Design→Material Supply phase advance: one row per
// approved BOM item. Lead tech + accountant work through the status
// workflow (not_ordered → ordered → received_at_warehouse →
// delivered_to_site). Mid-phase additions allowed. Append-only audit
// trail.
//
// Roles (mirrors lib/permissions.ts):
//   VIEW_MATERIAL_SUPPLY   — admin/md/manager/lead_worker/accounts/sales
//   MANAGE_MATERIAL_SUPPLY — admin/md/manager/lead_worker/accounts
//
// Responsive:
//   ≥720px → table layout
//   <720px → stacked card layout, full-width modals as bottom sheets
//   44px tap targets on action buttons (btn-sm + minHeight in scoped style)
//   No hover-only affordances (all actions are taps/clicks)
// ============================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { phaseIndex } from "@/lib/phases";
import {
  createProjectMaterial,
  updateProjectMaterialStatus,
  updateProjectMaterialQuantity,
  linkProjectMaterialToPoLine,
  advanceProjectPhase,
} from "@/lib/create";
import { formatLongDateTime } from "@/lib/dates";
import type { ProjectMaterial, ProjectMaterialHistory, ProjectMaterialStatus } from "@/lib/types";
import {
  PROJECT_MATERIAL_STATUSES,
  PROJECT_MATERIAL_STATUS_LABEL,
  computeMaterialSupplyProgress,
  isReadyForInstallation,
  pendingMaterialsForGate,
} from "@/lib/projects/materialSupply";
import { CardHead, EmptyState, Modal, PageHeader } from "../../shared";

// ── Status → badge tone ─────────────────────────────────────
const STATUS_BADGE_CLS: Record<ProjectMaterialStatus, string> = {
  not_ordered: "badge-outline",
  ordered: "badge-info",
  received_at_warehouse: "badge-warning",
  delivered_to_site: "badge-success",
  cancelled: "badge-outline",
  issue: "badge-danger",
};

/* ─── Summary card (project detail page) ─────────────────── */
export function MaterialSupplySummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_MATERIAL_SUPPLY")) return null;

  const project = db.proj(projectId);
  const materials = db.materialsForProject(projectId);
  const progress = computeMaterialSupplyProgress(materials);

  // Don't show the card until the project has reached or passed Material Supply —
  // before that, there's nothing meaningful to render and the auto-seed hasn't fired.
  const phaseIdx = phaseIndex(project?.currentPhase);
  if (phaseIdx < phaseIndex("material_supply")) return null;

  const badge =
    materials.length === 0
      ? { label: "Awaiting setup", cls: "badge-outline" }
      : progress.percentDelivered === 100
        ? { label: "All delivered", cls: "badge-success" }
        : progress.deliveredSite > 0
          ? { label: `${progress.percentDelivered}% delivered`, cls: "badge-info" }
          : { label: "In progress", cls: "badge-warning" };

  return (
    <section
      className="card card-pad card-hover"
      style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/material-supply`)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
          <Icon name="package" size={18} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Material Supply</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              {materials.length === 0
                ? "Auto-seeds from the approved submittal on phase advance"
                : `${progress.deliveredSite} of ${progress.total} delivered to site · ${progress.notOrdered} not ordered`}
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
export function MaterialSupplyPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_MATERIAL_SUPPLY")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Material Supply" title="Material Supply" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Material Supply is visible to project management and accounts." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const materials = db.materialsForProject(projectId);
  const progress = computeMaterialSupplyProgress(materials);

  const phaseIdx = phaseIndex(project?.currentPhase);
  const beforePhase = phaseIdx < phaseIndex("material_supply");
  const phaseLocked = phaseIdx > phaseIndex("material_supply");
  const canManage = can(role, "MANAGE_MATERIAL_SUPPLY") && !phaseLocked && !beforePhase;

  const [statusEdit, setStatusEdit] = useState<ProjectMaterial | null>(null);
  const [qtyEdit, setQtyEdit] = useState<{ material: ProjectMaterial; kind: "warehouse" | "site" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [poEdit, setPoEdit] = useState<ProjectMaterial | null>(null);

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
        eyebrow="Phase 2"
        title="Material Supply"
        sub="Procurement progress — from approved BOM through delivery to site"
        right={
          <span className={"badge " + (progress.total === 0 ? "badge-outline" : "badge-info")} style={{ fontWeight: 600 }}>
            {progress.total === 0 ? "No materials yet" : `${progress.percentDelivered}% delivered to site`}
          </span>
        }
      />

      {beforePhase && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="clock" size={16} /></div>
          <div className="text"><div className="h">Project is still in Design</div>
            <div className="d">Material Supply auto-populates once the project advances past Design.</div></div>
        </div>
      )}
      {phaseLocked && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="checkCircle" size={16} /></div>
          <div className="text"><div className="h">Material Supply complete</div>
            <div className="d">This project has moved past Material Supply — the list is read-only.</div></div>
        </div>
      )}
      {!canManage && !beforePhase && !phaseLocked && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="eye" size={16} /></div>
          <div className="text"><div className="h">View only</div>
            <div className="d">You can review progress but only project management / lead tech / accounts can edit.</div></div>
        </div>
      )}

      {/* Progress tiles */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Progress" sub={`${progress.total} item${progress.total === 1 ? "" : "s"} in scope`} />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <ProgressTile label="Not ordered" value={progress.notOrdered} />
          <ProgressTile label="Ordered" value={progress.ordered} />
          <ProgressTile label="At warehouse" value={progress.receivedWarehouse} />
          <ProgressTile label="At site" value={progress.deliveredSite} accent />
          <ProgressTile label="Cancelled" value={progress.cancelled} muted />
          <ProgressTile label="Issues" value={progress.issue} danger={progress.issue > 0} />
        </div>
      </section>

      {/* Materials */}
      <section className="card card-pad">
        <div className="row between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <CardHead title={`Materials · ${materials.length}`} sub="Status, quantities, optional PO linkage" />
          {canManage && (
            <button className="btn btn-soft btn-sm" onClick={() => setAddOpen(true)} style={{ minHeight: 36 }}>
              <Icon name="plus" size={13} /> Add material
            </button>
          )}
        </div>

        {materials.length === 0 ? (
          <EmptyState icon="package" title="No materials yet"
            sub={beforePhase
              ? "Will auto-populate from the approved Material Submittal when the project moves to Material Supply."
              : "The approved Material Submittal had no items, or none were seeded. Add manually if needed."} />
        ) : (
          <>
            {/* Desktop table (≥720px) */}
            <div className="ms-table-wrap" style={{ overflowX: "auto" }}>
              <table className="ms-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <th style={ms_th}>Description</th>
                    <th style={ms_th}>Model</th>
                    <th style={{ ...ms_th, textAlign: "right" }}>Planned</th>
                    <th style={{ ...ms_th, textAlign: "right" }}>Warehouse</th>
                    <th style={{ ...ms_th, textAlign: "right" }}>Site</th>
                    <th style={ms_th}>Status</th>
                    <th style={ms_th}>PO</th>
                    <th style={ms_th}></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map(m => (
                    <MaterialRow key={m.id} m={m} canManage={canManage}
                      onEditStatus={() => setStatusEdit(m)}
                      onEditQtyWarehouse={() => setQtyEdit({ material: m, kind: "warehouse" })}
                      onEditQtySite={() => setQtyEdit({ material: m, kind: "site" })}
                      onEditPo={() => setPoEdit(m)} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards (<720px) */}
            <div className="ms-cards" style={{ display: "grid", gap: 10 }}>
              {materials.map(m => (
                <MaterialCard key={m.id} m={m} canManage={canManage}
                  onEditStatus={() => setStatusEdit(m)}
                  onEditQtyWarehouse={() => setQtyEdit({ material: m, kind: "warehouse" })}
                  onEditQtySite={() => setQtyEdit({ material: m, kind: "site" })}
                  onEditPo={() => setPoEdit(m)} />
              ))}
            </div>

            {/* Scoped responsive CSS: show table at ≥720, cards at <720. */}
            <style>{`
              .ms-cards { display: none; }
              @media (max-width: 720px) {
                .ms-table-wrap { display: none; }
                .ms-cards { display: grid; }
              }
            `}</style>
          </>
        )}
      </section>

      {/* Advance to Installation — only shown when user can manage,
          project is currently in material_supply phase, and we're not
          locked / not-yet-arrived. */}
      {canManage && (
        <AdvanceToInstallationSection
          projectId={projectId}
          projectCode={project?.code ?? ""}
          projectName={project?.name ?? ""}
          materials={materials}
        />
      )}

      {/* History */}
      {materials.length > 0 && (
        <HistorySection projectId={projectId} materials={materials} />
      )}

      {/* Modals */}
      {statusEdit && (
        <StatusEditModal material={statusEdit} userId={me.id}
          onDone={(result) => {
            setStatusEdit(null);
            if (result === "ok") { bumpData(); fireToast("Status updated"); }
            else if (result) { fireToast(result); }
          }} />
      )}
      {qtyEdit && (
        <QuantityEditModal material={qtyEdit.material} kind={qtyEdit.kind} userId={me.id}
          onDone={(result) => {
            setQtyEdit(null);
            if (result === "ok") { bumpData(); fireToast("Quantity updated"); }
            else if (result) { fireToast(result); }
          }} />
      )}
      {addOpen && (
        <AddMaterialModal projectId={projectId} userId={me.id}
          onDone={(result) => {
            setAddOpen(false);
            if (result === "ok") { bumpData(); fireToast("Material added"); }
            else if (result) { fireToast(result); }
          }} />
      )}
      {poEdit && (
        <PoLinkModal material={poEdit} userId={me.id}
          onDone={(result) => {
            setPoEdit(null);
            if (result === "ok") { bumpData(); fireToast("PO link updated"); }
            else if (result) { fireToast(result); }
          }} />
      )}
    </div>
  );
}

/* ─── Progress tile ──────────────────────────────────────── */
const ms_th: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", font: "var(--t-micro)" };
const ms_td: React.CSSProperties = { padding: "12px", borderBottom: "1px solid var(--border)", font: "var(--t-small)", verticalAlign: "top" };

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

/* ─── Row + Card (desktop / mobile) ──────────────────────── */
interface RowProps {
  m: ProjectMaterial;
  canManage: boolean;
  onEditStatus: () => void;
  onEditQtyWarehouse: () => void;
  onEditQtySite: () => void;
  onEditPo: () => void;
}

function MaterialRow({ m, canManage, onEditStatus, onEditQtyWarehouse, onEditQtySite, onEditPo }: RowProps) {
  return (
    <tr>
      <td style={{ ...ms_td, maxWidth: 280 }}>
        <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{m.description}</div>
        {m.notes && <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginTop: 2, overflowWrap: "anywhere" }}>{m.notes}</div>}
      </td>
      <td style={{ ...ms_td, overflowWrap: "anywhere" }}>{m.modelNumber || <span style={{ color: "var(--ink-quiet)" }}>—</span>}</td>
      <td style={{ ...ms_td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.quantityPlanned}</td>
      <td style={{ ...ms_td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {canManage ? (
          <button className="btn btn-ghost btn-sm" onClick={onEditQtyWarehouse} style={{ minHeight: 32, gap: 4 }}>
            {m.quantityReceivedWarehouse}<Icon name="pen" size={11} style={{ color: "var(--ink-mute)" }} />
          </button>
        ) : <span>{m.quantityReceivedWarehouse}</span>}
      </td>
      <td style={{ ...ms_td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {canManage ? (
          <button className="btn btn-ghost btn-sm" onClick={onEditQtySite} style={{ minHeight: 32, gap: 4 }}>
            {m.quantityDeliveredSite}<Icon name="pen" size={11} style={{ color: "var(--ink-mute)" }} />
          </button>
        ) : <span>{m.quantityDeliveredSite}</span>}
      </td>
      <td style={ms_td}>
        <span className={"badge " + STATUS_BADGE_CLS[m.status]} style={{ whiteSpace: "nowrap" }}>
          {PROJECT_MATERIAL_STATUS_LABEL[m.status]}
        </span>
      </td>
      <td style={ms_td}>
        {m.poLineItemId
          ? <span className="badge badge-info" title={m.poLineItemId} style={{ whiteSpace: "nowrap" }}>Linked</span>
          : <span style={{ color: "var(--ink-quiet)" }}>—</span>}
      </td>
      <td style={{ ...ms_td, textAlign: "right" }}>
        {canManage && (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={onEditStatus} style={{ minHeight: 32 }}>Status</button>
            <button className="btn btn-ghost btn-sm" onClick={onEditPo} style={{ minHeight: 32 }}>PO</button>
          </div>
        )}
      </td>
    </tr>
  );
}

function MaterialCard({ m, canManage, onEditStatus, onEditQtyWarehouse, onEditQtySite, onEditPo }: RowProps) {
  return (
    <div className="card card-pad">
      {/* Header: title block + status badge. Status is on its own row when
          space is tight (flex-wrap kicks in below ~280px content width). */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <div style={{ font: "var(--t-body-md)", fontWeight: 600, overflowWrap: "anywhere" }}>{m.description}</div>
          {m.modelNumber && <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginTop: 2, overflowWrap: "anywhere" }}>Model {m.modelNumber}</div>}
        </div>
        <span className={"badge " + STATUS_BADGE_CLS[m.status]} style={{ flexShrink: 0 }}>
          {PROJECT_MATERIAL_STATUS_LABEL[m.status]}
        </span>
      </div>

      {/* Quantities — minmax(0, 1fr) lets each column shrink past content
          so the number doesn't push the card sideways at 320px. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
        <QtyMini label="Planned" value={m.quantityPlanned} />
        <QtyMini label="Warehouse" value={m.quantityReceivedWarehouse} onEdit={canManage ? onEditQtyWarehouse : undefined} />
        <QtyMini label="Site" value={m.quantityDeliveredSite} onEdit={canManage ? onEditQtySite : undefined} />
      </div>

      {m.poLineItemId && (
        <div style={{
          font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 10,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          PO linked · <span className="numeric" title={m.poLineItemId}>{m.poLineItemId.slice(0, 8)}…</span>
        </div>
      )}

      {canManage && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-soft btn-sm" onClick={onEditStatus}
            style={{ minHeight: 44, flex: "1 1 130px", justifyContent: "center" }}>
            <Icon name="refresh" size={13} /> Status
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onEditPo}
            style={{ minHeight: 44, flex: "1 1 130px", justifyContent: "center" }}>
            <Icon name="paperclip" size={13} /> PO link
          </button>
        </div>
      )}
    </div>
  );
}

function QtyMini({ label, value, onEdit }: { label: string; value: number; onEdit?: () => void }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--bg-muted)", minWidth: 0 }}>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      {onEdit ? (
        <button className="btn btn-ghost btn-sm" onClick={onEdit}
          style={{
            padding: "2px 0", marginTop: 2, minHeight: 32, width: "100%",
            justifyContent: "flex-start",
            fontVariantNumeric: "tabular-nums",
            font: "var(--t-body-md)", fontWeight: 700,
          }}>
          {value}<Icon name="pen" size={10} style={{ marginLeft: 4, color: "var(--ink-mute)" }} />
        </button>
      ) : (
        <div style={{ font: "var(--t-body-md)", fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
      )}
    </div>
  );
}

/* ─── Modal shell ────────────────────────────────────────── */
// Adds the padding + header that the bare <Modal> doesn't provide.
// Without this, child content sits flush against the rounded corners
// of the modal frame — the title would visually clip at the top edge.
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

/* ─── Status edit modal ──────────────────────────────────── */
function StatusEditModal({ material, userId, onDone }: { material: ProjectMaterial; userId: string; onDone: (result: "ok" | string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<ProjectMaterialStatus>(material.status);

  const save = async () => {
    if (picked === material.status) { onDone(null); return; }
    setBusy(true);
    const res = await updateProjectMaterialStatus(material.id, picked, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell title="Update status" sub={material.description} onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || picked === material.status}>
            <Icon name="check" size={14} /> Save
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PROJECT_MATERIAL_STATUSES.map(s => {
            const selected = picked === s;
            return (
              <button key={s} type="button"
                className={"btn " + (selected ? "btn-primary" : "btn-ghost")}
                onClick={() => setPicked(s)}
                style={{ justifyContent: "flex-start", minHeight: 44, gap: 10, flexWrap: "wrap" }}>
                <span className={"badge " + STATUS_BADGE_CLS[s]}>{PROJECT_MATERIAL_STATUS_LABEL[s]}</span>
                {s === material.status && <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>current</span>}
              </button>
            );
          })}
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── Quantity edit modal ────────────────────────────────── */
function QuantityEditModal({ material, kind, userId, onDone }: {
  material: ProjectMaterial; kind: "warehouse" | "site"; userId: string;
  onDone: (result: "ok" | string | null) => void;
}) {
  const current = kind === "warehouse" ? material.quantityReceivedWarehouse : material.quantityDeliveredSite;
  const [v, setV] = useState<string>(String(current));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) { onDone("Enter a number ≥ 0."); return; }
    if (num === current) { onDone(null); return; }
    setBusy(true);
    const res = await updateProjectMaterialQuantity(material.id, kind, num, userId);
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell
        title={`Update ${kind === "warehouse" ? "warehouse" : "site"} quantity`}
        sub={`${material.description} · Planned ${material.quantityPlanned}`}
        onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            <Icon name="check" size={14} /> Save
          </button>
        </>}>
        <input className="input numeric" type="number" min={0} step="any" inputMode="decimal"
          value={v} onChange={e => setV(e.target.value)} autoFocus
          style={{ font: "var(--t-h3)", padding: "12px 14px", width: "100%" }} />
      </ModalShell>
    </Modal>
  );
}

/* ─── Add material modal ─────────────────────────────────── */
function AddMaterialModal({ projectId, userId, onDone }: { projectId: string; userId: string; onDone: (result: "ok" | string | null) => void }) {
  const [desc, setDesc] = useState("");
  const [model, setModel] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await createProjectMaterial(
      { projectId, description: desc, modelNumber: model || null, quantityPlanned: Number(qty) },
      userId,
    );
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell
        title="Add material"
        sub="For mid-phase additions not in the original approved submittal."
        onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !desc.trim() || !qty}>
            <Icon name="plus" size={14} /> Add
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Description" required>
            <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. PoE Switch — 24 port" autoFocus />
          </Field>
          <Field label="Model number">
            <input className="input" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. CB-SW2400P" />
          </Field>
          <Field label="Planned quantity" required>
            <input className="input numeric" type="number" min={1} step={1} inputMode="numeric"
              value={qty} onChange={e => setQty(e.target.value)} />
          </Field>
        </div>
      </ModalShell>
    </Modal>
  );
}

/* ─── PO link modal (paste-uuid for MS-B; richer picker is a follow-up) ── */
function PoLinkModal({ material, userId, onDone }: { material: ProjectMaterial; userId: string; onDone: (result: "ok" | string | null) => void }) {
  const [v, setV] = useState(material.poLineItemId ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const trimmed = v.trim();
    const res = await linkProjectMaterialToPoLine(
      material.id,
      trimmed === "" ? null : trimmed,
      userId,
    );
    setBusy(false);
    onDone(res.ok ? "ok" : res.error);
  };

  return (
    <Modal open={true} onClose={() => onDone(null)}>
      <ModalShell
        title="PO line link"
        sub={material.description}
        onClose={() => onDone(null)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            <Icon name="check" size={14} /> Save
          </button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="PO line item ID">
            <input className="input numeric" value={v} onChange={e => setV(e.target.value)}
              placeholder="Paste a po_line_items.id (or leave blank to unlink)" autoFocus />
          </Field>
          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
            The Accountant module owns POs — paste the line item id from there. A richer in-app
            PO picker will land in a follow-up slice.
          </div>
        </div>
      </ModalShell>
    </Modal>
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

/* ─── Advance to Installation section ────────────────────── */
// Renders the "Advance to Installation" CTA + readiness hint panel +
// confirmation modal. Self-contained — manages its own confirm state.
// Visibility is gated by the page (canManage = MANAGE_MATERIAL_SUPPLY
// AND project is in material_supply phase). The DB trigger
// trg_check_material_supply_gate (migration 0201) is the last-line
// enforcer; this UI mirrors that rule via isReadyForInstallation so
// users don't see a button they'd be 403'd on.
//
// Mobile (<560px): button + actions go full-width; pending-items
// hint scrolls vertically inside the card.
function AdvanceToInstallationSection({
  projectId, projectCode, projectName, materials,
}: {
  projectId: string; projectCode: string; projectName: string; materials: ProjectMaterial[];
}) {
  const { fireToast, bumpData } = useApp();
  const ready = isReadyForInstallation(materials);
  const pending = pendingMaterialsForGate(materials);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await advanceProjectPhase(projectId, "installation");
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setConfirmOpen(false);
    bumpData();
    fireToast("Project advanced to Installation phase");
  };

  return (
    <>
      <section className="card card-pad" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Icon name="arrowRight" size={20} style={{ color: ready ? "var(--suc-700)" : "var(--ink-mute)", marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ font: "var(--t-h3)", fontWeight: 700 }}>Advance to Installation</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
              {ready
                ? materials.length === 0
                  ? "No materials in scope — phase advance allowed."
                  : `${materials.length} material${materials.length === 1 ? "" : "s"}, all delivered or cancelled. Ready to move on.`
                : `${pending.length} material${pending.length === 1 ? "" : "s"} still pending. Mark them delivered or cancelled to proceed.`}
            </div>
          </div>
        </div>

        {/* Primary CTA — full width on narrow viewports, auto-width on desktop.
            44px minHeight ensures comfortable tap on mobile. */}
        <button
          className="btn btn-primary"
          onClick={() => setConfirmOpen(true)}
          disabled={!ready}
          aria-disabled={!ready}
          style={{ minHeight: 44, width: "100%", justifyContent: "center" }}>
          <Icon name="arrowRight" size={14} />
          Advance to Installation
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
                  {pending.length} item{pending.length === 1 ? "" : "s"} blocking advancement
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {pending.map(p => (
                    <li key={p.id}>
                      <span style={{ fontWeight: 600 }}>{p.description}</span>
                      <span style={{ color: "var(--ink-mute)" }}>
                        {" "}— {PROJECT_MATERIAL_STATUS_LABEL[p.status]}
                      </span>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 8, font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                  Mark these materials as delivered or cancelled to proceed.
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {confirmOpen && (
        <Modal open={true} onClose={() => !busy && setConfirmOpen(false)}>
          <ModalShell
            title="Advance to Installation"
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
                {materials.length === 0
                  ? "No materials in scope — phase advance allowed."
                  : `${materials.length} material${materials.length === 1 ? "" : "s"}, all delivered or cancelled.`}
              </div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                Once advanced, Material Supply becomes read-only and the project enters Installation.
                The project&apos;s lead technician will be notified automatically.
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

/* ─── History feed ───────────────────────────────────────── */
function HistorySection({ projectId, materials }: { projectId: string; materials: ProjectMaterial[] }) {
  void projectId; // selector below uses materials directly
  const { role } = useApp();

  const history = useMemo(() => {
    const matIds = new Set(materials.map(m => m.id));
    const all: ProjectMaterialHistory[] = [];
    for (const id of Object.keys(db.PROJECT_MATERIAL_HISTORY)) {
      const h = db.PROJECT_MATERIAL_HISTORY[id];
      if (h && matIds.has(h.materialId)) all.push(h);
    }
    return all.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  }, [materials]);

  // History visible to the audit audience per RLS pm_hist_read.
  if (!can(role, "VIEW_MATERIAL_SUPPLY")) return null;
  if (history.length === 0) return null;

  const byMaterial = new Map<string, ProjectMaterial>();
  for (const m of materials) byMaterial.set(m.id, m);

  return (
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <CardHead title={`Activity · ${history.length}`} sub="Append-only audit trail — every change with actor and timestamp" />
      <div className="col gap-2">
        {history.map(h => (
          <HistoryEntry key={h.id} row={h} materialDesc={byMaterial.get(h.materialId)?.description ?? "—"} />
        ))}
      </div>
    </section>
  );
}

function HistoryEntry({ row, materialDesc }: { row: ProjectMaterialHistory; materialDesc: string }) {
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
        {materialDesc}
      </div>
      <div style={{ font: "var(--t-small)", overflowWrap: "anywhere" }}>{row.detail ?? row.action}</div>
    </div>
  );
}
