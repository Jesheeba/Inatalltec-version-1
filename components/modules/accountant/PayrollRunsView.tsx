"use client";
// ============================================================
// Accountant · Payroll Runs view (Phase 4, Slices 4C-2 + 4D).
//
// Monthly payroll workflow inside the Payroll tab: list runs → open a run →
// seed lines from active staff → adjust overtime/bonus/deductions (draft) →
// approve → generate the WPS file → mark paid. Payslip (print → PDF) is
// available per employee line.
//
// CONFIDENTIAL tab (admin/md/accounts). Fully responsive: tables collapse to
// cards ≤720px, actions wrap, modals are bottom sheets.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { CardHead, EmptyState, KPI, Modal } from "../../shared";
import {
  fetchPayrollRuns, fetchPayrollRunDetail, seedPayrollLines,
  approvePayrollRun, reopenPayrollRun, cancelPayrollRun, buildWpsForRun,
  type PayrollRun, type PayrollRunDetail, type PayrollLine,
} from "@/lib/accounting/payrollRuns";
import { fetchAccountingSettings, type AccountingSettings } from "@/lib/accounting/settings";
import { PayrollRunBadge, NewRunDialog, LineEditDialog, MarkPaidDialog } from "./payrollRunBits";
import { printPayslip } from "./payslip";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const periodLabel = (r: { periodMonth: number; periodYear: number }) =>
  `${MONTHS[(r.periodMonth - 1) % 12] ?? ""} ${r.periodYear}`;

function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function PayrollRunsView({ canManage }: { canManage: boolean }) {
  const { fmtMoney } = useApp();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const res = await fetchPayrollRuns();
    setLoading(false);
    if (!res.ok) { setErr(res.error); return; }
    setRuns(res.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const ytdNet = useMemo(() => {
    const yr = new Date().getFullYear();
    return runs.filter(r => r.periodYear === yr && r.status === "paid").reduce((s, r) => s + r.totalNet, 0);
  }, [runs]);

  if (openId) {
    return <RunDetail runId={openId} canManage={canManage} onBack={() => { setOpenId(null); void load(); }} />;
  }

  return (
    <>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Payroll runs" value={runs.length} sub="All periods" />
        <KPI label="Paid this year" value={fmtMoney(ytdNet, { compact: true })} sub="Net disbursed" />
        <KPI label="Drafts" value={runs.filter(r => r.status === "draft").length} sub="Awaiting approval" />
      </div>

      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ font: "var(--t-h3)" }}>Monthly runs</div>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> New run
          </button>
        )}
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading runs…</div>
      ) : runs.length === 0 ? (
        <EmptyState icon="receipt" title="No payroll runs yet"
          sub={canManage ? "Create a run for the current month to begin." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Run</th><th>Period</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Employees</th>
                <th style={{ textAlign: "right" }}>Net</th>
                <th>Status</th><th style={{ width: 80 }}></th>
              </tr></thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(r.id)}>
                    <td data-th="Run" style={{ fontWeight: 600, font: "var(--t-small)" }}>{r.runCode}</td>
                    <td data-th="Period" style={{ font: "var(--t-small)" }}>{periodLabel(r)}</td>
                    <td data-th="Employees" className="hide-mobile numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{r.employeeCount}</td>
                    <td data-th="Net" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(r.totalNet)}</td>
                    <td data-th="Status"><PayrollRunBadge status={r.status} /></td>
                    <td data-th=""><button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setOpenId(r.id); }}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <NewRunDialog onClose={() => setCreating(false)}
          onCreated={run => { setCreating(false); setOpenId(run.id); }} />
      )}
    </>
  );
}

