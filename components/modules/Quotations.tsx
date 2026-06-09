"use client";
// ============================================================
// Quotations module (Phase 11, minimal)
//
// CRUD list of quotations. Each row carries title + customer + value +
// a status pill (draft → sent → accepted → converted, with rejected as
// a side branch). Status changes go through updateQuotationStatus().
// Convert action creates the downstream project or AMC via the same
// helpers the create modals use, then flips status to 'converted'
// with the FK populated.
//
// Permission: admin / md / manager / sales. Same allowlist as the RLS
// quote_write policy from migration 0028.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import {
  updateQuotationStatus, convertQuotation,
  updateQuotation, downloadQuotationFile,
} from "@/lib/create";
import {
  EmptyState, FilterBar, KPI, PageHeader,
} from "../shared";
import type { Quotation, QuotationStatus } from "@/lib/types";

const ALLOWED_WRITE = new Set<string>(["admin", "md", "manager", "sales"]);
const ALLOWED_READ  = new Set<string>(["admin", "md", "manager", "sales", "accounts", "estimator"]);

const STATUS_OPTIONS: QuotationStatus[] = ["draft", "sent", "accepted", "rejected", "converted"];
const STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "Draft", sent: "Sent", accepted: "Accepted",
  rejected: "Rejected", converted: "Converted",
};
const STATUS_PILL_CLS: Record<QuotationStatus, string> = {
  draft:     "badge-outline",
  sent:      "badge-primary",
  accepted:  "badge-success",
  rejected:  "badge-warning",
  converted: "badge-violet",
};

