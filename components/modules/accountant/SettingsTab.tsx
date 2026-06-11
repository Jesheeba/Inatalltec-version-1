"use client";
// ============================================================
// Accountant · Settings tab (Phase 0, migration 0045).
//
// Edits the configurable accounting rules so later modules read config
// instead of hardcoding: tax rate/label, document prefixes, default
// invoice terms, AR/AP aging buckets, and the payment-methods list.
//
// Self-contained: loads + saves via lib/accounting/settings.ts (client
// session, RLS-gated). Read-only when the viewer lacks edit rights.
// ============================================================

import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { CardHead, EmptyState } from "../../shared";
import {
  fetchAccountingSettings, updateAccountingSettings,
  fetchPaymentMethods, createLookup, updateLookup,
  type AccountingSettings, type AccountingLookup, type AccountingSettingsPatch,
  LOOKUP_PAYMENT_METHOD,
} from "@/lib/accounting/settings";

type Form = {
  defaultTaxRatePct: string;
  taxLabel: string;
  invoicePrefix: string;
  poPrefix: string;
  invoiceDueDays: string;
  agingBucket1Days: string;
  agingBucket2Days: string;
  agingBucket3Days: string;
  poApprovalThreshold1: string;
  poApprovalThreshold2: string;
  poApprovalThreshold3: string;
};

function toForm(s: AccountingSettings): Form {
  return {
    defaultTaxRatePct: String(s.defaultTaxRatePct),
    taxLabel: s.taxLabel,
    invoicePrefix: s.invoicePrefix,
    poPrefix: s.poPrefix,
    invoiceDueDays: String(s.invoiceDueDays),
    agingBucket1Days: String(s.agingBucket1Days),
    agingBucket2Days: String(s.agingBucket2Days),
    agingBucket3Days: String(s.agingBucket3Days),
    poApprovalThreshold1: String(s.poApprovalThreshold1),
    poApprovalThreshold2: String(s.poApprovalThreshold2),
    poApprovalThreshold3: String(s.poApprovalThreshold3),
  };
}

const numOr = (v: string, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};

