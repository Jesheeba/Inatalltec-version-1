"use client";
// ============================================================
// AMC module - list + detail + reactivation banner
// (Ported from modules/amc.jsx)
// ============================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db, ROLE_LABELS } from "@/lib/db";
import {
  updateAmc, AMC_STATUSES, AMC_STATUS_LABEL, AMC_PAYMENT_METHOD_LABEL,
  pauseAmc, resumeAmc, calculateDaysUntilPause,
  type AmcPaymentMethod,
} from "@/lib/create";
import { RenewAmcModal } from "../RenewAmcModal";
import { can, listScopeFor } from "@/lib/permissions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatLongDate, formatLongDateTime } from "@/lib/dates";
import type { AmcContract, AmcStatus, User } from "@/lib/types";
import {
  CardHead, ChoicePill, EmptyState, FilterBar, KPI, PageHeader, StatusBadge, WoCard,
} from "../shared";

// Color tokens for each amc_status — fed to ChoicePill so the pill
// background tracks the StatusBadge styling defined in shared.tsx.
const AMC_STATUS_PILL_CLS: Record<AmcStatus, string> = {
  draft:           "badge-outline",
  pending_payment: "badge-warning",
  active:          "badge-success",
  suspended:       "badge-danger",
  expired:         "badge-danger",
  cancelled:       "badge-danger",
  renewed:         "badge-info",
};

function ReactivationBanner({ contract, onOpen }: { contract: AmcContract; onOpen: () => void }) {
  const { fmtMoney } = useApp();
  const customerName = db.cust(contract.customer)?.name ?? "—";
  return (
    <div className="card card-accent card-pad" style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20 }}>
      <div style={{ width: 50, height: 50, borderRadius: 14, background: "var(--bg-elev)", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pri-700)" }}>
        <Icon name="refresh" size={24} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap-2">
          <span className="badge" style={{ background: "var(--pri-500)", color: "#fff" }}>Paused</span>
          {contract.overdueDays > 0 && (
            <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{contract.overdueDays}d overdue</span>
          )}
        </div>
        <div className="truncate" style={{ font: "var(--t-h3)", marginTop: 6 }}>
          {contract.code} · {customerName} — awaiting reactivation
        </div>
        <div style={{ font: "var(--t-body)", color: "var(--ink-soft)", marginTop: 2 }}>
          Contract value {fmtMoney(contract.value)}. Record payment or click Reactivate to restore service schedule.
        </div>
      </div>
      <button onClick={onOpen} className="btn btn-primary btn-lg hide-mobile">
        Review & reactivate <Icon name="arrowRight" size={16} />
      </button>
      <button onClick={onOpen} className="btn btn-primary btn-sm show-mobile">Review</button>
    </div>
  );
}

function AmcRow({ c, onClick }: { c: AmcContract; onClick: () => void }) {
  const { fmtMoney } = useApp();
  const cust = db.cust(c.customer);
  const site = db.site(c.site);
  // Suspended contracts surface the reactivation modal on click — that's the
  // closest analogue to the legacy PENDING_REACTIVATION row highlight.
  const isSuspended = c.contract_status === "suspended";
  return (
    <tr onClick={onClick} style={{ background: isSuspended ? "var(--pri-50)" : undefined }}>
      <td data-th="Code" className="numeric" style={{ fontFamily: "var(--font-mono)", font: "var(--t-small)", color: "var(--ink-mute)" }}>{c.code}</td>
      <td data-th="Customer">
        <div style={{ font: "var(--t-body-md)" }}>{cust?.name ?? "-"}</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{site?.name ?? "-"}</div>
      </td>
      <td data-th="Services" className="hide-mobile">
        <div className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{c.services.done}/{c.services.total}</div>
        <div className="progress progress-thin" style={{ marginTop: 4 }}>
          <div style={{ width: (c.services.done / c.services.total) * 100 + "%" }} />
        </div>
      </td>
      <td data-th="Next due" className="hide-mobile">
        <div className="numeric" style={{ font: "var(--t-small)" }}>{c.nextDue}</div>
        {c.overdueDays > 0 && <div style={{ font: "var(--t-micro)", color: "var(--dan-700)" }}>{c.overdueDays}d overdue</div>}
      </td>
      <td data-th="Value" className="hide-mobile numeric" style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{fmtMoney(c.value, { compact: true })}</td>
      <td data-th="State"><StatusBadge state={c.contract_status} /></td>
    </tr>
  );
}

