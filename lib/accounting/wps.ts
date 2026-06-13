// ============================================================
// Accountant module · Phase 4 (Slice 4C-1) — UAE WPS SIF builder.
//
// Produces a UAE Wage Protection System "Salary Information File" (SIF) from
// a finalized payroll run. Pure / dependency-free so it is trivially testable
// and reusable by the UI (wired to a button in Slice 4C-2).
//
// ─────────────────────────────────────────────────────────────
// ⚠️  UAE-WPS FORMAT ASSUMPTIONS — CONFIRM BEFORE SUBMITTING A REAL FILE ⚠️
// The official SIF layout varies between banks / exchange houses and between
// SIF versions. This builder emits the WIDELY-USED SIF v1 shape but you MUST
// validate it against YOUR bank / WPS agent's template before relying on it:
//
//   • RECORD TYPES: EDR (Employee Detail Record), one per employee, then a
//     single SCR (Salary Control Record) trailer. Some banks expect SCR
//     FIRST as a header — placement is configurable here and defaults to
//     trailer-last. CONFIRM which your agent wants.
//   • FIELD ORDER below follows the common SIF v1 order. Newer SIF revisions
//     add columns (currency, total fixed/variable, leave codes). CONFIRM.
//   • EMPLOYEE "Person ID" — WPS keys on the MOL labour-card / work-permit
//     number (14 digits). The employee master does NOT capture that yet, so
//     we emit the Emirates ID as a PLACEHOLDER. This is almost certainly the
//     wrong identifier for live submission — a dedicated labour_card_no field
//     is needed (future migration). Flagged per row in `warnings`.
//   • AGENT IDs — the routing codes for the employer's and each employee's
//     bank/exchange. The employer Agent ID is supplied via `employer.agentId`.
//     The PER-EMPLOYEE Agent ID is NOT stored anywhere in the app (the master
//     keeps only IBAN + account), so the EDR agent-id field is emitted EMPTY
//     and must be filled by the bank or a future field. Flagged per row.
//   • AMOUNTS are AED, two decimals. No fils/whole-number rounding is forced.
//   • DATES use YYYY-MM-DD; salary month uses MMYYYY. Some agents want DDMMYYYY
//     / no separators. CONFIRM.
//   • This file performs NO statutory calculation (overtime multipliers,
//     GPSSA pension, gratuity) — it only formats amounts already entered on
//     the run. See 0053 for the matching salary-calculation flags.
// ─────────────────────────────────────────────────────────────

export interface WpsEmployer {
  /** MOL establishment ID (employer unique id). Required. */
  establishmentId: string;
  /** Employer bank routing / WPS Agent ID. Required. */
  agentId: string;
  /** Optional bank short name, for the filename only. */
  bankShortName?: string;
}

export interface WpsLineInput {
  /** Labour-card / person number. Emirates ID is passed as a placeholder. */
  personId: string | null;
  /** Employee bank routing / Agent ID — not stored by the app today. */
  agentId?: string | null;
  iban: string | null;
  /** Gross fixed pay (basic + allowances), AED. */
  fixedIncome: number;
  /** Variable pay (overtime + bonus + other additions), AED. */
  variableIncome: number;
  /** Net pay actually transferred, AED. */
  netSalary: number;
  daysInPeriod: number | null;
  leaveDays: number;
  /** For per-row warning messages only. */
  employeeName?: string;
}

export interface WpsBuildInput {
  employer: WpsEmployer;
  salaryYear: number;
  salaryMonth: number;            // 1–12
  periodStart: string;            // YYYY-MM-DD
  periodEnd: string;              // YYYY-MM-DD
  lines: WpsLineInput[];
  /** SCR placement. UAE banks differ; default 'trailer'. */
  scrPosition?: "header" | "trailer";
  /** Injectable for deterministic tests; defaults to now. */
  createdAt?: Date;
}

export interface WpsBuildResult {
  ok: boolean;
  error?: string;
  csv?: string;
  filename?: string;
  /** Non-fatal format/data caveats the accountant must read. */
  warnings: string[];
}

const money = (v: number): string => (Number.isFinite(v) ? v : 0).toFixed(2);
const pad2 = (n: number): string => String(n).padStart(2, "0");

