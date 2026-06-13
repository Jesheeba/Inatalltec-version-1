"use client";
// ============================================================
// Accountant · Payroll tab — Employee Salary Master (Phase 4, migration 0052).
//
// CONFIDENTIAL: this tab is only rendered for VIEW_PAYROLL (admin/md/
// accounts) — Manager is deliberately excluded (salary confidentiality).
// The Accountant hub gates the tab; this component double-checks edit
// rights via canManage (MANAGE_PAYROLL).
//
// Employee master: list with search + status/department filters, a
// create/edit form covering profile + UAE salary structure (basic +
// housing + transport + other → live gross total), and a status-change
// dialog that captures separation_date on resign/terminate.
//
// Payroll RUNS / payslips / WPS / EOS arrive in later slices and will live
// under this same tab via internal navigation. Slice 4B is the master only.
//
// Fully responsive: shared .table collapses to cards ≤720px, auto-fit
// grids, modal is a bottom sheet ≤720px.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db, ROLE_LABELS, isPlatformRole } from "@/lib/db";
import type { User } from "@/lib/types";
import { CardHead, EmptyState, FilterBar, KPI, Modal } from "../../shared";
import {
  fetchEmployees, createEmployee, updateEmployee, setEmployeeStatus,
  EMPLOYEE_STATUS_LABEL,
  type Employee, type EmployeeStatus, type EmployeeInput,
} from "@/lib/accounting/payroll";
import { PayrollRunsView } from "./PayrollRunsView";
import { EndOfServiceView } from "./EndOfServiceView";

type StatusFilter = "all" | EmployeeStatus;

const STATUS_BADGE: Record<EmployeeStatus, string> = {
  active: "badge-success",
  on_leave: "badge-info",
  probation: "badge-warning",
  resigned: "badge-outline",
  terminated: "badge-danger",
};

type SubView = "employees" | "runs" | "eos";

// Host: the Payroll tab holds three sub-views behind an internal switch —
// the employee master, the monthly payroll runs, and end-of-service. All
// three share the VIEW_PAYROLL confidentiality (Manager never sees the tab).
export function PayrollTab({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<SubView>("employees");
  const subTabs: { value: SubView; label: string }[] = [
    { value: "employees", label: "Employees" },
    { value: "runs", label: "Payroll Runs" },
    { value: "eos", label: "End of Service" },
  ];
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <FilterBar<SubView> value={view} onChange={setView} options={subTabs} />
      </div>
      {view === "employees" && <EmployeeMasterView canManage={canManage} />}
      {view === "runs" && <PayrollRunsView canManage={canManage} />}
      {view === "eos" && <EndOfServiceView />}
    </>
  );
}

