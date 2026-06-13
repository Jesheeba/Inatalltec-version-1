// ============================================================
// Accountant module · Phase 4 (Slice 4A) — Payroll / Employee master
// data layer (migration 0052).
//
// ISOLATED + ADDITIVE: self-contained, client-session (RLS-gated) data
// access — touches none of the shared hydrate/db/app-context mirrors,
// like the rest of lib/accounting/*.
//
// Slice 4A covers the Employee Salary Master only (CRUD + status). Payroll
// runs, payslips, WPS export and end-of-service calculation arrive in
// later slices and will extend this file.
//
// The gross total_salary is DB-generated (basic + housing + transport +
// other); this layer never computes authoritative pay.
// ============================================================

import { supabaseBrowser } from "@/lib/supabase/client";
import type { AcctResult } from "./settings";

export type EmployeeStatus = "active" | "on_leave" | "probation" | "resigned" | "terminated";

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: "Active",
  on_leave: "On leave",
  probation: "Probation",
  resigned: "Resigned",
  terminated: "Terminated",
};

export interface Employee {
  id: string;
  orgKey: string;
  employeeCode: string;
  name: string;
  position: string | null;
  department: string | null;
  dateOfJoining: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  passportNumber: string | null;
  emiratesId: string | null;
  visaStatus: string | null;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  totalSalary: number;       // generated (gross)
  bankAccount: string | null;
  iban: string | null;
  status: EmployeeStatus;
  separationDate: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const EMPLOYEE_COLS =
  "id, org_key, employee_code, name, position, department, date_of_joining, date_of_birth, nationality, passport_number, emirates_id, visa_status, basic_salary, housing_allowance, transport_allowance, other_allowances, total_salary, bank_account, iban, status, separation_date, notes, created_by, created_at, updated_at";

const n = (v: unknown, dflt = 0): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : dflt; };
const s = (v: unknown, dflt = ""): string => (typeof v === "string" ? v : dflt);
const sn = (v: unknown): string | null => (typeof v === "string" ? v : null);

function rowToEmployee(r: Record<string, unknown>): Employee {
  return {
    id: s(r.id), orgKey: s(r.org_key, "org_installtec"), employeeCode: s(r.employee_code),
    name: s(r.name), position: sn(r.position), department: sn(r.department),
    dateOfJoining: sn(r.date_of_joining), dateOfBirth: sn(r.date_of_birth),
    nationality: sn(r.nationality), passportNumber: sn(r.passport_number),
    emiratesId: sn(r.emirates_id), visaStatus: sn(r.visa_status),
    basicSalary: n(r.basic_salary), housingAllowance: n(r.housing_allowance),
    transportAllowance: n(r.transport_allowance), otherAllowances: n(r.other_allowances),
    totalSalary: n(r.total_salary),
    bankAccount: sn(r.bank_account), iban: sn(r.iban),
    status: (r.status as EmployeeStatus) ?? "active",
    separationDate: sn(r.separation_date), notes: sn(r.notes),
    createdBy: sn(r.created_by), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}

// ── Fetch ───────────────────────────────────────────────────
export interface EmployeeFilter { status?: EmployeeStatus; department?: string; search?: string; }

export async function fetchEmployees(filter?: EmployeeFilter): Promise<AcctResult<Employee[]>> {
  let q = supabaseBrowser().from("employees").select(EMPLOYEE_COLS).order("name", { ascending: true });
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.department) q = q.eq("department", filter.department);
  if (filter?.search?.trim()) {
    const t = filter.search.trim().replace(/[%,]/g, " ");
    q = q.or(`name.ilike.%${t}%,employee_code.ilike.%${t}%,position.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToEmployee(r as Record<string, unknown>)) };
}

export async function fetchEmployee(id: string): Promise<AcctResult<Employee>> {
  const { data, error } = await supabaseBrowser().from("employees").select(EMPLOYEE_COLS).eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Employee not found." };
  return { ok: true, data: rowToEmployee(data as Record<string, unknown>) };
}

// ── Create / edit ───────────────────────────────────────────
export interface EmployeeInput {
  name: string;
  position?: string;
  department?: string;
  dateOfJoining?: string | null;
  dateOfBirth?: string | null;
  nationality?: string;
  passportNumber?: string;
  emiratesId?: string;
  visaStatus?: string;
  basicSalary?: number;
  housingAllowance?: number;
  transportAllowance?: number;
  otherAllowances?: number;
  bankAccount?: string;
  iban?: string;
  notes?: string;
}

function employeeBody(input: Partial<EmployeeInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const setStr = (key: string, v: string | undefined) => { if (v !== undefined) body[key] = v.trim() || null; };
  const setDate = (key: string, v: string | null | undefined) => { if (v !== undefined) body[key] = v || null; };
  const setNum = (key: string, v: number | undefined) => { if (v !== undefined) body[key] = n(v); };
  if (input.name !== undefined) body.name = input.name.trim();
  setStr("position", input.position);
  setStr("department", input.department);
  setDate("date_of_joining", input.dateOfJoining);
  setDate("date_of_birth", input.dateOfBirth);
  setStr("nationality", input.nationality);
  setStr("passport_number", input.passportNumber);
  setStr("emirates_id", input.emiratesId);
  setStr("visa_status", input.visaStatus);
  setNum("basic_salary", input.basicSalary);
  setNum("housing_allowance", input.housingAllowance);
  setNum("transport_allowance", input.transportAllowance);
  setNum("other_allowances", input.otherAllowances);
  setStr("bank_account", input.bankAccount);
  setStr("iban", input.iban);
  setStr("notes", input.notes);
  return body;
}

export async function createEmployee(input: EmployeeInput, createdBy: string | null): Promise<AcctResult<Employee>> {
  if (!input.name?.trim()) return { ok: false, error: "Employee name is required." };
  const body = employeeBody(input);
  body.created_by = createdBy;
  const { data, error } = await supabaseBrowser().from("employees").insert(body).select(EMPLOYEE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to create employee." };
  return { ok: true, data: rowToEmployee(data as Record<string, unknown>) };
}

export async function updateEmployee(id: string, patch: Partial<EmployeeInput>, actorId: string | null): Promise<AcctResult<Employee>> {
  const body = employeeBody(patch);
  if (Object.keys(body).length === 0) return { ok: false, error: "Nothing to update." };
  body.last_action_by = actorId;
  const { data, error } = await supabaseBrowser().from("employees").update(body).eq("id", id).select(EMPLOYEE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update employee." };
  return { ok: true, data: rowToEmployee(data as Record<string, unknown>) };
}

// ── Status ──────────────────────────────────────────────────
// Resigned / terminated optionally carry a separation date (drives EOS in 4E).
export async function setEmployeeStatus(
  id: string, status: EmployeeStatus, actorId: string | null, separationDate?: string | null,
): Promise<AcctResult<Employee>> {
  const body: Record<string, unknown> = { status, last_action_by: actorId };
  if (status === "resigned" || status === "terminated") {
    if (separationDate !== undefined) body.separation_date = separationDate || null;
  } else {
    // Re-activating clears any prior separation date.
    body.separation_date = null;
  }
  const { data, error } = await supabaseBrowser().from("employees").update(body).eq("id", id).select(EMPLOYEE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Failed to update status." };
  return { ok: true, data: rowToEmployee(data as Record<string, unknown>) };
}
