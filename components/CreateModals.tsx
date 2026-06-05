"use client";
// ============================================================
// Create flows - modal host + Picker + entity forms.
// Uses the prototype's design system: accent gradient hero,
// grouped sections, .input / .textarea / .select primitives,
// .form-foot button row with primary CTA. On submit:
//   - validate required fields
//   - write to Supabase (or in-memory in mock mode)
//   - inline error toast + close + bump context for list refresh
// ============================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Modal } from "./shared";
import { useApp, type CreateKind } from "@/lib/app-context";
import { db, ROLE_LABELS } from "@/lib/db";
import type { IconName, Role } from "@/lib/types";
import {
  createAmc, createApproval, createCustomer, createOrganization, createProject,
  createRepairTicket, createSite, updateSite, createUser, createWorkOrder, updateOrganization,
  PROJECT_STATUSES, PROJECT_STAGES, PROJECT_STATUS_LABEL, PROJECT_STAGE_LABEL,
  recordAmcPayment, AMC_PAYMENT_METHOD_LABEL,
  JOB_CATEGORIES, JOB_CATEGORY_LABEL,
  UAE_EMIRATES,
  createReplacementRequest, REPLACEMENT_CONTEXT_LABEL,
  createSubContractor, assignSubContractorToWO,
  logSubContractorHours, editSubContractorHoursEntry,
  createFreeCall, createQuotation, linkFreeCallToWorkOrder,
  type ProjectStatus, type ProjectStage, type AmcPaymentMethod,
  type JobCategory, type ContractMeta,
} from "@/lib/create";
import { formatMonthDay } from "@/lib/dates";
import type { ProjectPhase, ReplacementContext } from "@/lib/types";
import { PROJECT_PHASES, PROJECT_PHASE_LABEL } from "@/lib/phases";
import { can, type PermissionAction } from "@/lib/permissions";
import { createNote, updateNote } from "@/lib/notes";
import { currencySymbol } from "@/lib/format";
import {
  formatConflictLabel, getWorkerConflictsFor, getSubContractorConflictsFor,
  type WorkerConflict,
} from "@/lib/conflicts";

/* ─── Host ──────────────────────────────────────────────── */
export function CreateModalsHost() {
  const { create, closeCreate } = useApp();
  if (!create) return null;
  return (
    <Modal open onClose={closeCreate} lg={create.kind !== "picker"}>
      {create.kind === "picker" && <Picker />}
      {create.kind === "user" && (
        <RoleGate action="CREATE_USER" kindLabel="users"><UserForm /></RoleGate>
      )}
      {create.kind === "customer" && (
        <RoleGate action="CREATE_CUSTOMER" kindLabel="customers"><CustomerForm /></RoleGate>
      )}
      {create.kind === "site" && (
        <RoleGate action="CREATE_SITE" kindLabel="sites"><SiteForm /></RoleGate>
      )}
      {create.kind === "project" && (
        <RoleGate action="CREATE_PROJECT" kindLabel="Main Contractor jobs"><ProjectForm /></RoleGate>
      )}
      {create.kind === "amc" && (
        <RoleGate action="CREATE_AMC" kindLabel="AMC contracts"><AmcForm /></RoleGate>
      )}
      {create.kind === "workorder" && (
        <RoleGate action="CREATE_WORK_ORDER" kindLabel="work orders"><WorkOrderForm /></RoleGate>
      )}
      {create.kind === "repair" && (
        <RoleGate action="CREATE_REPAIR" kindLabel="repair tickets"><RepairForm /></RoleGate>
      )}
      {create.kind === "material_request" && (
        <RoleGate action="CREATE_MATERIAL_REQUEST" kindLabel="material requests"><MaterialRequestForm /></RoleGate>
      )}
      {create.kind === "delivery" && (
        <RoleGate action="CREATE_WORK_ORDER" kindLabel="deliveries"><WorkOrderForm fixedType="DELIVERY" /></RoleGate>
      )}
      {create.kind === "team_member" && <UserForm teamOnly />}
      {create.kind === "quotation" && (
        <RoleGate action="CREATE_QUOTATION" kindLabel="quotations"><QuotationForm /></RoleGate>
      )}
      {create.kind === "organization" && <OrganizationForm />}
      {create.kind === "note" && <NoteForm />}
      {create.kind === "amc_payment" && <PaymentForm />}
      {create.kind === "replacement_request" && (
        <RoleGate action="CREATE_REPLACEMENT" kindLabel="replacement requests"><ReplacementRequestForm /></RoleGate>
      )}
      {create.kind === "sub_contractor" && <SubContractorForm />}
      {create.kind === "sub_hours" && <LogSubHoursForm />}
      {create.kind === "free_call" && <FreeCallForm />}
      {create.kind === "quotation_v2" && <QuotationFormV2 />}
    </Modal>
  );
}

/* ─── Reusable primitives ──────────────────────────────── */
function FormShell({
  icon, title, sub, busy, error, submitLabel = "Create",
  onSubmit, children, footerHint,
}: {
  icon: IconName; title: string; sub?: string;
  busy: boolean; error: string | null;
  submitLabel?: string;
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
  footerHint?: ReactNode;
}) {
  const { closeCreate } = useApp();
  return (
    <form onSubmit={onSubmit}>
      <div className="form-hero">
        <div className="form-hero-icon"><Icon name={icon} size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="form-hero-title">{title}</div>
          {sub && <div className="form-hero-sub">{sub}</div>}
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={closeCreate} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="form-body">{children}</div>

      {error && (
        <div className="form-error">
          <Icon name="alertCircle" size={14} /> {error}
        </div>
      )}

      <div className="form-foot">
        {footerHint && (
          <div style={{ flex: 1, font: "var(--t-small)", color: "var(--ink-mute)", display: "flex", alignItems: "center", gap: 8 }}>
            {footerHint}
          </div>
        )}
        <button type="button" className="btn btn-ghost" onClick={closeCreate}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? <><Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
            : <><Icon name="check" size={14} /> {submitLabel}</>}
        </button>
      </div>
    </form>
  );
}

// Friendly shell rendered when a user reaches a create form they don't have
// permission for (URL manipulation, stale openCreate call after role switch,
// etc.). Keeps the modal closeable so they're not stuck.
function DeniedShell({ kindLabel }: { kindLabel: string }) {
  const { closeCreate, role } = useApp();
  return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--dan-50)", color: "var(--dan-700)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Icon name="alertCircle" size={22} />
      </div>
      <div style={{ font: "var(--t-h3)" }}>You don't have permission</div>
      <div style={{ font: "var(--t-body)", color: "var(--ink-mute)", marginTop: 6 }}>
        Your role ({ROLE_LABELS[role] ?? role}) isn't allowed to create {kindLabel}. Speak to an Operations Manager if you think this is wrong.
      </div>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={closeCreate}>Close</button>
    </div>
  );
}

// Render-time gate: returns the granted-form children, or a DeniedShell.
// Picker already filters by role, but this is defence-in-depth for
// scenarios where openCreate(kind) is called directly (deep-link, prefill
// flow, stale state after role-switch).
function RoleGate({ action, kindLabel, children }: { action: PermissionAction; kindLabel: string; children: ReactNode }) {
  const { role } = useApp();
  if (!can(role, action)) return <DeniedShell kindLabel={kindLabel} />;
  return <>{children}</>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="form-row">{children}</div>;
}

