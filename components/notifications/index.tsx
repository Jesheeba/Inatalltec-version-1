"use client";
// ============================================================
// Notification system - premium enterprise UI
// Bell · Badge · Card · Group · Dropdown · RealtimeToast ·
// AlertBanner · ActivityFeedCard
// All pieces are reusable and inherit the CRM design tokens.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import type { IconName, Notification, NotificationKind, NotificationPriority } from "@/lib/types";

/* ─── Kind → icon + accent class ──────────────────────────── */
type KindMeta = { icon: IconName; cls: string; label: string };

const KIND_MAP: Record<string, KindMeta> = {
  approval: { icon: "inbox", cls: "kind-approval", label: "Approval" },
  escalation: { icon: "alertTriangle", cls: "kind-escalation", label: "Escalation" },
  workorder: { icon: "briefcase", cls: "kind-workorder", label: "Work order" },
  sla: { icon: "clock", cls: "kind-sla", label: "SLA" },
  message: { icon: "messageCircle", cls: "kind-message", label: "Message" },
  mention: { icon: "user", cls: "kind-mention", label: "Mention" },
  payment: { icon: "banknote", cls: "kind-payment", label: "Payment" },
  amc: { icon: "shieldCheck", cls: "kind-amc", label: "AMC" },
  signoff: { icon: "checkCircle", cls: "kind-signoff", label: "Sign-off" },
  material: { icon: "package", cls: "kind-material", label: "Material" },
  leave: { icon: "calendar", cls: "kind-leave", label: "Leave" },
  system: { icon: "bell", cls: "kind-system", label: "System" },
};

function metaFor(kind: string): KindMeta {
  return KIND_MAP[kind] || KIND_MAP.system;
}

/* ─── NotificationBadge ───────────────────────────────────── */
export function NotificationBadge({ count, max = 99 }: { count: number; max?: number }) {
  if (count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);
  return (
    <span
      key={count} // re-mounts on change so the bump animation fires
      style={{
        minWidth: 16, height: 16, padding: "0 4px",
        borderRadius: 999,
        background: "var(--ink)",
        color: "#fff",
        font: "700 10px/16px var(--font-sans)",
        letterSpacing: "0.01em",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: "2px solid var(--bg-elev)",
        boxSizing: "content-box",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.22)",
        animation: "badgeBump .35s cubic-bezier(.2,.8,.25,1)",
      }}
    >
      {display}
    </span>
  );
}

/* ─── NotificationBell ────────────────────────────────────── */
export function NotificationBell() {
  const { setNotif, unreadCount } = useApp();
  return (
    <button
      className="btn btn-ghost btn-icon"
      style={{ position: "relative" }}
      onClick={() => setNotif(o => !o)}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
    >
      <span style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
        <Icon name="bell" size={18} />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: -6, right: -7, pointerEvents: "none" }}>
            <NotificationBadge count={unreadCount} />
          </span>
        )}
      </span>
    </button>
  );
}

