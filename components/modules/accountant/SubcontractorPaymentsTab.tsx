"use client";
// ============================================================
// Accountant · Subcontractor Payments tab (Phase 3, migration 0051).
//
// Master/detail over a LIVE-computed ledger (no stored balance):
//   • List: per-sub outstanding (hours × rate − payments)
//   • Detail: hours logged, payments made, current balance, an inline
//     rate editor, record-payment + reverse-payment, and the append-only
//     audit history (visible to admin/md/accounts only — RLS returns [] to
//     a manager).
//
// Edit rights: MANAGE_SUBCONTRACTOR_PAYMENTS. Read for everyone with
// VIEW_ACCOUNTING (Manager is read-only).
//
// Fully responsive: shared .table collapses to cards ≤720px, auto-fit
// grids, modal is a bottom sheet ≤720px.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { CardHead, EmptyState, KPI } from "../../shared";
import {
  fetchSubContractorLedgers, fetchSubContractorDetail, updateSubContractorRate,
  reverseSubContractorPayment,
  type SubContractorLedger, type SubContractorDetail,
} from "@/lib/accounting/subcontractorPayments";
import { RecordSubPaymentDialog } from "./subPaymentBits";

export function SubcontractorPaymentsTab({ canManage }: { canManage: boolean }) {
  const { fmtMoney } = useApp();
  const [ledgers, setLedgers] = useState<SubContractorLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [owingOnly, setOwingOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const res = await fetchSubContractorLedgers();
    setLoading(false);
    if (!res.ok) { setErr(res.error); return; }
    setLedgers(res.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const totalOwed = useMemo(() => ledgers.reduce((sum, l) => sum + Math.max(0, l.outstanding), 0), [ledgers]);
  const subsOwed = useMemo(() => ledgers.filter(l => l.outstanding > 0.005).length, [ledgers]);
  const unrated = useMemo(() => ledgers.filter(l => l.hourlyRate == null && l.hoursTotal > 0).length, [ledgers]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return ledgers.filter(l => {
      if (owingOnly && !(l.outstanding > 0.005)) return false;
      if (t && !(`${l.name} ${l.company ?? ""}`.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [ledgers, search, owingOnly]);

  if (selectedId) {
    return (
      <SubDetailView id={selectedId} canManage={canManage}
        onBack={() => setSelectedId(null)} onChanged={() => { void load(); }} />
    );
  }

  return (
    <>
      {/* KPIs */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Total owed" value={fmtMoney(totalOwed, { compact: true })}
          sub={`${subsOwed} subcontractor${subsOwed === 1 ? "" : "s"}`} />
        <KPI label="Subcontractors owed" value={subsOwed} sub="With an open balance" />
        <KPI label="Missing a rate" value={unrated} sub="Have hours but no rate set" />
      </div>

      {/* Controls */}
      <div className="row gap-2" style={{ marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div className="row" style={{ alignItems: "center", gap: 6, flex: 1, minWidth: 200,
          border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0 10px" }}>
          <Icon name="search" size={14} />
          <input className="input" style={{ border: "none", padding: "8px 0", flex: 1, background: "transparent" }}
            placeholder="Search name or company" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={"btn btn-sm " + (owingOnly ? "btn-primary" : "btn-ghost")} onClick={() => setOwingOnly(o => !o)}>
          <Icon name="filter" size={13} /> Owing only
        </button>
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading subcontractors…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="users" title={ledgers.length === 0 ? "No subcontractors yet" : "Nothing in this view"}
          sub={ledgers.length === 0 ? "Subcontractors are added from the Team / work-order flow." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Subcontractor</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Rate</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Hours</th>
                <th style={{ textAlign: "right" }}>Earned</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Outstanding</th>
              </tr></thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(l.id)}>
                    <td data-th="Subcontractor" style={{ font: "var(--t-small)" }}>
                      <div style={{ fontWeight: 600 }}>{l.name}{!l.isActive && <span className="badge badge-outline" style={{ marginLeft: 6 }}>Inactive</span>}</div>
                      {l.company && <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{l.company}</div>}
                    </td>
                    <td data-th="Rate" className="numeric hide-mobile" style={{ textAlign: "right", font: "var(--t-small)" }}>
                      {l.hourlyRate == null ? <span style={{ color: "var(--warn-600)" }}>Not set</span> : fmtMoney(l.hourlyRate)}
                    </td>
                    <td data-th="Hours" className="numeric hide-mobile" style={{ textAlign: "right", font: "var(--t-small)" }}>{l.hoursTotal}</td>
                    <td data-th="Earned" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.earned)}</td>
                    <td data-th="Paid" className="numeric hide-mobile" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(l.paid)}</td>
                    <td data-th="Outstanding" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600,
                      color: l.outstanding > 0.005 ? "var(--dan-700)" : l.outstanding < -0.005 ? "var(--suc-700)" : undefined }}>
                      {fmtMoney(l.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Detail ─────────────────────────────────────────────── */
function SubDetailView({ id, canManage, onBack, onChanged }: {
  id: string; canManage: boolean; onBack: () => void; onChanged: () => void;
}) {
  const { fmtMoney } = useApp();
  const [detail, setDetail] = useState<SubContractorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    const d = await fetchSubContractorDetail(id);
    setLoading(false);
    if (!d.ok) { setErr(d.error); return; }
    setDetail(d.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr(null); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Something went wrong"); return false; }
    await load(); onChanged();
    return true;
  };

  if (loading) return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading subcontractor…</div>;
  if (!detail) return <EmptyState icon="alertCircle" title="Couldn't load subcontractor" sub={err ?? undefined} />;

  const { ledger, hoursEntries, payments, history } = detail;

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
        <Icon name="chevronLeft" size={14} /> All subcontractors
      </button>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {/* Header */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ font: "var(--t-h3)", fontWeight: 700 }}>{ledger.name}</span>
              {!ledger.isActive && <span className="badge badge-outline">Inactive</span>}
            </div>
            {ledger.company && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>{ledger.company}</div>}
            <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>
              {ledger.hoursTotal} hour{ledger.hoursTotal === 1 ? "" : "s"} logged
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Outstanding</div>
            <div className="numeric" style={{ font: "var(--t-h3)", fontWeight: 700,
              color: ledger.outstanding > 0.005 ? "var(--dan-700)" : ledger.outstanding < -0.005 ? "var(--suc-700)" : undefined }}>
              {fmtMoney(ledger.outstanding)}
            </div>
            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
              earned {fmtMoney(ledger.earned)} · paid {fmtMoney(ledger.paid)}
            </div>
          </div>
        </div>

        {/* Rate editor */}
        <div style={{ marginTop: 16 }}>
          <RateEditor ledger={ledger} canManage={canManage}
            onSave={(rate) => run(() => updateSubContractorRate(ledger.id, rate))} busy={busy} />
        </div>

        {/* Actions */}
        {canManage && (
          <div className="row gap-2" style={{ marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => setShowPay(true)}>
              <Icon name="banknote" size={14} /> Record payment
            </button>
          </div>
        )}
      </section>

      {/* Logged hours */}
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHead title={`Logged hours · ${hoursEntries.length}`} sub="From work-order time tracking" />
        {hoursEntries.length === 0 ? (
          <EmptyState icon="clock" title="No hours logged" />
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr>
                  <th>Date</th><th>Work order</th>
                  <th className="hide-mobile">Notes</th>
                  <th style={{ textAlign: "right" }}>Hours</th>
                </tr></thead>
                <tbody>
                  {hoursEntries.map(h => {
                    const wo = db.wo(h.workOrderId);
                    return (
                      <tr key={h.id}>
                        <td data-th="Date" style={{ font: "var(--t-small)" }}>{h.entryDate}</td>
                        <td data-th="Work order" style={{ font: "var(--t-small)" }}>{wo?.code ?? "—"}</td>
                        <td data-th="Notes" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{h.notes ?? "—"}</td>
                        <td data-th="Hours" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{h.hours}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Payments */}
      {payments.length > 0 && (
        <section className="card card-pad" style={{ marginBottom: 16 }}>
          <CardHead title={`Payments · ${payments.length}`} sub="Payments made to this subcontractor" />
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr>
                  <th>Date</th><th>Method</th><th className="hide-mobile">Reference</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  {canManage && <th style={{ width: 96 }}></th>}
                </tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td data-th="Date" style={{ font: "var(--t-small)" }}>{p.paymentDate}</td>
                      <td data-th="Method" style={{ font: "var(--t-small)" }}>{p.method ?? "—"}</td>
                      <td data-th="Reference" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{p.reference ?? "—"}</td>
                      <td data-th="Amount" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(p.amount)}</td>
                      {canManage && (
                        <td data-th="">
                          <button className="btn btn-ghost btn-sm btn-danger" disabled={busy}
                            onClick={() => run(() => reverseSubContractorPayment(p.id))}>
                            <Icon name="x" size={12} /> Reverse
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Audit history (RLS returns [] for non-audit roles) */}
      {history.length > 0 && (
        <section className="card card-pad">
          <CardHead title="Audit history" sub="Immutable record of payments and reversals" />
          <div className="col gap-2" style={{ marginTop: 4 }}>
            {history.map(h => (
              <div key={h.id} className="row" style={{ alignItems: "center", gap: 10, padding: "8px 10px",
                border: "1px solid var(--border)", borderRadius: "var(--r-md)", flexWrap: "wrap" }}>
                <Icon name={h.action === "payment_reversed" ? "refresh" : "banknote"} size={13} />
                <span style={{ font: "var(--t-small)", fontWeight: 600 }}>{h.detail ?? h.action}</span>
                <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginLeft: "auto" }}>{h.changedAt.slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {showPay && (
        <RecordSubPaymentDialog sub={ledger} onClose={() => setShowPay(false)}
          onRecorded={() => { void load(); onChanged(); }} />
      )}
    </>
  );
}

/* ─── Inline rate editor ─────────────────────────────────── */
function RateEditor({ ledger, canManage, busy, onSave }: {
  ledger: SubContractorLedger; canManage: boolean; busy: boolean; onSave: (rate: number) => void;
}) {
  const { fmtMoney } = useApp();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(ledger.hourlyRate != null ? String(ledger.hourlyRate) : "");

  if (!editing) {
    return (
      <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Hourly rate:</span>
        <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>
          {ledger.hourlyRate == null ? <span style={{ color: "var(--warn-600)" }}>Not set</span> : fmtMoney(ledger.hourlyRate)}
        </span>
        {canManage && (
          <button className="btn btn-ghost btn-sm" disabled={busy}
            onClick={() => { setVal(ledger.hourlyRate != null ? String(ledger.hourlyRate) : ""); setEditing(true); }}>
            <Icon name="pen" size={12} /> {ledger.hourlyRate == null ? "Set rate" : "Edit"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Hourly rate:</span>
      <input className="input input-sm numeric" type="number" min={0} step="any" value={val}
        onChange={e => setVal(e.target.value)} style={{ maxWidth: 120 }} autoFocus />
      <button className="btn btn-primary btn-sm" disabled={busy || !(Number(val) >= 0)}
        onClick={() => { onSave(Number(val) || 0); setEditing(false); }}>
        <Icon name="check" size={12} /> Save
      </button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
    </div>
  );
}
