"use client";
// ============================================================
// Project phase UI primitives.
//
// One file, four exports — they share the same color/label tables
// from lib/phases.ts and are visually related, so co-locating keeps
// them easy to keep in sync.
//
//   • <PhaseBadge>            small pill for cards, calendars, lists
//   • <PhaseStepper>          horizontal 6-step lane for detail pages
//   • <AdvancePhaseButton>    "Move to Next Phase" CTA + confirm modal
//   • <PhaseHistoryTimeline>  vertical audit feed for the detail page
//
// All four are visual only — none of them write to the DB on their own.
// Mutations go through lib/create.ts `advanceProjectPhase`, which is
// invoked by AdvancePhaseButton's confirm handler.
//
// Only Main Contractor projects have phases (the column lives on
// `projects`, and AMC/Repair live in separate tables). These components
// assume the caller already gated by entity type.
// ============================================================

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { advanceProjectPhase } from "@/lib/create";
import {
  PROJECT_PHASES, PROJECT_PHASE_COLOR, PROJECT_PHASE_LABEL,
  PROJECT_PHASE_TOOLTIP,
  canChangeProjectPhase, nextPhase, phaseIndex,
} from "@/lib/phases";
import type { ProjectPhase, ProjectPhaseHistory } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatLongDateTime } from "@/lib/dates";

// ── PhaseBadge ────────────────────────────────────────────

/**
 * Small inline pill. Used on project cards (Active Projects widget),
 * the GrowthPlan event chips' tooltip, and anywhere "what phase is
 * this project in" needs to be glanceable.
 *
 * Renders nothing when phase is null AND `showUnset` is false (the
 * default) — callers that want "No phase set" copy should pass
 * showUnset to opt in.
 */
export function PhaseBadge({ phase, size = "md", showUnset = false }: {
  phase: ProjectPhase | null | undefined;
  size?: "sm" | "md";
  showUnset?: boolean;
}) {
  if (!phase) {
    if (!showUnset) return null;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        borderRadius: 999,
        background: "var(--bg-muted)",
        color: "var(--ink-mute)",
        font: size === "sm" ? "var(--t-micro)" : "var(--t-small)",
        fontWeight: 500,
        border: "1px dashed var(--border)",
      }}>
        <Icon name="clock" size={size === "sm" ? 10 : 12} />
        No phase set
      </span>
    );
  }
  const c = PROJECT_PHASE_COLOR[phase];
  return (
    <span title={PROJECT_PHASE_TOOLTIP[phase]}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        font: size === "sm" ? "var(--t-micro)" : "var(--t-small)",
        fontWeight: 600,
      }}>
      <span style={{
        width: size === "sm" ? 6 : 8,
        height: size === "sm" ? 6 : 8,
        borderRadius: 999,
        background: c.dot,
        flexShrink: 0,
      }} />
      {PROJECT_PHASE_LABEL[phase]}
    </span>
  );
}

// ── PhaseStepper ──────────────────────────────────────────

/**
 * Horizontal 6-step lane for the project detail page. Each segment
 * shows the phase label + completion state; the current phase is
 * highlighted in its color; completed phases get a checkmark; future
 * phases dim down. Wraps cleanly on narrow viewports.
 */
