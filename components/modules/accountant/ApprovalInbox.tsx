"use client";
// ============================================================
// Accountant · Approval Inbox (Phase 2, Slice 2B.7).
//
// A reusable "Awaiting your approval" section shown at the top of the
// Invoices and Purchase Orders tabs. The PARENT decides visibility (only
// renders this for APPROVE_* users); the component itself hides when the
// list is empty, so an approver with nothing pending sees nothing.
//
// Generic by design — it takes already-resolved items (code / party /
// amount / waitingSince) so it has no data-layer or db dependency and can
// back any approval queue.
//
// Fully responsive: the header and each row are flex + wrap, so at 360px
// the amount/age block stacks under the code/party block with no
// horizontal scroll. The whole header and each item are real <button>s
// (≥44px touch targets, keyboard-focusable, no hover-only affordance).
//
// Collapse state is remembered per browser session (sessionStorage).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";

export interface ApprovalInboxItem {
  id: string;
  code: string;        // invoice / PO number
  party: string;       // customer or vendor name
  amount: number;
  // ISO timestamp used as the "submitted" proxy. Invoices/POs have no
  // dedicated submitted_at column; for a pending item updated_at == the
  // submit time (nothing else mutates it while pending) — see report.
  waitingSince: string;
}

const MAX_SHOWN = 5;

function daysAgoLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function ApprovalInbox({ title = "Awaiting your approval", items, onOpen, storageKey }: {
  title?: string;
  items: ApprovalInboxItem[];
  onOpen: (id: string) => void;
  storageKey: string;
}) {
  const { fmtMoney } = useApp();
  const [open, setOpen] = useState(true);

  // Restore collapse preference (per session) after mount to avoid any
  // SSR/hydration mismatch.
  useEffect(() => {
    try { if (sessionStorage.getItem(storageKey) === "collapsed") setOpen(false); } catch { /* ignore */ }
  }, [storageKey]);

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try { sessionStorage.setItem(storageKey, next ? "expanded" : "collapsed"); } catch { /* ignore */ }
      return next;
    });
  };

  // Most recently submitted first; show up to MAX_SHOWN.
  const shown = useMemo(
    () => [...items].sort((a, b) => (a.waitingSince < b.waitingSince ? 1 : -1)).slice(0, MAX_SHOWN),
    [items],
  );

  if (items.length === 0) return null;

  return (
    <section className="card card-pad" style={{ marginBottom: 16, borderColor: "var(--warn-100)" }}>
      {/* Header — whole bar is a button for accessibility + touch target */}
      <button onClick={toggle} aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: 44,
          background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
        }}>
        <Icon name="inbox" size={18} />
        <span style={{ font: "var(--t-h3)" }}>{title}</span>
        <span className="badge badge-warning" style={{ flexShrink: 0 }}>{items.length}</span>
        <Icon name={open ? "chevronUp" : "chevronDown"} size={16} style={{ marginLeft: "auto" }} />
      </button>

      {open && (
        <div className="col gap-2" style={{ marginTop: 12 }}>
          {shown.map(it => (
            <button key={it.id} onClick={() => onOpen(it.id)}
              style={{
                width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                gap: 12, flexWrap: "wrap", minHeight: 44, padding: "10px 12px", cursor: "pointer",
                border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--bg-muted)",
                textAlign: "left",
              }}>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{it.code}</span>
                <span style={{ font: "var(--t-small)", color: "var(--ink-mute)", overflowWrap: "anywhere" }}>{it.party}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: "auto", textAlign: "right" }}>
                <span className="numeric" style={{ font: "var(--t-body-md)", fontWeight: 600 }}>{fmtMoney(it.amount)}</span>
                <span style={{ font: "var(--t-small)", color: "var(--ink-quiet)" }}>waiting {daysAgoLabel(it.waitingSince)}</span>
              </div>
            </button>
          ))}
          {items.length > shown.length && (
            <div style={{ font: "var(--t-small)", color: "var(--ink-quiet)", paddingLeft: 2 }}>
              +{items.length - shown.length} more pending — use the “Pending” filter to see all.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
