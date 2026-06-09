"use client";
// ============================================================
// Accountant module (Phase 10, minimal)
//
// Two surfaces:
//   • Outstanding balance KPI cards
//   • AR aging table — every AMC with payment_received_at IS NULL
//
// Permission: admin / md / manager / accounts. The Shell sidebar gate
// already filters; we re-check inside for defence-in-depth and
// graceful direct-URL behaviour.
//
// No new schema. Reads off the hydrated AMC mirror; payment status is
// inferred from contract_status (post-0027 'pending_payment' = unpaid,
// 'active' = paid, 'suspended' = paused). Days-since-signed is computed
// from amc.firstPaymentDueAt - payment_grace_days backwards-ish: we
// use firstPaymentDueAt minus 30 days as the signed_at proxy when the
// raw signed_at isn't on the type. Good enough for the demo; exact
// value lives in DB.
// ============================================================

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import {
  EmptyState, KPI, PageHeader,
} from "../shared";
import type { AmcContract } from "@/lib/types";

const ALLOWED = new Set<string>(["admin", "md", "manager", "accounts"]);

interface Row {
  amc: AmcContract;
  customerName: string;
  daysSinceSigned: number;   // computed (negative = future-dated)
  isPaused: boolean;
}

export function Accountant() {
  const { role, fmtMoney, openAmc, dataVersion } = useApp();
  void dataVersion;
  const [hidePaused, setHidePaused] = useState(false);

  if (!ALLOWED.has(role)) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Finance" title="Accountant" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Accountant is available to MD / Admin / Operations Manager / Accounts." />
      </div>
    );
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const a of Object.values(db.AMCS)) {
      // Unpaid = pending_payment OR (suspended with reason 'Payment overdue').
      const unpaid = a.contract_status === "pending_payment"
                  || (a.contract_status === "suspended" && a.suspendedReason === "Payment overdue");
      if (!unpaid) continue;
      const cust = db.cust(a.customer);
      // signed_at proxy: firstPaymentDueAt - 30 days. If we don't have
      // a due date either, skip the row (anomalous data).
      let daysSinceSigned = 0;
      if (a.firstPaymentDueAt) {
        const due = new Date(a.firstPaymentDueAt).getTime();
        const signedAt = due - 30 * 86_400_000;
        daysSinceSigned = Math.floor((Date.now() - signedAt) / 86_400_000);
      }
      out.push({
        amc: a,
        customerName: cust?.name ?? "Unknown customer",
        daysSinceSigned,
        isPaused: a.contract_status === "suspended",
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const filtered = useMemo(
    () => (hidePaused ? rows.filter(r => !r.isPaused) : rows)
      .sort((a, b) => b.daysSinceSigned - a.daysSinceSigned),
    [rows, hidePaused],
  );

  // KPIs read from `rows` (pre-filter) so hidePaused doesn't change the headline.
  const totalOutstanding = rows.reduce((s, r) => s + (r.amc.value || 0), 0);
  const pastThirtyDays = rows.filter(r => r.daysSinceSigned > 30).length;
  const pausedCount = rows.filter(r => r.isPaused).length;

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Finance" title="Accountant"
        sub="Outstanding AMC balances and aging" />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Total outstanding"
             value={fmtMoney(totalOutstanding, { compact: true })}
             sub={`${rows.length} unpaid contract${rows.length === 1 ? "" : "s"}`} />
        <KPI label="Past 30 days" value={pastThirtyDays}
             sub="Signed >30 days ago, no payment" />
        <KPI label="Paused" value={pausedCount}
             sub="Auto-suspended after overdue payment" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <input id="acc-hidepaused" type="checkbox" checked={hidePaused}
                 onChange={e => setHidePaused(e.target.checked)}
                 style={{ width: 18, height: 18 }} />
          <label htmlFor="acc-hidepaused" style={{ font: "var(--t-small)" }}>
            Hide paused contracts
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="check" title="Nothing outstanding"
          sub="Every signed AMC contract is paid up. Nice work." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Customer</th>
                  <th style={{ textAlign: "right" }}>Value</th>
                  <th style={{ textAlign: "right" }}>Days since signed</th>
                  <th>Status</th>
                  <th style={{ width: 100 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.amc.id}>
                    <td style={{ fontWeight: 600, font: "var(--t-small)" }}>{r.amc.code}</td>
                    <td style={{ font: "var(--t-small)" }}>{r.customerName}</td>
                    <td className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>
                      {fmtMoney(r.amc.value, { compact: true })}
                    </td>
                    <td className="numeric" style={{ textAlign: "right", font: "var(--t-small)",
                                                     color: r.daysSinceSigned > 30 ? "var(--dan-700)" : undefined,
                                                     fontWeight: r.daysSinceSigned > 30 ? 600 : 400 }}>
                      {r.daysSinceSigned >= 0 ? r.daysSinceSigned : "—"}
                    </td>
                    <td style={{ font: "var(--t-small)" }}>
                      {r.isPaused
                        ? <span className="badge badge-outline">Paused</span>
                        : <span className="badge badge-outline">Pending payment</span>}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openAmc(r.amc.id)}>
                        Record payment <Icon name="arrowRight" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
