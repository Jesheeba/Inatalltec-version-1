"use client";
// ============================================================
// Job Cost Analysis (JCA) — Design phase activity 3 (migration 0043).
//
// Two exports:
//   • JcaSummaryCard — the status card on the project detail page.
//   • JcaPage — the full budget form at /projects/[id]/jca.
//
// INTERNAL budget — no client cycle, no revisions. Five numeric inputs;
// subtotal / profit / total are computed live in the UI (never stored).
// Every Save appends a permanent history snapshot (audit trail).
//
// Roles: VIEW_JCA can view (adds Accounts, read-only); MANAGE_JCA can
// edit. Sales / Lead Tech / Workers have no access. Once the project
// advances past Design the JCA is read-only.
// ============================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { phaseIndex } from "@/lib/phases";
import { saveJca } from "@/lib/create";
import { formatLongDateTime } from "@/lib/dates";
import type { ProjectJca, ProjectJcaHistory } from "@/lib/types";
import { CardHead, EmptyState, PageHeader } from "../../shared";

// The five editable fields, in display order.
const FIELDS = [
  { key: "materialsBudget",     label: "Materials Budget",     hint: "Cameras, recorders, cables, connectors — total supplier cost." },
  { key: "manpowerBudget",      label: "Manpower Budget",      hint: "Workers + lead techs — estimated hours × labour rate." },
  { key: "subcontractorBudget", label: "Subcontractor Budget", hint: "Third-party contractors used on this project." },
  { key: "otherCharges",        label: "Other Charges",        hint: "Permits, taxes, insurance, transport — miscellaneous." },
] as const;
type MoneyKey = typeof FIELDS[number]["key"];
type FormState = Record<MoneyKey, string> & { profitMarginPct: string };

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function formStateFrom(jca: ProjectJca | null): FormState {
  return {
    materialsBudget:     jca ? String(jca.materialsBudget) : "",
    manpowerBudget:      jca ? String(jca.manpowerBudget) : "",
    subcontractorBudget: jca ? String(jca.subcontractorBudget) : "",
    otherCharges:        jca ? String(jca.otherCharges) : "",
    profitMarginPct:     jca ? String(jca.profitMarginPct) : "",
  };
}

