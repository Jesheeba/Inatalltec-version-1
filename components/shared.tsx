"use client";
// ============================================================
// Installtec OS - Shared components used everywhere
// (Ported from prototype/components.jsx)
// ============================================================

import { Fragment, type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { db } from "@/lib/db";
import type { Approval, ApprovalStep, IconName, WorkOrder } from "@/lib/types";
import { useApp } from "@/lib/app-context";
import { supabaseBrowser } from "@/lib/supabase/client";

/* ─── Sign out ──────────────────────────────────────────── */
// Drops the Supabase session on the server (cookie cleared), then routes to /login.
// Matches the .btn-ghost styling already used elsewhere in the topbar/sidebar.
export function SignOutButton({ size = "sm", variant = "ghost", label = "Sign out" }: {
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "soft" | "primary";
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try { await supabaseBrowser().auth.signOut(); } catch { /* no-op */ }
    // POST to the server route so the server-side cookie is also cleared.
    try { await fetch("/api/auth/signout", { method: "POST" }); } catch { /* no-op */ }
    router.replace("/login");
    router.refresh();
  };
  const cls = `btn btn-${variant}${size === "sm" ? " btn-sm" : size === "lg" ? " btn-lg" : ""}`;
  return (
    <button className={cls} onClick={onClick} disabled={busy} title="Sign out">
      {busy
        ? <Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} />
        : <Icon name="arrowRight" size={14} />}
      <span className="hide-mobile">{busy ? "Signing out…" : label}</span>
    </button>
  );
}