export function AmcList() {
  const { openAmc, setModal, openCreate, fmtMoney, role, me } = useApp();
  type F = "all" | AmcStatus;
  const [filter, setFilter] = useState<F>("all");
  const scope = listScopeFor(role, "amc");

  // Counts keyed by the new lowercase enum (migration 0009). "Reactivation"
  // banner / filter now drives off 'suspended' instead of the legacy
  // PENDING_REACTIVATION (which the new payment trigger never produces).
  // Scope: managers/admin see all; lead_worker sees contracts where they
  // are the assigned Lead Tech (amc_contracts.lead_tech_id, migration 0018)
  // OR have an active WO assignment on the contract. Either path keeps the
  // list non-empty so they can spawn WOs without needing one assigned first.
  // "Hidden" roles get an empty-state below.
  const all = useMemo(() => {
    if (scope === "hidden") return [];
    const everything = Object.values(db.AMCS);
    if (scope === "all") return everything;
    const myAmcIds = new Set(
      Object.values(db.WORK_ORDERS)
        .filter(w => w.assigned?.includes(me.id) && w.source.kind === "amc")
        .map(w => w.source.id)
    );
    return everything.filter(a => a.leadTechId === me.id || myAmcIds.has(a.id));
  }, [scope, me.id]);

  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="The strategic gold mine" title="AMC contracts" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="AMC contracts are visible to Operations Manager, Admin, MD, Accounts, and Lead Technicians." />
      </div>
    );
  }
  const counts = {
    all: all.length,
    draft:           all.filter(c => c.contract_status === "draft").length,
    pending_payment: all.filter(c => c.contract_status === "pending_payment").length,
    active:          all.filter(c => c.contract_status === "active").length,
    suspended:       all.filter(c => c.contract_status === "suspended").length,
    expired:         all.filter(c => c.contract_status === "expired").length,
    cancelled:       all.filter(c => c.contract_status === "cancelled").length,
    renewed:         all.filter(c => c.contract_status === "renewed").length,
  };
  const list = filter === "all" ? all : all.filter(c => c.contract_status === filter);

  return (
    <div className="main-pad">
      <PageHeader eyebrow="The strategic gold mine" title="AMC contracts"
        sub="Quarterly maintenance services, recurring revenue, payment-gated execution."
        right={can(role, "CREATE_AMC")
          ? <button className="btn btn-primary" onClick={() => openCreate("amc")}><Icon name="plus" size={14} /> New AMC</button>
          : undefined} />

      {(() => {
        const target = all.find(c => c.contract_status === "suspended");
        if (!target) return null;
        return (
          <ReactivationBanner contract={target}
            onOpen={() => setModal({ kind: "reactivation", data: { id: target.id } })} />
        );
      })()}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active contracts" value={counts.active} sub="+6 this quarter" trend="up" />
        <KPI label="Annualised value" value={fmtMoney(1_840_000, { compact: true })}>
          <div className="progress" style={{ marginTop: 8 }}><div style={{ width: "72%" }} /></div>
        </KPI>
        <KPI label="Paused · payment" value={counts.suspended} sub={`${fmtMoney(134_000, { compact: true })} at risk`} trend="down" />
        <KPI accent="violet" label="Pending payment" value={counts.pending_payment} sub="awaiting first payment" />
      </div>

      <div className="card card-pad" style={{ padding: 14, marginBottom: 16 }}>
        <FilterBar<F> value={filter} onChange={setFilter} options={[
          { value: "all",             label: "All",             count: counts.all },
          { value: "draft",           label: "Draft",           count: counts.draft },
          { value: "pending_payment", label: "Pending Payment", count: counts.pending_payment },
          { value: "active",          label: "Active",          count: counts.active },
          { value: "suspended",       label: "Paused",          count: counts.suspended },
          { value: "expired",         label: "Expired",         count: counts.expired },
          { value: "cancelled",       label: "Cancelled",       count: counts.cancelled },
        ]} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Code</th>
                <th>Customer · Site</th>
                <th className="hide-mobile" style={{ width: 140 }}>Services</th>
                <th className="hide-mobile" style={{ width: 120 }}>Next due</th>
                <th className="hide-mobile" style={{ width: 110 }}>Value</th>
                <th style={{ width: 140 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <AmcRow key={c.id} c={c} onClick={() => {
                  if (c.contract_status === "suspended") setModal({ kind: "reactivation", data: { id: c.id } });
                  else openAmc(c.id);
                }} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ k, v, sub, onClick }:
  { k: string; v: ReactNode; sub?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
      <div style={{ font: "var(--t-body-md)", marginTop: 3 }}>
        {v} {onClick && <Icon name="externalLink" size={11} style={{ color: "var(--ink-quiet)", marginLeft: 4, verticalAlign: "middle" }} />}
      </div>
      {sub && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// Mirror of LeadTechRow in Misc.tsx, sized to drop into the Contract
// metadata MetaRow column. Read-only by default; Operations Manager /
// Admin / MD get an inline reassign Select (migration 0018).
function AmcLeadTechRow({
  leadTechId, canEdit, leadTechOptions, onChange,
}: {
  leadTechId: string;
  canEdit: boolean;
  leadTechOptions: User[];
  onChange: (id: string) => void;
}) {
  const leadTech = leadTechId ? db.user(leadTechId) : null;
  return (
    <div>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Lead Technician
      </div>
      {canEdit ? (
        <select
          className="input input-sm"
          value={leadTechId}
          onChange={e => onChange(e.target.value)}
          style={{ marginTop: 4, width: "100%" }}
        >
          <option value="">— Unassigned —</option>
          {leadTechOptions.map(u => (
            <option key={u.id} value={u.id}>{u.name} · {ROLE_LABELS[u.role]}</option>
          ))}
        </select>
      ) : (
        <div style={{ font: "var(--t-body-md)", marginTop: 3 }}>
          {leadTech ? `${leadTech.name} · ${ROLE_LABELS[leadTech.role]}` : "— Unassigned —"}
        </div>
      )}
    </div>
  );
}

// ── AMC pause / renewal helpers (migration 0021) ─────────
// Roles allowed to pause / resume / renew an AMC. Mirrors the existing
// amc_write RLS policy (0016): md / admin / manager. UI hides the
// buttons for other roles; the DB still rejects unauthorised writes.
function canManageAmcPause(role: string): boolean {
  return role === "md" || role === "admin" || role === "manager";
}

// Roles allowed to record AMC payments. Mirrors amc_pay_write
// (migration 0025): md / admin / manager / sales / accounts.
// Technicians (lead_worker / worker / driver / subcontractor) should
// not see the "Record Payment" CTA on the contract detail page —
// they're field execution, not finance.
function canRecordAmcPayment(role: string): boolean {
  return role === "md" || role === "admin" || role === "manager"
      || role === "sales" || role === "accounts";
}

// Roles allowed to change the AMC contract_status pill. Tightest gate
// — must match amc_write (md / admin / manager). Anyone else gets a
// read-only badge instead of the editable ChoicePill.
function canChangeAmcStatus(role: string): boolean {
  return role === "md" || role === "admin" || role === "manager";
}

// When the contract is within this many days of expires_at (or already
// past), the "Renew Contract" button appears on the detail page.
const RENEW_WINDOW_DAYS = 30;

function isRenewEligible(amc: AmcContract): boolean {
  if (!amc.expiresAt) return false;
  const exp = new Date(amc.expiresAt).getTime();
  if (Number.isNaN(exp)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToExpiry = Math.round((exp - today.getTime()) / 86_400_000);
  return daysToExpiry <= RENEW_WINDOW_DAYS;
}

// Inline reason-capture modal for the Pause button. Resume uses a
// simpler confirm (no reason needed) but reuses the same chrome.
function PauseReasonModal({ open, mode, onClose, onConfirm, busy, err }: {
  open: boolean;
  mode: "pause" | "resume";
  onClose: () => void;
  onConfirm: (reason: string) => void;
  busy: boolean;
  err: string | null;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) setReason(""); }, [open]);
  if (!open) return null;
  const requiresReason = mode === "pause";
  return (
    <div role="dialog" aria-modal="true"
      onClick={() => { if (!busy) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.42)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, zIndex: 1000,
      }}>
      <form onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (requiresReason && !reason.trim()) return; onConfirm(reason); }}
        style={{
          background: "var(--bg-elev)", borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: 460,
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}>
        <div>
          <div style={{ font: "var(--t-h3)" }}>
            {mode === "pause" ? "Pause AMC contract" : "Resume AMC contract"}
          </div>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
            {mode === "pause"
              ? "Halts further scheduled visits and free calls until you resume or payment is recorded."
              : "Brings the contract back to active. Scheduled visits resume immediately."}
          </div>
        </div>
        <div>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                          textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            {mode === "pause" ? "Pause reason" : "Note (optional)"}
            {requiresReason && <span style={{ color: "var(--dan-700)" }}> *</span>}
          </label>
          <textarea className="textarea" rows={3}
            value={reason} onChange={e => setReason(e.target.value)}
            placeholder={mode === "pause"
              ? "e.g. Customer disputes invoice; awaiting clarification"
              : "Optional note about why you're resuming"}
            style={{ marginTop: 6 }} required={requiresReason} />
        </div>
        {err && (
          <div style={{
            padding: "10px 12px", background: "var(--dan-50)",
            color: "var(--dan-700)", borderRadius: "var(--r-md)",
            font: "var(--t-small)", display: "flex", alignItems: "center", gap: 8,
          }}>
            <Icon name="alertCircle" size={14} /> {err}
          </div>
        )}
        <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary"
            disabled={busy || (requiresReason && !reason.trim())}>
            {busy
              ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
              : (mode === "pause"
                  ? <><Icon name="pause" size={13} /> Pause AMC</>
                  : <><Icon name="play" size={13} /> Resume AMC</>)}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AmcDetail({ id }: { id: string }) {
  const { go, openWO, openAmc, openCreate, setModal, openCustomer, fmtMoney, fireToast, bumpData, dataVersion, role, me } = useApp();
  // Subscribe to dataVersion so a status change or new payment re-renders.
  void dataVersion;
  const c = db.amc(id);
  // Hoisted schedule fetch — feeds BOTH the service-schedule card and the
  // "Services X/Y · Next: …" KPI. Kept above the early return so the hook
  // order is stable when the contract briefly resolves to null.
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setScheduleError(null);
      const { data, error } = await supabaseBrowser()
        .from("amc_service_schedule")
        .select("id, service_number, scheduled_date, status, work_order_id, completed_at")
        .eq("amc_contract_id", id)
        .order("service_number", { ascending: true });
      if (cancelled) return;
      if (error) { setScheduleError(error.message); setSchedule([]); return; }
      setSchedule((data ?? []) as ScheduleRow[]);
    })();
    return () => { cancelled = true; };
  }, [id, dataVersion]);

  const scheduleStats = useMemo(() => {
    if (!schedule || schedule.length === 0) return null;
    const done = schedule.filter(s => s.status === "completed").length;
    const next = schedule.find(s => s.status !== "completed" && s.status !== "skipped");
    return {
      done,
      total: schedule.length,
      nextDue: next ? formatRelativeDate(next.scheduled_date) : "—",
    };
  }, [schedule]);

  if (!c) return <EmptyState icon="alertCircle" title="AMC not found"
    action={<button className="btn btn-primary" onClick={() => go("amc")}>Back to AMC</button>} />;
  const cust = db.cust(c.customer);
  const site = db.site(c.site);
  const wos = db.byAmc(id).wos;
  const mgr = db.user(c.manager);
  const custName = cust?.name ?? "-";
  const siteName = site?.name ?? "-";
  const siteArea = site?.area ?? "";

  // Lead Tech assignment (migration 0018). Operations Manager / Admin /
  // MD can reassign; everyone else gets read-only. Gated by CREATE_AMC
  // permission so the rule lines up with who can create AMCs in the first
  // place. Plus a "+ Create Work Order" button — admins/MD/managers always
  // see it, the assigned Lead Tech also sees it (they're the one who'll
  // staff workers onto the new WO).
  const canEditLead = can(role, "CREATE_AMC");
  const isAssignedLead = role === "lead_worker" && c.leadTechId === me.id;
  const canCreateWo = canEditLead || isAssignedLead;
  const leadTechOptions = useMemo(
    () => Object.values(db.USERS).filter(u => u.role === "lead_worker"),
    [dataVersion],
  );

  const onChangeLeadTech = async (nextId: string) => {
    if (nextId === c.leadTechId) return;
    const prevId = c.leadTechId;
    db.AMCS[id] = { ...c, leadTechId: nextId };
    bumpData();
    const res = await updateAmc(id, { lead_tech_id: nextId || null });
    if (!res.ok) {
      db.AMCS[id] = { ...c, leadTechId: prevId };
      bumpData();
      fireToast(`Couldn't reassign Lead: ${res.error}`);
      return;
    }
    const nextUser = nextId ? db.user(nextId) : null;
    fireToast(nextUser ? `Lead Tech → ${nextUser.name}` : "Lead Tech cleared");
  };

  // History reloader handle — refetch after each successful status update.
  const [historyTick, setHistoryTick] = useState(0);

  const onChangeStatus = async (next: AmcStatus) => {
    if (next === c.contract_status) return;
    const prev = c.contract_status;
    // Optimistic: mutate the in-memory mirror so the pill flips instantly.
    db.AMCS[id] = { ...c, contract_status: next };
    bumpData();
    const res = await updateAmc(id, { contract_status: next });
    if (!res.ok) {
      db.AMCS[id] = { ...c, contract_status: prev };
      bumpData();
      fireToast(`Couldn't update status: ${res.error}`);
      return;
    }
    fireToast(`Status → ${AMC_STATUS_LABEL[next]}`);
    setHistoryTick(t => t + 1);
  };

  const statusOptions = AMC_STATUSES.map(s => ({
    value: s, label: AMC_STATUS_LABEL[s], cls: AMC_STATUS_PILL_CLS[s],
  }));

  // ── Pause / Resume / Renew state (migration 0021) ──
  const canPauseResume = canManageAmcPause(role);
  const canRecordPay  = canRecordAmcPayment(role);
  const canEditStatus = canChangeAmcStatus(role);
  const isPaused = c.contract_status === "suspended";
  const renewEligible = isRenewEligible(c);
  // Find any contract that renewed THIS one (reverse chain link).
  const renewedToContract = useMemo(
    () => Object.values(db.AMCS).find(a => a.renewedFromId === id) ?? null,
    [id, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const renewedFromContract = c.renewedFromId ? db.amc(c.renewedFromId) : null;

  const [pauseModal, setPauseModal] = useState<{ open: boolean; mode: "pause" | "resume" }>({
    open: false, mode: "pause",
  });
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseErr, setPauseErr]   = useState<string | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);

  const onConfirmPauseOrResume = async (reason: string) => {
    setPauseBusy(true); setPauseErr(null);
    const res = pauseModal.mode === "pause"
      ? await pauseAmc(id, reason, me.id)
      : await resumeAmc(id, me.id);
    setPauseBusy(false);
    if (!res.ok) { setPauseErr(res.error); return; }
    fireToast(pauseModal.mode === "pause"
      ? `${c.code} paused`
      : `${c.code} resumed`);
    bumpData();
    setHistoryTick(t => t + 1);
    setPauseModal({ open: false, mode: pauseModal.mode });
  };

  // Pause-warning / payment-status copy.
  //
  // The yellow/neutral payment banners must NEVER show on a paid
  // contract — first_payment_due_at stays populated as historical
  // metadata even after recordAmcPayment flips the status to 'active'.
  // We use contract_status === 'pending_payment' as the "not yet paid"
  // signal: the 0027 payment trigger flips pending_payment → active
  // atomically with the payment INSERT, so this status is a reliable
  // proxy for "no payment_received_at yet" without needing to thread
  // payment_received_at all the way through types + hydrate. The red
  // "paused" banner is gated separately on isPaused below.
  //
  // `daysToPause` is positive when the cliff is upcoming, zero on
  // cliff day, negative when the cliff has passed without an
  // autoPause sweep having caught it yet.
  const daysToPause = !isPaused && c.contract_status === "pending_payment"
    ? calculateDaysUntilPause(c)
    : null;
  // Yellow (warning): cliff approaching within 10 days OR already past
  // but auto-pause hasn't run yet.
  const showPauseWarning = daysToPause !== null && daysToPause <= 10;
  // Neutral (info): cliff is more than 10 days away — payment due but
  // no pressure yet.
  const showPaymentDueInfo = daysToPause !== null && daysToPause > 10 && !!c.firstPaymentDueAt;

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => go("amc")} style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All AMC contracts
        </a>
      </div>
      <PageHeader
        eyebrow={"AMC · " + c.code}
        title={custName}
        sub={[site?.name, site?.area].filter(Boolean).join(" · ") || "-"}
        right={
          <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* Record Payment — gated behind canRecordPay so technicians
                (lead_worker/worker/driver) never see a CTA they can't
                actually use. DB-side amc_pay_write enforces it too. */}
            {canRecordPay && (c.contract_status === "pending_payment" || c.contract_status === "suspended") && (
              <button className="btn btn-primary" onClick={() => openCreate("amc_payment", {
                amc_id: id, code: c.code, value_aed: c.value,
                was_suspended: c.contract_status === "suspended",
              })}>
                <Icon name="banknote" size={14} />
                {c.contract_status === "suspended" ? " Record Payment & Reactivate" : " Record Payment"}
              </button>
            )}
            {/* Legacy "Reactivate" button removed for paused contracts —
                md/admin/manager use the new "Resume AMC" button below
                (calls resumeAmc directly), and accounts users use the
                "Record Payment & Reactivate" button above (the payment
                trigger fn_amc_payment_received auto-resumes). The
                ReactivationModal that this button opened is still
                accessible from the AmcList banner. */}
            {canPauseResume && !isPaused && c.contract_status !== "expired" && c.contract_status !== "cancelled" && c.contract_status !== "renewed" && (
              <button className="btn btn-ghost"
                onClick={() => { setPauseErr(null); setPauseModal({ open: true, mode: "pause" }); }}>
                <Icon name="pause" size={14} /> Pause AMC
              </button>
            )}
            {canPauseResume && isPaused && (
              <button className="btn btn-ghost"
                onClick={() => { setPauseErr(null); setPauseModal({ open: true, mode: "resume" }); }}>
                <Icon name="play" size={14} /> Resume AMC
              </button>
            )}
            {canPauseResume && renewEligible && !renewedToContract && (
              <button className="btn btn-primary"
                onClick={() => setRenewOpen(true)}>
                <Icon name="refresh" size={14} /> Renew Contract
              </button>
            )}
            {/* Status pill: editable for md/admin/manager; read-only
                StatusBadge for everyone else (technicians, accounts,
                sales). Aligns with amc_write RLS gate. */}
            {canEditStatus ? (
              <ChoicePill<AmcStatus>
                ariaLabel="AMC contract status"
                value={c.contract_status}
                options={statusOptions}
                onChange={onChangeStatus}
              />
            ) : (
              <StatusBadge state={c.contract_status} />
            )}
          </div>
        }
      />

      {/* Pause-reason / resume-note modal (migration 0021) */}
      <PauseReasonModal
        open={pauseModal.open}
        mode={pauseModal.mode}
        busy={pauseBusy}
        err={pauseErr}
        onClose={() => { if (!pauseBusy) setPauseModal({ open: false, mode: pauseModal.mode }); }}
        onConfirm={onConfirmPauseOrResume} />

      {/* Renew-contract modal */}
      <RenewAmcModal
        previous={c}
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        onRenewed={(newId) => { setRenewOpen(false); openAmc(newId); }} />

      {/* Paused banner — surfaces the reason inline since the existing
          ReactivationBanner lives on AmcList, not here. Specialises the
          headline + adds a "record payment to resume" hint when the
          reason is the 0027 'Payment overdue' auto-pause. */}
      {isPaused && c.suspendedReason && (
        <div className="card card-pad" style={{
          marginBottom: 16,
          background: "var(--dan-50)",
          borderColor: "var(--dan-100)",
        }}>
          <div className="row gap-2" style={{ alignItems: "flex-start" }}>
            <Icon name="pause" size={16} style={{ color: "var(--dan-700)", marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "var(--t-body-md)", color: "var(--dan-700)", fontWeight: 600 }}>
                {c.suspendedReason === "Payment overdue"
                  ? "Paused due to overdue payment"
                  : "Contract is paused"}
              </div>
              <div style={{ font: "var(--t-small)", color: "var(--ink)", marginTop: 4 }}>
                {c.suspendedReason === "Payment overdue"
                  ? "Record payment to resume."
                  : c.suspendedReason}
              </div>
              {c.suspendedAt && (
                <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginTop: 4 }}>
                  Paused {formatPauseAgo(c.suspendedAt)}
                  {c.pausedBy ? ` · by ${db.user(c.pausedBy)?.name ?? "Unknown"}` : " · auto"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Warning banner — payment overdue or about to auto-pause.
          Handles three cases:
            • daysToPause > 0 (cliff upcoming): "auto-pause in N days"
            • daysToPause === 0: "auto-pause today"
            • daysToPause < 0  (past due, sweep hasn't run): "overdue,
              record to avoid suspension". This is the 0027 spec copy. */}
      {showPauseWarning && (
        <div className="card card-pad" style={{
          marginBottom: 16,
          background: "var(--warn-100)",
          borderColor: "var(--warn-100)",
        }}>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <Icon name="alertTriangle" size={16} style={{ color: "var(--warn-700)" }} />
            <div style={{ font: "var(--t-body-md)", color: "var(--warn-700)" }}>
              {daysToPause! < 0
                ? "Payment overdue — record payment to avoid suspension."
                : daysToPause === 0
                ? "First payment overdue — contract will auto-pause today."
                : `First payment due in ${daysToPause} day${daysToPause === 1 ? "" : "s"} — record payment to avoid suspension.`}
            </div>
          </div>
        </div>
      )}

      {/* Neutral info banner — first payment due, plenty of runway.
          Shows for pending_payment contracts when the cliff is >10 days
          out. Stops surprising the user with no signal at all between
          contract-signing and the 10-day warning window. */}
      {showPaymentDueInfo && c.firstPaymentDueAt && (
        <div className="card card-pad" style={{
          marginBottom: 16,
          background: "var(--bg-muted)",
          borderColor: "var(--border)",
        }}>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <Icon name="clock" size={16} style={{ color: "var(--ink-mute)" }} />
            <div style={{ font: "var(--t-body-md)", color: "var(--ink)" }}>
              First payment due {formatRelativeDate(c.firstPaymentDueAt.slice(0, 10))}
              {daysToPause !== null && daysToPause > 0 && (
                <span style={{ color: "var(--ink-mute)", marginLeft: 6 }}>
                  · {daysToPause} day{daysToPause === 1 ? "" : "s"} remaining
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI label="Annual value" value={fmtMoney(c.value, { compact: true })} />
        <KPI
          label="Services"
          value={(scheduleStats?.done ?? c.services.done) + " / " + (scheduleStats?.total ?? c.services.total)}
          sub={"Next: " + (scheduleStats?.nextDue ?? c.nextDue)}
        />
        <KPI label="Free calls used" value={c.freeCalls} sub="of 10 included" />
        <KPI label="Expires" value={c.expiresAt} />
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
        <AmcServiceScheduleCard
          rows={schedule}
          error={scheduleError}
          contractStatus={c.contract_status}
          onOpenWo={openWO}
        />

        <section className="card card-pad">
          <CardHead title="Contract metadata" />
          <div className="col gap-3">
            <MetaRow k="Customer" v={custName} onClick={cust ? () => openCustomer(c.customer) : undefined} />
            <MetaRow k="Site" v={siteName} sub={siteArea} />
            <MetaRow k="Manager" v={mgr.name} sub={ROLE_LABELS[mgr.role]} />
            <AmcLeadTechRow
              leadTechId={c.leadTechId}
              canEdit={canEditLead}
              leadTechOptions={leadTechOptions}
              onChange={onChangeLeadTech}
            />
            <MetaRow k="Value" v={fmtMoney(c.value)} />
            <MetaRow k="Expires" v={c.expiresAt} />
            <MetaRow k="Status" v={<StatusBadge state={c.contract_status} />} />
            {renewedFromContract && (
              <MetaRow
                k="Renewed from"
                v={renewedFromContract.code}
                sub={db.cust(renewedFromContract.customer)?.name ?? undefined}
                onClick={() => openAmc(renewedFromContract.id)} />
            )}
            {renewedToContract && (
              <MetaRow
                k="Renewed to"
                v={renewedToContract.code}
                sub={db.cust(renewedToContract.customer)?.name ?? undefined}
                onClick={() => openAmc(renewedToContract.id)} />
            )}
            {c.firstPaymentDueAt && c.contract_status === "active" && (
              <MetaRow k="First payment due" v={c.firstPaymentDueAt.slice(0, 10)}
                sub={daysToPause !== null
                  ? (daysToPause >= 0 ? `${daysToPause} day${daysToPause === 1 ? "" : "s"} until auto-pause` : `${-daysToPause} day${daysToPause === -1 ? "" : "s"} overdue`)
                  : undefined} />
            )}
          </div>
        </section>
      </div>

      <AmcActivationCard amcId={id} reloadKey={dataVersion} />

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <CardHead
          title={"Linked work orders · " + wos.length}
          sub="One WO per quarterly service · plus any free-call visits"
          right={canCreateWo ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openCreate("workorder", {
                source_kind: "amc",
                source_id: id,
                customer_id: c.customer,
                site_id: c.site || undefined,
              })}
            >
              <Icon name="plus" size={13} /> Create Work Order
            </button>
          ) : undefined}
        />
        {wos.length === 0 ? (
          <EmptyState
            icon="briefcase"
            title="No work orders linked yet"
            action={canCreateWo ? (
              <button
                className="btn btn-primary"
                onClick={() => openCreate("workorder", {
                  source_kind: "amc",
                  source_id: id,
                  customer_id: c.customer,
                  site_id: c.site || undefined,
                })}
              >
                <Icon name="plus" size={14} /> Create Work Order
              </button>
            ) : undefined}
          />
        ) : (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {wos.map(w => <WoCard key={w.id} wo={w} compact onClick={() => openWO(w.id)} />)}
          </div>
        )}
      </section>

      <AmcPaymentsCard amcId={id} reloadKey={dataVersion} />
      <AmcStatusHistory amcId={id} reloadKey={historyTick + dataVersion} />
    </div>
  );
}

/* ─── Service schedule card (Step C) ─────────────────────
   Reads the real amc_service_schedule rows seeded by the
   fn_amc_payment_received trigger (migration 0011). Falls back
   to a status-aware empty state when the contract hasn't been
   activated yet.

   The fetch lives in AmcDetail (not here) so the same data also
   drives the "Services X/Y · Next: …" KPI — single source of truth.
============================================================ */
type ScheduleStatus = "scheduled" | "in_progress" | "completed" | "skipped" | "overdue";

interface ScheduleRow {
  id: string;
  service_number: number;
  scheduled_date: string;
  status: ScheduleStatus;
  work_order_id: string | null;
  completed_at: string | null;
}

const SERVICE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  scheduled:   "Scheduled",
  in_progress: "In progress",
  completed:   "Completed",
  skipped:     "Skipped",
  overdue:     "Overdue",
};

const SERVICE_STATUS_BADGE: Record<ScheduleStatus, string> = {
  scheduled:   "badge-outline",
  in_progress: "badge-info",
  completed:   "badge-success",
  skipped:     "badge",
  overdue:     "badge-danger",
};

function AmcServiceScheduleCard({
  rows, error, contractStatus, onOpenWo,
}: {
  rows: ScheduleRow[] | null;
  error: string | null;
  contractStatus: AmcStatus;
  onOpenWo: (id: string) => void;
}) {
  const sub = rows && rows.length > 0
    ? `${rows.length} services across the contract year`
    : "Auto-scheduled on first payment";

  return (
    <section className="card card-pad">
      <CardHead title="Service schedule" sub={sub} />
      {rows === null ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>
      ) : error ? (
        <div style={{ font: "var(--t-small)", color: "var(--dan-700)", padding: 8 }}>
          Couldn't load schedule: {error}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={
            contractStatus === "draft" || contractStatus === "pending_payment"
              ? "Services will auto-schedule after first payment"
              : contractStatus === "suspended"
                ? "Service schedule on hold — record payment to restore"
                : contractStatus === "cancelled" || contractStatus === "expired"
                  ? "No services scheduled — contract " + contractStatus
                  : "No services scheduled yet"
          }
        />
      ) : (
        <div className="col gap-3">
          {rows.map(r => (
            <ScheduleEntry key={r.id} row={r} contractStatus={contractStatus} onOpenWo={onOpenWo} />
          ))}
        </div>
      )}
    </section>
  );
}

function ScheduleEntry({
  row, contractStatus, onOpenWo,
}: {
  row: ScheduleRow;
  contractStatus: AmcStatus;
  onOpenWo: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  // A 'scheduled' row whose date has passed is effectively overdue, even if
  // nothing has updated the stored enum yet.
  const effective: ScheduleStatus =
    row.status === "scheduled" && row.scheduled_date < today ? "overdue" : row.status;

  const done       = effective === "completed";
  const inProgress = effective === "in_progress";
  const overdue    = effective === "overdue";
  const onHold     = contractStatus === "suspended" && (effective === "scheduled" || effective === "overdue");

  const accentBg     = done ? "var(--suc-50)" : overdue ? "var(--dan-50)" : inProgress ? "var(--pri-50)" : "var(--bg-muted)";
  const accentBorder = done ? "var(--suc-100)" : overdue ? "var(--dan-100)" : inProgress ? "var(--pri-200)" : "var(--border)";
  const numBg        = done ? "var(--suc-500)" : overdue ? "var(--dan-500)" : inProgress ? "var(--pri-500)" : "var(--bg-deep)";
  const numColor     = done || inProgress || overdue ? "#fff" : "var(--ink-mute)";

  const daysIndicator = (() => {
    if (done || row.status === "skipped") return null;
    const d = new Date(row.scheduled_date.slice(0, 10));
    const t = new Date(today);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
    if (diff === 0) return { label: "Today", tone: "warning" as const };
    if (diff === 1) return { label: "Tomorrow", tone: "info" as const };
    if (diff > 0)   return { label: `In ${diff} days`, tone: "neutral" as const };
    return { label: `${-diff}d overdue`, tone: "danger" as const };
  })();

  const daysColor =
    daysIndicator?.tone === "danger"  ? "var(--dan-700)" :
    daysIndicator?.tone === "warning" ? "var(--war-700)" :
    daysIndicator?.tone === "info"    ? "var(--pri-700)" :
    "var(--ink-mute)";

  return (
    <div className="row gap-3" style={{
      padding: 12, borderRadius: "var(--r-md)",
      background: accentBg, border: `1px solid ${accentBorder}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 12,
        background: numBg, color: numColor,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {done
          ? <Icon name="check" size={18} strokeWidth={2.5} />
          : <span style={{ font: "600 14px/1", fontFamily: "var(--font-display)" }}>Q{row.service_number}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: "var(--t-body-md)" }}>Quarter {row.service_number} service</span>
          <div className="row gap-2">
            {onHold && <span className="badge badge-primary">Hold</span>}
            <span className={`badge ${SERVICE_STATUS_BADGE[effective]}`}>
              {SERVICE_STATUS_LABEL[effective]}
            </span>
          </div>
        </div>
        <div className="row gap-2" style={{ marginTop: 2, font: "var(--t-small)", color: "var(--ink-mute)", flexWrap: "wrap" }}>
          <span className="numeric">{formatScheduleDate(row.scheduled_date)}</span>
          {daysIndicator && (
            <span style={{ color: daysColor, fontWeight: 500 }}>· {daysIndicator.label}</span>
          )}
          {done && row.completed_at && (
            <span>· Completed {formatHistoryDate(row.completed_at)}</span>
          )}
        </div>
        {row.work_order_id && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 6, padding: "2px 8px" }}
            onClick={() => onOpenWo(row.work_order_id!)}
          >
            View work order <Icon name="arrowRight" size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function formatScheduleDate(dateOnly: string): string {
  const d = new Date(dateOnly.slice(0, 10));
  if (Number.isNaN(d.getTime())) return dateOnly;
  return formatLongDate(d);
}

/* ─── Activation details (post-payment summary) ──────────
   The base AmcContract carried in db.AMCS doesn't include the
   payment-gating fields (activation_date, payment_received_at,
   payment_grace_days). We fetch them on-demand here. The card
   only renders when the contract is active or about to activate.
   reloadKey is dataVersion → refetches after every bumpData().
============================================================ */
interface ActivationFields {
  contract_status: AmcStatus;
  payment_received_at: string | null;
  activation_date: string | null;
  payment_grace_days: number | null;
}

function AmcActivationCard({ amcId, reloadKey }: { amcId: string; reloadKey: number }) {
  const [row, setRow] = useState<ActivationFields | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const { data, error } = await supabaseBrowser()
        .from("amc_contracts")
        .select("contract_status, payment_received_at, activation_date, payment_grace_days")
        .eq("id", amcId).maybeSingle();
      if (cancelled) return;
      if (error) { setError(error.message); setRow(null); return; }
      setRow(data as ActivationFields | null);
    })();
    return () => { cancelled = true; };
  }, [amcId, reloadKey]);

  if (error) return null;
  if (!row) return null;
  // Only show once the contract has at least reached pending_payment.
  if (row.contract_status === "draft") return null;
  if (!row.payment_received_at && !row.activation_date) return null;

  const paid       = row.payment_received_at ? formatHistoryDate(row.payment_received_at) : "—";
  const activates  = row.activation_date ? formatRelativeDate(row.activation_date) : "—";
  const graceDays  = row.payment_grace_days ?? 30;

  return (
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <CardHead title="Activation details"
        sub={`Service schedule starts ${graceDays} days after payment lands`} />
      <div className="col" style={{ gap: 10 }}>
        <div className="row between" style={{ padding: "6px 0" }}>
          <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Payment received</span>
          <span className="numeric" style={{ font: "var(--t-body-md)" }}>{paid}</span>
        </div>
        <div className="row between" style={{ padding: "6px 0" }}>
          <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Activation date</span>
          <span className="numeric" style={{ font: "var(--t-body-md)" }}>{activates}</span>
        </div>
      </div>
    </section>
  );
}

/* ─── Payments history card ──────────────────────────────
   Lists every amc_payments row for this contract, newest first.
   reloadKey bumps via dataVersion so a fresh payment shows up.
============================================================ */
interface PaymentRow {
  id: string;
  amount_aed: number;
  received_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
}

function AmcPaymentsCard({ amcId, reloadKey }: { amcId: string; reloadKey: number }) {
  const { fmtMoney } = useApp();
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const { data, error } = await supabaseBrowser()
        .from("amc_payments")
        .select("id, amount_aed, received_at, method, reference, notes")
        .eq("amc_id", amcId)
        .order("received_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) { setError(error.message); setRows([]); return; }
      setRows((data ?? []) as PaymentRow[]);
    })();
    return () => { cancelled = true; };
  }, [amcId, reloadKey]);

  const visible = useMemo(() => {
    if (!rows) return [];
    return showAll ? rows : rows.slice(0, 5);
  }, [rows, showAll]);

  return (
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <CardHead title={"Payments" + (rows ? ` · ${rows.length}` : "")}
        sub="Every payment received against this contract" />
      {rows === null ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>
      ) : error ? (
        <div style={{ font: "var(--t-small)", color: "var(--dan-700)", padding: 8 }}>Couldn't load payments: {error}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="banknote" title="No payments recorded yet"
          sub="Use Record Payment above to register the first payment." />
      ) : (
        <>
          <div className="col" style={{ gap: 8 }}>
            {visible.map(p => <PaymentRowCard key={p.id} row={p} fmtMoney={fmtMoney} />)}
          </div>
          {rows.length > 5 && !showAll && (
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>
                View all {rows.length} payments
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PaymentRowCard({ row, fmtMoney }: {
  row: PaymentRow;
  fmtMoney: (n: number | null | undefined, opts?: { compact?: boolean }) => string;
}) {
  const methodLabel = row.method && (row.method in AMC_PAYMENT_METHOD_LABEL)
    ? AMC_PAYMENT_METHOD_LABEL[row.method as AmcPaymentMethod]
    : row.method ?? "—";
  return (
    <div className="row gap-3" style={{
      padding: 12, background: "var(--bg-muted)",
      borderRadius: "var(--r-md)", border: "1px solid var(--border)",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: "var(--suc-100)", color: "var(--suc-700)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon name="banknote" size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between" style={{ gap: 8 }}>
          <span className="numeric" style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{fmtMoney(row.amount_aed)}</span>
          <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{formatHistoryDate(row.received_at)}</span>
        </div>
        <div className="row gap-2" style={{ marginTop: 2, font: "var(--t-small)", color: "var(--ink-mute)", flexWrap: "wrap" }}>
          <span>{methodLabel}</span>
          {row.reference && <span style={{ fontStyle: "italic" }}>· {row.reference}</span>}
        </div>
        {row.notes && (
          <div style={{ marginTop: 6, font: "var(--t-small)", color: "var(--ink-soft)" }}>{row.notes}</div>
        )}
      </div>
    </div>
  );
}

function formatRelativeDate(dateOnly: string): string {
  const d = new Date(dateOnly.slice(0, 10));
  if (Number.isNaN(d.getTime())) return dateOnly;
  const today = new Date(new Date().toISOString().slice(0, 10));
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const display = formatLongDate(d);
  if (days === 0) return `${display} (today)`;
  if (days === 1) return `${display} (tomorrow)`;
  if (days === -1) return `${display} (yesterday)`;
  if (days > 0) return `${display} (in ${days} days)`;
  return `${display} (${-days} days ago)`;
}

// Format a pause timestamp as a relative phrase: "today", "yesterday",
// "3 days ago", or the absolute date for older entries.
function formatPauseAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return formatLongDate(new Date(iso));
}

/* ─── AMC status history ─────────────────────────────────
   Mirror of ProjectStatusHistory in Misc.tsx — reads from
   amc_status_history (migration 0009b). RLS lets anyone who
   can see the parent contract see its audit trail.
============================================================ */
interface AmcHistoryRow {
  id: string;
  old_status: AmcStatus | null;
  new_status: AmcStatus;
  changed_by: string | null;
  changed_at: string;
}

function AmcStatusHistory({ amcId, reloadKey }: { amcId: string; reloadKey: number }) {
  const [rows, setRows] = useState<AmcHistoryRow[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const { data, error } = await supabaseBrowser()
        .from("amc_status_history")
        .select("id, old_status, new_status, changed_by, changed_at")
        .eq("amc_contract_id", amcId)
        .order("changed_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) { setError(error.message); setRows([]); return; }
      setRows((data ?? []) as AmcHistoryRow[]);
    })();
    return () => { cancelled = true; };
  }, [amcId, reloadKey]);

  const visible = useMemo(() => {
    if (!rows) return [];
    return showAll ? rows : rows.slice(0, 20);
  }, [rows, showAll]);

  return (
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <CardHead title="Status history" sub="Every contract status change with actor and timestamp" />
      {rows === null ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>
      ) : error ? (
        <div style={{ font: "var(--t-small)", color: "var(--dan-700)", padding: 8 }}>Couldn't load history: {error}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="clock" title="No changes yet"
          sub="Change the status above — every change is recorded here." />
      ) : (
        <>
          <div className="col" style={{ gap: 8 }}>
            {visible.map(r => <AmcHistoryEntry key={r.id} row={r} />)}
          </div>
          {rows.length > 20 && !showAll && (
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>
                View all {rows.length} entries
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AmcHistoryEntry({ row }: { row: AmcHistoryRow }) {
  const actor = row.changed_by ? db.user(row.changed_by) : null;
  const when = formatHistoryDate(row.changed_at);
  return (
    <div className="row gap-3" style={{
      padding: 10, background: "var(--bg-muted)",
      borderRadius: "var(--r-md)", border: "1px solid var(--border)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--bg-elev)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon name="clock" size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--t-body-md)" }}>
          Status <span style={{ color: "var(--ink-mute)" }}>
            {row.old_status ? AMC_STATUS_LABEL[row.old_status] : "—"}
          </span> → <strong>{AMC_STATUS_LABEL[row.new_status]}</strong>
        </div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
          {actor ? actor.name : "Unknown user"} · {when}
        </div>
      </div>
    </div>
  );
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatLongDateTime(d);
}