export function SettingsTab({ canEdit }: { canEdit: boolean }) {
  const { fireToast } = useApp();
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [methods, setMethods] = useState<AccountingLookup[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newMethod, setNewMethod] = useState("");

  const load = async () => {
    setLoading(true); setErr(null);
    const [s, m] = await Promise.all([fetchAccountingSettings(), fetchPaymentMethods()]);
    if (!s.ok) { setErr(s.error); setLoading(false); return; }
    setSettings(s.data); setForm(toForm(s.data));
    if (m.ok) setMethods(m.data);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setF = (k: keyof Form, v: string) => setForm(prev => (prev ? { ...prev, [k]: v } : prev));

  const dirty = !!(settings && form) && (
    numOr(form.defaultTaxRatePct, -1) !== settings.defaultTaxRatePct
    || form.taxLabel.trim() !== settings.taxLabel
    || form.invoicePrefix.trim() !== settings.invoicePrefix
    || form.poPrefix.trim() !== settings.poPrefix
    || numOr(form.invoiceDueDays, -1) !== settings.invoiceDueDays
    || numOr(form.agingBucket1Days, -1) !== settings.agingBucket1Days
    || numOr(form.agingBucket2Days, -1) !== settings.agingBucket2Days
    || numOr(form.agingBucket3Days, -1) !== settings.agingBucket3Days
    || numOr(form.poApprovalThreshold1, -1) !== settings.poApprovalThreshold1
    || numOr(form.poApprovalThreshold2, -1) !== settings.poApprovalThreshold2
    || numOr(form.poApprovalThreshold3, -1) !== settings.poApprovalThreshold3
  );

  const save = async () => {
    if (!form || !settings) return;
    setBusy(true); setErr(null);
    const patch: AccountingSettingsPatch = {
      defaultTaxRatePct: numOr(form.defaultTaxRatePct, settings.defaultTaxRatePct),
      taxLabel: form.taxLabel,
      invoicePrefix: form.invoicePrefix,
      poPrefix: form.poPrefix,
      invoiceDueDays: numOr(form.invoiceDueDays, settings.invoiceDueDays),
      agingBucket1Days: numOr(form.agingBucket1Days, settings.agingBucket1Days),
      agingBucket2Days: numOr(form.agingBucket2Days, settings.agingBucket2Days),
      agingBucket3Days: numOr(form.agingBucket3Days, settings.agingBucket3Days),
      poApprovalThreshold1: numOr(form.poApprovalThreshold1, settings.poApprovalThreshold1),
      poApprovalThreshold2: numOr(form.poApprovalThreshold2, settings.poApprovalThreshold2),
      poApprovalThreshold3: numOr(form.poApprovalThreshold3, settings.poApprovalThreshold3),
    };
    const res = await updateAccountingSettings(patch);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setSettings(res.data); setForm(toForm(res.data));
    fireToast("Accounting settings saved");
  };

  const addMethod = async () => {
    const label = newMethod.trim();
    if (!label) return;
    setBusy(true); setErr(null);
    const res = await createLookup(LOOKUP_PAYMENT_METHOD, label, { sortOrder: methods.length + 1 });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMethods(prev => [...prev, res.data]);
    setNewMethod("");
    fireToast(`Payment method "${label}" added`);
  };

  const toggleMethod = async (m: AccountingLookup) => {
    setBusy(true); setErr(null);
    const res = await updateLookup(m.id, { isActive: !m.isActive });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMethods(prev => prev.map(x => (x.id === m.id ? res.data : x)));
  };

  if (loading) {
    return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading settings…</div>;
  }
  if (err && !settings) {
    return <EmptyState icon="alertCircle" title="Couldn't load settings"
      sub={err + " — has migration 0045 been applied?"} />;
  }
  if (!form) return null;

  const fieldStyle = { gap: 4 } as const;
  const labelStyle = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;
  const hintStyle = { font: "var(--t-micro)", color: "var(--ink-quiet)" } as const;

  return (
    <>
      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}
      {!canEdit && (
        <div className="alert-banner tone-info" style={{ marginBottom: 16 }}>
          <div className="ic"><Icon name="eye" size={16} /></div>
          <div className="text"><div className="h">View only</div>
            <div className="d">Only the Accountant / Admin / MD can change these settings.</div></div>
        </div>
      )}

      {/* Tax & terms */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Tax & invoice terms" sub="Defaults applied to new invoices — every value is editable" />
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Default tax rate (%)</label>
            <input className="input numeric" type="number" min={0} step="any" disabled={!canEdit}
              value={form.defaultTaxRatePct} onChange={e => setF("defaultTaxRatePct", e.target.value)} />
            <div style={hintStyle}>UAE VAT is 5%.</div>
          </div>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Tax label</label>
            <input className="input" disabled={!canEdit}
              value={form.taxLabel} onChange={e => setF("taxLabel", e.target.value)} />
          </div>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Invoice payment terms (days)</label>
            <input className="input numeric" type="number" min={0} disabled={!canEdit}
              value={form.invoiceDueDays} onChange={e => setF("invoiceDueDays", e.target.value)} />
            <div style={hintStyle}>Due date = invoice date + this many days.</div>
          </div>
        </div>
      </section>

      {/* Document numbering */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Document numbering" sub="Prefixes for generated document numbers" />
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Invoice prefix</label>
            <input className="input" disabled={!canEdit}
              value={form.invoicePrefix} onChange={e => setF("invoicePrefix", e.target.value)} />
            <div style={hintStyle}>e.g. {form.invoicePrefix || "INV"}-2026-0001</div>
          </div>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Purchase-order prefix</label>
            <input className="input" disabled={!canEdit}
              value={form.poPrefix} onChange={e => setF("poPrefix", e.target.value)} />
            <div style={hintStyle}>e.g. {form.poPrefix || "PO"}-2026-0001</div>
          </div>
        </div>
      </section>

      {/* Aging buckets */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="Aging buckets" sub="Upper bounds (days) for AR / AP aging — 4th bucket is everything beyond bucket 3" />
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Bucket 1 ≤ (days)</label>
            <input className="input numeric" type="number" min={1} disabled={!canEdit}
              value={form.agingBucket1Days} onChange={e => setF("agingBucket1Days", e.target.value)} />
          </div>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Bucket 2 ≤ (days)</label>
            <input className="input numeric" type="number" min={1} disabled={!canEdit}
              value={form.agingBucket2Days} onChange={e => setF("agingBucket2Days", e.target.value)} />
          </div>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Bucket 3 ≤ (days)</label>
            <input className="input numeric" type="number" min={1} disabled={!canEdit}
              value={form.agingBucket3Days} onChange={e => setF("agingBucket3Days", e.target.value)} />
          </div>
        </div>
      </section>

      {/* PO approval thresholds */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title="PO approval thresholds (AED)"
          sub="Order total decides how many approvers a purchase order needs — assumed defaults, confirm with the client" />
        <div className="alert-banner tone-warning" style={{ marginBottom: 12 }}>
          <div className="ic"><Icon name="alertTriangle" size={16} /></div>
          <div className="text"><div className="h">Assumption</div>
            <div className="d">Tiers follow the spec defaults (10k / 50k / 200k). Multi-signatory enforcement is planned for a later slice — for now a single approval advances a PO.</div></div>
        </div>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Tier 1 ≤ (solo)</label>
            <input className="input numeric" type="number" min={0} disabled={!canEdit}
              value={form.poApprovalThreshold1} onChange={e => setF("poApprovalThreshold1", e.target.value)} />
            <div style={hintStyle}>Operations Manager alone.</div>
          </div>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Tier 2 ≤ (+ Accountant)</label>
            <input className="input numeric" type="number" min={0} disabled={!canEdit}
              value={form.poApprovalThreshold2} onChange={e => setF("poApprovalThreshold2", e.target.value)} />
            <div style={hintStyle}>OM + Accountant.</div>
          </div>
          <div className="col" style={fieldStyle}>
            <label style={labelStyle}>Tier 3 ≤ (+ MD)</label>
            <input className="input numeric" type="number" min={0} disabled={!canEdit}
              value={form.poApprovalThreshold3} onChange={e => setF("poApprovalThreshold3", e.target.value)} />
            <div style={hintStyle}>OM + Accountant + MD; above this adds Founder.</div>
          </div>
        </div>
      </section>

      {canEdit && (
        <div className="row gap-2" style={{ marginBottom: 20, flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>
            <Icon name="check" size={14} /> Save settings
          </button>
          {dirty && (
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => settings && setForm(toForm(settings))}>Discard changes</button>
          )}
        </div>
      )}

      {/* Payment methods */}
      <section className="card card-pad">
        <CardHead title={`Payment methods · ${methods.length}`} sub="Used when recording payments across the accounting modules" />
        {methods.length === 0 ? (
          <EmptyState icon="banknote" title="No payment methods" />
        ) : (
          <div className="col gap-2">
            {methods.map(m => (
              <div key={m.id} className="row between" style={{ alignItems: "center", padding: "8px 10px",
                border: "1px solid var(--border)", borderRadius: "var(--r-md)", gap: 10, flexWrap: "wrap" }}>
                <div className="row gap-2" style={{ alignItems: "center", minWidth: 0 }}>
                  <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{m.label}</span>
                  <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{m.code}</span>
                  {!m.isActive && <span className="badge badge-outline">Inactive</span>}
                </div>
                {canEdit && (
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => toggleMethod(m)}>
                    {m.isActive ? "Deactivate" : "Activate"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="row gap-2" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="New payment method (e.g. Online Gateway)"
              value={newMethod} onChange={e => setNewMethod(e.target.value)} />
            <button className="btn btn-ghost" disabled={busy || !newMethod.trim()} onClick={addMethod}>
              <Icon name="plus" size={14} /> Add
            </button>
          </div>
        )}
      </section>
    </>
  );
}