/* ─── Row actions menu (portalised) ─────────────────────── */
// A "⋯" button that opens a small floating menu. The menu renders via a
// React portal to <body> so it isn't clipped by overflow:auto on any ancestor
// (a problem hit by table rows near the right/bottom edge). The menu
// positions itself relative to the trigger via getBoundingClientRect.
export interface RowMenuItem {
  label: string;
  icon?: IconName;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  hint?: string;
}
export function RowMenu({ items, disabled }: { items: RowMenuItem[]; disabled?: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuWidth = 200;
    // Pin top to the button's bottom edge; pin right to align with button's right edge.
    let left = r.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    setPos({ top: r.bottom + 6, left });
    setOpen(true);
  };

  // Reposition on scroll/resize while open.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuWidth = 200;
      let left = r.right - menuWidth;
      if (left < 8) left = 8;
      setPos({ top: r.bottom + 6, left });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const menu = open && pos && typeof document !== "undefined" ? createPortal(
    <>
      <div onClick={() => setOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
      <div role="menu"
        style={{
          position: "fixed", top: pos.top, left: pos.left, width: 200, zIndex: 1001,
          background: "var(--bg-elev)", borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)",
          padding: 6,
        }}>
        {items.map((it, i) => {
          const inert = it.disabled;
          return (
            <div key={i} role="menuitem"
              title={it.hint}
              onClick={() => { if (inert) return; setOpen(false); it.onClick(); }}
              style={{
                padding: "8px 10px", borderRadius: "var(--r-sm)",
                cursor: inert ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 10,
                color: inert ? "var(--ink-quiet)" : (it.destructive ? "var(--dan-700)" : "var(--ink)"),
                font: "var(--t-small)",
              }}
              onMouseEnter={e => { if (!inert) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"; }}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
              {it.icon && <Icon name={it.icon} size={14} />}
              <span>{it.label}</span>
            </div>
          );
        })}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button"
        className="btn btn-ghost btn-icon btn-sm"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Row actions" aria-haspopup="menu" aria-expanded={open}>
        <Icon name="ellipsis" size={14} />
      </button>
      {menu}
    </>
  );
}

/* ─── Choice pill (clickable badge → dropdown) ────────────
   Shared by every "click status → pick a new value" UI: project
   status / stage pills (Misc.tsx) and AMC contract_status (Amc.tsx).
   Generic over the value type so each caller can pass its own enum
   union. Renders the current option as a .badge with the caller-
   supplied `cls`; opens a portal-anchored menu below the trigger.
   44px tap targets for mobile; backdrop click dismisses.
============================================================ */
export interface ChoicePillProps<T extends string> {
  value: T;
  options: { value: T; label: string; cls?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}
export function ChoicePill<T extends string>({ value, options, onChange, ariaLabel, disabled }: ChoicePillProps<T>) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const cur = options.find(o => o.value === value);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.max(220, r.width);
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 6, left, width: w });
  };
  const openMenu = () => { place(); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const menu = open && pos && typeof document !== "undefined" ? createPortal(
    <>
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
      <div role="menu" style={{
        position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 1001,
        background: "var(--bg-elev)", borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)",
        padding: 6, maxHeight: 360, overflowY: "auto",
      }}>
        {options.map(o => {
          const active = o.value === value;
          return (
            <div key={o.value} role="menuitem"
              onClick={() => { setOpen(false); if (!active) onChange(o.value); }}
              style={{
                padding: "10px 12px", borderRadius: "var(--r-sm)", cursor: "pointer",
                font: "var(--t-small)", minHeight: 44,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: active ? "var(--bg-muted)" : "transparent",
                color: "var(--ink)",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = active ? "var(--bg-muted)" : "transparent"}>
              <span>{o.label}</span>
              {active && <Icon name="check" size={14} />}
            </div>
          );
        })}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled}
        className={"badge " + (cur?.cls ?? "badge-outline")}
        aria-label={`${ariaLabel}: ${cur?.label ?? value}. Click to change.`}
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        style={{
          cursor: disabled ? "not-allowed" : "pointer",
          border: 0, padding: "10px 14px", minHeight: 44,
          font: "var(--t-small)", fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
        {cur?.label ?? value}
        <Icon name="chevronDown" size={12} />
      </button>
      {menu}
    </>
  );
}

/* ─── Free-calls entitlement picker (migration 0037) ──────
   Three mutually-exclusive options — Limited / Unlimited / No —
   plus an optional "unset" state (no option selected). Clicking the
   active option again clears back to unset, which is how the create
   form and the detail editor both express "skip / not configured".
   When "Limited" is active a number input appears for the cap.
   Presentational only — the caller owns the value + persistence. */
export type FreeCallsModeValue = "limited" | "unlimited" | "none";
export function FreeCallsModePicker({
  mode, count, onModeChange, onCountChange, disabled,
}: {
  mode: FreeCallsModeValue | null;
  count: string;
  onModeChange: (m: FreeCallsModeValue | null) => void;
  onCountChange: (v: string) => void;
  disabled?: boolean;
}) {
  const opts: { value: FreeCallsModeValue; label: string }[] = [
    { value: "limited",   label: "Limited" },
    { value: "unlimited", label: "Unlimited" },
    { value: "none",      label: "No" },
  ];
  return (
    <div>
      <div className="row gap-2" style={{ flexWrap: "wrap" }} role="group" aria-label="Free calls included">
        {opts.map(o => {
          const active = mode === o.value;
          return (
            <button key={o.value} type="button" disabled={disabled}
              className={"btn btn-sm " + (active ? "btn-primary" : "btn-ghost")}
              aria-pressed={active}
              onClick={() => onModeChange(active ? null : o.value)}>
              {o.label}
            </button>
          );
        })}
      </div>
      {mode === "limited" && (
        <input className="input numeric" type="number" min={1} disabled={disabled}
          style={{ marginTop: 8, maxWidth: 200 }}
          value={count} onChange={e => onCountChange(e.target.value)}
          placeholder="e.g. 10" aria-label="Number of free calls included" />
      )}
    </div>
  );
}

/* ─── KPI ──────────────────────────────────────────── */
interface KPIProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "primary" | "violet" | "peach";
  trend?: "up" | "down";
  spark?: number[];
  icon?: IconName;
  children?: ReactNode;
}
export function KPI({ label, value, sub, accent, trend, spark, icon, children }: KPIProps) {
  const cls =
    "kpi" +
    (accent === "primary" ? " card-accent" : accent === "violet" ? " card-violet" : accent === "peach" ? " card-peach" : "");
  return (
    <div className={cls}>
      <div className="row between">
        <div className="kpi-label">{label}</div>
        {icon && <Icon name={icon} size={14} style={{ color: "var(--ink-quiet)" }} />}
      </div>
      <div className="kpi-value numeric">{value}</div>
      {sub && (
        <div className={"kpi-sub" + (trend === "up" ? " kpi-trend-up" : trend === "down" ? " kpi-trend-down" : "")}>
          {trend === "up" && "↑ "}{trend === "down" && "↓ "}{sub}
        </div>
      )}
      {spark && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28, marginTop: 8 }}>
          {spark.map((h, i) => (
            <span key={i} style={{
              flex: 1, borderRadius: 2,
              background: i === spark.length - 1
                ? "var(--pri-500)"
                : "color-mix(in srgb, var(--pri-500) 32%, transparent)",
              height: (h / Math.max(...spark) * 100) + "%",
            }} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

/* ─── WO Card ─────────────────────────────────────── */
export function WoCard({ wo, onClick, compact }: { wo: WorkOrder; onClick?: () => void; compact?: boolean }) {
  const customer = db.cust(wo.customer);
  const site = db.site(wo.site);
  const typeMap: Record<string, { label: string; cls: string }> = {
    AMC: { label: "AMC", cls: "badge-primary" },
    PROJECT: { label: "PROJECT", cls: "badge-info" },
    REPAIR: { label: "REPAIR", cls: "badge-warning" },
    DELIVERY: { label: "DELIVERY", cls: "badge-outline" },
    SURVEY: { label: "SURVEY", cls: "badge-violet" },
  };
  // 8-state wo_status enum from migration 0014. The pulsing dot stays on
  // 'in_progress' to keep the "Live" feel on the card.
  const stateMap: Record<string, { dot: string; text: string }> = {
    open:                 { dot: "dot",                  text: "Open" },
    assigned:             { dot: "dot-info",             text: "Assigned" },
    in_progress:          { dot: "dot-primary dot-pulse", text: "Live" },
    waiting_material:     { dot: "dot-warning",          text: "Waiting · material" },
    pending_confirmation: { dot: "dot-violet",           text: "Pending confirmation" },
    done:                 { dot: "dot-success",          text: "Done" },
    closed:               { dot: "dot-success",          text: "Closed" },
    cancelled:            { dot: "dot-danger",           text: "Cancelled" },
  };
  const t = typeMap[wo.type] || typeMap.PROJECT;
  const s = stateMap[wo.status] || { dot: "dot", text: wo.status };
  const isLive = wo.status === "in_progress";
  const startTime = wo.scheduledStart ? wo.scheduledStart.split("T")[1].slice(0, 5) : "";
  const endTime = wo.scheduledEnd ? wo.scheduledEnd.split("T")[1].slice(0, 5) : "";

  return (
    <div className="card card-hover" onClick={onClick} style={{
      padding: compact ? 14 : 16,
      borderLeft: isLive ? "3px solid var(--pri-500)" : "1px solid var(--border)",
      paddingLeft: isLive ? 13 : (compact ? 14 : 16),
    }}>
      <div className="row between">
        <div className="row gap-2">
          <span className={"badge " + t.cls} style={{ fontWeight: 600 }}>{t.label}</span>
          <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", fontFamily: "var(--font-mono)" }}>{wo.code}</span>
        </div>
        <span className="row gap-1" style={{ font: "var(--t-small)", color: isLive ? "var(--pri-700)" : "var(--ink-mute)" }}>
          <span className={"dot " + s.dot} />
          {s.text}
        </span>
      </div>
      <div style={{ font: "var(--t-h4)", color: "var(--ink)", marginTop: 8 }} className="truncate">{wo.title}</div>
      <div className="row gap-2" style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>
        <Icon name="mapPin" size={13} />
        <span className="truncate">{[customer?.name, site?.name].filter(Boolean).join(" · ") || "-"}</span>
      </div>
      {wo.flagged && (
        <div style={{
          marginTop: 10, padding: "7px 10px",
          background: "var(--dan-50)", color: "var(--dan-700)",
          borderRadius: "var(--r-sm)", font: "var(--t-small)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Icon name="alertTriangle" size={14} /> {wo.flagged}
        </div>
      )}
      <div className="row between" style={{ marginTop: 12 }}>
        <div className="row gap-2">
          <Icon name="clock" size={13} style={{ color: "var(--ink-quiet)" }} />
          <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{startTime} – {endTime}</span>
        </div>
        <div className="avatar-stack">
          {(wo.assigned || []).slice(0, 3).map(uid => {
            const u = db.user(uid);
            return <span key={uid} className={"avatar avatar-sm avatar-" + (u?.tint || "primary")}>{u?.initials ?? "?"}</span>;
          })}
          {wo.assigned && wo.assigned.length > 3 && (
            <span className="avatar avatar-sm" style={{ background: "var(--bg-muted)", color: "var(--ink-mute)" }}>+{wo.assigned.length - 3}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Feed Item ───────────────────────────────────── */
export function FeedItem({ item, onClick }: { item: import("@/lib/types").FeedItem; onClick?: () => void }) {
  const tagMap: Record<string, { bg: string; ink: string }> = {
    success: { bg: "var(--suc-100)", ink: "var(--suc-700)" },
    warning: { bg: "var(--warn-100)", ink: "var(--warn-700)" },
    danger: { bg: "var(--dan-100)", ink: "var(--dan-700)" },
    info: { bg: "var(--info-100)", ink: "var(--info-700)" },
    primary: { bg: "var(--pri-100)", ink: "var(--pri-700)" },
    neutral: { bg: "var(--bg-muted)", ink: "var(--ink-soft)" },
  };
  const tag = tagMap[item.tag] || tagMap.neutral;
  const iconMap: Record<string, IconName> = {
    "check-in": "mapPin", sla: "clock", material: "package",
    reactivation: "refresh", signoff: "signature", flag: "flag",
    approval: "inbox", ticket: "wrench", invoice: "receipt", leave: "calendar",
  };
  const who = item.who === "system" ? "System" : db.user(item.who).name;
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: "var(--r-md)",
      cursor: onClick ? "pointer" : "default",
      transition: "background .14s",
    }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = ""; }}>
      <div style={{
        width: 34, height: 34, borderRadius: 11,
        background: tag.bg, color: tag.ink,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon name={iconMap[item.kind] || "feed"} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--t-body)", color: "var(--ink)" }} className="truncate">
          <span style={{ fontWeight: 600 }}>{who}</span>{" "}{item.text}
        </div>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 2 }}>{item.t}</div>
      </div>
    </div>
  );
}

/* ─── Approval Card ───────────────────────────────── */
export function ApprovalCard({ ap, onClick, onApprove, onReject }:
  { ap: Approval | null | undefined; onClick?: () => void; onApprove?: () => void; onReject?: () => void }) {
  const { fmtMoney } = useApp();
  // Defensive: callers sometimes look ap up by a hardcoded id that no longer
  // exists in live data (e.g. mock-seed escalations). Bail out cleanly instead
  // of taking the whole route down.
  if (!ap) return null;
  const requester = ap.requester === "system"
    ? { name: "System", initials: "SY", tint: "primary" as const }
    : db.user(ap.requester);
  const kindCls =
    ap.kind === "AMC Reactivation" ? "badge-primary"
      : ap.kind === "Variation Order" ? "badge-violet"
        : ap.kind === "Material Request" ? "badge-info"
          : ap.kind === "Leave Request" ? "badge-peach"
            : "badge-outline";
  return (
    <div className="card" style={{
      padding: 16,
      borderLeft: ap.priority === "high" ? "3px solid var(--pri-500)" : "1px solid var(--border)",
      paddingLeft: ap.priority === "high" ? 13 : 16,
      cursor: onClick ? "pointer" : "default",
    }} onClick={onClick}>
      <div className="row between">
        <div className="row gap-2">
          <span className={"badge " + kindCls}>{ap.kind}</span>
          <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", fontFamily: "var(--font-mono)" }}>{ap.code}</span>
        </div>
        <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{ap.openedAt}</span>
      </div>
      <div style={{ font: "var(--t-body-md)", color: "var(--ink)", marginTop: 8 }}>{ap.context}</div>
      <div className="row gap-2" style={{ marginTop: 8 }}>
        <span className={"avatar avatar-sm avatar-" + (requester.tint || "primary")}>{requester.initials}</span>
        <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {requester.name}
          {ap.amount ? <span> · <span className="numeric" style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtMoney(ap.amount)}</span></span> : ""}
        </span>
      </div>
      {(onApprove || onReject) && (
        <div className="row gap-2" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onApprove?.(); }}>
            <Icon name="check" size={14} /> Approve
          </button>
          <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); onReject?.(); }}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Approval Chain Visualization ────────────────── */
export function ApprovalChain({ chain }: { chain: ApprovalStep[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {chain.map((step, i) => {
        const u = db.user(step.user);
        const isApproved = step.state === "approved";
        const isPending = step.state === "pending";
        const isQueued = step.state === "queued";
        return (
          <Fragment key={step.step}>
            <div style={{
              padding: "8px 12px",
              borderRadius: "var(--r-md)",
              background: isApproved ? "var(--suc-50)" : isPending ? "var(--pri-50)" : "var(--bg-muted)",
              border: "1px solid " + (isApproved ? "var(--suc-100)" : isPending ? "var(--pri-200)" : "var(--border)"),
              display: "flex", alignItems: "center", gap: 8,
              opacity: isQueued ? 0.6 : 1,
            }}>
              <span className={"avatar avatar-sm avatar-" + (u.tint || "primary")}>{u.initials}</span>
              <div>
                <div style={{ font: "var(--t-small)", color: "var(--ink)", fontWeight: 600 }}>{u.name}</div>
                <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "capitalize" }}>{step.role.replace("_", " ")}</div>
              </div>
              <div style={{ marginLeft: 4 }}>
                {isApproved && <Icon name="check" size={14} style={{ color: "var(--suc-600)" }} />}
                {isPending && <span className="dot dot-primary dot-pulse" />}
              </div>
            </div>
            {i < chain.length - 1 && <Icon name="chevronRight" size={14} style={{ color: "var(--ink-quiet)" }} />}
          </Fragment>
        );
      })}
    </div>
  );
}

/* ─── Slide-Over ──────────────────────────────────── */
export function SlideOver({ open, onClose, title, sub, children, foot }:
  { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="slideover-back" onClick={onClose} />
      <div className="slideover">
        <div className="slideover-head">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><Icon name="x" size={16} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "var(--t-h3)" }} className="truncate">{title}</div>
            {sub && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }} className="truncate">{sub}</div>}
          </div>
        </div>
        <div className="slideover-body">{children}</div>
        {foot && <div className="slideover-foot">{foot}</div>}
      </div>
    </>
  );
}

