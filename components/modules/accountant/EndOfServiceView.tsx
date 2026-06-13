"use client";
// ============================================================
// Accountant · End-of-Service / Gratuity (Phase 4, Slice 4E).
//
// Two things in one view:
//   1. Provision report — accrued gratuity for every employee as if they left
//      today (a liability snapshot).
//   2. Per-employee calculator — pick a leaving date and see the full UAE
//      gratuity breakdown.
//
// The UAE statutory rules are applied as DEFAULTS and shown on screen; nothing
// is persisted — this is a review figure, not a posting. Confidential tab.
// Fully responsive.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { CardHead, EmptyState, KPI, Modal } from "../../shared";
import { fetchEmployees, EMPLOYEE_STATUS_LABEL, type Employee } from "@/lib/accounting/payroll";
import { computeGratuity, GRATUITY_RULES, type SeparationReason } from "@/lib/accounting/gratuity";
import { AssumptionNote } from "./payrollRunBits";

const today = () => new Date().toISOString().slice(0, 10);
const reasonFor = (e: Employee): SeparationReason =>
  e.status === "resigned" ? "resigned" : e.status === "terminated" ? "terminated" : "other";
// The provision uses the actual separation date if one exists, else "as of today".
const asOfFor = (e: Employee): string => e.separationDate || today();

export function EndOfServiceView() {
  const { fmtMoney } = useApp();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openEmp, setOpenEmp] = useState<Employee | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true); setErr(null);
      const res = await fetchEmployees();
      setLoading(false);
      if (!res.ok) { setErr(res.error); return; }
      setEmployees(res.data);
    })();
  }, []);

  const rows = useMemo(() => employees.map(e => ({
    e, g: computeGratuity({ basicSalary: e.basicSalary, dateOfJoining: e.dateOfJoining, lastDay: asOfFor(e), reason: reasonFor(e) }),
  })), [employees]);

  const employed = rows.filter(r => ["active", "probation", "on_leave"].includes(r.e.status));
  const provision = employed.reduce((s, r) => s + r.g.amount, 0);
  const settlementDue = rows.filter(r => ["resigned", "terminated"].includes(r.e.status));
  const settlementTotal = settlementDue.reduce((s, r) => s + r.g.amount, 0);

  return (
    <>
      <AssumptionNote>
        Gratuity uses the UAE default rule (Decree-Law 33/2021): {GRATUITY_RULES.daysPerYearFirst5} days’ basic
        per year for the first {GRATUITY_RULES.thresholdYears} years, {GRATUITY_RULES.daysPerYearAfter5} days
        thereafter, on <strong>basic salary ÷ {GRATUITY_RULES.dailyWageDivisor}</strong>, no entitlement under
        1 year, capped at {GRATUITY_RULES.capYearsOfWage} years’ basic. Resignation and termination are paid the
        same. These figures are for review only — confirm with payroll/legal before settlement.
      </AssumptionNote>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Accrued provision" value={fmtMoney(provision, { compact: true })} sub="If all current staff left today" />
        <KPI label="Settlement due" value={fmtMoney(settlementTotal, { compact: true })} sub={`${settlementDue.length} resigned/terminated`} />
        <KPI label="Employees" value={employees.length} sub="In master" />
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading employees…</div>
      ) : employees.length === 0 ? (
        <EmptyState icon="users" title="No employees" sub="Add employees in the Employees view first." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="card-pad" style={{ paddingBottom: 8 }}>
            <CardHead title="End-of-service provision" sub="Accrued gratuity per employee — tap a row for the breakdown" />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Employee</th>
                <th className="hide-mobile">Joined</th>
                <th className="hide-mobile">Service</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Basic</th>
                <th style={{ textAlign: "right" }}>Gratuity</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {rows.map(({ e, g }) => (
                  <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => setOpenEmp(e)}>
                    <td data-th="Employee" style={{ font: "var(--t-small)" }}>
                      <div style={{ fontWeight: 600 }}>{e.name}</div>
                      <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{e.employeeCode}</div>
                    </td>
                    <td data-th="Joined" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{e.dateOfJoining ?? "—"}</td>
                    <td data-th="Service" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{g.serviceLabel}</td>
                    <td data-th="Basic" className="hide-mobile numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(e.basicSalary)}</td>
                    <td data-th="Gratuity" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(g.amount)}</td>
                    <td data-th="Status"><span className="badge badge-outline">{EMPLOYEE_STATUS_LABEL[e.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openEmp && <EosDetailDialog employee={openEmp} onClose={() => setOpenEmp(null)} />}
    </>
  );
}

/* ─── Per-employee calculator ─────────────────────────────── */
function EosDetailDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { fmtMoney } = useApp();
  const [lastDay, setLastDay] = useState(employee.separationDate || today());
  const reason = reasonFor(employee);
  const g = computeGratuity({ basicSalary: employee.basicSalary, dateOfJoining: employee.dateOfJoining, lastDay, reason });

  const labelStyle = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;
  const line = (k: string, v: string, strong?: boolean) => (
    <div className="row between" style={{ font: strong ? "var(--t-body-md)" : "var(--t-small)" }}>
      <span style={{ color: "var(--ink-mute)" }}>{k}</span>
      <strong className="numeric" style={{ fontWeight: strong ? 700 : 600 }}>{v}</strong>
    </div>
  );

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>{employee.name}</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {employee.employeeCode} · joined {employee.dateOfJoining ?? "—"} · basic {fmtMoney(employee.basicSalary)}
        </div>

        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Last working day</label>
          <input className="input" type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} />
        </div>

        <div className="card card-pad col gap-2" style={{ background: "var(--bg-muted)" }}>
          {line("Service length", g.serviceLabel)}
          {line("Daily basic (÷30)", fmtMoney(g.dailyBasic))}
          {line(`Days, yrs 1–${GRATUITY_RULES.thresholdYears}`, `${g.first5Days.toFixed(1)} d`)}
          {line("Days, beyond", `${g.after5Days.toFixed(1)} d`)}
          {g.capped && line("Statutory cap", fmtMoney(g.cap))}
          {line("Gratuity payable", fmtMoney(g.amount), true)}
        </div>

        {g.notes.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, font: "var(--t-micro)", color: "var(--ink-quiet)", display: "grid", gap: 4 }}>
            {g.notes.map((nNote, i) => <li key={i}>{nNote}</li>)}
          </ul>
        )}

        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>
          {reason === "other"
            ? "Employee is still active — this is the accrued provision as of the date above."
            : `Status: ${EMPLOYEE_STATUS_LABEL[employee.status]} — final settlement figure.`}
          {" "}Not saved; for review only.
        </div>

        <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
