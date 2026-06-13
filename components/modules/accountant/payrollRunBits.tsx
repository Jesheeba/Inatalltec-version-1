"use client";
// ============================================================
// Accountant · Payroll Runs — shared bits (Phase 4, Slice 4C-2).
// Status badge + the create / line-edit / mark-paid dialogs. UAE-legal
// assumptions are surfaced inline where they affect the figures.
// ============================================================

import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { Modal } from "../../shared";
import { fetchPaymentMethods, type AccountingLookup } from "@/lib/accounting/settings";
import {
  createPayrollRun, updatePayrollLine, markPayrollRunPaid,
  PAYROLL_RUN_STATUS_LABEL,
  type PayrollRun, type PayrollLine, type PayrollRunStatus,
} from "@/lib/accounting/payrollRuns";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const RUN_BADGE: Record<PayrollRunStatus, string> = {
  draft: "badge-outline", approved: "badge-info", paid: "badge-success", cancelled: "badge-danger",
};
export function PayrollRunBadge({ status }: { status: PayrollRunStatus }) {
  return <span className={"badge " + RUN_BADGE[status]}>{PAYROLL_RUN_STATUS_LABEL[status]}</span>;
}

const labelStyle = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;
const cols2 = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" } as const;

// Small reusable "this uses an assumption" banner.
export function AssumptionNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="alert-banner tone-warning" style={{ marginBottom: 12 }}>
      <div className="ic"><Icon name="alertTriangle" size={16} /></div>
      <div className="text"><div className="h">UAE-legal assumption</div>
        <div className="d">{children}</div></div>
    </div>
  );
}

/* ─── New run ─────────────────────────────────────────────── */
export function NewRunDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (run: PayrollRun) => void }) {
  const { me, fireToast } = useApp();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await createPayrollRun({ periodYear: year, periodMonth: month, notes }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`Payroll run ${res.data.runCode} created`);
    onCreated(res.data);
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>New payroll run</div>
        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Month</label>
            <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Year</label>
            <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Notes <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>
          The pay period defaults to the whole calendar month. After creating, seed the employee lines.
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} /> Create run
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Adjust a line ───────────────────────────────────────── */
export function LineEditDialog({ line, onClose, onSaved }: {
  line: PayrollLine; onClose: () => void; onSaved: () => void;
}) {
  const { fmtMoney, fireToast } = useApp();
  const [overtime, setOvertime] = useState(String(line.overtimeAmount));
  const [bonus, setBonus] = useState(String(line.bonusAmount));
  const [otherAdd, setOtherAdd] = useState(String(line.otherAdditions));
  const [deductions, setDeductions] = useState(String(line.deductions));
  const [days, setDays] = useState(line.daysInPeriod === null ? "" : String(line.daysInPeriod));
  const [leave, setLeave] = useState(String(line.leaveDays));
  const [notes, setNotes] = useState(line.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const num = (v: string) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const net = line.grossSalary + num(overtime) + num(bonus) + num(otherAdd) - num(deductions);

  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await updatePayrollLine(line.id, {
      overtimeAmount: num(overtime), bonusAmount: num(bonus), otherAdditions: num(otherAdd),
      deductions: num(deductions), leaveDays: num(leave),
      daysInPeriod: days.trim() === "" ? null : num(days), notes,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Line updated");
    onSaved();
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>{line.employeeName}</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {line.employeeCode} · base gross {fmtMoney(line.grossSalary)}
        </div>

        <AssumptionNote>
          Overtime, bonus and deductions are entered as <strong>final AED amounts</strong>. The app does
          <strong> not</strong> apply UAE overtime multipliers (1.25×/1.5×) or any statutory deduction
          (e.g. GPSSA pension) — compute those before entering.
        </AssumptionNote>

        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Overtime (AED)</label>
            <input className="input numeric" type="number" min={0} step="any" value={overtime} onChange={e => setOvertime(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Bonus (AED)</label>
            <input className="input numeric" type="number" min={0} step="any" value={bonus} onChange={e => setBonus(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Other additions (AED)</label>
            <input className="input numeric" type="number" min={0} step="any" value={otherAdd} onChange={e => setOtherAdd(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Deductions (AED)</label>
            <input className="input numeric" type="number" min={0} step="any" value={deductions} onChange={e => setDeductions(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Days in period</label>
            <input className="input numeric" type="number" min={0} value={days} onChange={e => setDays(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Leave days</label>
            <input className="input numeric" type="number" min={0} value={leave} onChange={e => setLeave(e.target.value)} />
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Line note <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="row between" style={{ font: "var(--t-body-md)" }}>
          <span style={{ color: "var(--ink-mute)" }}>Net pay</span>
          <strong className="numeric">{fmtMoney(net)}</strong>
        </div>

        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} /> Save line
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Mark paid ───────────────────────────────────────────── */
export function MarkPaidDialog({ run, onClose, onPaid }: {
  run: PayrollRun; onClose: () => void; onPaid: () => void;
}) {
  const { me, fireToast, fmtMoney } = useApp();
  const [methods, setMethods] = useState<AccountingLookup[]>([]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetchPaymentMethods();
      if (res.ok) {
        const active = res.data.filter(m => m.isActive);
        setMethods(active);
        if (active.length) setMethod(active[0].code);
      }
    })();
  }, []);

  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await markPayrollRunPaid(run.id, { paymentDate, method, reference }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${run.runCode} marked paid`);
    onPaid();
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Mark {run.runCode} paid</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {run.employeeCount} employees · net {fmtMoney(run.totalNet)}
        </div>
        <div className="alert-banner tone-warning" style={{ marginBottom: 4 }}>
          <div className="ic"><Icon name="alertTriangle" size={16} /></div>
          <div className="text"><div className="h">UAE timing</div>
            <div className="d">UAE labour law expects salaries paid within the first 10 days of the following
              month. This is a reminder only — the date is not enforced.</div></div>
        </div>

        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Payment date<span style={{ color: "var(--dan-700)" }}>*</span></label>
            <input className="input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={labelStyle}>Method</label>
            <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
              <option value="">—</option>
              {methods.map(m => <option key={m.id} value={m.code}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Reference <span style={{ color: "var(--ink-quiet)" }}>(WPS batch / transfer ref)</span></label>
          <input className="input" value={reference} onChange={e => setReference(e.target.value)} />
        </div>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>
          This writes a salary-payment record per employee and locks the run.
        </div>

        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !paymentDate}>
            <Icon name="check" size={14} /> Confirm paid
          </button>
        </div>
      </div>
    </Modal>
  );
}