/* ─── Modal ───────────────────────────────────────── */
export function Modal({ open, onClose, children, lg }:
  { open: boolean; onClose: () => void; children: ReactNode; lg?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={"modal" + (lg ? " modal-lg" : "")} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ─── FilterBar ───────────────────────────────────── */
export function FilterBar<T extends string>({ value, onChange, options }:
  { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
      {options.map(opt => (
        <button key={opt.value} className="chip" data-on={String(value === opt.value)} onClick={() => onChange(opt.value)}>
          {opt.label}
          {opt.count != null && (
            <span style={{ color: value === opt.value ? "rgba(255,255,255,0.7)" : "var(--ink-quiet)" }}>· {opt.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─── StatusBadge ─────────────────────────────────── */
export function StatusBadge({ state }: { state: string }) {
  const map: Record<string, { cls: string; dot: string; label?: string }> = {
    "ACTIVE": { cls: "badge-success", dot: "dot-success", label: "Active" },
    "PENDING_REACTIVATION": { cls: "badge-primary", dot: "dot-primary", label: "Reactivation" },
    "BLOCKED": { cls: "badge-danger", dot: "dot-danger", label: "Blocked" },
    "RENEWAL_DUE": { cls: "badge-warning", dot: "dot-warning", label: "Renewal" },
    "On Track": { cls: "badge-success", dot: "dot-success" },
    "Awaiting VO Approval": { cls: "badge-warning", dot: "dot-warning" },
    "Delayed": { cls: "badge-danger", dot: "dot-danger" },
    "New": { cls: "badge-info", dot: "dot-info" },
    "Resolved": { cls: "badge-success", dot: "dot-success" },
    // project_status enum (migration 0008) - lowercase keys map to
    // human-friendly labels so cards keep rendering correctly after
    // the text-to-enum conversion.
    "planned": { cls: "badge-info", dot: "dot-info", label: "Planned" },
    "in_progress": { cls: "badge-primary", dot: "dot-primary", label: "In Progress" },
    "on_hold": { cls: "badge-warning", dot: "dot-warning", label: "On Hold" },
    "completed": { cls: "badge-success", dot: "dot-success", label: "Completed" },
    "cancelled": { cls: "badge-danger", dot: "dot-danger", label: "Cancelled" },
    // amc_status enum (migration 0009) - lowercase keys.
    // 'cancelled' is shared with project_status above (both terminal states).
    "draft":            { cls: "badge-outline", dot: "dot",         label: "Draft" },
    "pending_payment":  { cls: "badge-warning", dot: "dot-warning", label: "Pending Payment" },
    "active":           { cls: "badge-success", dot: "dot-success", label: "Active" },
    "suspended":        { cls: "badge-danger",  dot: "dot-danger",  label: "Suspended" },
    "expired":          { cls: "badge-danger",  dot: "dot-danger",  label: "Expired" },
    "renewed":          { cls: "badge-info",    dot: "dot-info",    label: "Renewed" },
    // wo_status enum (migration 0014) - lowercase keys. in_progress /
    // completed / cancelled overlap with project_status above (intentional —
    // same colors for the shared semantic). Adding the WO-specific values:
    "open":                 { cls: "badge-info",    dot: "dot-info",    label: "Open" },
    "assigned":             { cls: "badge-outline", dot: "dot",         label: "Assigned" },
    "waiting_material":     { cls: "badge-warning", dot: "dot-warning", label: "Waiting · Material" },
    "pending_confirmation": { cls: "badge-violet",  dot: "dot-violet",  label: "Pending Confirmation" },
    "done":                 { cls: "badge-success", dot: "dot-success", label: "Done" },
    "closed":               { cls: "badge-outline", dot: "dot",         label: "Closed" },
  };
  const m = map[state] || { cls: "badge-outline", dot: "dot" };
  return <span className={"badge " + m.cls}><span className={"dot " + m.dot} /> {m.label || state}</span>;
}

/* ─── PageHeader ──────────────────────────────────── */
export function PageHeader({ eyebrow, title, sub, right }:
  { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/* ─── EmptyState ──────────────────────────────────── */
export function EmptyState({ icon = "inbox", title, sub, action }:
  { icon?: IconName; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--ink-mute)" }}>
      <div style={{
        width: 56, height: 56, borderRadius: 18,
        background: "var(--bg-muted)", color: "var(--ink-quiet)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        marginBottom: 14,
      }}>
        <Icon name={icon} size={24} />
      </div>
      <div style={{ font: "var(--t-h3)", color: "var(--ink)" }}>{title}</div>
      {sub && <div style={{ font: "var(--t-body)", maxWidth: 360, margin: "6px auto 0" }}>{sub}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

/* ─── CardHead ────────────────────────────────────── */
export function CardHead({ title, sub, right }:
  { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="row between" style={{ marginBottom: 12 }}>
      <div>
        <div style={{ font: "var(--t-h3)", color: "var(--ink)" }}>{title}</div>
        {sub && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* ─── Helper: shorthand for inline styles consumers use a lot ── */
export type Style = CSSProperties;

/* re-export useApp for convenience inside pages */
export { useApp };