export function PhaseStepper({ phase }: { phase: ProjectPhase | null | undefined }) {
  const currentIdx = phaseIndex(phase);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${PROJECT_PHASES.length}, 1fr)`,
      gap: 4,
    }}>
      {PROJECT_PHASES.map((p, i) => {
        const c = PROJECT_PHASE_COLOR[p];
        const isCurrent = i === currentIdx;
        const isDone    = currentIdx >= 0 && i < currentIdx;
        const isFuture  = currentIdx < 0 || i > currentIdx;
        const bg = isCurrent ? c.bg : isDone ? "var(--suc-50)" : "var(--bg-muted)";
        const fg = isCurrent ? c.fg : isDone ? "var(--suc-700)" : "var(--ink-quiet)";
        const dotBg = isCurrent ? c.dot : isDone ? "var(--suc-500)" : "var(--border-strong)";
        return (
          <div key={p} title={PROJECT_PHASE_TOOLTIP[p]}
            style={{
              padding: "8px 8px",
              borderRadius: "var(--r-sm)",
              background: bg,
              color: fg,
              border: isCurrent ? `1px solid ${c.dot}` : "1px solid transparent",
              opacity: isFuture ? 0.65 : 1,
              display: "flex", flexDirection: "column", gap: 4,
              minWidth: 0,
            }}>
            <div className="row gap-2" style={{ alignItems: "center", minWidth: 0 }}>
              <span style={{
                width: 16, height: 16, borderRadius: 999,
                background: dotBg, color: "white", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                font: "600 10px/1",
              }}>
                {isDone ? <Icon name="check" size={10} strokeWidth={3} /> : i + 1}
              </span>
              <span className="truncate" style={{
                font: "var(--t-small)",
                fontWeight: isCurrent ? 700 : 500,
              }}>
                {PROJECT_PHASE_LABEL[p]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AdvancePhaseButton ────────────────────────────────────

/**
 * "Move to Next Phase" CTA. Renders the primary button, opens a
 * confirm modal on click, and calls advanceProjectPhase on submit.
 * Hides itself entirely when the user lacks permission OR the project
 * is already at the last phase.
 *
 * The confirm modal accepts an optional note that gets attached to the
 * resulting project_phase_history row.
 */
export function AdvancePhaseButton({ projectId, currentPhase, onAdvanced }: {
  projectId: string;
  currentPhase: ProjectPhase | null | undefined;
  onAdvanced?: () => void;
}) {
  const { role, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!canChangeProjectPhase(role)) return null;

  // Two CTA shapes: "Set phase to Design" if unset, "Move to <next>" otherwise.
  const target: ProjectPhase | null = currentPhase ? nextPhase(currentPhase) : "design";
  if (!target) {
    // At final phase already — render a subtle done indicator instead of
    // hiding entirely, so it's clear the project has reached the end.
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 12px", borderRadius: "var(--r-md)",
        background: "var(--bg-muted)", color: "var(--ink-mute)",
        font: "var(--t-small)", fontWeight: 500,
      }}>
        <Icon name="check" size={13} /> Project closed
      </span>
    );
  }

  // Slice D — design completion gate.
  // The Design → Material Supply transition requires all three Design
  // activities to be in their done state. The DB trigger in migration
  // 0044 enforces the same rule server-side; this UI check just stops
  // the user from getting a confusing error back from the DB.
  const isDesignExit = currentPhase === "design" && target === "material_supply";
  const readiness = isDesignExit ? db.designReadiness(projectId) : null;
  const gateBlocked = readiness != null && !readiness.isComplete;
  const gateTooltip = gateBlocked
    ? "Complete the Design activities first:\n• " + readiness!.missing.join("\n• ")
    : undefined;

  const close = () => { if (!busy) { setOpen(false); setNote(""); setErr(null); } };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    const res = await advanceProjectPhase(projectId, target, note);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(currentPhase
      ? `Phase → ${PROJECT_PHASE_LABEL[target]}`
      : `Phase set to ${PROJECT_PHASE_LABEL[target]}`);
    bumpData();
    setOpen(false); setNote(""); setErr(null);
    onAdvanced?.();
  };

  const label = currentPhase ? `Move to ${PROJECT_PHASE_LABEL[target]}` : "Set Phase";

  return (
    <>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => { if (!gateBlocked) setOpen(true); }}
        disabled={gateBlocked}
        title={gateTooltip}
        aria-disabled={gateBlocked}>
        <Icon name="arrowRight" size={13} /> {label}
      </button>
      {open && (
        <div role="dialog" aria-modal="true"
          onClick={close}
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.42)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, zIndex: 1000,
          }}>
          <form onClick={e => e.stopPropagation()} onSubmit={submit}
            style={{
              background: "var(--bg-elev)", borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: 480,
              padding: 20, display: "flex", flexDirection: "column", gap: 14,
            }}>
            <div>
              <div style={{ font: "var(--t-h3)" }}>{label}</div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
                {currentPhase ? (
                  <>
                    Moving from <strong>{PROJECT_PHASE_LABEL[currentPhase]}</strong> to{" "}
                    <strong>{PROJECT_PHASE_LABEL[target]}</strong>.
                  </>
                ) : (
                  <>Setting the initial phase to <strong>{PROJECT_PHASE_LABEL[target]}</strong>.</>
                )}
              </div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 8 }}>
                {PROJECT_PHASE_TOOLTIP[target]}
              </div>
            </div>

            {isDesignExit && (
              <div style={{
                padding: "12px 14px", background: "var(--warn-50)",
                color: "var(--warn-700)", borderRadius: "var(--r-md)",
                border: "1px solid var(--warn-100)",
                font: "var(--t-small)", display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <Icon name="lock" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    Design activities will be locked
                  </div>
                  <div>
                    Once you advance past Design, the Material Submittal, Shop
                    Drawing, and JCA pages become permanently read-only.
                    Existing data and history stay visible, but no further
                    revisions, uploads, or edits will be allowed.
                  </div>
                </div>
              </div>
            )}

            <div>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                              textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Note (optional)
              </label>
              <textarea className="textarea" rows={3}
                value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. BOQ signed off by client; site mobilisation kickoff Monday"
                style={{ marginTop: 6 }} />
            </div>

            {err && (
              <div style={{
                padding: "10px 12px", background: "var(--dan-50)",
                color: "var(--dan-700)", borderRadius: "var(--r-md)",
                font: "var(--t-small)", display: "flex", alignItems: "center", gap: 8,
              }}>
                <Icon name="alertCircle" size={14} /> {err}
              </div>
            )}

            <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy
                  ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                  : <>{isDesignExit ? "Confirm & lock" : "Confirm"} <Icon name="arrowRight" size={13} /></>}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/**
 * DesignGateHint
 *
 * Renders a small inline panel under the PhaseTracker explaining
 * what's still incomplete when the project sits at Design but isn't
 * yet ready to advance. Hidden when:
 *   • currentPhase is not 'design' (no gate to display)
 *   • all three Design activities are already complete
 *
 * Intentionally permission-agnostic: every viewer should see why the
 * project is stuck. The hint contains no actionable controls — it's
 * pure messaging.
 */
export function DesignGateHint({ projectId, currentPhase }: {
  projectId: string;
  currentPhase: ProjectPhase | null | undefined;
}) {
  const { dataVersion } = useApp();
  void dataVersion;
  if (currentPhase !== "design") return null;
  const readiness = db.designReadiness(projectId);
  if (readiness.isComplete) return null;

  return (
    <div style={{
      marginTop: 12, padding: "10px 14px",
      background: "var(--warn-50)", color: "var(--warn-700)",
      borderRadius: "var(--r-md)", border: "1px solid var(--warn-100)",
      display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ font: "var(--t-small)", flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Complete the Design activities to advance
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          {readiness.missing.map(m => <li key={m}>{m}</li>)}
        </ul>
      </div>
    </div>
  );
}

// ── PhaseHistoryTimeline ──────────────────────────────────

/**
 * Lazy-fetches project_phase_history rows for one project and renders
 * them oldest→newest as a vertical timeline. reloadKey lets the
 * parent re-fetch after a phase change.
 */
export function PhaseHistoryTimeline({ projectId, reloadKey }: {
  projectId: string;
  reloadKey: number;
}) {
  const [rows, setRows] = useState<ProjectPhaseHistory[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      const { data, error } = await supabaseBrowser()
        .from("project_phase_history")
        .select("id, project_id, from_phase, to_phase, changed_by, changed_at, note")
        .eq("project_id", projectId)
        .order("changed_at", { ascending: true });
      if (cancelled) return;
      if (error) { setErr(error.message); setRows([]); return; }
      setRows(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
        id:         r.id as string,
        projectId:  r.project_id as string,
        fromPhase:  (r.from_phase as ProjectPhaseHistory["fromPhase"]) ?? null,
        toPhase:    r.to_phase as ProjectPhaseHistory["toPhase"],
        changedBy:  (r.changed_by as string | null) ?? null,
        changedAt:  r.changed_at as string,
        note:       (r.note as string | null) ?? null,
      })));
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  if (rows === null) {
    return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>;
  }
  if (err) {
    return <div style={{ font: "var(--t-small)", color: "var(--dan-700)", padding: 8 }}>Couldn't load phase history: {err}</div>;
  }
  if (rows.length === 0) {
    return (
      <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 12, textAlign: "center" }}>
        No phase changes yet. Use <strong>Move to Next Phase</strong> above to record one.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", padding: "8px 0" }}>
      <div style={{
        position: "absolute", left: 17, top: 18, bottom: 18,
        width: 2, background: "var(--divider)",
      }} />
      <div className="col" style={{ gap: 10 }}>
        {rows.map(r => <TimelineEntry key={r.id} row={r} />)}
      </div>
    </div>
  );
}

function TimelineEntry({ row }: { row: ProjectPhaseHistory }) {
  const toC = PROJECT_PHASE_COLOR[row.toPhase];
  const actor = row.changedBy ? db.user(row.changedBy) : null;
  return (
    <div className="row gap-3" style={{ alignItems: "flex-start" }}>
      <span style={{
        width: 36, height: 36, borderRadius: "50%",
        background: toC.dot, color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, zIndex: 1,
        border: "3px solid var(--bg-elev)",
      }}>
        <Icon name="arrowRight" size={14} />
      </span>
      <div style={{
        flex: 1, minWidth: 0,
        padding: 12, borderRadius: "var(--r-md)",
        background: "var(--bg-muted)", border: "1px solid var(--border)",
      }}>
        <div className="row gap-2" style={{ flexWrap: "wrap", alignItems: "center" }}>
          {row.fromPhase ? (
            <>
              <PhaseBadge phase={row.fromPhase} size="sm" />
              <Icon name="arrowRight" size={12} style={{ color: "var(--ink-quiet)" }} />
              <PhaseBadge phase={row.toPhase} size="sm" />
            </>
          ) : (
            <>
              <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Set to</span>
              <PhaseBadge phase={row.toPhase} size="sm" />
            </>
          )}
        </div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 6 }}>
          {actor?.name ?? "System"} · {formatPhaseDate(row.changedAt)}
        </div>
        {row.note && (
          <div style={{
            marginTop: 8, padding: "6px 10px",
            background: "var(--bg-elev)", borderRadius: "var(--r-sm)",
            font: "var(--t-small)", color: "var(--ink)",
            border: "1px solid var(--border)",
          }}>
            {row.note}
          </div>
        )}
      </div>
    </div>
  );
}

function formatPhaseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatLongDateTime(d);
}
