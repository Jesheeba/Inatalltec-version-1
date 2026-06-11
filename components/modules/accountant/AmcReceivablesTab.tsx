"use client";
// ============================================================
// Accountant · AMC Receivables tab.
//
// This is the ORIGINAL Accountant AR view (Phase 10), moved verbatim
// out of Accountant.tsx into a tab so the hub can host additional
// accounting areas. Behaviour is unchanged: it reads the hydrated AMC
// mirror and surfaces every unpaid/paused contract with aging.
// ============================================================

import { useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { EmptyState, KPI } from "../../shared";
import type { AmcContract } from "@/lib/types";

interface Row {
  amc: AmcContract;
  customerName: string;
  daysSinceSigned: number;   // computed (negative = future-dated)
  isPaused: boolean;
}

export function AmcReceivablesTab() {
  const { fmtMoney, openAmc, dataVersion } = useApp();
  void dataVersion;
  const [hidePaused, setHidePaused] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const a of Object.values(db.AMCS)) {
      // Unpaid = pending_payment OR (suspended with reason 'Payment overdue').
      const unpaid = a.contract_status === "pending_payment"
                  || (a.contract_status === "suspended" && a.suspendedReason === "Payment overdue");
      if (!unpaid) continue;
      const cust = db.cust(a.customer);
      // signed_at proxy: firstPaymentDueAt - 30 days.
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

  const totalOutstanding = rows.reduce((s, r) => s + (r.amc.value || 0), 0);
  const pastThirtyDays = rows.filter(r => r.daysSinceSigned > 30).length;
  const pausedCount = rows.filter(r => r.isPaused).length;

  return (
    <>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
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
                    <td data-th="Contract" style={{ fontWeight: 600, font: "var(--t-small)" }}>{r.amc.code}</td>
                    <td data-th="Customer" style={{ font: "var(--t-small)" }}>{r.customerName}</td>
                    <td data-th="Value" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>
                      {fmtMoney(r.amc.value, { compact: true })}
                    </td>
                    <td data-th="Days since signed" className="numeric" style={{ textAlign: "right", font: "var(--t-small)",
                                                     color: r.daysSinceSigned > 30 ? "var(--dan-700)" : undefined,
                                                     fontWeight: r.daysSinceSigned > 30 ? 600 : 400 }}>
                      {r.daysSinceSigned >= 0 ? r.daysSinceSigned : "—"}
                    </td>
                    <td data-th="Status" style={{ font: "var(--t-small)" }}>
                      {r.isPaused
                        ? <span className="badge badge-outline">Paused</span>
                        : <span className="badge badge-outline">Pending payment</span>}
                    </td>
                    <td data-th="Action">
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
    </>
  );
}
