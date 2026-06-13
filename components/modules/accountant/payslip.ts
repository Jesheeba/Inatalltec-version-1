// ============================================================
// Accountant module · Phase 4 (Slice 4D) — Payslip generation.
//
// No PDF dependency is bundled, so a payslip is produced as a clean,
// self-contained HTML document opened in a new window with print-on-load —
// the user picks "Save as PDF" in the browser print dialog. This keeps the
// app dependency-free while still delivering a PDF.
//
// The payslip carries a visible UAE-compliance note: the figures are exactly
// what was entered on the payroll run — NO statutory deductions (pension /
// GPSSA) or overtime multipliers are applied automatically.
// ============================================================

import type { PayrollRun, PayrollLine } from "@/lib/accounting/payrollRuns";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function aed(v: number): string {
  const x = Number.isFinite(v) ? v : 0;
  return "AED " + x.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface PayslipOptions {
  companyName: string;
  run: PayrollRun;
  line: PayrollLine;
}

export function buildPayslipHtml({ companyName, run, line }: PayslipOptions): string {
  const period = `${MONTHS[(run.periodMonth - 1) % 12] ?? ""} ${run.periodYear}`;
  const row = (label: string, value: string, opts?: { strong?: boolean; muted?: boolean }) =>
    `<tr>
       <td class="lbl ${opts?.muted ? "muted" : ""}">${esc(label)}</td>
       <td class="val ${opts?.strong ? "strong" : ""}">${esc(value)}</td>
     </tr>`;

  const earnings = [
    row("Basic salary", aed(line.basicSalary)),
    row("Housing allowance", aed(line.housingAllowance)),
    row("Transport allowance", aed(line.transportAllowance)),
    row("Other allowances", aed(line.otherAllowances)),
    line.overtimeAmount ? row("Overtime", aed(line.overtimeAmount)) : "",
    line.bonusAmount ? row("Bonus", aed(line.bonusAmount)) : "",
    line.otherAdditions ? row("Other additions", aed(line.otherAdditions)) : "",
    row("Total earnings", aed(line.grossSalary + line.additionsTotal), { strong: true }),
  ].join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Payslip · ${esc(line.employeeName)} · ${esc(period)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a;
         margin: 0; padding: 28px; font-size: 13px; }
  .sheet { max-width: 720px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .co { font-size: 18px; font-weight: 700; }
  .doc { text-align: right; }
  .doc .t { font-size: 16px; font-weight: 700; letter-spacing: .04em; }
  .doc .s { color: #555; font-size: 12px; }
  .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 24px; margin-bottom: 18px; }
  .meta div { font-size: 12px; }
  .meta .k { color: #777; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  td { padding: 7px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  .lbl { color: #333; } .lbl.muted { color: #888; }
  .val { text-align: right; font-variant-numeric: tabular-nums; }
  .val.strong, .lbl.strong { font-weight: 700; border-top: 1px solid #ccc; }
  .net { display: flex; justify-content: space-between; align-items: center; gap: 12px;
         background: #f3f6ff; border: 1px solid #c7d6ff; border-radius: 10px; padding: 14px 16px; margin: 4px 0 18px; }
  .net .k { font-weight: 600; } .net .v { font-size: 20px; font-weight: 800; }
  .note { font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 12px; line-height: 1.5; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 560px) { .cols { grid-template-columns: 1fr; } .meta { grid-template-columns: 1fr; } }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style></head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="co">${esc(companyName || "Company")}</div>
      <div class="doc"><div class="t">PAYSLIP</div><div class="s">${esc(period)} · ${esc(run.runCode)}</div></div>
    </div>

    <div class="meta">
      <div><span class="k">Employee:</span> <strong>${esc(line.employeeName)}</strong></div>
      <div><span class="k">Code:</span> ${esc(line.employeeCode || "—")}</div>
      <div><span class="k">Pay period:</span> ${esc(run.periodStart || "")} → ${esc(run.periodEnd || "")}</div>
      <div><span class="k">Days / leave:</span> ${esc(line.daysInPeriod ?? "—")} / ${esc(line.leaveDays)}</div>
      <div><span class="k">Bank account:</span> ${esc(line.bankAccount || "—")}</div>
      <div><span class="k">IBAN:</span> ${esc(line.iban || "—")}</div>
    </div>

    <div class="cols">
      <table><tbody>${earnings}</tbody></table>
      <table><tbody>
        ${row("Total earnings", aed(line.grossSalary + line.additionsTotal))}
        ${row("Deductions", "− " + aed(line.deductions), { muted: true })}
        ${row("Net adjustments", aed(line.additionsTotal - line.deductions), { muted: true })}
      </tbody></table>
    </div>

    <div class="net"><span class="k">Net pay</span><span class="v">${esc(aed(line.netPay))}</span></div>

    <div class="note">
      This payslip reflects the amounts recorded on payroll run ${esc(run.runCode)}. Figures are entered by the
      employer: <strong>no statutory deductions (e.g. GPSSA / pension) and no overtime multipliers are applied
      automatically</strong>. Gratuity / end-of-service is calculated separately on leaving. Amounts in AED.
      Generated for review — not a tax document.
    </div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
}

// Open the payslip in a new window; it prints itself on load. Returns false if
// the browser blocked the popup.
export function printPayslip(opts: PayslipOptions): boolean {
  const html = buildPayslipHtml(opts);
  const w = window.open("", "_blank", "width=780,height=920");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}
