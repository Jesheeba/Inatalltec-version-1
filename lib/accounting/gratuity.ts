// ============================================================
// Accountant module · Phase 4 (Slice 4E) — UAE end-of-service gratuity.
//
// Pure / dependency-free so it is testable and reusable by the UI.
//
// ─────────────────────────────────────────────────────────────
// ⚠️  UAE-LEGAL CALCULATION — these are the DEFAULT statutory rules under
// Federal Decree-Law No. 33 of 2021 (unlimited contracts). They are encoded
// as the OVERRIDABLE constants in GRATUITY_RULES and surfaced in the UI so a
// client can confirm or adjust them. Key assumptions:
//
//   • < 1 year of continuous service → NO gratuity.
//   • 1–5 years   → 21 days of BASIC wage per year of service.
//   • beyond 5 yr → 30 days of BASIC wage per year for the years above 5.
//   • Daily wage = BASIC salary ÷ 30 (allowances excluded — UAE gratuity is
//     on basic only).
//   • Total gratuity is capped at 2 years' wage. "Wage" here is taken as
//     2 × 12 × BASIC; whether the cap should use TOTAL pay is a legal nuance
//     to confirm.
//   • Probation (first 6 months) → no entitlement.
//   • Resignation and termination are treated the SAME (the pre-2021 limited-
//     contract resignation reductions are NOT applied). Confirm if any legacy
//     limited-term contracts need the old 1/3–2/3 scale.
//   • Service length uses calendar days ÷ 365.25. Unpaid-leave exclusions are
//     NOT deducted (the app does not track unpaid-leave totals yet).
//
// This module does NOT persist anything — it computes a figure the accountant
// reviews. Nothing here is a substitute for legal/payroll sign-off.
// ─────────────────────────────────────────────────────────────

export const GRATUITY_RULES = {
  minServiceYears: 1,      // below this → nothing
  probationMonths: 6,      // no entitlement during probation
  daysPerYearFirst5: 21,   // days of basic per year, years 1–5
  daysPerYearAfter5: 30,   // days of basic per year, years 6+
  thresholdYears: 5,       // boundary between the two rates
  dailyWageDivisor: 30,    // daily basic = basic / 30
  capYearsOfWage: 2,       // total capped at this many years' basic
  daysPerYear: 365.25,     // service-length basis
} as const;

export type SeparationReason = "resigned" | "terminated" | "other";

export interface GratuityInput {
  basicSalary: number;
  dateOfJoining: string | null;   // YYYY-MM-DD
  lastDay: string | null;         // YYYY-MM-DD (separation date)
  reason?: SeparationReason;
}

export interface GratuityResult {
  eligible: boolean;
  serviceYears: number;     // fractional
  serviceLabel: string;     // "3 yr 2 mo"
  dailyBasic: number;
  first5Days: number;       // gratuity days accrued in years 1–5
  after5Days: number;       // gratuity days accrued beyond year 5
  totalDays: number;
  rawAmount: number;        // before cap
  cap: number;
  capped: boolean;
  amount: number;           // final, AED
  notes: string[];          // human-readable caveats / reasons
}

function yearsToLabel(years: number): string {
  if (years <= 0) return "0";
  const whole = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  const y = whole > 0 ? `${whole} yr` : "";
  const m = months > 0 ? `${months} mo` : "";
  return [y, m].filter(Boolean).join(" ") || "0";
}

export function computeGratuity(input: GratuityInput): GratuityResult {
  const R = GRATUITY_RULES;
  const notes: string[] = [];
  const basic = Number.isFinite(input.basicSalary) ? Math.max(0, input.basicSalary) : 0;
  const dailyBasic = basic / R.dailyWageDivisor;

  const empty: GratuityResult = {
    eligible: false, serviceYears: 0, serviceLabel: "0", dailyBasic,
    first5Days: 0, after5Days: 0, totalDays: 0, rawAmount: 0,
    cap: 0, capped: false, amount: 0, notes,
  };

  if (!input.dateOfJoining || !input.lastDay) {
    notes.push("Joining date and last working day are both required to calculate gratuity.");
    return empty;
  }
  const joinMs = Date.parse(input.dateOfJoining);
  const lastMs = Date.parse(input.lastDay);
  if (!Number.isFinite(joinMs) || !Number.isFinite(lastMs) || lastMs < joinMs) {
    notes.push("Last working day must be on or after the joining date.");
    return empty;
  }
  if (basic <= 0) notes.push("Basic salary is zero — gratuity will be zero.");

  const serviceYears = (lastMs - joinMs) / 86400000 / R.daysPerYear;
  const serviceLabel = yearsToLabel(serviceYears);

  // Probation / under-minimum service → no entitlement.
  if (serviceYears < R.probationMonths / 12) {
    notes.push(`Within probation (under ${R.probationMonths} months) — no end-of-service entitlement.`);
    return { ...empty, serviceYears, serviceLabel };
  }
  if (serviceYears < R.minServiceYears) {
    notes.push(`Under ${R.minServiceYears} year of continuous service — no gratuity is due under the default rule.`);
    return { ...empty, serviceYears, serviceLabel };
  }

  const first5 = Math.min(serviceYears, R.thresholdYears);
  const after5 = Math.max(serviceYears - R.thresholdYears, 0);
  const first5Days = first5 * R.daysPerYearFirst5;
  const after5Days = after5 * R.daysPerYearAfter5;
  const totalDays = first5Days + after5Days;
  const rawAmount = totalDays * dailyBasic;

  const cap = R.capYearsOfWage * 12 * basic;
  const capped = rawAmount > cap && cap > 0;
  const amount = capped ? cap : rawAmount;

  if (capped) notes.push(`Capped at ${R.capYearsOfWage} years' basic wage (UAE statutory ceiling).`);
  if (input.reason === "resigned") {
    notes.push("Resignation is paid at the same rate as termination (post-2021 law). Confirm if any pre-2021 limited contract applies.");
  }
  notes.push("Gratuity is on BASIC salary only; allowances are excluded.");

  return {
    eligible: amount > 0,
    serviceYears, serviceLabel, dailyBasic,
    first5Days, after5Days, totalDays,
    rawAmount, cap, capped, amount, notes,
  };
}
