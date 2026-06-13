// ============================================================
// Accountant · Phase 7 — print + CSV for the monthly reports.
// Turns a Report (lib/accounting/monthly.ts) into an A4 print document
// (browser "Save as PDF") and a CSV. Dependency-free.
// ============================================================

import type { Report } from "@/lib/accounting/monthly";

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function aed(v: number): string {
  return "AED " + (Number.isFinite(v) ? v : 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function reportToHtml(report: Report, companyName: string): string {
  const sections = report.sections.map(sec => {
    const rows = sec.lines.map(l =>
      `<tr><td class="${l.bold ? "b" : ""} ${l.muted ? "m" : ""}">${esc(l.label)}</td>
           <td class="v ${l.bold ? "b" : ""} ${l.muted ? "m" : ""}">${esc(aed(l.value))}</td></tr>`).join("");
    return `<section><h2>${esc(sec.title)}</h2><table>${rows}</table>${sec.note ? `<p class="note">${esc(sec.note)}</p>` : ""}</section>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>${esc(report.title)} · ${esc(report.period)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; padding: 24px; }
  .sheet { max-width: 800px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
  .co { font-size: 17px; font-weight: 700; }
  .doc { text-align: right; }
  .doc .t { font-size: 15px; font-weight: 700; }
  .doc .s { color: #666; }
  .banner { background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; font-size: 11px; }
  section { margin-bottom: 14px; break-inside: avoid; }
  h2 { font-size: 13px; margin: 0 0 6px; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 4px; border-bottom: 1px solid #eee; }
  td.v { text-align: right; font-variant-numeric: tabular-nums; }
  td.b { font-weight: 700; border-top: 1px solid #ccc; }
  td.m { color: #999; }
  .note { font-size: 10px; color: #888; margin: 4px 0 0; }
  .foot { margin-top: 18px; border-top: 1px solid #eee; padding-top: 8px; font-size: 10px; color: #999; }
  @media print { body { padding: 0; } }
</style></head>
<body><div class="sheet">
  <div class="head">
    <div class="co">${esc(companyName || "Company")}</div>
    <div class="doc"><div class="t">${esc(report.title)}</div><div class="s">${esc(report.period)}</div></div>
  </div>
  ${report.banner ? `<div class="banner">${esc(report.banner)}</div>` : ""}
  ${sections}
  <div class="foot">Generated for review — amounts in AED. Figures are from the accounting module and exclude any source the viewer's role cannot read.</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
}

export function printReport(report: Report, companyName: string): boolean {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return false;
  w.document.open(); w.document.write(reportToHtml(report, companyName)); w.document.close(); w.focus();
  return true;
}

export function reportToCsv(report: Report): string {
  const esc2 = (v: unknown) => { const t = String(v ?? ""); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines = [["Section", "Item", "Amount (AED)"].join(",")];
  for (const sec of report.sections)
    for (const l of sec.lines) lines.push([sec.title, l.label, l.value.toFixed(2)].map(esc2).join(","));
  return "﻿" + lines.join("\r\n");
}