function EmployeeMasterView({ canManage }: { canManage: boolean }) {
  const { fmtMoney } = useApp();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Employee | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const res = await fetchEmployees();
    setLoading(false);
    if (!res.ok) { setErr(res.error); return; }
    setEmployees(res.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const departments = useMemo(
    () => [...new Set(employees.map(e => e.department).filter((d): d is string => !!d))].sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return employees.filter(e => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (deptFilter !== "all" && e.department !== deptFilter) return false;
      if (t && !(`${e.name} ${e.employeeCode} ${e.position ?? ""}`.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [employees, statusFilter, deptFilter, search]);

  const activeCount = useMemo(() => employees.filter(e => e.status === "active").length, [employees]);
  const monthlyGross = useMemo(
    () => employees.filter(e => e.status === "active" || e.status === "probation" || e.status === "on_leave")
      .reduce((sum, e) => sum + e.totalSalary, 0),
    [employees],
  );

  // Lower-cased existing employee names — lets the create form warn when a
  // picked/typed person looks like a duplicate. (UI hint only; no DB constraint.)
  const existingNames = useMemo(
    () => new Set(employees.map(e => e.name.trim().toLowerCase())),
    [employees],
  );

  const statusTabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: employees.length },
    { value: "active", label: "Active" },
    { value: "probation", label: "Probation" },
    { value: "on_leave", label: "On leave" },
    { value: "resigned", label: "Resigned" },
    { value: "terminated", label: "Terminated" },
  ];

  return (
    <>
      {/* KPIs */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Employees" value={employees.length} sub={`${activeCount} active`} />
        <KPI label="Monthly gross" value={fmtMoney(monthlyGross, { compact: true })} sub="Active / probation / on-leave" />
        <KPI label="Departments" value={departments.length} sub="With staff" />
      </div>

      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FilterBar<StatusFilter> value={statusFilter} onChange={setStatusFilter} options={statusTabs} />
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> New employee
          </button>
        )}
      </div>

      {/* Search + department filter */}
      <div className="row gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <div className="row" style={{ alignItems: "center", gap: 6, flex: 1, minWidth: 200,
          border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0 10px" }}>
          <Icon name="search" size={14} />
          <input className="input" style={{ border: "none", padding: "8px 0", flex: 1, background: "transparent" }}
            placeholder="Search name, code or position" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ maxWidth: 220 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading employees…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="users" title={employees.length === 0 ? "No employees yet" : "Nothing in this view"}
          sub={canManage && employees.length === 0 ? "Add the first employee." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Code</th><th>Name</th>
                <th className="hide-mobile">Position</th>
                <th className="hide-mobile">Department</th>
                <th style={{ textAlign: "right" }}>Gross</th>
                <th>Status</th>
                {canManage && <th style={{ width: 110 }}></th>}
              </tr></thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}>
                    <td data-th="Code" style={{ fontWeight: 600, font: "var(--t-small)" }}>{e.employeeCode}</td>
                    <td data-th="Name" style={{ font: "var(--t-small)" }}>{e.name}</td>
                    <td data-th="Position" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{e.position ?? "—"}</td>
                    <td data-th="Department" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{e.department ?? "—"}</td>
                    <td data-th="Gross" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(e.totalSalary)}</td>
                    <td data-th="Status"><span className={"badge " + STATUS_BADGE[e.status]}>{EMPLOYEE_STATUS_LABEL[e.status]}</span></td>
                    {canManage && (
                      <td data-th="" >
                        <div className="row gap-1" style={{ flexWrap: "wrap" }}>
                          <button className="btn btn-ghost btn-sm" aria-label="Edit" onClick={() => setEditing(e)}>
                            <Icon name="pen" size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setStatusTarget(e)}>
                            Status
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <EmployeeFormDialog existingNames={existingNames}
          onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />
      )}
      {editing && (
        <EmployeeFormDialog employee={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
      {statusTarget && (
        <StatusDialog employee={statusTarget} onClose={() => setStatusTarget(null)} onSaved={() => { setStatusTarget(null); void load(); }} />
      )}
    </>
  );
}

/* ─── Create / edit dialog ───────────────────────────────── */
function EmployeeFormDialog({ employee, existingNames, onClose, onSaved }: {
  employee?: Employee; existingNames?: Set<string>; onClose: () => void; onSaved: () => void;
}) {
  const { me, fireToast, fmtMoney } = useApp();
  const isEdit = !!employee;
  const [name, setName] = useState(employee?.name ?? "");
  // Create-mode only: optional pick from the existing app users (db.USERS).
  // UI convenience — no DB link is created; the name is just copied in.
  const [pickedUser, setPickedUser] = useState<User | null>(null);
  const [position, setPosition] = useState(employee?.position ?? "");
  const [department, setDepartment] = useState(employee?.department ?? "");
  const [dateOfJoining, setDateOfJoining] = useState(employee?.dateOfJoining ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(employee?.dateOfBirth ?? "");
  const [nationality, setNationality] = useState(employee?.nationality ?? "");
  const [passportNumber, setPassportNumber] = useState(employee?.passportNumber ?? "");
  const [emiratesId, setEmiratesId] = useState(employee?.emiratesId ?? "");
  const [visaStatus, setVisaStatus] = useState(employee?.visaStatus ?? "");
  const [basicSalary, setBasicSalary] = useState(String(employee?.basicSalary ?? "0"));
  const [housingAllowance, setHousingAllowance] = useState(String(employee?.housingAllowance ?? "0"));
  const [transportAllowance, setTransportAllowance] = useState(String(employee?.transportAllowance ?? "0"));
  const [otherAllowances, setOtherAllowances] = useState(String(employee?.otherAllowances ?? "0"));
  const [bankAccount, setBankAccount] = useState(employee?.bankAccount ?? "");
  const [iban, setIban] = useState(employee?.iban ?? "");
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = (Number(basicSalary) || 0) + (Number(housingAllowance) || 0)
    + (Number(transportAllowance) || 0) + (Number(otherAllowances) || 0);

  // Warn (create mode) when the name matches a person already on the master —
  // whether picked from the user list or typed by hand.
  const dupWarning = !isEdit && name.trim().length > 0
    && (existingNames?.has(name.trim().toLowerCase()) ?? false);

  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Employee name is required."); return; }
    setBusy(true);
    const input: EmployeeInput = {
      name, position, department,
      dateOfJoining: dateOfJoining || null, dateOfBirth: dateOfBirth || null,
      nationality, passportNumber, emiratesId, visaStatus,
      basicSalary: Number(basicSalary) || 0, housingAllowance: Number(housingAllowance) || 0,
      transportAllowance: Number(transportAllowance) || 0, otherAllowances: Number(otherAllowances) || 0,
      bankAccount, iban, notes,
    };
    const res = isEdit ? await updateEmployee(employee!.id, input, me.id) : await createEmployee(input, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(isEdit ? "Employee updated" : `Employee ${res.data.employeeCode} created`);
    onSaved();
  };

  const label = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;
  const cols3 = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" } as const;

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>{isEdit ? `Edit ${employee!.employeeCode}` : "New employee"}</div>

        {!isEdit && (
          <UserPicker
            picked={pickedUser}
            onPick={u => { setPickedUser(u); setName(u.name); }}
            onClear={() => setPickedUser(null)}
          />
        )}

        <div className="col" style={{ gap: 4 }}>
          <label style={label}>Full name<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus={isEdit} />
          {dupWarning && (
            <div style={{ font: "var(--t-micro)", color: "var(--warn-700)", display: "flex", gap: 6, alignItems: "flex-start", marginTop: 2 }}>
              <Icon name="alertTriangle" size={13} />
              <span>This person may already be in the employee list — check before creating a duplicate.</span>
            </div>
          )}
        </div>

        <div style={cols3}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Position</label>
            <input className="input" value={position} onChange={e => setPosition(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Department</label>
            <input className="input" value={department} onChange={e => setDepartment(e.target.value)} />
          </div>
        </div>

        <div style={cols3}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Date of joining</label>
            <input className="input" type="date" value={dateOfJoining} onChange={e => setDateOfJoining(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Date of birth</label>
            <input className="input" type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Nationality</label>
            <input className="input" value={nationality} onChange={e => setNationality(e.target.value)} />
          </div>
        </div>

        <div style={cols3}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Passport number</label>
            <input className="input" value={passportNumber} onChange={e => setPassportNumber(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Emirates ID</label>
            <input className="input" value={emiratesId} onChange={e => setEmiratesId(e.target.value)} placeholder="784-…" />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Visa status</label>
            <input className="input" value={visaStatus} onChange={e => setVisaStatus(e.target.value)} />
          </div>
        </div>

        {/* Salary structure */}
        <div style={{ font: "var(--t-body-md)", fontWeight: 600, marginTop: 4 }}>Salary structure (monthly)</div>
        <div style={cols3}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Basic salary</label>
            <input className="input numeric" type="number" min={0} step="any" value={basicSalary} onChange={e => setBasicSalary(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Housing allowance</label>
            <input className="input numeric" type="number" min={0} step="any" value={housingAllowance} onChange={e => setHousingAllowance(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Transport allowance</label>
            <input className="input numeric" type="number" min={0} step="any" value={transportAllowance} onChange={e => setTransportAllowance(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Other allowances</label>
            <input className="input numeric" type="number" min={0} step="any" value={otherAllowances} onChange={e => setOtherAllowances(e.target.value)} />
          </div>
        </div>
        <div className="row between" style={{ font: "var(--t-body-md)" }}>
          <span style={{ color: "var(--ink-mute)" }}>Total gross salary</span>
          <strong className="numeric">{fmtMoney(total)}</strong>
        </div>

        {/* Bank */}
        <div style={cols3}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Bank account</label>
            <input className="input" value={bankAccount} onChange={e => setBankAccount(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>IBAN</label>
            <input className="input" value={iban} onChange={e => setIban(e.target.value)} placeholder="AE…" />
          </div>
        </div>

        <div className="col" style={{ gap: 4 }}>
          <label style={label}>Notes</label>
          <textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim()}>
            <Icon name="check" size={14} /> {isEdit ? "Save employee" : "Create employee"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Status-change dialog ───────────────────────────────── */
function StatusDialog({ employee, onClose, onSaved }: {
  employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const { me, fireToast } = useApp();
  const [status, setStatus] = useState<EmployeeStatus>(employee.status);
  const [separationDate, setSeparationDate] = useState(employee.separationDate ?? new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsSeparation = status === "resigned" || status === "terminated";

  const submit = async () => {
    setErr(null);
    if (needsSeparation && !separationDate) { setErr("Enter the separation date."); return; }
    setBusy(true);
    const res = await setEmployeeStatus(employee.id, status, me.id, needsSeparation ? separationDate : null);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${employee.name} → ${EMPLOYEE_STATUS_LABEL[status]}`);
    onSaved();
  };

  const label = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Change status</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{employee.employeeCode} · {employee.name}</div>

        <div className="col" style={{ gap: 4 }}>
          <label style={label}>Status</label>
          <select className="input" value={status} onChange={e => setStatus(e.target.value as EmployeeStatus)}>
            <option value="active">Active</option>
            <option value="probation">Probation</option>
            <option value="on_leave">On leave</option>
            <option value="resigned">Resigned</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>

        {needsSeparation && (
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Separation date<span style={{ color: "var(--dan-700)" }}>*</span></label>
            <input className="input" type="date" value={separationDate} onChange={e => setSeparationDate(e.target.value)} />
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>Used for end-of-service calculation (a later slice).</div>
          </div>
        )}

        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} /> Update status
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Existing-user picker (create mode only) ─────────────────
 * UI convenience so the Accountant can copy a name from the app's user
 * directory (db.USERS) instead of retyping it. Purely cosmetic — it sets
 * the name field and nothing else; NO link is stored between users and
 * employees. Manual entry stays available for people without a login
 * (drivers, cleaners, contractors).
 *
 * Renders inline (search input + full-width list, each row ≥44px), so on
 * mobile it fills the bottom-sheet modal rather than opening a tiny popup. */
function UserPicker({ picked, onPick, onClear }: {
  picked: User | null;
  onPick: (u: User) => void;
  onClear: () => void;
}) {
  const { dataVersion } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  // Everyone with a login except the platform super-admin. (The mock User
  // model carries no active/disabled flag, so "inactive" can't be filtered —
  // flagged in the slice report.)
  const users = useMemo(
    () => Object.values(db.USERS)
      .filter(u => !isPlatformRole(u.role))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [dataVersion],
  );
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users;
    return users.filter(u => `${u.name} ${ROLE_LABELS[u.role]} ${u.role}`.toLowerCase().includes(t));
  }, [users, q]);

  const lbl = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;

  return (
    <div className="col" style={{ gap: 6 }}>
      <label style={lbl}>Select from existing users <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>

      {picked ? (
        /* Selected — clearly indicated, with a Change affordance. */
        <div className="row between" style={{ alignItems: "center", gap: 10, padding: "8px 12px", minHeight: 44,
          border: "1px solid var(--suc-700)", background: "var(--suc-50, var(--bg-muted))", borderRadius: "var(--r-md)" }}>
          <div className="row" style={{ alignItems: "center", gap: 8, minWidth: 0 }}>
            <Icon name="check" size={15} />
            <div className="col" style={{ gap: 0, minWidth: 0 }}>
              <span style={{ font: "var(--t-body-md)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{picked.name}</span>
              <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{ROLE_LABELS[picked.role]}</span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 36 }}
            onClick={() => { onClear(); setQ(""); setOpen(true); }}>Change</button>
        </div>
      ) : open ? (
        /* Open list — search + full-width options. */
        <div className="col" style={{ gap: 0, border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
          <div className="row" style={{ alignItems: "center", gap: 6, padding: "0 10px", borderBottom: "1px solid var(--border)" }}>
            <Icon name="search" size={14} />
            <input className="input" autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search name or role…"
              style={{ border: "none", padding: "10px 0", flex: 1, background: "transparent" }} />
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Close list"
              style={{ minHeight: 36 }} onClick={() => setOpen(false)}><Icon name="chevronUp" size={15} /></button>
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 12 }}>No matching users.</div>
            ) : filtered.map(u => (
              <button key={u.id} type="button" onClick={() => { onPick(u); setOpen(false); setQ(""); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44,
                  padding: "8px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--border)",
                  textAlign: "left", cursor: "pointer" }}>
                <Icon name="user" size={15} />
                <span style={{ font: "var(--t-body-md)", fontWeight: 500 }}>{u.name}</span>
                <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>({ROLE_LABELS[u.role]})</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Closed — a single full-width control to open the list. */
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}
          style={{ justifyContent: "space-between", width: "100%", minHeight: 44, border: "1px solid var(--border)" }}>
          <span className="row" style={{ alignItems: "center", gap: 8 }}>
            <Icon name="users" size={15} /> Select from existing users
          </span>
          <Icon name="chevronDown" size={15} />
        </button>
      )}

      <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>Or enter the name manually below.</div>
    </div>
  );
}
