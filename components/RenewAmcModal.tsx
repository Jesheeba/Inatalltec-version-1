"use client";
// ============================================================
// RenewAmcModal — modal dialog launched from the AMC detail page
// when the user clicks "Renew Contract". Defaults inherit from the
// previous contract; the user can edit value/dates/lead before
// submitting. Submit calls renewAmc() in lib/create.ts which:
//
//   1) INSERTs a new amc_contracts row with renewed_from_id set.
//   2) BEFORE INSERT trigger (migration 0021) populates
//      first_payment_due_at from signed_at + grace days.
//   3) Returns the new id; we open it via openAmc.
//
// The previous contract is left untouched — chain navigation is
// rendered on both sides via renewedFromId (forward) and a reverse
// lookup (backward) in AmcDetail.
//
// Permission: gated by amc_write RLS (md/admin/manager). UI hides
// the launch button for other roles; this component renders the
// form unconditionally and lets the DB enforce the final gate.
// ============================================================

import { useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { renewAmc } from "@/lib/create";
import type { AmcContract } from "@/lib/types";

export function RenewAmcModal({ previous, open, onClose, onRenewed }: {
  previous: AmcContract;
  open: boolean;
  onClose: () => void;
  onRenewed: (newAmcId: string) => void;
}) {
  const { fireToast, bumpData, currentOrg } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  // Default expiry = today + 1 year, mirroring the typical 12-month
  // AMC contract length. User can override.
  const oneYearFromToday = (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const [f, setF] = useState({
    code:         "",
    value_aed:    String(previous.value || ""),
    signed_at:    today,
    expires_at:   oneYearFromToday,
    lead_tech_id: previous.leadTechId || "",
    manager_id:   previous.manager || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lead techs + managers — same role buckets the create form uses.
  const leadTechs = Object.values(db.USERS).filter(u => u.role === "lead_worker");
  const managers  = Object.values(db.USERS).filter(u => u.role === "manager");

  const cust = db.cust(previous.customer);
  const site = previous.site ? db.site(previous.site) : null;
  const isPausedWarning = previous.contract_status === "suspended";
  const sym = currentOrg?.currency_symbol ?? "AED";

  const close = () => { if (!busy) { setErr(null); onClose(); } };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const v = Number(f.value_aed);
    if (!Number.isFinite(v) || v <= 0) { setErr("Contract value must be greater than zero."); return; }
    if (!f.expires_at) { setErr("Expiry date is required."); return; }
    if (!f.signed_at)  { setErr("Signed date is required."); return; }
    setBusy(true);
    const res = await renewAmc(previous.id, {
      code:         f.code.trim() || undefined,
      value_aed:    v,
      expires_at:   f.expires_at,
      signed_at:    f.signed_at,
      lead_tech_id: f.lead_tech_id || null,
      manager_id:   f.manager_id || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`Renewal created — ${previous.code} → new contract`);
    bumpData();
    onRenewed(res.id);
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true"
      onClick={close}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.42)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, zIndex: 1000,
      }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{
          background: "var(--bg-elev)", borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: 520,
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
          maxHeight: "90vh", overflowY: "auto",
        }}>
        <div>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <Icon name="refresh" size={16} style={{ color: "var(--pri-700)" }} />
            <div style={{ font: "var(--t-h3)" }}>Renew {previous.code}</div>
          </div>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
            Creates a new contract for <strong>{cust?.name ?? "Unknown customer"}</strong>
            {site ? <> · {site.name}</> : null}, linked back to {previous.code}.
          </div>
        </div>

        {isPausedWarning && (
          <div style={{
            padding: "8px 10px", background: "var(--warn-100)",
            color: "var(--warn-700)", borderRadius: "var(--r-sm)",
            font: "var(--t-small)", display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <Icon name="alertTriangle" size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              {previous.code} is currently <strong>Paused</strong>. The renewal will
              be created as a fresh contract — the paused one stays as-is until
              you resolve its payment.
            </span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              New code
            </label>
            <input className="input" value={f.code}
              onChange={e => setF({ ...f, code: e.target.value })}
              placeholder="Auto-generated if blank" style={{ marginTop: 6 }} />
          </div>
          <div>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Annual value ({sym})
            </label>
            <input className="input numeric" type="number" min={0} required
              value={f.value_aed}
              onChange={e => setF({ ...f, value_aed: e.target.value })}
              style={{ marginTop: 6 }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Signed date
            </label>
            <input className="input" type="date" required value={f.signed_at}
              onChange={e => setF({ ...f, signed_at: e.target.value })}
              style={{ marginTop: 6 }} />
          </div>
          <div>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Expires
            </label>
            <input className="input" type="date" required value={f.expires_at}
              onChange={e => setF({ ...f, expires_at: e.target.value })}
              style={{ marginTop: 6 }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Lead Technician
            </label>
            <select className="input" value={f.lead_tech_id}
              onChange={e => setF({ ...f, lead_tech_id: e.target.value })}
              style={{ marginTop: 6 }}>
              <option value="">— Inherit from previous —</option>
              {leadTechs.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)",
                            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Manager
            </label>
            <select className="input" value={f.manager_id}
              onChange={e => setF({ ...f, manager_id: e.target.value })}
              style={{ marginTop: 6 }}>
              <option value="">— Inherit from previous —</option>
              {managers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{
          padding: "8px 10px", background: "var(--bg-muted)",
          borderRadius: "var(--r-sm)", font: "var(--t-small)",
          color: "var(--ink-mute)",
        }}>
          The new contract starts as <strong>Draft</strong> with a fresh
          30-day payment window from the Signed date. Auto-pause and the 4
          quarterly PPM visits kick in the same way as any new AMC.
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
          <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy
              ? <><Icon name="loader" size={13} style={{ animation: "spin 1s linear infinite" }} /> Creating…</>
              : <><Icon name="refresh" size={13} /> Create renewal</>}
          </button>
        </div>
      </form>
    </div>
  );
}