export function Quotations() {
  const { role, openCreate, fmtMoney, fireToast, bumpData, openProject, openAmc, dataVersion } = useApp();
  void dataVersion;
  const canWrite = ALLOWED_WRITE.has(role);

  if (!ALLOWED_READ.has(role)) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Sales" title="Quotations" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Quotations are managed by MD / Admin / Operations Manager / Sales." />
      </div>
    );
  }

  type Filter = QuotationStatus | "all";
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [convertTarget, setConvertTarget] = useState<{ id: string; target: "project" | "amc" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Deep-link from elsewhere in the app: /quotations?open=<id> opens
  // the editor on mount. Used by the Project detail "Open quotation"
  // button so Sales can jump straight to the auto-generated draft.
  const searchParams = useSearchParams();
  useEffect(() => {
    const openId = searchParams?.get("open");
    if (openId) setEditingId(openId);
  }, [searchParams]);

  const all = useMemo(
    () => Object.values(db.QUOTATIONS).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: all.length, draft: 0, sent: 0, accepted: 0, rejected: 0, converted: 0 };
    for (const x of all) c[x.status] = (c[x.status] || 0) + 1;
    return c;
  }, [all]);

  let list = all;
  if (filter !== "all") list = list.filter(x => x.status === filter);
  if (q.trim()) {
    const lq = q.toLowerCase();
    list = list.filter(x =>
      x.code.toLowerCase().includes(lq)
      || x.title.toLowerCase().includes(lq)
      || (db.cust(x.customerId ?? "")?.name ?? "").toLowerCase().includes(lq)
    );
  }

  const totalValue = list.reduce((s, x) => s + (x.valueAed || 0), 0);

  const onStatusChange = async (quotation: Quotation, next: QuotationStatus) => {
    if (next === quotation.status) return;
    if (next === "converted") {
      fireToast("Use the Convert button to flip to converted.");
      return;
    }
    const res = await updateQuotationStatus(quotation.id, next);
    if (!res.ok) { fireToast(`Couldn't update: ${res.error}`); return; }
    fireToast(`${quotation.code} → ${STATUS_LABEL[next]}`);
    bumpData();
  };

  const onConvert = async () => {
    if (!convertTarget) return;
    const res = await convertQuotation(convertTarget.id, convertTarget.target);
    if (!res.ok) { fireToast(res.error); return; }
    fireToast(`Quotation converted to ${convertTarget.target === "project" ? "project" : "AMC"}`);
    bumpData();
    setConvertTarget(null);
    if (convertTarget.target === "project") openProject(res.targetId);
    else openAmc(res.targetId);
  };

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Sales" title="Quotations"
        sub="Quick tracker — title, value, status, convert"
        right={canWrite ? (
          <button className="btn btn-primary" onClick={() => openCreate("quotation_v2")}>
            <Icon name="plus" size={14} /> New quotation
          </button>
        ) : undefined} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Total quotations" value={all.length} />
        <KPI label="Accepted" value={counts.accepted} />
        <KPI label="Converted" value={counts.converted} />
        <KPI label="Pipeline value (filtered)" value={fmtMoney(totalValue, { compact: true })}
             sub={`${list.length} row${list.length === 1 ? "" : "s"} in view`} />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm" placeholder="Search code, title, customer…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <FilterBar<Filter> value={filter} onChange={setFilter} options={[
            { value: "all",       label: "All",       count: counts.all },
            { value: "draft",     label: "Draft",     count: counts.draft },
            { value: "sent",      label: "Sent",      count: counts.sent },
            { value: "accepted",  label: "Accepted",  count: counts.accepted },
            { value: "rejected",  label: "Rejected",  count: counts.rejected },
            { value: "converted", label: "Converted", count: counts.converted },
          ]} />
        </div>
      </div>

      {list.length === 0 ? (
        all.length === 0 ? (
          <EmptyState icon="fileText" title="No quotations yet"
            sub={canWrite
              ? "Click + New quotation to track your first quote."
              : "Quotations will appear here once Sales logs them."} />
        ) : (
          <EmptyState icon="fileText" title="No quotations match"
            sub="Try a different filter or clear the search." />
        )
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Customer</th>
                  <th style={{ textAlign: "right" }}>Value</th>
                  <th>Status</th>
                  <th>Valid until</th>
                  <th style={{ width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map(x => {
                  const cust = x.customerId ? db.cust(x.customerId) : null;
                  return (
                    <tr key={x.id}>
                      <td style={{ font: "var(--t-small)", fontWeight: 600 }}>{x.code}</td>
                      <td style={{ font: "var(--t-small)" }}>{x.title}</td>
                      <td style={{ font: "var(--t-small)" }}>{cust?.name ?? "—"}</td>
                      <td className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>
                        {fmtMoney(x.valueAed, { compact: true })}
                      </td>
                      <td>
                        {canWrite && x.status !== "converted" ? (
                          <select className="input input-sm"
                                  value={x.status}
                                  onChange={e => onStatusChange(x, e.target.value as QuotationStatus)}
                                  style={{ width: "auto", display: "inline-block" }}>
                            {STATUS_OPTIONS.filter(s => s !== "converted").map(s => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`badge ${STATUS_PILL_CLS[x.status]}`}>{STATUS_LABEL[x.status]}</span>
                        )}
                      </td>
                      <td className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                        {x.validUntil ?? "—"}
                      </td>
                      <td>
                        {/* Icon-only horizontal action bar. Each button
                            carries a native `title` so hover shows the
                            label. nowrap keeps the strip on one line; if
                            the screen is too narrow, the table column
                            scrolls horizontally (the parent already wraps
                            with overflowX: auto). */}
                        <div className="row gap-1" style={{ flexWrap: "nowrap", alignItems: "center" }}>
                          <button
                            title="Open / edit"
                            aria-label="Open / edit"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "4px 8px" }}
                            onClick={() => setEditingId(x.id)}>
                            <Icon name="pen" size={13} />
                          </button>
                          <button
                            title="Download PDF"
                            aria-label="Download PDF"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "4px 8px" }}
                            onClick={() => downloadQuotationFile(x, "pdf")}>
                            <Icon name="fileText" size={13} />
                          </button>
                          <button
                            title="Download Word"
                            aria-label="Download Word"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "4px 8px" }}
                            onClick={() => downloadQuotationFile(x, "word")}>
                            <Icon name="arrowDown" size={13} />
                          </button>
                          {canWrite && x.status === "accepted" && !x.convertedToProjectId && !x.convertedToAmcId && (
                            <>
                              <button
                                title="Convert to Project"
                                aria-label="Convert to Project"
                                className="btn btn-primary btn-sm"
                                style={{ padding: "4px 8px" }}
                                onClick={() => setConvertTarget({ id: x.id, target: "project" })}>
                                <Icon name="briefcase" size={13} />
                              </button>
                              <button
                                title="Convert to AMC"
                                aria-label="Convert to AMC"
                                className="btn btn-primary btn-sm"
                                style={{ padding: "4px 8px" }}
                                onClick={() => setConvertTarget({ id: x.id, target: "amc" })}>
                                <Icon name="refresh" size={13} />
                              </button>
                            </>
                          )}
                          {x.convertedToProjectId && (
                            <button
                              title="View linked project"
                              aria-label="View linked project"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: "4px 8px" }}
                              onClick={() => openProject(x.convertedToProjectId!)}>
                              <Icon name="externalLink" size={13} />
                            </button>
                          )}
                          {x.convertedToAmcId && (
                            <button
                              title="View linked AMC"
                              aria-label="View linked AMC"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: "4px 8px" }}
                              onClick={() => openAmc(x.convertedToAmcId!)}>
                              <Icon name="externalLink" size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {convertTarget && (
        <div className="modal-back" onClick={() => setConvertTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: 24 }}>
              <div style={{ font: "var(--t-h3)", marginBottom: 8 }}>
                Convert to {convertTarget.target === "project" ? "Project" : "AMC contract"}?
              </div>
              <div style={{ font: "var(--t-body)", color: "var(--ink-mute)", marginBottom: 20 }}>
                A new {convertTarget.target === "project" ? "project" : "AMC"} will be created using this
                quotation's title, customer, and value. The quotation will be marked as Converted and
                you'll be taken to the new record.
              </div>
              <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setConvertTarget(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={onConvert}>
                  <Icon name="check" size={14} /> Confirm convert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingId && (
        <QuotationEditor
          quotationId={editingId}
          canEdit={canWrite}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

/* ─── Migration 0035 — Quotation editor modal ──────────────
 *
 * Opens when the user clicks "Open" on a row. Six editable fields
 * (Title, Customer-readonly, Value, Valid-until, Scope, Terms,
 * Notes). The auto-generate hook on createProject seeds placeholder
 * text for Scope and Terms — Sales replaces them here.
 *
 * Header carries the Download PDF / Download Word buttons. PDF goes
 * via the browser print dialog (Save as PDF); Word downloads a .doc
 * file with Word-friendly HTML — no PDF/DOCX library is in the bundle.
 * ─────────────────────────────────────────────────────────── */
function QuotationEditor({
  quotationId, canEdit, onClose,
}: {
  quotationId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const q = db.QUOTATIONS[quotationId];
  // Initialize from mirror; subsequent edits live in form state.
  const [title, setTitle]       = useState(q?.title ?? "");
  const [value, setValue]       = useState<string>(String(q?.valueAed ?? 0));
  const [validUntil, setValid]  = useState(q?.validUntil ?? "");
  const [desc, setDesc]         = useState(q?.description ?? "");
  const [terms, setTerms]       = useState(q?.terms ?? "");
  const [notes, setNotes]       = useState(q?.notes ?? "");
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  if (!q) {
    return (
      <div className="modal-back" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}
             style={{ maxWidth: 480, padding: 24 }}>
          <div style={{ font: "var(--t-h3)", marginBottom: 8 }}>Quotation not found</div>
          <div style={{ font: "var(--t-body)", color: "var(--ink-mute)", marginBottom: 16 }}>
            It may have been deleted or you may not have permission to view it.
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const customer = q.customerId ? db.cust(q.customerId)?.name ?? "—" : "—";

  const onSave = async () => {
    setErr(null);
    const parsedValue = Number(value);
    if (!title.trim())          { setErr("Title is required."); return; }
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      setErr("Value must be a non-negative number.");
      return;
    }
    setBusy(true);
    const res = await updateQuotation(quotationId, {
      title,
      value_aed:   parsedValue,
      valid_until: validUntil || null,
      description: desc,
      terms,
      notes,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${q.code} saved`);
    bumpData();
  };

  const onDownload = (format: "pdf" | "word") => {
    // Pull the freshest version (mirror was just updated by onSave).
    const current = db.QUOTATIONS[quotationId] ?? q;
    downloadQuotationFile(current, format);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 720, width: "calc(100vw - 32px)", padding: 0 }}
      >
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Quotation · {q.code}
            </div>
            <div className="truncate" style={{ font: "var(--t-h3)" }}>{title || "(untitled)"}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onDownload("pdf")}>
            <Icon name="fileText" size={13} /> PDF
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDownload("word")}>
            <Icon name="fileText" size={13} /> Word
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div style={{ padding: 24, maxHeight: "70vh", overflowY: "auto" }}>
          <div style={{
            display: "grid", gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            marginBottom: 16,
          }}>
            <FormField label="Customer">
              <div style={{ font: "var(--t-body-md)", padding: "8px 0" }}>{customer}</div>
            </FormField>
            <FormField label="Value (AED)">
              <input className="input input-md" type="number" min="0" step="0.01"
                     value={value} disabled={!canEdit || busy}
                     onChange={e => setValue(e.target.value)} />
            </FormField>
            <FormField label="Valid until">
              <input className="input input-md" type="date"
                     value={validUntil} disabled={!canEdit || busy}
                     onChange={e => setValid(e.target.value)} />
            </FormField>
          </div>

          <FormField label="Title">
            <input className="input input-md" value={title}
                   disabled={!canEdit || busy}
                   onChange={e => setTitle(e.target.value)} />
          </FormField>

          <div style={{ marginTop: 16 }}>
            <FormField label="Scope of work">
              <textarea
                className="input"
                value={desc}
                disabled={!canEdit || busy}
                rows={8}
                placeholder="Describe the scope of work…"
                onChange={e => setDesc(e.target.value)}
                style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            </FormField>
          </div>

          <div style={{ marginTop: 16 }}>
            <FormField label="Terms">
              <textarea
                className="input"
                value={terms}
                disabled={!canEdit || busy}
                rows={6}
                placeholder="Payment terms…"
                onChange={e => setTerms(e.target.value)}
                style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            </FormField>
          </div>

          <div style={{ marginTop: 16 }}>
            <FormField label="Notes (optional)">
              <textarea
                className="input"
                value={notes}
                disabled={!canEdit || busy}
                rows={3}
                placeholder="Internal notes or extra conditions…"
                onChange={e => setNotes(e.target.value)}
                style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            </FormField>
          </div>

          {err && (
            <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginTop: 12 }}>
              {err}
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 24px",
          borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Close</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={onSave} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