/* ─── Run detail ──────────────────────────────────────────── */
function RunDetail({ runId, canManage, onBack }: { runId: string; canManage: boolean; onBack: () => void }) {
  const { fmtMoney, fireToast, currentOrg } = useApp();
  const [detail, setDetail] = useState<PayrollRunDetail | null>(null);
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editLine, setEditLine] = useState<PayrollLine | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [wpsWarnings, setWpsWarnings] = useState<string[] | null>(null);

  const { me } = useApp();
  const companyName = currentOrg?.display_name || "Company";

  const load = async () => {
    setLoading(true); setErr(null);
    const [d, s] = await Promise.all([fetchPayrollRunDetail(runId), fetchAccountingSettings()]);
    setLoading(false);
    if (!d.ok) { setErr(d.error); return; }
    setDetail(d.data);
    if (s.ok) setSettings(s.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [runId]);

  const run = detail?.run;
  const isDraft = run?.status === "draft";
  const isApproved = run?.status === "approved";

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Action failed."); return; }
    if (okMsg) fireToast(okMsg);
    void load();
  };

  const seed = () => act(async () => {
    const r = await seedPayrollLines(runId, me.id);
    if (r.ok) fireToast(r.data === 0 ? "No new employees to add" : `${r.data} employee line(s) added`);
    return r;
  });

  const generateWps = () => {
    if (!run || !detail) return;
    const employer = {
      establishmentId: settings?.wpsEstablishmentId ?? "",
      agentId: settings?.wpsAgentId ?? "",
      bankShortName: settings?.wpsBankName ?? "",
    };
    const res = buildWpsForRun(run, detail.lines, employer);
    if (!res.ok) { setWpsWarnings([res.error ?? "WPS file could not be generated."]); return; }
    downloadText(res.filename ?? `WPS_${run.runCode}.csv`, res.csv ?? "");
    fireToast("WPS file generated");
    if (res.warnings.length) setWpsWarnings(res.warnings);
  };

  if (loading) return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading run…</div>;
  if (!run) return <EmptyState icon="alertCircle" title="Run not found" sub={err ?? undefined} />;

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
        <Icon name="arrowLeft" size={14} /> All runs
      </button>

      {/* Header */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <div className="row" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ font: "var(--t-h3)" }}>{run.runCode}</span>
              <PayrollRunBadge status={run.status} />
            </div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
              {periodLabel(run)} · {run.periodStart} → {run.periodEnd} · {run.employeeCount} employees
            </div>
          </div>
          {canManage && (
            <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
              {isDraft && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={seed}><Icon name="users" size={14} /> Seed lines</button>}
              {isDraft && <button className="btn btn-primary btn-sm" disabled={busy || run.employeeCount === 0} onClick={() => act(() => approvePayrollRun(runId, me.id), "Run approved")}><Icon name="check" size={14} /> Approve</button>}
              {(isApproved || run.status === "paid") && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={generateWps}><Icon name="arrowDown" size={14} /> WPS file</button>}
              {isApproved && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setPayOpen(true)}><Icon name="banknote" size={14} /> Mark paid</button>}
              {isApproved && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => reopenPayrollRun(runId, me.id), "Run reopened")}>Reopen</button>}
              {(isDraft || isApproved) && <button className="btn btn-ghost btn-sm btn-danger" disabled={busy} onClick={() => act(() => cancelPayrollRun(runId, me.id), "Run cancelled")}>Cancel</button>}
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginTop: 16 }}>
          <KPI label="Gross" value={fmtMoney(run.totalGross)} />
          <KPI label="Additions" value={fmtMoney(run.totalAdditions)} sub="OT + bonus" />
          <KPI label="Deductions" value={fmtMoney(run.totalDeductions)} />
          <KPI accent="primary" label="Net payable" value={fmtMoney(run.totalNet)} />
        </div>
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {/* Lines */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div className="card-pad" style={{ paddingBottom: 8 }}>
          <CardHead title={`Employees · ${detail?.lines.length ?? 0}`}
            sub={isDraft ? "Adjust overtime, bonus and deductions, then approve" : "Locked — run is no longer a draft"} />
        </div>
        {(detail?.lines.length ?? 0) === 0 ? (
          <div className="card-pad">
            <EmptyState icon="users" title="No lines yet"
              sub={canManage && isDraft ? "Use “Seed lines” to add all active employees." : undefined} />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Employee</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Gross</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Add.</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Ded.</th>
                <th style={{ textAlign: "right" }}>Net</th>
                <th style={{ width: 96 }}></th>
              </tr></thead>
              <tbody>
                {detail!.lines.map(l => (
                  <tr key={l.id}>
                    <td data-th="Employee" style={{ font: "var(--t-small)" }}>
                      <div style={{ fontWeight: 600 }}>{l.employeeName}</div>
                      <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{l.employeeCode}</div>
                    </td>
                    <td data-th="Gross" className="hide-mobile numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.grossSalary)}</td>
                    <td data-th="Additions" className="hide-mobile numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.additionsTotal)}</td>
                    <td data-th="Deductions" className="hide-mobile numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.deductions)}</td>
                    <td data-th="Net" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(l.netPay)}</td>
                    <td data-th="">
                      <div className="row gap-1" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {canManage && isDraft && (
                          <button className="btn btn-ghost btn-sm" aria-label="Edit line" onClick={() => setEditLine(l)}>
                            <Icon name="pen" size={13} />
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" aria-label="Payslip"
                          onClick={() => { if (!printPayslip({ companyName, run, line: l })) fireToast("Allow pop-ups to print the payslip"); }}>
                          <Icon name="fileText" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payments + audit */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {(detail?.payments.length ?? 0) > 0 && (
          <div className="card card-pad">
            <CardHead title="Salary payments" sub={`${detail!.payments.length} record(s)`} />
            <div className="col gap-2">
              {detail!.payments.slice(0, 8).map(p => (
                <div key={p.id} className="row between" style={{ font: "var(--t-small)", gap: 10 }}>
                  <span style={{ color: "var(--ink-mute)" }}>{p.paymentDate}{p.method ? ` · ${p.method}` : ""}</span>
                  <strong className="numeric">{fmtMoney(p.amount)}</strong>
                </div>
              ))}
              {detail!.payments.length > 8 && <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>+{detail!.payments.length - 8} more</div>}
            </div>
          </div>
        )}
        <div className="card card-pad">
          <CardHead title="Activity" sub="Audit trail" />
          {(detail?.history.length ?? 0) === 0 ? (
            <div style={{ font: "var(--t-small)", color: "var(--ink-quiet)" }}>No history.</div>
          ) : (
            <div className="col gap-2">
              {detail!.history.map(h => (
                <div key={h.id} className="row" style={{ gap: 8, alignItems: "flex-start", font: "var(--t-small)" }}>
                  <Icon name="clock" size={13} />
                  <div className="col" style={{ gap: 0, minWidth: 0 }}>
                    <span>{h.detail ?? h.action}</span>
                    <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{new Date(h.changedAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editLine && <LineEditDialog line={editLine} onClose={() => setEditLine(null)} onSaved={() => { setEditLine(null); void load(); }} />}
      {payOpen && <MarkPaidDialog run={run} onClose={() => setPayOpen(false)} onPaid={() => { setPayOpen(false); void load(); }} />}

      {wpsWarnings && (
        <Modal open onClose={() => setWpsWarnings(null)}>
          <div className="col gap-3" style={{ padding: 22 }}>
            <div style={{ font: "var(--t-h3)" }}><Icon name="alertTriangle" size={16} /> WPS file — read before submitting</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
              The file downloaded, but confirm these against your bank / WPS agent:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, font: "var(--t-small)", display: "grid", gap: 6 }}>
              {wpsWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
            <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => setWpsWarnings(null)}>Understood</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