function Field({ label, required, hint, children }:
  { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">
        {label}{required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

// Checkbox + label + hint, laid out like the rest of the form so a stack of
// them reads as a single field. The 44px tap area keeps it mobile-usable.
function CheckboxField({ checked, onChange, label, hint }:
  { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="field">
      <label style={{
        display: "flex", gap: 12, alignItems: "flex-start",
        cursor: "pointer", minHeight: 44, padding: "4px 0",
      }}>
        <input type="checkbox" checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ marginTop: 4, width: 18, height: 18, flexShrink: 0, cursor: "pointer" }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--t-body-md)" }}>{label}</div>
          {hint && <div className="field-hint" style={{ marginTop: 2 }}>{hint}</div>}
        </span>
      </label>
    </div>
  );
}

// Inline warning block surfaced below a worker picker when the chosen
// worker has another active WO in the selected time window. Non-blocking
// — the Lead Tech can still submit. Renders nothing when conflicts is
// empty so it's safe to drop into a form unconditionally.
function ConflictWarning({ workerName, conflicts }: {
  workerName: string;
  conflicts: WorkerConflict[];
}) {
  if (conflicts.length === 0) return null;
  return (
    <div role="status" style={{
      marginTop: 6,
      padding: "8px 10px",
      borderRadius: "var(--r-sm)",
      background: "var(--warn-100)",
      border: "1px solid var(--warn-100)",
      color: "var(--warn-700)",
      font: "var(--t-small)",
      display: "flex", gap: 8, alignItems: "flex-start",
    }}>
      <Icon name="alertTriangle" size={14} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {workerName} has {conflicts.length === 1 ? "a conflicting work order" : `${conflicts.length} conflicting work orders`}
        </div>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {conflicts.slice(0, 3).map(c => (
            <li key={c.workOrderId} style={{ marginTop: 2 }}>
              {formatConflictLabel(c)}{c.isLead ? " (lead)" : ""}
            </li>
          ))}
          {conflicts.length > 3 && (
            <li style={{ marginTop: 2, color: "var(--warn-700)", opacity: 0.8 }}>
              +{conflicts.length - 3} more
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

interface Opt { value: string; label: string; disabled?: boolean }
function Select({ value, onChange, options, placeholder, required, disabled }:
  { value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; required?: boolean; disabled?: boolean }) {
  return (
    <select className="select" value={value} required={required} disabled={disabled}
      onChange={e => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
}

// Sentinel selected when the user picks the "+ Add new site" row from the
// dropdown. We intercept this value in SiteSelectField → it never reaches
// the parent form, so parent.site_id stays untouched while the inline form
// is open.
const SITE_ADD_NEW = "__site_add_new__";

/**
 * SiteSelectField — the customer-gated Site picker used by the 4 entity
 * creation forms (Project, AMC, WorkOrder, Repair).
 *
 *   - Disabled until the parent picks a Customer.
 *   - Lists that customer's active sites + a "+ Add new site" sentinel row.
 *   - When the sentinel is picked, expands an inline mini-form (name / area /
 *     emirate). On save it calls createSite, bumps data, fires a toast, and
 *     auto-selects the new site in the dropdown. The parent's other form
 *     fields are untouched — that's the whole point.
 *   - On cancel the dropdown returns to whatever was selected before.
 */
function SiteSelectField({ customerId, siteId, onSiteChange }: {
  customerId: string;
  siteId: string;
  onSiteChange: (id: string) => void;
}) {
  const { fireToast, bumpData, dataVersion } = useApp();
  // Subscribe to dataVersion so a newly created site (mirrored into db.SITES
  // by createSite) shows up in the options without needing a parent re-render.
  const sites = useMemo(
    () => Object.values(db.SITES).filter(s => s.customer === customerId && s.is_active !== false),
    [customerId, dataVersion],
  );
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [g, setG] = useState({ name: "", area: "", emirate: "" });

  // Reset the inline form whenever the parent switches customer — a half-typed
  // site for the previous customer should not survive the switch.
  useEffect(() => {
    setAdding(false);
    setErr(null);
    setG({ name: "", area: "", emirate: "" });
  }, [customerId]);

  const options = customerId
    ? [
        ...sites.map(s => ({ value: s.id, label: s.name })),
        { value: SITE_ADD_NEW, label: "+ Add new site" },
      ]
    : [];

  const onSelectChange = (v: string) => {
    if (v === SITE_ADD_NEW) {
      // Open the inline form without polluting siteId. The select element's
      // controlled `value` prop is still siteId, so React snaps it back on
      // the next render.
      setAdding(true);
      setErr(null);
      return;
    }
    onSiteChange(v);
  };

  const addNewSite = async () => {
    if (!g.name.trim()) { setErr("Site name is required."); return; }
    if (!customerId)    { setErr("Pick a customer first."); return; }
    setBusy(true); setErr(null);
    const res = await createSite({
      name: g.name,
      customer_id: customerId,
      area: g.area || undefined,
      emirate: g.emirate || undefined,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onSiteChange(res.id);
    bumpData();
    fireToast(`Site "${g.name.trim()}" added`);
    setAdding(false);
    setG({ name: "", area: "", emirate: "" });
  };

  const cancelAdd = () => {
    setAdding(false);
    setErr(null);
    setG({ name: "", area: "", emirate: "" });
  };

  return (
    <div className="col" style={{ gap: 8 }}>
      <Select
        value={siteId}
        onChange={onSelectChange}
        placeholder={!customerId ? "Pick a customer first" : "- Select -"}
        disabled={!customerId}
        options={options}
      />
      {adding && customerId && (
        <div
          // Visually nested inside the parent form. Tinted background + accent
          // border so it reads as "you're creating a sub-entity".
          style={{
            background: "var(--pri-50)",
            border: "1px solid var(--pri-200)",
            borderRadius: "var(--r-md)",
            padding: 14,
            display: "flex", flexDirection: "column", gap: 10,
          }}
        >
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <Icon name="mapPin" size={14} style={{ color: "var(--pri-700)" }} />
            <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>New site for this customer</span>
          </div>
          <div className="field">
            <label className="field-label">Site name<span className="req">*</span></label>
            <input
              className="input"
              autoFocus
              value={g.name}
              onChange={e => setG({ ...g, name: e.target.value })}
              placeholder="e.g. Bay Gate Tower"
            />
          </div>
          <div className="form-row">
            <div className="field">
              <label className="field-label">Area</label>
              <input
                className="input"
                value={g.area}
                onChange={e => setG({ ...g, area: e.target.value })}
                placeholder="e.g. Marina, Business Bay"
              />
            </div>
            <div className="field">
              <label className="field-label">Emirate</label>
              <Select
                value={g.emirate}
                onChange={v => setG({ ...g, emirate: v })}
                placeholder="- Select -"
                options={UAE_EMIRATES.map(e => ({ value: e, label: e }))}
              />
            </div>
          </div>
          {err && (
            <div className="form-error" style={{ marginTop: 0 }}>
              <Icon name="alertCircle" size={14} /> {err}
            </div>
          )}
          <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancelAdd} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={addNewSite} disabled={busy}>
              {busy
                ? <><Icon name="loader" size={12} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                : <><Icon name="plus" size={12} /> Add site</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Picker (what do you want to create?) ─────────────── */
function Picker() {
  const { openCreate, closeCreate, role } = useApp();
  const items: { kind: CreateKind; label: string; sub: string; icon: IconName; roles?: Role[] }[] = [
    { kind: "workorder", label: "Work order", sub: "Schedule field execution", icon: "briefcase", roles: ["admin", "md", "manager", "lead_worker"] },
    { kind: "customer", label: "Customer", sub: "Add a new account", icon: "building", roles: ["admin", "md", "manager", "sales"] },
    { kind: "site", label: "Site", sub: "Customer location for field work", icon: "mapPin", roles: ["admin", "md", "manager", "lead_worker"] },
    { kind: "project", label: "Main Contractor Job", sub: "Installation contract with milestones and payment terms", icon: "layers", roles: ["admin", "md", "manager"] },
    { kind: "amc", label: "AMC contract", sub: "Annual maintenance, 4 quarterly services", icon: "shieldCheck", roles: ["admin", "md", "manager"] },
    { kind: "repair", label: "Repair ticket", sub: "Log a service request", icon: "wrench", roles: ["admin", "md", "manager"] },
    { kind: "material_request", label: "Material request", sub: "Approval-routed materials", icon: "package", roles: ["admin", "md", "manager", "lead_worker"] },
    { kind: "user", label: "User", sub: "Invite a team member", icon: "user", roles: ["admin"] },
  ];
  const visible = items.filter(i => !i.roles || i.roles.includes(role));

  return (
    <>
      <div className="form-hero">
        <div className="form-hero-icon"><Icon name="plus" size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="form-hero-title">Create</div>
          <div className="form-hero-sub">What would you like to add?</div>
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={closeCreate} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div style={{ padding: 12 }}>
        {visible.map(it => (
          <div key={it.kind} onClick={() => openCreate(it.kind)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--r-md)", cursor: "pointer", transition: "background .14s" }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ""}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--bg-muted)", color: "var(--ink-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={it.icon} size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "var(--t-body-md)" }}>{it.label}</div>
              <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{it.sub}</div>
            </div>
            <Icon name="chevronRight" size={14} style={{ color: "var(--ink-quiet)" }} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── Credentials issued (post-create) ───────────────────── */
// Shown after a user is created so the admin can copy + share the login.
function CredentialsIssued({ name, email, password, onDone }: {
  name: string; email: string; password: string; onDone: () => void;
}) {
  const [copied, setCopied] = useState<"email" | "password" | "both" | null>(null);
  const copy = async (text: string, tag: "email" | "password" | "both") => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1800); }
    catch { /* clipboard may be blocked - ignore */ }
  };
  const both = `Email: ${email}\nPassword: ${password}`;

  const Row = ({ k, v, tag }: { k: string; v: string; tag: "email" | "password" }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 12px", background: "var(--bg-muted)",
      borderRadius: "var(--r-md)", border: "1px solid var(--border)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k}</div>
        <div className="numeric truncate" style={{ font: "var(--t-body-md)", fontFamily: "var(--font-mono)" }}>{v}</div>
      </div>
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => copy(v, tag)} title={`Copy ${k.toLowerCase()}`}>
        <Icon name={copied === tag ? "check" : "paperclip"} size={14} />
      </button>
    </div>
  );

  return (
    <>
      <div className="form-hero">
        <div className="form-hero-icon"><Icon name="checkCircle" size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="form-hero-title">Account created</div>
          <div className="form-hero-sub">Share these credentials with {name} - password follows the FirstName@123 rule.</div>
        </div>
      </div>

      <div className="form-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Row k="Email" v={email} tag="email" />
        <Row k="Password" v={password} tag="password" />

        <div style={{
          padding: "10px 12px", background: "var(--warn-50)", color: "var(--warn-700)",
          borderRadius: "var(--r-md)", border: "1px solid var(--warn-100)",
          font: "var(--t-small)", display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <Icon name="alertCircle" size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>This is shown once. Ask the user to sign in and change their password from their profile.</span>
        </div>
      </div>

      <div className="form-foot">
        <div style={{ flex: 1 }}>
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => copy(both, "both")}>
            <Icon name={copied === "both" ? "check" : "paperclip"} size={14} />
            {copied === "both" ? "Copied" : "Copy both"}
          </button>
        </div>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          <Icon name="check" size={14} /> Done
        </button>
      </div>
    </>
  );
}

/* ─── USER / TEAM MEMBER ────────────────────────────────── */
function UserForm({ teamOnly }: { teamOnly?: boolean }) {
  const { closeCreate, fireToast, bumpData, create, role: actorRole } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string; name: string } | null>(null);
  const prefillRole = (create?.prefill?.role as Role | undefined);
  const prefillOrg = (create?.prefill?.organization_id as string | undefined);

  // v6 governance (PART 2): Admin cannot create Admins or Super Admins -
  // only Super Admin can. Field-worker forms stay scoped to the field set.
  const allowedRoles: Role[] = teamOnly
    ? ["lead_worker", "worker", "driver", "subcontractor"]
    : actorRole === "super_admin"
      ? ["admin", "md", "manager", "sales", "estimator", "lead_worker", "worker", "driver", "subcontractor", "service_support", "accounts"]
      : ["md", "manager", "sales", "estimator", "lead_worker", "worker", "driver", "subcontractor", "service_support", "accounts"];

  // If a stale prefill asks for a role the actor isn't allowed to grant, fall back.
  const safeInitialRole: Role = prefillRole && allowedRoles.includes(prefillRole)
    ? prefillRole
    : (teamOnly ? "worker" : allowedRoles[0]);

  const [f, setF] = useState({
    full_name: "", email: "", phone: "",
    role: safeInitialRole,
    region: "UAE",
    manager_id: "",
    organization_id: prefillOrg ?? "",
  });
  const managers = useMemo(() =>
    Object.values(db.USERS).filter(u => u.role === "manager" || u.role === "lead_worker")
    , []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    // Defence in depth: even if the dropdown was tampered with, refuse to mint
    // an Admin or Super Admin unless the actor is Super Admin.
    if ((f.role === "admin" || f.role === "super_admin") && actorRole !== "super_admin") {
      setBusy(false);
      setErr("Only Super Admin can create Admin or Super Admin accounts.");
      return;
    }
    const res = await createUser({
      full_name: f.full_name, email: f.email, phone: f.phone, role: f.role,
      region: f.region, manager_id: f.manager_id || null,
      organization_id: f.organization_id || undefined,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(teamOnly ? "Team member added" : "User created");
    bumpData();
    // Surface the auto-generated credentials so the admin can pass them on.
    if (res.credentials) {
      setIssued({ ...res.credentials, name: f.full_name });
    } else {
      closeCreate();
    }
  };

  // After success, show a credentials card instead of the form.
  if (issued) {
    return (
      <CredentialsIssued
        name={issued.name}
        email={issued.email}
        password={issued.password}
        onDone={closeCreate}
      />
    );
  }

  return (
    <FormShell icon={teamOnly ? "users" : "user"}
      title={teamOnly ? "Add team member" : "New user"}
      sub={teamOnly ? "Adds a field worker, lead, driver, or subcontractor" : "Create a system user - admin sets role and scope"}
      busy={busy} error={err} onSubmit={submit}
      submitLabel={teamOnly ? "Add member" : "Create user"}>
      <Section title="Identity">
        <Row>
          <Field label="Full name" required>
            <input className="input" required value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} placeholder="e.g. Layla Hassan" />
          </Field>
          <Field label="Email" required>
            <input className="input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="layla@installtec.ae" />
          </Field>
        </Row>
        <Row>
          <Field label="Phone">
            <input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+971 ..." />
          </Field>
          <Field label="Region">
            <Select value={f.region} onChange={v => setF({ ...f, region: v })}
              options={["UAE", "KSA", "Ethiopia", "Uganda", "India"].map(r => ({ value: r, label: r }))} />
          </Field>
        </Row>
      </Section>

      <Section title="Role & scope">
        <Row>
          <Field label="Role" required>
            <Select value={f.role} onChange={v => setF({ ...f, role: v as Role })}
              options={allowedRoles.map(r => ({ value: r, label: ROLE_LABELS[r] }))} />
          </Field>
          <Field label="Reports to">
            <Select value={f.manager_id} onChange={v => setF({ ...f, manager_id: v })}
              placeholder="- None -"
              options={managers.map(m => ({ value: m.id, label: `${m.name} · ${ROLE_LABELS[m.role]}` }))} />
          </Field>
        </Row>
        {Object.keys(db.ORGANIZATIONS).length > 1 && (
          <Field label="Organization" required={f.role === "admin"}
            hint="Which tenant this user belongs to - defaults to the first organization.">
            <Select value={f.organization_id} onChange={v => setF({ ...f, organization_id: v })}
              placeholder="- Default org -"
              options={Object.values(db.ORGANIZATIONS).map(o => ({ value: o.id, label: o.display_name }))} />
          </Field>
        )}
      </Section>
    </FormShell>
  );
}

/* ─── CUSTOMER ──────────────────────────────────────────── */
function CustomerForm() {
  const { closeCreate, fireToast, bumpData } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "", tier: "Standard" as "Strategic" | "Key" | "Standard",
    region: "UAE", sector: "Real Estate", owner_id: "", tagsCsv: "",
  });
  const salesUsers = useMemo(() =>
    Object.values(db.USERS).filter(u => u.role === "sales" || u.role === "manager")
    , []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    const res = await createCustomer({
      name: f.name, tier: f.tier, region: f.region, sector: f.sector,
      owner_id: f.owner_id || null,
      tags: f.tagsCsv.split(",").map(s => s.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Customer added"); bumpData(); closeCreate();
  };

  return (
    <FormShell icon="building" title="New customer"
      sub="Adds a customer account - sites, jobs, AMCs and tickets attach to this"
      busy={busy} error={err} onSubmit={submit} submitLabel="Add customer">
      <Section title="Profile">
        <Field label="Customer name" required>
          <input className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Sobha Realty" />
        </Field>
        <Row>
          <Field label="Tier" required>
            <Select value={f.tier} onChange={v => setF({ ...f, tier: v as typeof f.tier })}
              options={[{ value: "Strategic", label: "Strategic" }, { value: "Key", label: "Key" }, { value: "Standard", label: "Standard" }]} />
          </Field>
          <Field label="Region">
            <Select value={f.region} onChange={v => setF({ ...f, region: v })}
              options={["UAE", "KSA", "Ethiopia", "Uganda", "India"].map(r => ({ value: r, label: r }))} />
          </Field>
        </Row>
      </Section>

      <Section title="Account">
        <Row>
          <Field label="Sector">
            <Select value={f.sector} onChange={v => setF({ ...f, sector: v })}
              options={["Real Estate", "Healthcare", "Education", "Government", "Hospitality", "Industrial"].map(s => ({ value: s, label: s }))} />
          </Field>
          <Field label="Account owner">
            <Select value={f.owner_id} onChange={v => setF({ ...f, owner_id: v })}
              placeholder="- Unassigned -"
              options={salesUsers.map(u => ({ value: u.id, label: u.name }))} />
          </Field>
        </Row>
        <Field label="Tags" hint="Comma-separated - e.g. CCTV, ACS, Fiber">
          <input className="input" value={f.tagsCsv} onChange={e => setF({ ...f, tagsCsv: e.target.value })} placeholder="CCTV, ACS" />
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── SITE ──────────────────────────────────────────────── */
// When prefill includes `id`, the form switches into edit mode and calls
// updateSite instead of createSite. This is how SiteDetail's "Edit" button
// reuses the same modal for both flows.
function SiteForm() {
  const { closeCreate, fireToast, bumpData, create } = useApp();
  const prefill = (create?.prefill ?? {}) as {
    id?: string;
    customer_id?: string;
    name?: string;
    address_line_1?: string;
    address_line_2?: string;
    area?: string;
    emirate?: string;
    contact_name?: string;
    contact_phone?: string;
    contact_email?: string;
    access_instructions?: string;
    geo_lat?: number;
    geo_lng?: number;
  };
  const isEdit = !!prefill.id;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // GPS is stored as two numeric columns in DB but presented as a single
  // "lat, lng" field in the UI — most field crew copy/paste it from Google
  // Maps as one string. We split on submit.
  const initialGps =
    typeof prefill.geo_lat === "number" && typeof prefill.geo_lng === "number"
      ? `${prefill.geo_lat}, ${prefill.geo_lng}`
      : "";
  const [f, setF] = useState({
    customer_id: prefill.customer_id ?? "",
    name: prefill.name ?? "",
    address_line_1: prefill.address_line_1 ?? "",
    address_line_2: prefill.address_line_2 ?? "",
    area: prefill.area ?? "",
    emirate: prefill.emirate ?? "",
    gps: initialGps,
    contact_name: prefill.contact_name ?? "",
    contact_phone: prefill.contact_phone ?? "",
    contact_email: prefill.contact_email ?? "",
    access_instructions: prefill.access_instructions ?? "",
  });
  const customers = Object.values(db.CUSTOMERS);

  const parseGps = (raw: string): { lat: number | null; lng: number | null; err: string | null } => {
    const s = raw.trim();
    if (!s) return { lat: null, lng: null, err: null };
    const parts = s.split(/[,\s]+/).filter(Boolean).map(p => Number(p));
    if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) {
      return { lat: null, lng: null, err: "GPS must be two numbers, e.g. 25.2048, 55.2708" };
    }
    return { lat: parts[0]!, lng: parts[1]!, err: null };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const gps = parseGps(f.gps);
    if (gps.err) { setErr(gps.err); return; }
    setBusy(true);
    const payload = {
      customer_id: f.customer_id,
      name: f.name,
      address_line_1: f.address_line_1,
      address_line_2: f.address_line_2,
      area: f.area,
      emirate: f.emirate,
      geo_lat: gps.lat,
      geo_lng: gps.lng,
      contact_name: f.contact_name,
      contact_phone: f.contact_phone,
      contact_email: f.contact_email,
      access_instructions: f.access_instructions,
    };
    const res = isEdit
      ? await updateSite(prefill.id!, payload)
      : await createSite(payload);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(isEdit ? `Site "${f.name}" updated` : `Site "${f.name}" added`);
    bumpData();
    closeCreate();
  };

  return (
    <FormShell icon="mapPin" title={isEdit ? "Edit site" : "New site"}
      sub="A customer location where work is delivered"
      busy={busy} error={err} onSubmit={submit}
      submitLabel={isEdit ? "Save site" : "Create site"}>
      <Section title="Basics">
        <Field label="Site name" required>
          <input className="input" required value={f.name}
            onChange={e => setF({ ...f, name: e.target.value })}
            placeholder="e.g. Bay Gate Tower, MAG 318, Marina HQ" />
        </Field>
        <Field label="Customer" required>
          <Select required value={f.customer_id}
            onChange={v => setF({ ...f, customer_id: v })}
            placeholder="- Select -"
            options={customers.map(c => ({ value: c.id, label: c.name }))} />
        </Field>
      </Section>

      <Section title="Location">
        <Field label="Address line 1">
          <input className="input" value={f.address_line_1}
            onChange={e => setF({ ...f, address_line_1: e.target.value })}
            placeholder="Building / street" />
        </Field>
        <Field label="Address line 2">
          <input className="input" value={f.address_line_2}
            onChange={e => setF({ ...f, address_line_2: e.target.value })}
            placeholder="Unit, floor, landmark" />
        </Field>
        <Row>
          <Field label="City / area">
            <input className="input" value={f.area}
              onChange={e => setF({ ...f, area: e.target.value })}
              placeholder="e.g. Marina, Business Bay" />
          </Field>
          <Field label="Emirate">
            <Select value={f.emirate} onChange={v => setF({ ...f, emirate: v })}
              placeholder="- Select -"
              options={UAE_EMIRATES.map(e => ({ value: e, label: e }))} />
          </Field>
        </Row>
        <Field label="GPS coordinates" hint="Optional — paste 'lat, lng' from Google Maps">
          <input className="input numeric" value={f.gps}
            onChange={e => setF({ ...f, gps: e.target.value })}
            placeholder="25.2048, 55.2708" />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Site contact name">
          <input className="input" value={f.contact_name}
            onChange={e => setF({ ...f, contact_name: e.target.value })}
            placeholder="Facilities manager, security lead, etc." />
        </Field>
        <Row>
          <Field label="Contact phone" hint="+971 prefix for UAE numbers">
            <input className="input" value={f.contact_phone}
              onChange={e => setF({ ...f, contact_phone: e.target.value })}
              placeholder="+971 50 123 4567" />
          </Field>
          <Field label="Contact email">
            <input className="input" type="email" value={f.contact_email}
              onChange={e => setF({ ...f, contact_email: e.target.value })}
              placeholder="contact@example.ae" />
          </Field>
        </Row>
        <Field label="Access notes">
          <textarea className="textarea" rows={2} value={f.access_instructions}
            onChange={e => setF({ ...f, access_instructions: e.target.value })}
            placeholder="e.g. Security check at gate, parking on B2, ask for facilities manager" />
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── PROJECT ───────────────────────────────────────────── */
function ProjectForm() {
  const { closeCreate, fireToast, bumpData, create, currentOrg } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const initialCustomer = (create?.prefill?.customer_id as string) || "";
  // Phase 9.x Part 4 auto-assign — same pattern as AmcForm above.
  const managers = useMemo(() => Object.values(db.USERS).filter(u => u.role === "manager"), []);
  const autoManager = managers.length === 1 ? managers[0] : null;
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[Auto-assign] Active manager:", autoManager?.name ?? "NONE");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [f, setF] = useState({
    name: "", code: "",
    customer_id: initialCustomer, site_id: "",
    manager_id: autoManager?.id ?? "",
    lead_tech_id: "",
    value_aed: "",
    started_at: today, due_at: "",
    status: "planned" as ProjectStatus,
    stage: "lead" as ProjectStage,
    // Starting phase (migration 0020). Defaults to 'design' — the DB
    // default is the same, so this just makes the form's choice
    // visible. Operations Manager can pick a later phase if backfilling
    // an in-flight project.
    current_phase: "design" as ProjectPhase,
    // Step B (migration 0012) — Main Contractor Job specifics.
    // All optional; persisted to projects.scope_description, .job_category,
    // and .contract_meta (JSONB). has_tc_phase defaults on because most
    // installs include a T&C handover; the other two phase flags default off.
    scope_description: "",
    job_category: "" as "" | JobCategory,
    has_boq: false,
    has_design_phase: false,
    has_tc_phase: true,
    retention_pct: "5",
    payment_terms: "",
  });
  // Contract terms section is collapsed by default — most jobs are created
  // with the defaults and the extra fields only matter once an estimator
  // formalises the contract. Track whether the user has opened it so we
  // don't persist defaults the user never saw.
  const [showContractTerms, setShowContractTerms] = useState(false);
  const customers = Object.values(db.CUSTOMERS);
  // managers resolved above for the Phase 9.x auto-assign — reuse here
  // for the picker pool when there isn't exactly one.
  // Lead Tech picker — only lead_workers. Drives the "who owns execution"
  // assignment that lets the Lead see this project in their sidebar without
  // having to wait for a WO to be assigned to them (migration 0018). The
  // legacy Team concept has been retired: Lead Tech assigns workers to each
  // Work Order individually, no intermediate crew grouping.
  const leadTechs = useMemo(() => Object.values(db.USERS).filter(u => u.role === "lead_worker"), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!f.lead_tech_id) {
      setErr("Lead Technician is required — pick the user who will manage execution.");
      return;
    }
    setBusy(true);
    // Only record contract_meta values if the user explicitly opened the
    // collapsed section. Otherwise an empty object lets future migrations /
    // detail-page logic distinguish "user accepted defaults" from "user
    // never looked at this section".
    const meta: ContractMeta = {};
    if (showContractTerms) {
      meta.has_boq          = f.has_boq;
      meta.has_design_phase = f.has_design_phase;
      meta.has_tc_phase     = f.has_tc_phase;
      const ret = f.retention_pct.trim();
      if (ret !== "") {
        const n = Number(ret);
        if (Number.isFinite(n)) meta.retention_pct = n;
      }
      const terms = f.payment_terms.trim();
      if (terms) meta.payment_terms = terms;
    }
    const res = await createProject({
      name: f.name, code: f.code || undefined,
      customer_id: f.customer_id, site_id: f.site_id || undefined,
      manager_id: f.manager_id || null,
      lead_tech_id: f.lead_tech_id || null,
      value_aed: Number(f.value_aed),
      started_at: f.started_at, due_at: f.due_at,
      status: f.status,
      stage: f.stage,
      current_phase: f.current_phase,
      scope_description: f.scope_description.trim() || undefined,
      job_category: f.job_category || undefined,
      contract_meta: meta,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Main Contractor Job created"); bumpData(); closeCreate();
  };

  return (
    <FormShell icon="briefcase" title="New Main Contractor Job"
      sub="Installation contract with milestones and payment terms"
      busy={busy} error={err} onSubmit={submit} submitLabel="Create job">
      <Section title="Basics">
        <Field label="Job name" required>
          <input className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Sobha Hartland Phase 3 - ELV" />
        </Field>
        <Row>
          <Field label="Code" hint="Auto-generated if blank">
            <input className="input" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="PRJ-2025-NNN" />
          </Field>
          <Field label={`Contract value (${currencySymbol(currentOrg)})`} required>
            <input className="input numeric" type="number" min={0} required value={f.value_aed} onChange={e => setF({ ...f, value_aed: e.target.value })} placeholder="0" />
          </Field>
        </Row>
      </Section>

      <Section title="Job type">
        <Field label="Scope description"
          hint="Optional — give the team a one-line summary of what's being built">
          <textarea className="textarea" rows={3}
            value={f.scope_description}
            onChange={e => setF({ ...f, scope_description: e.target.value })}
            placeholder="Brief description of the work, e.g. '47-camera CCTV installation including design, supply, and T&C'" />
        </Field>
        <Field label="Job category">
          <Select value={f.job_category}
            onChange={v => setF({ ...f, job_category: (v as JobCategory | "") })}
            placeholder="— Select category —"
            options={JOB_CATEGORIES.map(c => ({ value: c, label: JOB_CATEGORY_LABEL[c] }))} />
        </Field>
        <Field label="Starting phase"
          hint="Most new projects start at Design. Pick a later phase only if you're backfilling a job that's already in motion.">
          <Select value={f.current_phase}
            onChange={v => setF({ ...f, current_phase: v as ProjectPhase })}
            options={PROJECT_PHASES.map(p => ({ value: p, label: PROJECT_PHASE_LABEL[p] }))} />
        </Field>
      </Section>

      <Section title="Customer & site">
        <Row>
          <Field label="Customer" required>
            <Select required value={f.customer_id} onChange={v => setF({ ...f, customer_id: v, site_id: "" })}
              placeholder="- Select -"
              options={customers.map(c => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Site">
            <SiteSelectField
              customerId={f.customer_id}
              siteId={f.site_id}
              onSiteChange={v => setF({ ...f, site_id: v })}
            />
          </Field>
        </Row>
      </Section>

      <Section title="Schedule & assignment">
        <Row>
          <Field label="Started" required>
            <input className="input" type="date" required value={f.started_at} onChange={e => setF({ ...f, started_at: e.target.value })} />
          </Field>
          <Field label="Due" required>
            <input className="input" type="date" required value={f.due_at} onChange={e => setF({ ...f, due_at: e.target.value })} />
          </Field>
        </Row>
        {managers.length !== 1 && (
          <Field label="Manager"
            hint={managers.length === 0 ? "No active manager configured" : undefined}>
            <Select value={f.manager_id} onChange={v => setF({ ...f, manager_id: v })}
              placeholder="- Unassigned -"
              options={managers.map(m => ({ value: m.id, label: m.name }))} />
          </Field>
        )}
        <Field label="Lead Technician" required
          hint="Who will manage execution and assign workers?">
          <Select required value={f.lead_tech_id}
            onChange={v => setF({ ...f, lead_tech_id: v })}
            placeholder="- Select Lead Technician -"
            options={leadTechs.map(u => ({ value: u.id, label: `${u.name} · ${ROLE_LABELS[u.role]}` }))} />
        </Field>
      </Section>

      <div style={{ padding: "0 0 4px" }}>
        <button type="button" className="btn btn-ghost btn-sm"
          aria-expanded={showContractTerms}
          aria-controls="job-contract-terms"
          onClick={() => setShowContractTerms(v => !v)}>
          <Icon name={showContractTerms ? "chevronDown" : "chevronRight"} size={14} />
          {showContractTerms ? "Hide contract terms" : "Show contract terms"}
        </button>
      </div>

      {showContractTerms && (
        <div id="job-contract-terms">
          <Section title="Contract terms">
            <CheckboxField
              checked={f.has_boq}
              onChange={v => setF({ ...f, has_boq: v })}
              label="Has Bill of Quantities (BOQ)"
              hint="Check if the job has a structured BOQ document"
            />
            <CheckboxField
              checked={f.has_design_phase}
              onChange={v => setF({ ...f, has_design_phase: v })}
              label="Includes design phase"
              hint="Check if scope includes design before installation"
            />
            <CheckboxField
              checked={f.has_tc_phase}
              onChange={v => setF({ ...f, has_tc_phase: v })}
              label="Includes Testing & Commissioning"
              hint="Check if scope includes T&C handover"
            />
            <Row>
              <Field label="Retention %" hint="Held back until DLP period">
                <input className="input numeric" type="number" min={0} max={50}
                  value={f.retention_pct}
                  onChange={e => setF({ ...f, retention_pct: e.target.value })}
                  placeholder="5" />
              </Field>
              <Field label="Payment terms" hint="Payment milestones as percentages">
                <input className="input"
                  value={f.payment_terms}
                  onChange={e => setF({ ...f, payment_terms: e.target.value })}
                  placeholder="e.g. 30/40/20/10" />
              </Field>
            </Row>
          </Section>
        </div>
      )}

      <Section title="Lifecycle">
        <Row>
          <Field label="Status">
            <Select value={f.status} onChange={v => setF({ ...f, status: v as ProjectStatus })}
              options={PROJECT_STATUSES.map(s => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))} />
          </Field>
          <Field label="Stage">
            <Select value={f.stage} onChange={v => setF({ ...f, stage: v as ProjectStage })}
              options={PROJECT_STAGES.map(s => ({ value: s, label: PROJECT_STAGE_LABEL[s] }))} />
          </Field>
        </Row>
      </Section>
    </FormShell>
  );
}

/* ─── AMC ───────────────────────────────────────────────── */
const CAN_CREATE_CUSTOMER_INLINE = new Set(["admin", "md", "manager", "sales", "accounts"]);
function AmcForm() {
  const { closeCreate, fireToast, bumpData, create, currentOrg, role: viewerRole } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Phase 9.x Part 5 — inline new-customer mini-form. Spec is locked
  // to Option α: Name + Tier only. Phone / email / notes / address
  // get filled in later on the Customers page (those columns don't
  // exist on the customers table today).
  const canCreateCustomer = CAN_CREATE_CUSTOMER_INLINE.has(viewerRole);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustTier, setNewCustTier] = useState<"Strategic" | "Key" | "Standard">("Standard");
  const [newCustBusy, setNewCustBusy] = useState(false);
  const [newCustErr, setNewCustErr]   = useState<string | null>(null);
  const initialCustomer = (create?.prefill?.customer_id as string) || "";
  const expDefault = new Date(); expDefault.setFullYear(expDefault.getFullYear() + 1);
  // Phase 9.x Part 4: auto-assign Account Manager when exactly one
  // manager exists. Field is hidden from the UI in that case but the
  // value is still sent on submit. Resolved at form mount (useMemo
  // with [] deps so a manager hired mid-session doesn't suddenly
  // re-shape the form for the user).
  const managers = useMemo(() => Object.values(db.USERS).filter(u => u.role === "manager"), []);
  const autoManager = managers.length === 1 ? managers[0] : null;
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[Auto-assign] Active manager:", autoManager?.name ?? "NONE");
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [f, setF] = useState({
    code: "", customer_id: initialCustomer, site_id: "",
    manager_id: autoManager?.id ?? "",
    lead_tech_id: "", value_aed: "",
    expires_at: expDefault.toISOString().slice(0, 10),
  });
  const customers = Object.values(db.CUSTOMERS);
  const leadTechs = useMemo(() => Object.values(db.USERS).filter(u => u.role === "lead_worker"), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!f.lead_tech_id) {
      setErr("Lead Technician is required — pick the user who will manage execution.");
      return;
    }
    setBusy(true);
    const res = await createAmc({
      code: f.code || undefined,
      customer_id: f.customer_id, site_id: f.site_id || undefined,
      manager_id: f.manager_id || null,
      lead_tech_id: f.lead_tech_id || null,
      value_aed: Number(f.value_aed),
      expires_at: f.expires_at,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("AMC contract created · service 1 scheduled, services 2-N will auto-schedule on payment"); bumpData(); closeCreate();
  };

  const submitNewCustomer = async () => {
    setNewCustErr(null);
    const trimmed = newCustName.trim();
    if (!trimmed) { setNewCustErr("Customer name is required."); return; }
    setNewCustBusy(true);
    const res = await createCustomer({ name: trimmed, tier: newCustTier });
    setNewCustBusy(false);
    if (!res.ok) { setNewCustErr(res.error); return; }
    // Auto-select the new customer in the AMC form and collapse the mini-form.
    setF({ ...f, customer_id: res.id, site_id: "" });
    setShowNewCustomer(false);
    setNewCustName("");
    setNewCustTier("Standard");
    fireToast(`Customer "${trimmed}" created`);
    bumpData();
  };

  return (
    <FormShell icon="shieldCheck" title="New AMC contract"
      sub="Annual maintenance — service 1 scheduled on sign; rest unlock on payment"
      busy={busy} error={err} onSubmit={submit} submitLabel="Create AMC"
      footerHint={<><Icon name="shieldCheck" size={13} style={{ color: "var(--pri-600)" }} />Service 1 scheduled now; services 2-N unlock on first payment</>}>
      <Section title="Contract">
        <Row>
          <Field label="Code" hint="Auto-generated if blank">
            <input className="input" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="AMC-NNN" />
          </Field>
          <Field label={`Annual value (${currencySymbol(currentOrg)})`} required>
            <input className="input numeric" type="number" min={0} required value={f.value_aed} onChange={e => setF({ ...f, value_aed: e.target.value })} placeholder="0" />
          </Field>
        </Row>
      </Section>

      <Section title="Coverage">
        <Row>
          <Field label="Customer" required>
            <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
              <div style={{ flex: 1 }}>
                <Select required value={f.customer_id} onChange={v => setF({ ...f, customer_id: v, site_id: "" })}
                  placeholder="- Select -"
                  options={customers.map(c => ({ value: c.id, label: c.name }))} />
              </div>
              {canCreateCustomer && (
                <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setShowNewCustomer(v => !v)}
                        title="Create a new customer without leaving this form">
                  <Icon name="plus" size={13} /> New
                </button>
              )}
            </div>
            {showNewCustomer && (
              <div className="card card-pad" style={{ marginTop: 8, background: "var(--bg-muted)" }}>
                <div className="col gap-3">
                  <div className="field">
                    <label className="field-label">New customer name<span className="req">*</span></label>
                    <input className="input" autoFocus value={newCustName}
                           onChange={e => setNewCustName(e.target.value)}
                           placeholder="e.g. Sobha Realty" />
                  </div>
                  <div className="field">
                    <label className="field-label">Tier</label>
                    <select className="input" value={newCustTier}
                            onChange={e => setNewCustTier(e.target.value as "Strategic" | "Key" | "Standard")}>
                      <option value="Standard">Standard</option>
                      <option value="Key">Key</option>
                      <option value="Strategic">Strategic</option>
                    </select>
                    <div className="field-hint">
                      Phone, email, address, and other details can be added later on the Customers page.
                    </div>
                  </div>
                  {newCustErr && (
                    <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}>
                      <Icon name="alertCircle" size={13} /> {newCustErr}
                    </div>
                  )}
                  <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-ghost btn-sm"
                            onClick={() => { setShowNewCustomer(false); setNewCustErr(null); }}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary btn-sm"
                            disabled={newCustBusy} onClick={submitNewCustomer}>
                      {newCustBusy
                        ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Creating…</>
                        : <><Icon name="check" size={13} /> Create customer</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Field>
          <Field label="Site">
            <SiteSelectField
              customerId={f.customer_id}
              siteId={f.site_id}
              onSiteChange={v => setF({ ...f, site_id: v })}
            />
          </Field>
        </Row>
        <Row>
          {managers.length === 1 ? (
            // Auto-assigned manager hidden — the value is still on f.manager_id.
            // Render the Expires field full-width so the row doesn't collapse.
            <Field label="Expires" required>
              <input className="input" type="date" required value={f.expires_at} onChange={e => setF({ ...f, expires_at: e.target.value })} />
            </Field>
          ) : (
            <>
              <Field label="Account manager"
                hint={managers.length === 0 ? "No active manager configured" : undefined}>
                <Select value={f.manager_id} onChange={v => setF({ ...f, manager_id: v })}
                  placeholder="- Unassigned -"
                  options={managers.map(m => ({ value: m.id, label: m.name }))} />
              </Field>
              <Field label="Expires" required>
                <input className="input" type="date" required value={f.expires_at} onChange={e => setF({ ...f, expires_at: e.target.value })} />
              </Field>
            </>
          )}
        </Row>
        <Field label="Lead Technician" required
          hint="Who will manage execution and assign workers?">
          <Select required value={f.lead_tech_id}
            onChange={v => setF({ ...f, lead_tech_id: v })}
            placeholder="- Select Lead Technician -"
            options={leadTechs.map(u => ({ value: u.id, label: `${u.name} · ${ROLE_LABELS[u.role]}` }))} />
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── WORK ORDER / DELIVERY ─────────────────────────────── */
function WorkOrderForm({ fixedType }: { fixedType?: "DELIVERY" }) {
  const { closeCreate, fireToast, bumpData, create, me } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getMinutes() % 30);
  const later = new Date(now); later.setHours(later.getHours() + 2);
  const fmt = (d: Date) => d.toISOString().slice(0, 16);
  const initialCustomer = (create?.prefill?.customer_id as string) || "";
  // Prefill set by detail-page "+ Create Work Order" buttons (Fix 5,
  // migration 0018). Lets a Lead Tech jump from a project / AMC / repair
  // page straight into a WO already linked to that source, with the
  // customer + site copied in.
  const initialSiteId = (create?.prefill?.site_id as string) || "";
  const prefillSourceKind = create?.prefill?.source_kind;
  const initialSourceKind: "" | "amc" | "project" | "repair" =
    prefillSourceKind === "amc" || prefillSourceKind === "project" || prefillSourceKind === "repair"
      ? prefillSourceKind
      : "";
  const initialSourceId = (create?.prefill?.source_id as string) || "";
  const initialType: "AMC" | "PROJECT" | "REPAIR" | "DELIVERY" | "SURVEY" =
    fixedType
      ? fixedType
      : initialSourceKind === "amc" ? "AMC"
      : initialSourceKind === "project" ? "PROJECT"
      : initialSourceKind === "repair" ? "REPAIR"
      : "PROJECT";
  // Explicit title prefill (e.g. from the "+ Create Work Order" button
  // on a free-call entry). Wins over the source-derived auto-title.
  const prefillTitle = (create?.prefill?.title as string) || "";
  // Generate a sensible default title when the form was opened from a
  // detail page ("+ Create Work Order" buttons on project/AMC/repair
  // pages). Saves the user typing for the common case; still editable.
  const initialTitle = prefillTitle || (() => {
    if (!initialSourceKind || !initialSourceId) return "";
    if (initialSourceKind === "project") {
      const p = db.proj(initialSourceId);
      return p ? `Site visit · ${p.name}` : "";
    }
    if (initialSourceKind === "amc") {
      const a = db.amc(initialSourceId);
      if (!a) return "";
      const cust = db.cust(a.customer)?.name;
      return cust ? `${a.code} service visit · ${cust}` : `${a.code} service visit`;
    }
    if (initialSourceKind === "repair") {
      const r = db.REPAIRS[initialSourceId];
      return r ? `Repair · ${r.title}` : "";
    }
    return "";
  })();
  // Lead Tech prefill (e.g. from the AMC's leadTechId when the
  // "+ Create Work Order" button on a free-call entry is clicked).
  const prefillLead = (create?.prefill?.assigned_lead as string) || "";
  // Free-call id prefill — after createWorkOrder succeeds we link the
  // new WO back to the originating free-call row.
  const prefillFreeCallId = (create?.prefill?.free_call_id as string) || "";
  const [f, setF] = useState({
    title: initialTitle, type: initialType,
    customer_id: initialCustomer, site_id: initialSiteId,
    scheduled_start: fmt(now), scheduled_end: fmt(later),
    assigned_lead: prefillLead, priority: "Standard",
    additional_workers: [] as string[],
    // Migration 0023: external sub-contractors assigned to this WO at
    // creation. Stored as sub_contractors.id; reconciled into the join
    // table after the WO row is created.
    additional_subs: [] as string[],
    source_kind: initialSourceKind, source_id: initialSourceId,
  });
  const customers = Object.values(db.CUSTOMERS);
  // Deliveries are driver-led, not lead-tech-led. The top picker becomes
  // a single-driver chooser; "additional workers" becomes optional helpers.
  const isDelivery = fixedType === "DELIVERY";
  // Spec: for normal WOs the top picker is a lead_worker. For deliveries
  // it's a driver — the person who actually drives the van. Additional
  // workers below are technicians + drivers (helpers / ride-alongs).
  // super_admin is filtered by the explicit role list.
  const leadOptions = useMemo(() =>
    Object.values(db.USERS).filter(u =>
      isDelivery ? u.role === "driver" : u.role === "lead_worker"
    ),
    [isDelivery]);
  const workerOptions = useMemo(() =>
    Object.values(db.USERS).filter(u =>
      (u.role === "worker" || u.role === "driver")
      && u.id !== f.assigned_lead
    ),
    [f.assigned_lead]);
  // Active sub-contractor profiles (migration 0023). Inactive ones are
  // hidden from the picker but existing WO assignments stay visible
  // elsewhere — see SubContractors module.
  const subOptions = useMemo(() => db.activeSubContractors(), []);
  const sourceOptions = useMemo<Opt[]>(() => {
    if (f.source_kind === "amc") return Object.values(db.AMCS).map(a => ({ value: a.id, label: a.code + " · " + (db.cust(a.customer)?.name ?? "-") }));
    if (f.source_kind === "project") return Object.values(db.PROJECTS).map(p => ({ value: p.id, label: p.code + " · " + p.name }));
    if (f.source_kind === "repair") return Object.values(db.REPAIRS).map(r => ({ value: r.id, label: r.code + " · " + r.title }));
    return [];
  }, [f.source_kind]);

  // Conflict warnings — recomputed whenever the time window or
  // worker selection changes. Cheap O(n) over db.WORK_ORDERS each pass;
  // memoised so React doesn't re-render every keystroke unnecessarily.
  // No exclude id (this is a create form — the WO doesn't exist yet).
  //
  // v1.0.1 cleanup: Lead Techs are intentionally NOT availability-checked
  // here. Business rule — leads supervise across sites and can overlap.
  // We still surface a soft warning below the picker if the SELECTED lead
  // has a conflict (informational only, doesn't block submit).
  const leadConflicts = useMemo(() =>
    f.assigned_lead && f.scheduled_start && f.scheduled_end
      ? getWorkerConflictsFor(f.assigned_lead, f.scheduled_start, f.scheduled_end)
      : [],
    [f.assigned_lead, f.scheduled_start, f.scheduled_end]);
  const workerConflicts = useMemo(() => {
    const map: Record<string, WorkerConflict[]> = {};
    if (!f.scheduled_start || !f.scheduled_end) return map;
    for (const u of workerOptions) {
      map[u.id] = getWorkerConflictsFor(u.id, f.scheduled_start, f.scheduled_end);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.scheduled_start, f.scheduled_end, workerOptions]);
  const totalWorkerConflictCount = f.additional_workers
    .reduce((sum, id) => sum + (workerConflicts[id]?.length ?? 0), 0);

  // Sub-contractor availability — same shape as workerConflicts, reads
  // from work_order_sub_contractors (migration 0023) via the
  // getSubContractorConflictsFor helper. Powers the greyed-out state
  // on the sub picker so the Lead Tech doesn't double-book externals.
  const subConflicts = useMemo(() => {
    const map: Record<string, WorkerConflict[]> = {};
    if (!f.scheduled_start || !f.scheduled_end) return map;
    for (const s of subOptions) {
      map[s.id] = getSubContractorConflictsFor(s.id, f.scheduled_start, f.scheduled_end);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.scheduled_start, f.scheduled_end, subOptions]);
  const totalSubConflictCount = f.additional_subs
    .reduce((sum, id) => sum + (subConflicts[id]?.length ?? 0), 0);

  // Re-validate worker selections after the user changes the time window.
  // We only toast (don't auto-deselect) so the user keeps control. Skip
  // the very first mount so prefilled forms don't toast immediately. Lead
  // conflicts are intentionally excluded — leads are allowed to overlap.
  const didMountTimeCheck = useRef(false);
  useEffect(() => {
    if (!didMountTimeCheck.current) { didMountTimeCheck.current = true; return; }
    if (!f.scheduled_start || !f.scheduled_end) return;
    const offenders: string[] = [];
    for (const id of f.additional_workers) {
      if ((workerConflicts[id]?.length ?? 0) > 0) {
        offenders.push(db.user(id)?.name ?? "Worker");
      }
    }
    for (const id of f.additional_subs) {
      if ((subConflicts[id]?.length ?? 0) > 0) {
        offenders.push(db.subContractor(id)?.name ?? "Sub-contractor");
      }
    }
    if (offenders.length > 0) {
      const names = offenders.slice(0, 3).join(", ")
        + (offenders.length > 3 ? ` +${offenders.length - 3} more` : "");
      fireToast(`Time changed — please re-check ${names}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.scheduled_start, f.scheduled_end]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!f.assigned_lead) {
      setErr(isDelivery
        ? "Driver is required — pick the user who will handle the delivery."
        : "Assigned lead is required — pick a Lead Technician.");
      return;
    }
    setBusy(true);
    const res = await createWorkOrder({
      title: f.title, type: f.type, customer_id: f.customer_id, site_id: f.site_id || undefined,
      scheduled_start: f.scheduled_start, scheduled_end: f.scheduled_end,
      assigned_lead: f.assigned_lead || undefined,
      additional_workers: f.additional_workers,
      priority: f.priority,
      source_kind: f.source_kind || undefined,
      source_id: f.source_id || undefined,
    });
    if (!res.ok) { setBusy(false); setErr(res.error); return; }

    // Fan out sub-contractor assignments. We do this AFTER the WO row
    // exists so wos_uniq_wo_sub has something to anchor to. Failures
    // are surfaced as a toast but don't abort the WO creation — the
    // user can re-assign from the WO detail page.
    const subFailures: string[] = [];
    for (const subId of f.additional_subs) {
      const a = await assignSubContractorToWO(res.id, subId, me.id);
      if (!a.ok) {
        const subName = db.subContractor(subId)?.name ?? "sub-contractor";
        subFailures.push(`${subName}: ${a.error}`);
      }
    }

    // If this form was opened from a free-call entry, link the new WO
    // back to the free call so the entry's "View →" row appears without
    // a full re-hydrate. Best-effort: link failures don't abort.
    if (prefillFreeCallId) {
      const linkRes = await linkFreeCallToWorkOrder(prefillFreeCallId, res.id);
      if (!linkRes.ok) {
        // eslint-disable-next-line no-console
        console.warn("[WorkOrderForm] free-call link failed:", linkRes.error);
      }
    }

    setBusy(false);
    if (subFailures.length > 0) {
      fireToast(`WO created; some sub-contractor assignments failed: ${subFailures.join("; ")}`);
    } else {
      fireToast("Work order scheduled");
    }
    bumpData(); closeCreate();
  };

  const toggleWorker = (id: string) => {
    setF(prev => {
      const has = prev.additional_workers.includes(id);
      return {
        ...prev,
        additional_workers: has
          ? prev.additional_workers.filter(x => x !== id)
          : [...prev.additional_workers, id],
      };
    });
  };

  const toggleSub = (id: string) => {
    setF(prev => {
      const has = prev.additional_subs.includes(id);
      return {
        ...prev,
        additional_subs: has
          ? prev.additional_subs.filter(x => x !== id)
          : [...prev.additional_subs, id],
      };
    });
  };

  const TYPES: Opt[] = [
    { value: "PROJECT", label: "PROJECT" }, { value: "AMC", label: "AMC" },
    { value: "REPAIR", label: "REPAIR" }, { value: "DELIVERY", label: "DELIVERY" },
    { value: "SURVEY", label: "SURVEY" },
  ];

  return (
    <FormShell icon="briefcase"
      title={fixedType === "DELIVERY" ? "New delivery" : "New work order"}
      sub="Every field activity - jobs, AMC services, repair visits, deliveries, surveys"
      busy={busy} error={err} onSubmit={submit}
      submitLabel={fixedType === "DELIVERY" ? "Schedule delivery" : "Schedule WO"}>
      <Section title="Job">
        <Field label="Title" required>
          <input className="input" required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. Q3 service · 24 cameras + 6 readers" />
        </Field>
        <Row>
          <Field label="Type" required>
            <Select value={f.type} disabled={!!fixedType} onChange={v => setF({ ...f, type: v as typeof f.type })} options={TYPES} />
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={v => setF({ ...f, priority: v })}
              options={[{ value: "Standard", label: "Standard" }, { value: "High", label: "High" }, { value: "Low", label: "Low" }]} />
          </Field>
        </Row>
      </Section>

      <Section title="Customer & site">
        <Row>
          <Field label="Customer" required>
            <Select required value={f.customer_id} onChange={v => setF({ ...f, customer_id: v, site_id: "" })}
              placeholder="- Select -"
              options={customers.map(c => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Site">
            <SiteSelectField
              customerId={f.customer_id}
              siteId={f.site_id}
              onSiteChange={v => setF({ ...f, site_id: v })}
            />
          </Field>
        </Row>
      </Section>

      <Section title="Schedule">
        <Row>
          <Field label="Start" required>
            <input className="input" type="datetime-local" required value={f.scheduled_start} onChange={e => setF({ ...f, scheduled_start: e.target.value })} />
          </Field>
          <Field label="End" required>
            <input className="input" type="datetime-local" required value={f.scheduled_end} onChange={e => setF({ ...f, scheduled_end: e.target.value })} />
          </Field>
        </Row>
      </Section>

      <Section title="Assignment & link">
        <Field
          label={isDelivery ? "Driver" : "Assigned lead"}
          required
          hint={isDelivery
            ? "Driver who will handle the delivery"
            : "Lead Technician who owns this work order"}>
          <Select required value={f.assigned_lead}
            onChange={v => setF({ ...f, assigned_lead: v })}
            placeholder={isDelivery ? "- Select Driver -" : "- Select Lead Technician -"}
            options={leadOptions.map(u => ({ value: u.id, label: `${u.name} · ${ROLE_LABELS[u.role]}` }))} />
          {f.assigned_lead && (
            <ConflictWarning
              workerName={db.user(f.assigned_lead)?.name ?? (isDelivery ? "This driver" : "This lead")}
              conflicts={leadConflicts} />
          )}
        </Field>
        <Field label="Additional workers"
          hint={f.additional_workers.length > 0
            ? `${f.additional_workers.length} selected${totalWorkerConflictCount > 0 ? ` · ${totalWorkerConflictCount} conflict${totalWorkerConflictCount === 1 ? "" : "s"}` : ""}`
            : "Optional — Technicians, Lead Techs, and Drivers can join the crew"}>
          {workerOptions.length === 0 ? (
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>
              No additional workers available yet.
            </div>
          ) : (
            <div style={{
              maxHeight: 200, overflowY: "auto",
              border: "1px solid var(--border)", borderRadius: "var(--r-md)",
              padding: 6, background: "var(--bg-elev)",
            }}>
              {workerOptions.map(u => {
                const checked = f.additional_workers.includes(u.id);
                const conflicts = workerConflicts[u.id] ?? [];
                const hasConflict = conflicts.length > 0;
                // Block NEW selection of conflicted techs; allow toggling
                // OFF an already-checked one so the user can fix mistakes.
                const blockSelect = hasConflict && !checked;
                const first = conflicts[0];
                const busySub = first
                  ? `Busy: ${first.code} ${first.scheduledStart.slice(11, 16)}-${first.scheduledEnd.slice(11, 16)}${conflicts.length > 1 ? ` +${conflicts.length - 1} more` : ""}`
                  : "";
                return (
                  <label key={u.id}
                    title={hasConflict
                      ? `Time conflict: ${conflicts.map(c => c.code).join(", ")}`
                      : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: "var(--r-sm)",
                      cursor: blockSelect ? "not-allowed" : "pointer",
                      minHeight: 44,
                      background: checked ? "var(--pri-50)" : "transparent",
                      opacity: blockSelect ? 0.55 : 1,
                    }}>
                    <input type="checkbox" checked={checked}
                      disabled={blockSelect}
                      onChange={() => toggleWorker(u.id)}
                      style={{ width: 18, height: 18, flexShrink: 0,
                               cursor: blockSelect ? "not-allowed" : "pointer" }} />
                    <span className={"avatar avatar-sm avatar-" + (u.tint || "primary")}>{u.initials}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{
                        font: "var(--t-body-md)",
                        textDecoration: blockSelect ? "line-through" : undefined,
                      }}>{u.name}</div>
                      {hasConflict && (
                        <div className="truncate" style={{
                          font: "var(--t-micro)", color: "var(--warn-700)", marginTop: 2,
                        }}>{busySub}</div>
                      )}
                    </div>
                    {hasConflict && (
                      <Icon name="alertTriangle" size={14} style={{ color: "var(--warn-700)" }} />
                    )}
                    <span style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{ROLE_LABELS[u.role]}</span>
                  </label>
                );
              })}
            </div>
          )}
          {f.additional_workers
            .filter(id => (workerConflicts[id]?.length ?? 0) > 0)
            .map(id => (
              <ConflictWarning key={id}
                workerName={db.user(id)?.name ?? "Worker"}
                conflicts={workerConflicts[id]} />
            ))}
        </Field>
        <Field label="Sub-contractors"
          hint={f.additional_subs.length > 0
            ? `${f.additional_subs.length} selected${totalSubConflictCount > 0 ? ` · ${totalSubConflictCount} conflict${totalSubConflictCount === 1 ? "" : "s"}` : ""}`
            : "Optional — external contractors from the sub-contractor directory"}>
          {subOptions.length === 0 ? (
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>
              No active sub-contractors yet — add one from <strong>Sub-contractors</strong> in the sidebar, then re-open this form.
            </div>
          ) : (
            <div style={{
              maxHeight: 200, overflowY: "auto",
              border: "1px solid var(--border)", borderRadius: "var(--r-md)",
              padding: 6, background: "var(--bg-elev)",
            }}>
              {subOptions.map(s => {
                const checked = f.additional_subs.includes(s.id);
                const conflicts = subConflicts[s.id] ?? [];
                const hasConflict = conflicts.length > 0;
                const blockSelect = hasConflict && !checked;
                const first = conflicts[0];
                const busySub = first
                  ? `Busy: ${first.code} ${first.scheduledStart.slice(11, 16)}-${first.scheduledEnd.slice(11, 16)}${conflicts.length > 1 ? ` +${conflicts.length - 1} more` : ""}`
                  : "";
                return (
                  <label key={s.id}
                    title={hasConflict
                      ? `Time conflict: ${conflicts.map(c => c.code).join(", ")}`
                      : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: "var(--r-sm)",
                      cursor: blockSelect ? "not-allowed" : "pointer",
                      minHeight: 44,
                      background: checked ? "var(--pri-50)" : "transparent",
                      opacity: blockSelect ? 0.55 : 1,
                    }}>
                    <input type="checkbox" checked={checked}
                      disabled={blockSelect}
                      onChange={() => toggleSub(s.id)}
                      style={{ width: 18, height: 18, flexShrink: 0,
                               cursor: blockSelect ? "not-allowed" : "pointer" }} />
                    <span style={{
                      width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                      background: "var(--bg-muted)", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      color: "var(--ink-mute)",
                    }}>
                      <Icon name="user" size={14} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{
                        font: "var(--t-body-md)",
                        textDecoration: blockSelect ? "line-through" : undefined,
                      }}>
                        {s.name}
                      </div>
                      <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
                        {s.company ?? "Independent"}
                      </div>
                      {hasConflict && (
                        <div className="truncate" style={{
                          font: "var(--t-micro)", color: "var(--warn-700)", marginTop: 2,
                        }}>{busySub}</div>
                      )}
                    </div>
                    {hasConflict && (
                      <Icon name="alertTriangle" size={14} style={{ color: "var(--warn-700)" }} />
                    )}
                    <span className="badge badge-outline" style={{ font: "var(--t-micro)" }}>
                      Sub
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </Field>
        <Field label="Link to source" hint="Optional - link this WO to a Main Contractor Job, AMC, or repair ticket">
          <div className="form-row-mixed">
            <Select value={f.source_kind} onChange={v => setF({ ...f, source_kind: v as typeof f.source_kind, source_id: "" })}
              options={[{ value: "", label: "none" }, { value: "project", label: "Main Contractor" }, { value: "amc", label: "AMC" }, { value: "repair", label: "repair" }]} />
            <Select value={f.source_id} onChange={v => setF({ ...f, source_id: v })}
              placeholder={f.source_kind ? "- Select -" : "Pick a type first"}
              disabled={!f.source_kind} options={sourceOptions} />
          </div>
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── REPAIR TICKET ─────────────────────────────────────── */
function RepairForm() {
  const { closeCreate, fireToast, bumpData } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    title: "", customer_id: "", site_id: "", lead_tech_id: "",
    classification: "AMC free-call" as "AMC free-call" | "Chargeable" | "Warranty",
    priority: "normal" as "high" | "normal",
    sla_target_min: 240,
  });
  const customers = Object.values(db.CUSTOMERS);
  const leadTechs = useMemo(() => Object.values(db.USERS).filter(u => u.role === "lead_worker"), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!f.lead_tech_id) {
      setErr("Lead Technician is required — pick the user who will manage execution.");
      return;
    }
    setBusy(true);
    const res = await createRepairTicket({
      title: f.title, customer_id: f.customer_id, site_id: f.site_id || undefined,
      lead_tech_id: f.lead_tech_id || null,
      classification: f.classification, priority: f.priority,
      sla_target_min: f.sla_target_min,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Repair ticket logged"); bumpData(); closeCreate();
  };

  return (
    <FormShell icon="wrench" title="Log repair ticket"
      sub="Own product or third-party - multi-visit, SLA-tracked"
      busy={busy} error={err} onSubmit={submit} submitLabel="Log ticket">
      <Section title="Issue">
        <Field label="Title" required>
          <input className="input" required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. Camera offline - main entrance" />
        </Field>
        <Row>
          <Field label="Customer" required>
            <Select required value={f.customer_id} onChange={v => setF({ ...f, customer_id: v, site_id: "" })}
              placeholder="- Select -"
              options={customers.map(c => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Site">
            <SiteSelectField
              customerId={f.customer_id}
              siteId={f.site_id}
              onSiteChange={v => setF({ ...f, site_id: v })}
            />
          </Field>
        </Row>
        <Field label="Lead Technician" required
          hint="Who will manage execution and assign workers?">
          <Select required value={f.lead_tech_id}
            onChange={v => setF({ ...f, lead_tech_id: v })}
            placeholder="- Select Lead Technician -"
            options={leadTechs.map(u => ({ value: u.id, label: `${u.name} · ${ROLE_LABELS[u.role]}` }))} />
        </Field>
      </Section>

      <Section title="Classification & SLA">
        <Row>
          <Field label="Classification" required>
            <Select value={f.classification} onChange={v => setF({ ...f, classification: v as typeof f.classification })}
              options={[
                { value: "AMC free-call", label: "AMC free-call" },
                { value: "Chargeable", label: "Chargeable" },
                { value: "Warranty", label: "Warranty" },
              ]} />
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={v => setF({ ...f, priority: v as typeof f.priority })}
              options={[{ value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
          </Field>
        </Row>
        <Field label="SLA target (minutes)" hint="Response window - drives the SLA Engine countdown">
          <input className="input numeric" type="number" min={15} step={15} value={f.sla_target_min} onChange={e => setF({ ...f, sla_target_min: Number(e.target.value) })} />
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── MATERIAL REQUEST (Approval) ──────────────────────── */
function MaterialRequestForm() {
  const { closeCreate, fireToast, bumpData, me, currentOrg } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ context: "", amount_aed: "", project_id: "" });
  const projects = Object.values(db.PROJECTS);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    const res = await createApproval({
      kind: "Material Request",
      context: f.context, amount_aed: Number(f.amount_aed),
      requester_id: me.id,
      target_kind: f.project_id ? "project" : undefined,
      target_id: f.project_id || undefined,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Material request submitted for approval"); bumpData(); closeCreate();
  };

  const overFiveK = Number(f.amount_aed) >= 5000;

  return (
    <FormShell icon="package" title="Request materials"
      sub="Routes through the Approval Chain Engine"
      busy={busy} error={err} onSubmit={submit} submitLabel="Submit request"
      footerHint={<><Icon name="inbox" size={13} style={{ color: "var(--pri-600)" }} />
        {overFiveK ? "Lead Worker → Manager" : "Lead Worker only"}
      </>}>
      <Section title="What you need">
        <Field label="Description" required>
          <textarea className="textarea" required value={f.context} onChange={e => setF({ ...f, context: e.target.value })}
            placeholder="e.g. Cat6A 305m drum × 2, patch panels × 4 for the Azizi Riviera riser run" />
        </Field>
      </Section>

      <Section title="Cost & scope">
        <Row>
          <Field label={`Estimated cost (${currencySymbol(currentOrg)})`} required>
            <input className="input numeric" type="number" min={0} required value={f.amount_aed} onChange={e => setF({ ...f, amount_aed: e.target.value })} />
          </Field>
          <Field label="For job">
            <Select value={f.project_id} onChange={v => setF({ ...f, project_id: v })}
              placeholder="- Not job-bound -"
              options={projects.map(p => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
          </Field>
        </Row>
      </Section>
    </FormShell>
  );
}

/* ─── QUOTATION (Approval) ─────────────────────────────── */
function QuotationForm() {
  const { closeCreate, fireToast, bumpData, me, create, currentOrg } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const initialCustomer = (create?.prefill?.customer_id as string) || "";
  const [f, setF] = useState({ context: "", amount_aed: "", customer_id: initialCustomer });
  const customers = Object.values(db.CUSTOMERS);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    const res = await createApproval({
      kind: "Quotation",
      context: f.context, amount_aed: Number(f.amount_aed),
      requester_id: me.id,
      target_kind: f.customer_id ? "customer" : undefined,
      target_id: f.customer_id || undefined,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast("Quotation submitted · routed per value-band chain"); bumpData(); closeCreate();
  };

  const val = Number(f.amount_aed);
  const chainHint = val >= 200000 ? "Sales → Manager → MD"
    : val >= 50000 ? "Sales → Manager"
      : "Sales only";

  return (
    <FormShell icon="receipt" title="New quotation"
      sub="Routed through the configured chain by value band"
      busy={busy} error={err} onSubmit={submit} submitLabel="Submit quotation"
      footerHint={<><Icon name="inbox" size={13} style={{ color: "var(--pri-600)" }} /> {chainHint}</>}>
      <Section title="Customer">
        <Field label="Account" required>
          <Select required value={f.customer_id} onChange={v => setF({ ...f, customer_id: v })}
            placeholder="- Select -"
            options={customers.map(c => ({ value: c.id, label: c.name }))} />
        </Field>
      </Section>

      <Section title="Scope & value">
        <Field label="Scope summary" required>
          <textarea className="textarea" required value={f.context} onChange={e => setF({ ...f, context: e.target.value })}
            placeholder="e.g. ELV scope - 80 cameras, 12 ACS doors, fiber backbone" />
        </Field>
        <Field label={`Quote value (${currencySymbol(currentOrg)})`} required hint="Determines the approval chain (chain config in /approvals)">
          <input className="input numeric" type="number" min={0} required value={f.amount_aed} onChange={e => setF({ ...f, amount_aed: e.target.value })} />
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── ORGANIZATION (Super Admin only) ───────────────────── */
const CURRENCIES = [
  { code: "AED", symbol: "AED" }, { code: "SAR", symbol: "ر.س" },
  { code: "USD", symbol: "$" }, { code: "INR", symbol: "₹" },
  { code: "EUR", symbol: "€" }, { code: "GBP", symbol: "£" },
  { code: "OMR", symbol: "OMR" }, { code: "KWD", symbol: "KWD" },
  { code: "BHD", symbol: "BHD" }, { code: "QAR", symbol: "QAR" },
  { code: "EGP", symbol: "EGP" },
];
const TIMEZONES = [
  "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Asia/Karachi",
  "Africa/Addis_Ababa", "Africa/Kampala", "Africa/Cairo",
  "Europe/London", "Europe/Paris", "America/New_York", "UTC",
];
const LOCALES = ["en-AE", "en-SA", "en-IN", "en-US", "en-GB", "ar-AE", "ar-SA", "hi-IN"];

function OrganizationForm() {
  const { closeCreate, fireToast, bumpData, create } = useApp();
  const editId = create?.prefill?.id as string | undefined;
  const editing = editId ? db.ORGANIZATIONS[editId] : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    name: editing?.name ?? "",
    display_name: editing?.display_name ?? "",
    subdomain: editing?.subdomain ?? "",
    legal_name: editing?.legal_name ?? "",
    tagline: editing?.tagline ?? "",
    primary_color: editing?.primary_color ?? "#5BAE9C",
    secondary_color: editing?.secondary_color ?? "#A78BFA",
    accent_color: editing?.accent_color ?? "#F4B8A4",
    logo_url: editing?.logo_url ?? "",
    default_currency: editing?.default_currency ?? "AED",
    currency_symbol: editing?.currency_symbol ?? "AED",
    currency_position: (editing?.currency_position ?? "before") as "before" | "after",
    decimal_places: editing?.decimal_places ?? 2,
    default_locale: editing?.default_locale ?? "en-AE",
    default_timezone: editing?.default_timezone ?? "Asia/Dubai",
    date_format: editing?.date_format ?? "DD/MM/YYYY",
    time_format: (editing?.time_format ?? "24h") as "12h" | "24h",
    email_from_name: editing?.email_from_name ?? "",
    whatsapp_business_name: editing?.whatsapp_business_name ?? "",
    admin_can_manage_branding: editing?.admin_can_manage_branding ?? false,
  });

  const sampleAmount = 1234567.89;
  const samplePreview = useMemo(() => {
    const sym = f.currency_symbol || f.default_currency;
    const places = f.decimal_places;
    const formatted = sampleAmount.toFixed(places).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return f.currency_position === "after" ? `${formatted} ${sym}` : `${sym} ${formatted}`;
  }, [f.currency_symbol, f.default_currency, f.decimal_places, f.currency_position]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    const payload = {
      name: f.name, display_name: f.display_name, subdomain: f.subdomain,
      legal_name: f.legal_name || undefined, tagline: f.tagline || undefined,
      primary_color: f.primary_color, secondary_color: f.secondary_color, accent_color: f.accent_color,
      logo_url: f.logo_url || undefined,
      default_currency: f.default_currency, currency_symbol: f.currency_symbol,
      currency_position: f.currency_position, decimal_places: f.decimal_places,
      default_locale: f.default_locale, default_timezone: f.default_timezone,
      date_format: f.date_format, time_format: f.time_format,
      email_from_name: f.email_from_name || undefined,
      whatsapp_business_name: f.whatsapp_business_name || undefined,
      admin_can_manage_branding: f.admin_can_manage_branding,
    };
    const res = editing
      ? await updateOrganization(editing.id, payload)
      : await createOrganization(payload);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(editing ? `${f.display_name} updated` : `${f.display_name} created`);
    bumpData(); closeCreate();
  };

  return (
    <FormShell icon="building"
      title={editing ? `Edit organization · ${editing.display_name}` : "New organization"}
      sub="Branding, currency and locale apply to everything inside this tenant - logos, colors, PDFs, emails."
      busy={busy} error={err} onSubmit={submit}
      submitLabel={editing ? "Save changes" : "Create organization"}
      footerHint={
        <>
          <Icon name="banknote" size={13} style={{ color: "var(--pri-600)" }} />
          Preview: <strong style={{ color: "var(--ink)" }}>{samplePreview}</strong>
        </>
      }>
      <Section title="Identity">
        <Row>
          <Field label="Display name" required>
            <input className="input" required value={f.display_name}
              onChange={e => setF({ ...f, display_name: e.target.value })} placeholder="Installtec" />
          </Field>
          <Field label="Legal name">
            <input className="input" value={f.name}
              onChange={e => setF({ ...f, name: e.target.value, legal_name: e.target.value })}
              placeholder="Installtec Electromechanical LLC" required />
          </Field>
        </Row>
        <Row>
          <Field label="Subdomain" required hint="Lowercase letters, numbers, hyphens. Becomes {sub}.platform.">
            <input className="input" required value={f.subdomain}
              onChange={e => setF({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              placeholder="installtec" disabled={!!editing} />
          </Field>
          <Field label="Tagline">
            <input className="input" value={f.tagline}
              onChange={e => setF({ ...f, tagline: e.target.value })}
              placeholder="Operations · Dubai" />
          </Field>
        </Row>
      </Section>

      <Section title="Branding">
        <Row>
          <Field label="Primary color">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={f.primary_color}
                onChange={e => setF({ ...f, primary_color: e.target.value })}
                style={{ width: 44, height: 36, border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", background: "transparent" }} />
              <input className="input" value={f.primary_color}
                onChange={e => setF({ ...f, primary_color: e.target.value })} />
            </div>
          </Field>
          <Field label="Secondary color">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={f.secondary_color}
                onChange={e => setF({ ...f, secondary_color: e.target.value })}
                style={{ width: 44, height: 36, border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", background: "transparent" }} />
              <input className="input" value={f.secondary_color}
                onChange={e => setF({ ...f, secondary_color: e.target.value })} />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Accent color">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={f.accent_color}
                onChange={e => setF({ ...f, accent_color: e.target.value })}
                style={{ width: 44, height: 36, border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", background: "transparent" }} />
              <input className="input" value={f.accent_color}
                onChange={e => setF({ ...f, accent_color: e.target.value })} />
            </div>
          </Field>
          <Field label="Logo URL" hint="Paste an image URL (Supabase Storage upload comes in slice 2).">
            <input className="input" value={f.logo_url}
              onChange={e => setF({ ...f, logo_url: e.target.value })}
              placeholder="https://..." />
          </Field>
        </Row>
        {/* Live brand strip preview */}
        <div style={{
          marginTop: 4, height: 48, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: 600, letterSpacing: 0.3,
          background: `linear-gradient(135deg, ${f.primary_color} 0%, ${f.secondary_color} 70%, ${f.accent_color} 100%)`,
        }}>{f.display_name || "Preview"}</div>
      </Section>

      <Section title="Currency">
        <Row>
          <Field label="Default currency" required>
            <Select value={f.default_currency}
              onChange={v => {
                const c = CURRENCIES.find(x => x.code === v);
                setF({ ...f, default_currency: v, currency_symbol: c?.symbol ?? v });
              }}
              options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} (${c.symbol})` }))} />
          </Field>
          <Field label="Symbol">
            <input className="input" value={f.currency_symbol}
              onChange={e => setF({ ...f, currency_symbol: e.target.value })} />
          </Field>
        </Row>
        <Row>
          <Field label="Position">
            <Select value={f.currency_position}
              onChange={v => setF({ ...f, currency_position: v as "before" | "after" })}
              options={[{ value: "before", label: "Before amount (AED 1,234)" }, { value: "after", label: "After amount (1,234 AED)" }]} />
          </Field>
          <Field label="Decimal places">
            <Select value={String(f.decimal_places)}
              onChange={v => setF({ ...f, decimal_places: Number(v) })}
              options={[{ value: "0", label: "0" }, { value: "2", label: "2" }, { value: "3", label: "3" }]} />
          </Field>
        </Row>
      </Section>

      <Section title="Locale">
        <Row>
          <Field label="Locale">
            <Select value={f.default_locale} onChange={v => setF({ ...f, default_locale: v })}
              options={LOCALES.map(l => ({ value: l, label: l }))} />
          </Field>
          <Field label="Timezone">
            <Select value={f.default_timezone} onChange={v => setF({ ...f, default_timezone: v })}
              options={TIMEZONES.map(t => ({ value: t, label: t }))} />
          </Field>
        </Row>
        <Row>
          <Field label="Date format">
            <Select value={f.date_format} onChange={v => setF({ ...f, date_format: v })}
              options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map(d => ({ value: d, label: d }))} />
          </Field>
          <Field label="Time format">
            <Select value={f.time_format} onChange={v => setF({ ...f, time_format: v as "12h" | "24h" })}
              options={[{ value: "24h", label: "24h" }, { value: "12h", label: "12h" }]} />
          </Field>
        </Row>
      </Section>

      <Section title="Outgoing communication">
        <Row>
          <Field label="Email from name" hint="Used as the sender name on outgoing emails.">
            <input className="input" value={f.email_from_name}
              onChange={e => setF({ ...f, email_from_name: e.target.value })}
              placeholder="Installtec Operations" />
          </Field>
          <Field label="WhatsApp business name">
            <input className="input" value={f.whatsapp_business_name}
              onChange={e => setF({ ...f, whatsapp_business_name: e.target.value })}
              placeholder="Installtec" />
          </Field>
        </Row>
        <Field label="">
          <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={f.admin_can_manage_branding}
              onChange={e => setF({ ...f, admin_can_manage_branding: e.target.checked })} />
            <span style={{ font: "var(--t-small)" }}>Allow the org Admin to edit branding (logo, colors, tagline).</span>
          </label>
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── Note form (Important Notes panel) ──────────────────── */
function NoteForm() {
  const { create, closeCreate, fireToast, bumpNotes } = useApp();
  const prefill = (create?.prefill ?? {}) as { id?: string; title?: string; body?: string; is_pinned?: boolean };
  const isEdit = !!prefill.id;
  const [f, setF] = useState({
    title: prefill.title ?? "",
    body: prefill.body ?? "",
    is_pinned: prefill.is_pinned ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    const res = isEdit
      ? await updateNote(prefill.id!, { title: f.title, body: f.body, is_pinned: f.is_pinned })
      : await createNote({ title: f.title, body: f.body, is_pinned: f.is_pinned });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(isEdit ? "Note updated" : "Note saved");
    bumpNotes();
    closeCreate();
  };

  return (
    <FormShell icon="fileText"
      title={isEdit ? "Edit note" : "New note"}
      sub="Only you can see your notes - they don't sync with the team."
      busy={busy} error={err} onSubmit={submit}
      submitLabel={isEdit ? "Save" : "Add note"}>
      <Section title="Note">
        <Field label="Title" required>
          <input className="input" value={f.title} maxLength={120}
            onChange={e => setF({ ...f, title: e.target.value })}
            placeholder="e.g. Backup keys cabinet code" autoFocus />
        </Field>
        <Field label="Note body" required hint="Plain text. Line breaks are preserved.">
          <textarea className="textarea" rows={6} value={f.body}
            onChange={e => setF({ ...f, body: e.target.value })}
            placeholder="Write the note…" />
        </Field>
        <Field label="">
          <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={f.is_pinned}
              onChange={e => setF({ ...f, is_pinned: e.target.checked })} />
            <span style={{ font: "var(--t-small)" }}>Pin to top of the notes panel.</span>
          </label>
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── AMC PAYMENT ────────────────────────────────────────
   Opened via openCreate("amc_payment", { amc_id, code, value_aed,
   was_suspended }) from AmcDetail. INSERT into amc_payments fires
   the fn_amc_payment_received trigger which auto-activates the
   contract — frontend just submits and shows a toast.
============================================================ */
function PaymentForm() {
  const { closeCreate, fireToast, bumpData, create, currentOrg } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const amcId         = (create?.prefill?.amc_id as string) || "";
  const amcCode       = (create?.prefill?.code as string) || "AMC";
  const contractValue = Number(create?.prefill?.value_aed) || 0;
  const wasSuspended  = create?.prefill?.was_suspended === true;

  const [f, setF] = useState({
    amount_aed:  contractValue > 0 ? String(contractValue) : "",
    received_at: today,
    method:      "bank_transfer" as AmcPaymentMethod,
    reference:   "",
    notes:       "",
  });

  const amountNum = Number(f.amount_aed);
  const partial   = contractValue > 0 && amountNum > 0 && amountNum < contractValue;
  const extreme   = contractValue > 0 && amountNum > contractValue * 2;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (!amcId) { setErr("Missing AMC id. Close and re-open from the AMC page."); return; }
    if (!amountNum || amountNum <= 0) { setErr("Amount must be greater than zero."); return; }
    if (extreme)                       { setErr(`Amount looks wrong — more than 2× the contract value (${currencySymbol(currentOrg)} ${contractValue}).`); return; }
    if (!f.received_at)                { setErr("Payment date is required."); return; }
    if (new Date(f.received_at).getTime() > Date.now() + 60_000) {
      setErr("Payment date cannot be in the future."); return;
    }

    setBusy(true);
    const res = await recordAmcPayment(amcId, {
      amount_aed:  amountNum,
      received_at: f.received_at,
      method:      f.method,
      reference:   f.reference.trim() || undefined,
      notes:       f.notes.trim() || undefined,
    });
    setBusy(false);

    if (!res.ok) { setErr(res.error); return; }
    fireToast(wasSuspended
      ? `Payment recorded · ${amcCode} reactivated`
      : `Payment recorded · ${amcCode} is now active`);
    bumpData();
    closeCreate();
  };

  return (
    <FormShell icon="banknote" title={`Record payment for ${amcCode}`}
      sub="Activates the contract and unlocks the service schedule"
      busy={busy} error={err} onSubmit={submit} submitLabel="Record Payment">
      <Section title="Payment">
        <Row>
          <Field label={`Amount (${currencySymbol(currentOrg)})`} required
            hint={partial ? `Partial payment — contract value is ${currencySymbol(currentOrg)} ${contractValue}` : undefined}>
            <input className="input numeric" type="number" min={0.01} step="0.01" required
              inputMode="decimal"
              value={f.amount_aed} onChange={e => setF({ ...f, amount_aed: e.target.value })}
              placeholder="0.00" />
          </Field>
          <Field label="Payment date" required>
            <input className="input" type="date" required max={today}
              value={f.received_at} onChange={e => setF({ ...f, received_at: e.target.value })} />
          </Field>
        </Row>
      </Section>

      <Section title="Reference">
        <Row>
          <Field label="Method">
            <Select value={f.method} onChange={v => setF({ ...f, method: v as AmcPaymentMethod })}
              options={(["bank_transfer","cash","cheque","credit_card","other"] as AmcPaymentMethod[])
                .map(m => ({ value: m, label: AMC_PAYMENT_METHOD_LABEL[m] }))} />
          </Field>
          <Field label="Reference number" hint="Cheque number, transaction ID, etc.">
            <input className="input" value={f.reference}
              onChange={e => setF({ ...f, reference: e.target.value })}
              placeholder="e.g. TRF-2026-1234" />
          </Field>
        </Row>
        <Field label="Notes">
          <textarea className="textarea" rows={3} value={f.notes}
            onChange={e => setF({ ...f, notes: e.target.value })}
            placeholder="Any additional notes about this payment" />
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── REPLACEMENT REQUEST ─────────────────────────────────
   Worker raises from the WO slideover ("+ Request Replacement"),
   or from the Replacements list page where they pick the parent
   WO inline. The form derives context + parent FKs from the WO,
   so the user only types item + qty + reason.
============================================================ */
function ReplacementRequestForm() {
  const { closeCreate, create, fireToast, bumpData, me, role } = useApp();
  const prefill = (create?.prefill ?? {}) as { work_order_id?: string };
  const lockedWoId = prefill.work_order_id ?? "";

  const [woId, setWoId] = useState(lockedWoId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    item_name: "",
    quantity: "1",
    reason: "",
  });

  // When the form is opened standalone (no prefill), the user picks a WO
  // from their accessible set. Managers see all active WOs; everyone else
  // sees only WOs they're assigned to / leading. Closed and cancelled WOs
  // are filtered out — you don't request a replacement on dead work.
  const pickableWos = useMemo(() => {
    if (lockedWoId) return [];
    const isManager = role === "admin" || role === "md" || role === "manager";
    return Object.values(db.WORK_ORDERS)
      .filter(w => w.status !== "closed" && w.status !== "cancelled" && w.status !== "done")
      .filter(w => isManager
        || w.assignedLead === me.id
        || (w.assigned ?? []).includes(me.id)
      )
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [lockedWoId, role, me.id]);

  const wo = woId ? db.wo(woId) : null;

  // Context inference from WO.source.kind. amc_scheduled vs amc_free_call
  // discrimination would require a lookup against amc_service_schedule;
  // for now default amc → amc_free_call and let users / a later cron
  // promote scheduled-service replacements as a follow-up.
  const context: ReplacementContext | null = wo
    ? wo.source.kind === "project" ? "main_contractor"
    : wo.source.kind === "amc"     ? "amc_free_call"
    : wo.source.kind === "repair"  ? "repair"
    : "main_contractor"
    : null;

  const cust = wo ? db.cust(wo.customer) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!wo || !context) { setErr("Pick a work order first."); return; }
    if (!f.item_name.trim()) { setErr("Item name is required."); return; }
    const qty = Number(f.quantity);
    if (!Number.isFinite(qty) || qty < 1) { setErr("Quantity must be 1 or more."); return; }

    setBusy(true);
    const res = await createReplacementRequest({
      context,
      customer_id:      wo.customer,
      work_order_id:    wo.id,
      project_id:       wo.source.kind === "project" ? wo.source.id : null,
      amc_contract_id:  wo.source.kind === "amc"     ? wo.source.id : null,
      repair_ticket_id: wo.source.kind === "repair"  ? wo.source.id : null,
      site_id:          wo.site || null,
      item_name:        f.item_name,
      quantity:         qty,
      reason:           f.reason || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`Replacement requested · ${res.rr.code}`);
    bumpData();
    closeCreate();
  };

  return (
    <FormShell icon="package" title="Request replacement"
      sub="A Lead Technician will review and approve before installation"
      busy={busy} error={err} onSubmit={submit}
      submitLabel="Submit request">
      <Section title="Work order">
        {lockedWoId ? (
          <Field label="Linked WO">
            <div className="row gap-3" style={{
              padding: 10, background: "var(--bg-muted)",
              borderRadius: "var(--r-md)", border: "1px solid var(--border)",
            }}>
              <Icon name="briefcase" size={14} style={{ color: "var(--ink-mute)" }} />
              <span className="numeric" style={{ fontFamily: "var(--font-mono)", font: "var(--t-small)" }}>{wo?.code ?? "—"}</span>
              <span className="truncate" style={{ flex: 1, font: "var(--t-small)" }}>{wo?.title ?? ""}</span>
            </div>
          </Field>
        ) : (
          <Field label="Work order" required hint="Only your active assignments are listed">
            <Select required value={woId} onChange={setWoId}
              placeholder={pickableWos.length === 0 ? "No active WOs available" : "- Select a work order -"}
              disabled={pickableWos.length === 0}
              options={pickableWos.map(w => ({
                value: w.id,
                label: w.code + " · " + w.title,
              }))} />
          </Field>
        )}
        {wo && context && (
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: "0 2px" }}>
            Context: <strong style={{ color: "var(--ink)" }}>{REPLACEMENT_CONTEXT_LABEL[context]}</strong>
            {" · "}Customer: <strong style={{ color: "var(--ink)" }}>{cust?.name ?? "—"}</strong>
          </div>
        )}
      </Section>

      <Section title="What needs replacing">
        <Field label="Item name" required>
          <input className="input" required
            value={f.item_name}
            onChange={e => setF({ ...f, item_name: e.target.value })}
            placeholder="e.g. Dome camera 4MP, Motion sensor PIR, Door strike" />
        </Field>
        <Field label="Quantity" required>
          <input className="input numeric" type="number" min={1} required
            value={f.quantity}
            onChange={e => setF({ ...f, quantity: e.target.value })} />
        </Field>
        <Field label="Reason" hint="What's wrong? Helps the Lead Tech decide quickly.">
          <textarea className="textarea" rows={3}
            value={f.reason}
            onChange={e => setF({ ...f, reason: e.target.value })}
            placeholder="e.g. Camera 7 lens fogged, no video feed; sensor not detecting motion in test" />
        </Field>
      </Section>
    </FormShell>
  );
}

/* ─── Sub-contractor (migration 0023) ──────────────────────
   Adds a profile to the sub_contractors directory. Phone +
   Emirates ID are soft-validated (warning hint only) — per
   spec, we don't reject formats since field staff often enter
   them inconsistently. The DB unique constraint on emirates_id
   surfaces a friendly error message if there's a collision.
============================================================ */

// UAE phone: optional +971, optional spaces/hyphens, 8-10 digits after.
// We only warn — don't block.
const UAE_PHONE_RE = /^(\+?971|0)?[\s\-]?\d{1,2}[\s\-]?\d{3}[\s\-]?\d{4}$/;
// Emirates ID: 15 digits, optionally formatted XXX-YYYY-XXXXXXX-X. Warn-only.
const EMIRATES_ID_RE = /^\d{3}[\s\-]?\d{4}[\s\-]?\d{7}[\s\-]?\d{1}$/;

function SubContractorForm() {
  const { closeCreate, fireToast, bumpData, me } = useApp();
  const [f, setF] = useState({
    name: "", phone: "", emirates_id: "", company: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Soft-validation hints (warnings, not blockers).
  const phoneWarn = f.phone && !UAE_PHONE_RE.test(f.phone.trim())
    ? "Doesn't look like a UAE phone format (+971…) — still saveable if intentional."
    : null;
  const eidWarn = f.emirates_id && !EMIRATES_ID_RE.test(f.emirates_id.trim())
    ? "Emirates ID is usually 15 digits (e.g. 784-1990-1234567-1) — still saveable if intentional."
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!f.name.trim()) { setErr("Name is required."); return; }
    setBusy(true);
    const res = await createSubContractor({
      name:        f.name,
      phone:       f.phone || null,
      emirates_id: f.emirates_id || null,
      company:     f.company || null,
      notes:       f.notes || null,
    }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${res.sub.name} added`);
    bumpData();
    closeCreate();
  };

  return (
    <FormShell icon="users"
      title="Add sub-contractor"
      sub="External contractor profile — name, phone, Emirates ID, company"
      busy={busy} error={err} onSubmit={submit}
      submitLabel="Add sub-contractor">
      <Section title="Identity">
        <Field label="Name" required>
          <input className="input" required value={f.name}
            onChange={e => setF({ ...f, name: e.target.value })}
            placeholder="e.g. Ahmed Khan" />
        </Field>
        <Field label="Company" hint='Leave blank if independent.'>
          <input className="input" value={f.company}
            onChange={e => setF({ ...f, company: e.target.value })}
            placeholder="e.g. Al Salam Electrical LLC" />
        </Field>
      </Section>
      <Section title="Contact & compliance">
        <Field label="Phone" hint={phoneWarn ?? "UAE format preferred: +971XXXXXXXXX"}>
          <input className="input" type="tel" value={f.phone}
            onChange={e => setF({ ...f, phone: e.target.value })}
            placeholder="+971 50 123 4567" />
        </Field>
        <Field label="Emirates ID"
          hint={eidWarn ?? "15-digit national ID (kept for HR / labour compliance)."}>
          <input className="input" value={f.emirates_id}
            onChange={e => setF({ ...f, emirates_id: e.target.value })}
            placeholder="784-1990-1234567-1" />
        </Field>
        <Field label="Notes" hint="Optional — internal notes about this profile.">
          <textarea className="textarea" rows={3} value={f.notes}
            onChange={e => setF({ ...f, notes: e.target.value })}
            placeholder="e.g. ELV specialist; works weekends" />
        </Field>
      </Section>
    </FormShell>
  );
}

// ─── Log sub-contractor hours (Phase 5D.1) ────────────────
//
// Opened from the WO slideover's Crew section. The trigger button there
// is already permission-gated (admin/md/manager OR lead_worker on their
// own WO), so this form is reached only by an authorised user. The
// underlying RLS (wosh_write) is the hard backstop — a hostile direct
// openCreate("sub_hours") still fails server-side.
//
// Mode is implicit: prefill.entry_id present → edit existing row;
// absent → log new. Same fields either way, different submit handler.
//
// Hard validations:
//   • Hours > 0 and ≤ 24 (matches DB CHECK wosh_chk_hours_range)
//   • Date not in the future
//   • Date not before the sub's assignedAt on this WO
function LogSubHoursForm() {
  const { closeCreate, fireToast, bumpData, me, create } = useApp();
  const prefill = (create?.prefill ?? {}) as Record<string, unknown>;
  const wo_id      = String(prefill.wo_id      ?? "");
  const sub_id     = String(prefill.sub_id     ?? "");
  const sub_name   = String(prefill.sub_name   ?? "");
  const wo_code    = String(prefill.wo_code    ?? "");
  const assigned_at = String(prefill.assigned_at ?? "");
  const entry_id   = (prefill.entry_id as string | undefined) || null;
  const isEdit = !!entry_id;

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
  }, []);
  // sub's assignedAt is an ISO timestamptz; we only care about the date.
  const assignedDateStr = assigned_at ? assigned_at.slice(0, 10) : "";

  const initialHours = typeof prefill.hours === "number"
    ? String(prefill.hours)
    : typeof prefill.hours === "string" ? prefill.hours : "";
  const initialDate = (prefill.entry_date as string | undefined) || todayStr;
  const initialNotes = (prefill.notes as string | undefined) || "";

  const [hours, setHours]         = useState<string>(initialHours);
  const [entryDate, setEntryDate] = useState<string>(initialDate);
  const [notes, setNotes]         = useState<string>(initialNotes);
  const [hoursTouched, setHoursTouched] = useState(false);
  const [dateTouched, setDateTouched]   = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  const hoursNum = Number(hours);
  const hoursError = (!hours || Number.isNaN(hoursNum))
    ? "Hours required."
    : (hoursNum <= 0)
      ? "Hours must be greater than 0."
      : (hoursNum > 24)
        ? "Hours cannot exceed 24."
        : null;
  const dateError = (!entryDate)
    ? "Date required."
    : (entryDate > todayStr)
      ? "Date cannot be in the future."
      : (assignedDateStr && entryDate < assignedDateStr)
        ? `Date can't be before ${formatYmd(assignedDateStr)} (sub was assigned then).`
        : null;
  const notesError = notes.length > 250
    ? `Notes can't exceed 250 characters (currently ${notes.length}).`
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setHoursTouched(true);
    setDateTouched(true);
    if (hoursError || dateError || notesError) {
      setErr(hoursError || dateError || notesError);
      return;
    }
    setBusy(true);
    if (isEdit && entry_id) {
      const res = await editSubContractorHoursEntry(entry_id, {
        hours: hoursNum,
        entryDate,
        notes: notes.trim() || null,
      });
      setBusy(false);
      if (!res.ok) { setErr(res.error); return; }
      fireToast(`Updated to ${formatHoursLabel(hoursNum)} for ${sub_name || "sub-contractor"}`);
    } else {
      if (!wo_id || !sub_id) { setBusy(false); setErr("Missing work order or sub-contractor."); return; }
      const res = await logSubContractorHours({
        workOrderId: wo_id,
        subContractorId: sub_id,
        entryDate,
        hours: hoursNum,
        notes: notes.trim() || null,
      }, me.id);
      setBusy(false);
      if (!res.ok) { setErr(res.error); return; }
      fireToast(`Logged ${formatHoursLabel(hoursNum)} for ${sub_name || "sub-contractor"}`);
    }
    bumpData();
    closeCreate();
  };

  return (
    <FormShell icon="clock"
      title={isEdit ? "Edit hours" : "Log hours"}
      sub={[sub_name, wo_code].filter(Boolean).join(" · ") || undefined}
      busy={busy} error={err} onSubmit={submit}
      submitLabel={isEdit ? "Save changes" : "Log hours"}>
      <Section title="Session">
        <Field label="Date" required>
          <input className="input" type="date" required
            value={entryDate}
            max={todayStr}
            min={assignedDateStr || undefined}
            onBlur={() => setDateTouched(true)}
            onChange={e => setEntryDate(e.target.value)} />
          {dateTouched && dateError && (
            <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginTop: 4 }}>
              {dateError}
            </div>
          )}
        </Field>
        <Field label="Hours" required hint="0.25 (15 min) to 24.0">
          <input className="input" type="number" required
            min="0.25" max="24" step="0.25"
            value={hours}
            onBlur={() => setHoursTouched(true)}
            onChange={e => setHours(e.target.value)}
            placeholder="6.0" />
          {hoursTouched && hoursError && (
            <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginTop: 4 }}>
              {hoursError}
            </div>
          )}
        </Field>
        <Field label="Notes" hint={`Optional · ${notes.length}/250`}>
          <textarea className="textarea" rows={3}
            maxLength={250}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. morning shift, completed cable pulling" />
          {notesError && (
            <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginTop: 4 }}>
              {notesError}
            </div>
          )}
        </Field>
      </Section>
    </FormShell>
  );
}

function padTwo(n: number): string { return n < 10 ? `0${n}` : String(n); }

function formatHoursLabel(h: number): string {
  return `${h.toFixed(1)} hrs`;
}

function formatYmd(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  return formatMonthDay(new Date(y, m - 1, d, 12, 0, 0));
}

// ─── Free call (Phase 8) ──────────────────────────────────
function FreeCallForm() {
  const { closeCreate, fireToast, bumpData, create, me } = useApp();
  const prefill = (create?.prefill ?? {}) as Record<string, unknown>;
  const amc_id = String(prefill.amc_id ?? "");
  const code   = String(prefill.code   ?? "");

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 16), []);
  const [date, setDate]    = useState(todayIso);
  const [desc, setDesc]    = useState("");
  const [notes, setNotes]  = useState("");
  const [busy, setBusy]    = useState(false);
  const [err, setErr]      = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!desc.trim()) { setErr("Description is required."); return; }
    if (!amc_id) { setErr("Missing AMC contract id."); return; }
    setBusy(true);
    const res = await createFreeCall({
      amc_contract_id: amc_id,
      description: desc,
      reported_at: new Date(date).toISOString(),
      notes: notes || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`Free call logged for ${code || "AMC"}`);
    bumpData();
    closeCreate();
  };

  return (
    <FormShell icon="phone" title="Log free call"
      sub={code ? `Against ${code}` : undefined}
      busy={busy} error={err} onSubmit={submit} submitLabel="Log call">
      <Section title="Call details">
        <Field label="Description" required hint="What did the customer report?">
          <input className="input" required value={desc}
                 onChange={e => setDesc(e.target.value)} autoFocus
                 placeholder="e.g. Camera 7 not responding · main lobby" />
        </Field>
        <Row>
          <Field label="Date / time" required>
            <input className="input" type="datetime-local" required value={date}
                   onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Logged by">
            <input className="input" value={me.name} disabled
                   style={{ background: "var(--bg-muted)", color: "var(--ink-mute)" }} />
          </Field>
        </Row>
        <Field label="Notes" hint="Optional — additional context for the technician">
          <textarea className="textarea" rows={3} value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Customer requested visit between 09:00-12:00" />
        </Field>
      </Section>
    </FormShell>
  );
}

// ─── Quotation v2 (Phase 11) ──────────────────────────────
// Renamed to QuotationFormV2 to avoid colliding with the legacy
// placeholder QuotationForm that still exists under create.kind === "quotation".
function QuotationFormV2() {
  const { closeCreate, fireToast, bumpData, currentOrg, me } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [f, setF] = useState({
    title: "", customer_id: "", value_aed: "",
    valid_until: "", notes: "",
  });
  const customers = Object.values(db.CUSTOMERS);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!f.title.trim()) { setErr("Title is required."); return; }
    setBusy(true);
    const res = await createQuotation({
      title: f.title,
      customer_id: f.customer_id || null,
      value_aed: f.value_aed ? Number(f.value_aed) : 0,
      valid_until: f.valid_until || null,
      notes: f.notes || null,
    }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`Quotation ${res.quotation.code} created`);
    bumpData();
    closeCreate();
  };

  return (
    <FormShell icon="fileText" title="New quotation"
      sub="Quick tracker — title, customer, value"
      busy={busy} error={err} onSubmit={submit} submitLabel="Create quotation">
      <Section title="Headline">
        <Field label="Title" required>
          <input className="input" required value={f.title}
                 onChange={e => setF({ ...f, title: e.target.value })}
                 placeholder="e.g. 24-camera CCTV upgrade — Bay Gate Tower" />
        </Field>
        <Row>
          <Field label="Customer">
            <Select value={f.customer_id} onChange={v => setF({ ...f, customer_id: v })}
              placeholder="- Select -"
              options={customers.map(c => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label={`Value (${currencySymbol(currentOrg)})`}>
            <input className="input numeric" type="number" min={0} step="0.01"
                   value={f.value_aed}
                   onChange={e => setF({ ...f, value_aed: e.target.value })}
                   placeholder="0" />
          </Field>
        </Row>
        <Field label="Valid until" hint="Optional — when does this quote expire?">
          <input className="input" type="date" value={f.valid_until}
                 onChange={e => setF({ ...f, valid_until: e.target.value })} />
        </Field>
        <Field label="Notes" hint="Optional — scope summary, payment terms, anything important">
          <textarea className="textarea" rows={3} value={f.notes}
                    onChange={e => setF({ ...f, notes: e.target.value })}
                    placeholder="e.g. Includes design, supply, T&C. 30-day payment terms." />
        </Field>
      </Section>
    </FormShell>
  );
}