// Minimal CSV-cell escaping. WPS SIF is plain comma-separated; we only quote a
// cell if it contains a comma, quote or newline (RFC-4180 style) to stay safe.
function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build a WPS SIF as CSV text. Returns ok:false with a clear message when the
 * employer identifiers are missing (the file is meaningless without them).
 * Per-row data gaps (missing IBAN / person id / employee agent id) are NOT
 * fatal — the row is emitted and a warning is collected so the accountant can
 * fix the master and regenerate.
 */
export function buildWpsSif(input: WpsBuildInput): WpsBuildResult {
  const warnings: string[] = [];
  const { employer, lines } = input;

  if (!employer?.establishmentId?.trim() || !employer?.agentId?.trim()) {
    return {
      ok: false,
      warnings,
      error:
        "WPS employer identifiers are required: MOL establishment ID and the employer bank routing / Agent ID. " +
        "Enter them before generating the WPS file.",
    };
  }
  if (lines.length === 0) {
    return { ok: false, warnings, error: "This payroll run has no lines to export." };
  }

  const now = input.createdAt ?? new Date();
  const salaryMonth = `${pad2(input.salaryMonth)}${input.salaryYear}`;        // MMYYYY
  const creationDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const creationTime = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;     // HHMM

  // Standing format caveats — always shown.
  warnings.push("Confirm the SIF layout (field order, record placement, person-ID field) with your bank / WPS agent before submitting.");
  warnings.push("Employee 'Person ID' is the Emirates ID as a placeholder — WPS expects the MOL labour-card number. Verify per employee.");
  warnings.push("Per-employee bank Agent ID is not stored in the app and is left blank — your bank usually derives it from the IBAN.");

  let totalNet = 0;
  const edrRows: string[] = [];
  lines.forEach((ln, i) => {
    totalNet += Number.isFinite(ln.netSalary) ? ln.netSalary : 0;
    const who = ln.employeeName || ln.personId || `row ${i + 1}`;
    if (!ln.iban?.trim()) warnings.push(`Missing IBAN for ${who} — WPS requires an employee IBAN.`);
    if (!ln.personId?.trim()) warnings.push(`Missing person ID for ${who}.`);

    // EDR field order (SIF v1):
    //   [0] Record type
    //   [1] Employee person ID (labour card / placeholder)
    //   [2] Employee Agent ID (bank routing)        ← blank, see flag
    //   [3] Employee account (IBAN)
    //   [4] Pay start date (YYYY-MM-DD)
    //   [5] Pay end date   (YYYY-MM-DD)
    //   [6] Days in period
    //   [7] Fixed income
    //   [8] Variable income
    //   [9] Days on leave (no auto-proration applied)
    //   [10] Net salary
    edrRows.push([
      "EDR",
      cell(ln.personId ?? ""),
      cell(ln.agentId ?? ""),
      cell(ln.iban ?? ""),
      input.periodStart,
      input.periodEnd,
      cell(ln.daysInPeriod ?? ""),
      money(ln.fixedIncome),
      money(ln.variableIncome),
      cell(ln.leaveDays ?? 0),
      money(ln.netSalary),
    ].join(","));
  });

  // SCR (control) record:
  //   [0] Record type
  //   [1] Employer establishment ID
  //   [2] Employer Agent ID (routing)
  //   [3] File creation date (YYYY-MM-DD)
  //   [4] File creation time (HHMM)
  //   [5] Salary month (MMYYYY)
  //   [6] Number of EDR records
  //   [7] Total net salary
  const scrRow = [
    "SCR",
    cell(employer.establishmentId),
    cell(employer.agentId),
    creationDate,
    creationTime,
    salaryMonth,
    String(lines.length),
    money(totalNet),
  ].join(",");

  const rows = input.scrPosition === "header"
    ? [scrRow, ...edrRows]
    : [...edrRows, scrRow];

  // WPS files are typically CRLF-terminated plain ASCII (no BOM).
  const csv = rows.join("\r\n") + "\r\n";
  const filename = `WPS_${employer.establishmentId}_${salaryMonth}.csv`;

  return { ok: true, csv, filename, warnings };
}
