"use client";
// ============================================================
// AmcPauseAlert — red banner at the top of admin / md / manager /
// accounts dashboards.
//
// Surfaces two cohorts:
//   • AMCs currently 'suspended' (UI label: "Paused")
//   • AMCs about to auto-pause — first_payment_due_at is in the next
//     PAUSE_WARNING_DAYS days, still 'active', no payment recorded.
//
// Each row is a one-line summary linking through to the AMC detail
// page. The component renders nothing when there's no signal — drop
// it into any dashboard without worrying about empty visual noise.
//
// Role-gated: only admin / md / manager / accounts see it. Other
// roles get nothing even if they somehow land on a dashboard that
// mounts this widget. (Defence in depth — Dashboard.tsx also only
// mounts it for those roles.)
// ============================================================

import { useMemo } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import type { AmcContract, Role } from "@/lib/types";
import { calculateDaysUntilPause } from "@/lib/create";

const PAUSE_WARNING_DAYS = 10;
const ALERT_ROLES: ReadonlySet<Role> = new Set<Role>([
  "admin", "md", "manager", "accounts",
]);

interface AlertRow {
  amc: AmcContract;
  kind: "paused" | "warning";
  days: number; // for paused: days since suspended_at (proxy via resumed/created), for warning: days until pause
}

export function AmcPauseAlert() {
  const { role, openAmc, dataVersion } = useApp();
  void dataVersion;

  const rows = useMemo<AlertRow[]>(() => {
    if (!ALERT_ROLES.has(role)) return [];
    const out: AlertRow[] = [];
    for (const amc of Object.values(db.AMCS)) {
      if (amc.contract_status === "suspended") {
        // "Paused N days ago" — use the most recent signal we have.
        // suspended_at isn't on the AmcContract shape, so we lean on
        // resumedAt's absence + the conservative "X days" estimate via
        // firstPaymentDueAt as a fallback. Worst case the banner just
        // says "Paused" without the day count.
        const days = paused_age_days(amc);
        out.push({ amc, kind: "paused", days });
      } else if (amc.contract_status === "active") {
        const d = calculateDaysUntilPause(amc);
        if (d !== null && d >= 0 && d <= PAUSE_WARNING_DAYS) {
          out.push({ amc, kind: "warning", days: d });
        }
      }
    }
    // Most urgent first: currently paused, then closest-to-pausing.
    out.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "paused" ? -1 : 1;
      if (a.kind === "warning") return a.days - b.days;       // smallest days-left first
      return b.days - a.days;                                 // longest-paused first
    });
    return out;
  }, [role, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) return null;

  const pausedCount  = rows.filter(r => r.kind === "paused").length;
  const warnCount    = rows.filter(r => r.kind === "warning").length;
  const headline = [
    pausedCount > 0 ? `${pausedCount} paused` : null,
    warnCount   > 0 ? `${warnCount} about to pause`  : null,
  ].filter(Boolean).join(" · ");

  return (
    <section style={{
      marginBottom: 20,
      background: "var(--dan-50)",
      border: "1px solid var(--dan-100)",
      borderRadius: "var(--r-md)",
      padding: 14,
    }}>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
        <Icon name="alertTriangle" size={16} style={{ color: "var(--dan-700)" }} />
        <span style={{ font: "var(--t-body-md)", fontWeight: 600, color: "var(--dan-700)" }}>
          AMC payment alerts · {headline}
        </span>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {rows.slice(0, 6).map(r => (
          <AlertRowItem key={r.amc.id} row={r} onClick={() => openAmc(r.amc.id)} />
        ))}
        {rows.length > 6 && (
          <div style={{ font: "var(--t-micro)", color: "var(--dan-700)", padding: "4px 10px" }}>
            +{rows.length - 6} more
          </div>
        )}
      </div>
    </section>
  );
}

function AlertRowItem({ row, onClick }: { row: AlertRow; onClick: () => void }) {
  const cust = db.cust(row.amc.customer);
  const subject = `${row.amc.code} · ${cust?.name ?? "Unknown customer"}`;
  const detail = row.kind === "paused"
    ? (row.days > 0 ? `Paused ${row.days} day${row.days === 1 ? "" : "s"} ago` : "Paused")
    : (row.days === 0
        ? "Pauses today — payment overdue"
        : `Pauses in ${row.days} day${row.days === 1 ? "" : "s"} — payment overdue`);
  return (
    <button onClick={onClick}
      style={{
        all: "unset", cursor: "pointer",
        display: "flex", gap: 10, alignItems: "center",
        padding: "8px 10px", borderRadius: "var(--r-sm)",
        background: "rgba(255,255,255,0.7)", minHeight: 44,
      }}>
      <Icon name={row.kind === "paused" ? "pause" : "clock"} size={14}
        style={{ color: "var(--dan-700)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ font: "var(--t-small)", fontWeight: 600, color: "var(--ink)" }}>
          {subject}
        </div>
        <div className="truncate" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>
          {detail}
        </div>
      </div>
      <Icon name="chevronRight" size={12} style={{ color: "var(--ink-quiet)", flexShrink: 0 }} />
    </button>
  );
}

// Estimate how long a paused AMC has been paused. The DB carries
// suspended_at but the frontend AmcContract shape doesn't surface it
// (it's been DB-only since 0009b). For the banner we fall back to
// "Paused" without a duration when we can't tell — the click-through
// to the detail page shows the precise reason + timestamps anyway.
function paused_age_days(amc: AmcContract): number {
  // If this AMC has a firstPaymentDueAt that's already in the past
  // AND no payment, paused_age is roughly (today - due). Otherwise
  // return 0 so the UI renders "Paused" without a misleading number.
  if (!amc.firstPaymentDueAt) return 0;
  const due = new Date(amc.firstPaymentDueAt).getTime();
  if (Number.isNaN(due)) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - due;
  return diff > 0 ? Math.floor(diff / 86_400_000) : 0;
}