/* ─── Summary card (project detail page) ─────────────────── */
export function JcaSummaryCard({ projectId }: { projectId: string }) {
  const { role, dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  if (!can(role, "VIEW_JCA")) return null;

  const jca = db.jcaForProject(projectId);
  const badge = jca ? { label: "Created", cls: "badge-success" } : { label: "Not created", cls: "badge-outline" };

  return (
    <section className="card card-pad card-hover" style={{ marginBottom: 16, cursor: "pointer" }}
      onClick={() => router.push(`/projects/${projectId}/jca`)}>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="row gap-3" style={{ alignItems: "center", minWidth: 0 }}>
          <Icon name="pieChart" size={18} style={{ color: "var(--ink-mute)" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "var(--t-body-md)", fontWeight: 600 }}>Job Cost Analysis</div>
            <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              Internal budget &amp; profit plan
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
export function JcaPage({ projectId }: { projectId: string }) {
  const { role, me, fireToast, bumpData, dataVersion, fmtMoney } = useApp();
  void dataVersion;
  const router = useRouter();

  if (!can(role, "VIEW_JCA")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Design" title="Job Cost Analysis" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="The JCA is an internal budget — visible to Operations Manager / Admin / MD / Accounts only." />
      </div>
    );
  }

  const project = db.proj(projectId);
  const jca = db.jcaForProject(projectId);
  const history = jca ? db.jcaHistoryForJca(jca.id) : [];

  const phaseLocked = !!project && phaseIndex(project.currentPhase) > phaseIndex("design");
  const canManage = can(role, "MANAGE_JCA") && !phaseLocked;

  const [f, setF] = useState<FormState>(() => formStateFrom(jca));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Live calculations.
  const subtotal = num(f.materialsBudget) + num(f.manpowerBudget) + num(f.subcontractorBudget) + num(f.otherCharges);
  const profit = subtotal * (num(f.profitMarginPct) / 100);
  const total = subtotal + profit;

  const dirty = useMemo(() => {
    if (!jca) return true;
    return num(f.materialsBudget) !== jca.materialsBudget
      || num(f.manpowerBudget) !== jca.manpowerBudget
      || num(f.subcontractorBudget) !== jca.subcontractorBudget
      || num(f.otherCharges) !== jca.otherCharges
      || num(f.profitMarginPct) !== jca.profitMarginPct;
  }, [f, jca]);

  const save = async () => {
    setErr(null); setBusy(true);
    const res = await saveJca(projectId, {
      materials_budget: num(f.materialsBudget),
      manpower_budget: num(f.manpowerBudget),
      subcontractor_budget: num(f.subcontractorBudget),
      other_charges: num(f.otherCharges),
      profit_margin_pct: num(f.profitMarginPct),
    }, note || null, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Something went wrong"); return; }
    setNote("");
    bumpData();
    fireToast(jca ? "JCA updated" : "JCA created");
  };

  const setField = (key: keyof FormState, v: string) => setF(prev => ({ ...prev, [key]: v }));

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => router.push(`/projects/${projectId}`)}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> {project ? project.code + " · " + project.name : "Back to project"}
        </a>
      </div>

      <PageHeader eyebrow="Design · Activity 3" title="Job Cost Analysis"
        sub="Internal budget — the client never sees this"
        right={<span className={"badge " + (jca ? "badge-success" : "badge-outline")} style={{ fontWeight: 600 }}>
          {jca ? "Created" : "Not created"}
        </span>} />

      {phaseLocked && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="lock" size={16} /></div>
          <div className="text"><div className="h">Design phase locked</div>
            <div className="d">This project has moved past Design — the JCA is read-only.</div></div>
        </div>
      )}
      {!canManage && !phaseLocked && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="eye" size={16} /></div>
          <div className="text"><div className="h">View only</div>
            <div className="d">You can review this budget but only the Operations Manager / Admin / MD can edit it.</div></div>
        </div>
      )}
      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {/* Budget form */}
      <section className="card card-pad">
        <CardHead title="Budget" sub="Enter the cost categories and target margin — totals update live" />

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {FIELDS.map(field => (
            <div key={field.key} className="col" style={{ gap: 4 }}>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{field.label}</label>
              <input className="input numeric" type="number" min={0} step="any" inputMode="decimal"
                disabled={!canManage} value={f[field.key]}
                onChange={e => setField(field.key, e.target.value)} placeholder="0" />
              <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{field.hint}</div>
            </div>
          ))}
          <div className="col" style={{ gap: 4 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Profit Margin (%)</label>
            <input className="input numeric" type="number" min={0} max={100} step="any" inputMode="decimal"
              disabled={!canManage} value={f.profitMarginPct}
              onChange={e => setField("profitMarginPct", e.target.value)} placeholder="0" />
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>Typically 15–25% in ELV contracting.</div>
          </div>
        </div>

        {/* Live totals */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 18 }}>
          <TotalTile label="Subtotal" value={fmtMoney(subtotal)} sub="Sum of the four cost categories" />
          <TotalTile label="Profit" value={fmtMoney(profit)} sub={`${num(f.profitMarginPct)}% of subtotal`} />
          <TotalTile label="Total Budget" value={fmtMoney(total)} sub="Subtotal + profit" accent />
        </div>

        {canManage && (
          <div className="col gap-2" style={{ marginTop: 18 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>Reason for this change (optional)</label>
            <textarea className="textarea" rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Camera prices increased after supplier quote update" />
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>
                <Icon name="check" size={14} /> {jca ? "Save changes" : "Create JCA"}
              </button>
              {jca && dirty && (
                <button className="btn btn-ghost" disabled={busy} onClick={() => { setF(formStateFrom(jca)); setNote(""); }}>
                  Discard changes
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Edit history */}
      {jca && (
        <section className="card card-pad" style={{ marginTop: 20 }}>
          <CardHead title={`Edit history · ${history.length}`} sub="Permanent audit trail — every change with actor and timestamp" />
          {history.length === 0 ? (
            <EmptyState icon="clock" title="No history yet" />
          ) : (
            <div className="col gap-2">
              {history.map((h, i) => (
                <HistoryEntry key={h.id} row={h} prev={i > 0 ? history[i - 1] : null} fmtMoney={fmtMoney} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ─── Total tile ─────────────────────────────────────────── */
function TotalTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      padding: 14, borderRadius: "var(--r-md)",
      border: "1px solid " + (accent ? "var(--pri-300)" : "var(--border)"),
      background: accent ? "var(--pri-50)" : "var(--bg-muted)",
    }}>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700, marginTop: 4, overflowWrap: "anywhere" }}>{value}</div>
      {sub && <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ─── History entry (diffs against the previous snapshot) ── */
const HIST_FIELDS: { key: keyof ProjectJcaHistory; label: string; pct?: boolean }[] = [
  { key: "materialsBudget", label: "Materials Budget" },
  { key: "manpowerBudget", label: "Manpower Budget" },
  { key: "subcontractorBudget", label: "Subcontractor Budget" },
  { key: "otherCharges", label: "Other Charges" },
  { key: "profitMarginPct", label: "Profit Margin", pct: true },
];

function HistoryEntry({ row, prev, fmtMoney }: {
  row: ProjectJcaHistory; prev: ProjectJcaHistory | null; fmtMoney: (n: number) => string;
}) {
  const actor = row.editedBy ? db.user(row.editedBy) : null;
  const when = (() => { const d = new Date(row.editedAt); return Number.isNaN(d.getTime()) ? row.editedAt : formatLongDateTime(d); })();
  const fmt = (v: number, pct?: boolean) => pct ? `${v}%` : fmtMoney(v);

  const changes = prev
    ? HIST_FIELDS.filter(fl => row[fl.key] !== prev[fl.key])
        .map(fl => `${fl.label}: ${fmt(prev[fl.key] as number, fl.pct)} → ${fmt(row[fl.key] as number, fl.pct)}`)
    : null;

  return (
    <div style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
      <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <Icon name="clock" size={13} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
        <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{actor ? actor.name : "Unknown user"}</span>
        <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginLeft: "auto" }}>{when}</span>
      </div>

      {changes === null ? (
        <div style={{ font: "var(--t-small)", marginTop: 6 }}>
          <strong>Initial JCA created.</strong>{" "}
          <span style={{ color: "var(--ink-mute)" }}>
            {HIST_FIELDS.map(fl => `${fl.label} ${fmt(row[fl.key] as number, fl.pct)}`).join(" · ")}
          </span>
        </div>
      ) : changes.length === 0 ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 6 }}>Saved with no value changes.</div>
      ) : (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, font: "var(--t-small)" }}>
          {changes.map((c, i) => <li key={i} style={{ marginBottom: 2 }}>{c}</li>)}
        </ul>
      )}

      {row.note && (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 6 }}>
          <strong>Reason:</strong> {row.note}
        </div>
      )}
    </div>
  );
}