/* ─── NotificationCard ────────────────────────────────────── */
export function NotificationCard({
  n,
  onOpen,
  onApprove,
  onReject,
  compact = false,
}: {
  n: Notification;
  onOpen?: (n: Notification) => void;
  onApprove?: (n: Notification) => void;
  onReject?: (n: Notification) => void;
  compact?: boolean;
}) {
  const m = metaFor(n.kind);
  const showActions = !compact && (n.actions?.length ?? 0) > 0;
  return (
    <div
      className={"notif-card" + (n.read ? "" : " unread")}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(n)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(n); } }}
    >
      {n.priority === "high" && <div className="notif-prio high" aria-label="High priority" />}
      <div className={"icon-wrap " + m.cls}>
        <Icon name={m.icon} size={17} />
      </div>
      <div className="body">
        <div className="row1">
          <span className="title">{n.title}</span>
        </div>
        <div className="desc">{n.body}</div>
        <div className="meta">
          <span>{m.label}</span>
          <span className="dot-sep" />
          <span>{n.t}</span>
          {n.priority === "high" && (
            <>
              <span className="dot-sep" />
              <span style={{ color: "var(--dan-700)", fontWeight: 600 }}>High priority</span>
            </>
          )}
        </div>
        {showActions && (
          <div className="actions" onClick={e => e.stopPropagation()}>
            {n.actions!.includes("approve") && (
              <button className="btn btn-primary btn-sm" onClick={() => onApprove?.(n)}>
                <Icon name="check" size={12} /> Approve
              </button>
            )}
            {n.actions!.includes("reject") && (
              <button className="btn btn-soft btn-sm" onClick={() => onReject?.(n)}>
                Reject
              </button>
            )}
            {n.actions!.includes("view") && (
              <button className="btn btn-ghost btn-sm" onClick={() => onOpen?.(n)}>
                View
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── NotificationGroup ───────────────────────────────────── */
export function NotificationGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="notif-group-label">{label}</div>
      {children}
    </div>
  );
}

/* ─── Grouping helpers ────────────────────────────────────── */
function groupByDay(notifications: Notification[]) {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const groups: { label: string; items: Notification[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];
  for (const n of notifications) {
    const d = n.iso ? new Date(n.iso) : null;
    if (!d) { groups[2].items.push(n); continue; }
    if (sameDay(d, today)) groups[0].items.push(n);
    else if (sameDay(d, yesterday)) groups[1].items.push(n);
    else groups[2].items.push(n);
  }
  return groups.filter(g => g.items.length > 0);
}

/* ─── NotificationDropdown - anchored under the bell ──────── */
type Filter = "all" | "unread" | "priority" | NotificationKind;

const FILTER_TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "priority", label: "Priority" },
  { id: "approval", label: "Approvals" },
  { id: "sla", label: "SLA" },
  { id: "mention", label: "Mentions" },
];

export function NotificationDropdown() {
  const { notifOpen, setNotif, notifications, unreadCount, markAllRead, markRead, followTarget, go, fireToast } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notifOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNotif(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notifOpen, setNotif]);

  const filtered = useMemo(() => {
    if (filter === "all") return notifications;
    if (filter === "unread") return notifications.filter(n => !n.read);
    if (filter === "priority") return notifications.filter(n => n.priority === "high");
    return notifications.filter(n => n.kind === filter);
  }, [notifications, filter]);

  if (!notifOpen) return null;

  const groups = groupByDay(filtered);

  const onOpen = (n: Notification) => {
    markRead(n.id);
    setNotif(false);
    followTarget(n.target);
  };
  const onApprove = (n: Notification) => { markRead(n.id); fireToast(`Approved · ${n.title}`); };
  const onReject = (n: Notification) => { markRead(n.id); fireToast(`Rejected · ${n.title}`); };

  return (
    <>
      <div onClick={() => setNotif(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div ref={ref} className="notif" role="dialog" aria-label="Notifications">
        <div className="notif-head">
          <div>
            <div className="title">Notifications</div>
            <div className="sub">
              {unreadCount > 0 ? `${unreadCount} unread · ${notifications.length} total` : "You're all caught up"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {unreadCount > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={markAllRead} title="Mark all as read">
                <Icon name="checkCircle" size={13} /> Mark all
              </button>
            )}
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setNotif(false)} aria-label="Close">
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        <div className="notif-filters">
          {FILTER_TABS.map(f => {
            const c =
              f.id === "all" ? notifications.length :
                f.id === "unread" ? unreadCount :
                  f.id === "priority" ? notifications.filter(n => n.priority === "high").length :
                    notifications.filter(n => n.kind === f.id).length;
            if (c === 0 && f.id !== "all") return null;
            return (
              <button key={f.id} className="notif-filter" data-on={String(filter === f.id)} onClick={() => setFilter(f.id)}>
                {f.label}
                {c > 0 && <span className="count">{c}</span>}
              </button>
            );
          })}
        </div>

        <div className="notif-list">
          {groups.length === 0 && (
            <div className="notif-empty">
              <div className="ic"><Icon name="checkCircle" size={22} /></div>
              <div className="h">Nothing here yet</div>
              <div className="s">New activity will land here in real time.</div>
            </div>
          )}
          {groups.map(g => (
            <NotificationGroup key={g.label} label={g.label}>
              {g.items.map(n => (
                <NotificationCard
                  key={n.id} n={n}
                  onOpen={onOpen}
                  onApprove={onApprove}
                  onReject={onReject}
                />
              ))}
            </NotificationGroup>
          ))}
        </div>

        <div className="notif-foot">
          <a onClick={() => { setNotif(false); go("notifications"); }}>
            Open notification center <Icon name="arrowRight" size={12} />
          </a>
          <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>
            <Icon name="zap" size={11} style={{ verticalAlign: "middle", marginRight: 3, color: "var(--pri-600)" }} />
            Realtime
          </span>
        </div>
      </div>
    </>
  );
}

/* ─── RealtimeToast - auto-dismissing realtime alert ──────── */
export function RealtimeToast({
  open, kind = "system", title, description, onClick, onDismiss, duration = 5200,
}: {
  open: boolean;
  kind?: NotificationKind | string;
  title: string;
  description?: string;
  onClick?: () => void;
  onDismiss?: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!open || !onDismiss) return;
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [open, onDismiss, duration]);

  if (!open) return null;
  const m = metaFor(kind);
  return (
    <div className="rt-toast" onClick={onClick} role="status" aria-live="polite">
      <div className={"icon-wrap " + m.cls} style={{ width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={m.icon} size={16} />
      </div>
      <div className="rt-body">
        <div className="rt-title">{title}</div>
        {description && <div className="rt-desc">{description}</div>}
      </div>
      <button className="rt-close" onClick={e => { e.stopPropagation(); onDismiss?.(); }} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/* ─── AlertBanner - top-of-page contextual alert ──────────── */
export function AlertBanner({
  tone = "info", icon, title, description, action,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  icon?: IconName;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  const fallbackIcon: Record<string, IconName> = {
    info: "alertCircle", warning: "alertTriangle", danger: "alertTriangle", success: "checkCircle",
  };
  const toneColor: Record<string, string> = {
    info: "var(--info-700)", warning: "var(--warn-700)", danger: "var(--dan-700)", success: "var(--suc-700)",
  };
  return (
    <div className={"alert-banner tone-" + tone} role="alert">
      <div className="ic" style={{ color: toneColor[tone] }}>
        <Icon name={icon || fallbackIcon[tone]} size={16} />
      </div>
      <div className="text">
        <div className="h">{title}</div>
        {description && <div className="d">{description}</div>}
      </div>
      {action && (
        <button className="btn btn-ghost btn-sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ─── ActivityFeedCard - operations feed item ─────────────── */
export function ActivityFeedCard({
  kind = "system", title, description, who, when, priority, onClick,
}: {
  kind?: NotificationKind | string;
  title: string;
  description?: string;
  who?: string;
  when: string;
  priority?: NotificationPriority;
  onClick?: () => void;
}) {
  const m = metaFor(kind);
  return (
    <div
      className="card card-hover"
      style={{ display: "flex", gap: 12, padding: 14, borderRadius: "var(--r-lg)", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      {priority === "high" && <div className="notif-prio high" style={{ width: 4 }} />}
      <div className={"icon-wrap " + m.cls} style={{ width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={m.icon} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--t-body-md)", color: "var(--ink)" }}>{title}</div>
        {description && <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>{description}</div>}
        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
          {who && <span>{who}</span>}
          {who && <span className="dot-sep" style={{ width: 3, height: 3, borderRadius: 50, background: "var(--ink-quiet)", display: "inline-block" }} />}
          <span>{when}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Export the kind meta map for consumers ──────────────── */
export { KIND_MAP, metaFor };
