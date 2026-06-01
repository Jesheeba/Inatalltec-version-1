// ============================================================
// Project phase reference — labels, tooltips, ordered list,
// color tokens, and permission/navigation helpers.
//
// The DB enum lives in migration 0020 (project_phase). Display labels
// are intentionally in TypeScript so renaming "T&C" → "Testing &
// Commissioning" doesn't need a DDL change.
//
// Color palette mirrors the existing badge/dot tokens in components/
// shared.tsx so phase pills sit consistently next to status pills
// across the app.
// ============================================================

import type { ProjectPhase, Role } from "./types";

// Canonical phase order — drives the stepper layout and the
// "Move to Next Phase" advance logic. Don't reorder without updating
// the migration's enum too.
export const PROJECT_PHASES: readonly ProjectPhase[] = [
  "design",
  "material_supply",
  "installation",
  "tc",
  "dlp",
  "closed",
] as const;

export const PROJECT_PHASE_LABEL: Record<ProjectPhase, string> = {
  design:          "Design",
  material_supply: "Material Supply",
  installation:    "Installation",
  tc:              "T&C",
  dlp:             "DLP",
  closed:          "Closed",
};

// Help text — surfaced in tooltips, the advance-phase confirm modal,
// and the stepper hover state. Kept short so they fit a tooltip.
export const PROJECT_PHASE_TOOLTIP: Record<ProjectPhase, string> = {
  design:          "Engineering team draws plans (drawings, BOQ, methodology).",
  material_supply: "Procure and deliver equipment to site.",
  installation:    "Physical work — mount equipment, run cables, configure.",
  tc:              "Test, train customer, sign handover.",
  dlp:             "12-month warranty period after handover.",
  closed:          "Final payment released, project archived.",
};

// Phase color tokens. Each phase has:
//   • bg  — pill background (badge-* class on tinted backgrounds)
//   • fg  — pill text/icon color
//   • dot — accent dot / left-border / calendar indicator
//   • hex — flat hex for the GrowthPlan calendar (which paints
//           inline; CSS vars don't resolve in event chip styles).
//
// Tokens are the same palette used by StatusBadge in shared.tsx so
// the phase pill visually rhymes with the existing status pill.
export interface PhaseColor {
  bg:  string;
  fg:  string;
  dot: string;
  hex: string;
}

export const PROJECT_PHASE_COLOR: Record<ProjectPhase, PhaseColor> = {
  design: {
    bg:  "var(--info-100)", fg: "var(--info-700)",
    dot: "var(--info-500)", hex: "#3B82F6", // blue
  },
  material_supply: {
    bg:  "var(--sec-100)", fg: "var(--sec-700)",
    dot: "var(--sec-500)", hex: "#A78BFA", // violet/purple
  },
  installation: {
    bg:  "var(--warn-100)", fg: "var(--warn-700)",
    dot: "var(--warn-500)", hex: "#F59E0B", // amber/orange
  },
  tc: {
    bg:  "var(--acc-100)", fg: "var(--acc-700)",
    dot: "var(--acc-500)", hex: "#EAB308", // yellow
  },
  dlp: {
    bg:  "var(--suc-100)", fg: "var(--suc-700)",
    dot: "var(--suc-500)", hex: "#10B981", // green
  },
  closed: {
    bg:  "var(--bg-muted)", fg: "var(--ink-mute)",
    dot: "var(--ink-quiet)", hex: "#9CA3AF", // gray
  },
};

// ── Lookup helpers ────────────────────────────────────────

/** 0..5 — position of a phase in the canonical order. -1 if unknown. */
export function phaseIndex(p: ProjectPhase | null | undefined): number {
  if (!p) return -1;
  return PROJECT_PHASES.indexOf(p);
}

/**
 * Next phase in the sequence, or null if already at the last phase
 * or NULL (unset). Used by the "Move to Next Phase" button.
 */
export function nextPhase(p: ProjectPhase | null | undefined): ProjectPhase | null {
  const i = phaseIndex(p);
  if (i < 0 || i >= PROJECT_PHASES.length - 1) return null;
  return PROJECT_PHASES[i + 1];
}

/** Previous phase, mostly for "undo" prompts. */
export function prevPhase(p: ProjectPhase | null | undefined): ProjectPhase | null {
  const i = phaseIndex(p);
  if (i <= 0) return null;
  return PROJECT_PHASES[i - 1];
}

/**
 * Role gate for phase mutations. Mirrors the projects_write RLS policy
 * from migration 0016 (md/admin/manager). UI uses this to hide the
 * "Move to Next Phase" button; the DB still rejects unauthorised
 * writes if the gate is bypassed.
 */
export function canChangeProjectPhase(role: Role): boolean {
  return role === "md" || role === "admin" || role === "manager";
}

/**
 * Validate a candidate phase string. Frontend code paths that read
 * from URL params or external APIs use this before passing to typed
 * helpers.
 */
export function isProjectPhase(s: string | null | undefined): s is ProjectPhase {
  return !!s && (PROJECT_PHASES as readonly string[]).includes(s);
}
