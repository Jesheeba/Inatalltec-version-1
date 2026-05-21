"use client";
// ============================================================
// Notification Center - full page
// Search · filters · priority tabs · grouped by date
// ============================================================

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import type { Notification, NotificationKind } from "@/lib/types";
import { KPI, PageHeader } from "../shared";
import {
  NotificationCard, NotificationGroup, AlertBanner, KIND_MAP,
} from "../notifications";

type Tab = "all" | "unread" | "priority";

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

export function NotificationCenter() {
  const { notifications, unreadCount, markAllRead, markRead, dismissNotification, followTarget, fireToast } = useApp();
  const [tab, setTab] = useState<Tab>("all");
  const [kindFilter, setKindFilter] = useState<NotificationKind | "all">("all");
  const [q, setQ] = useState("");

  const priorityCount = notifications.filter(n => n.priority === "high").length;
  const todayCount = useMemo(() => {
    const today = new Date();
    return notifications.filter(n => {
      if (!n.iso) return false;
      const d = new Date(n.iso);
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    }).length;
  }, [notifications]);

  const filtered = useMemo(() => {
    let list = notifications;
    if (tab === "unread") list = list.filter(n => !n.read);
    if (tab === "priority") list = list.filter(n => n.priority === "high");
    if (kindFilter !== "all") list = list.filter(n => n.kind === kindFilter);
    if (q.trim()) {
      const lq = q.toLowerCase();
      list = list.filter(n =>
        n.title.toLowerCase().includes(lq) ||
        n.body.toLowerCase().includes(lq),
      );
    }
    return list;
  }, [notifications, tab, kindFilter, q]);

  const groups = groupByDay(filtered);

  const onOpen = (n: Notification) => { markRead(n.id); followTarget(n.target); };
  const onApprove = (n: Notification) => { markRead(n.id); fireToast(`Approved · ${n.title}`); };
  const onReject = (n: Notification) => { markRead(n.id); fireToast(`Rejected · ${n.title}`); };

  return (
    <div className="main-pad">
      <PageHeader
        eyebrow="Notification center"
        title="All your alerts in one place"
        sub={<>Realtime fanout from approvals, SLA engine, AMC events, and team threads.</>}
        right={
          unreadCount > 0 ? (
            <button className="btn btn-primary btn-sm" onClick={markAllRead}>
              <Icon name="checkCircle" size={13} /> Mark all read
            </button>
          ) : undefined
        }
      />

      {priorityCount > 0 && (
        <AlertBanner
          tone="warning"
          icon="alertTriangle"
          title={`${priorityCount} high-priority alert${priorityCount === 1 ? "" : "s"} need attention`}
          description="Approvals, SLA breaches and escalations are flagged here first."
          action={{ label: "Show priority", onClick: () => setTab("priority") }}
        />
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
        <KPI label="Unread" value={unreadCount} sub={`of ${notifications.length} total`} accent="primary" />
        <KPI label="High priority" value={priorityCount} sub="Routed to you" />
        <KPI label="Today" value={todayCount} sub="New since midnight" />
        <KPI label="Approvals pending" value={notifications.filter(n => n.kind === "approval" && !n.read).length} sub="Awaiting your action" />
      </div>

      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row between" style={{ padding: "16px 20px 10px", flexWrap: "wrap", gap: 12 }}>
          <div className="seg">
            <button data-on={String(tab === "all")} onClick={() => setTab("all")}>All</button>
            <button data-on={String(tab === "unread")} onClick={() => setTab("unread")}>Unread {unreadCount > 0 && <span style={{ opacity: 0.7 }}>· {unreadCount}</span>}</button>
            <button data-on={String(tab === "priority")} onClick={() => setTab("priority")}>Priority {priorityCount > 0 && <span style={{ opacity: 0.7 }}>· {priorityCount}</span>}</button>
          </div>

          <div className="input-search-wrap" style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
            <Icon name="search" size={14} />
            <input
              className="input"
              placeholder="Search notifications…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="notif-filters" style={{ padding: "4px 16px 12px", borderBottom: "1px solid var(--divider)" }}>
          <button className="notif-filter" data-on={String(kindFilter === "all")} onClick={() => setKindFilter("all")}>All types</button>
          {(Object.keys(KIND_MAP) as NotificationKind[]).map(k => {
            const c = notifications.filter(n => n.kind === k).length;
            if (c === 0) return null;
            return (
              <button key={k} className="notif-filter" data-on={String(kindFilter === k)} onClick={() => setKindFilter(k)}>
                {KIND_MAP[k].label}
                <span className="count">{c}</span>
              </button>
            );
          })}
        </div>

        <div style={{ padding: "4px 8px 12px", minHeight: 200 }}>
          {groups.length === 0 && (
            <div className="notif-empty">
              <div className="ic"><Icon name="checkCircle" size={22} /></div>
              <div className="h">No notifications match your filters</div>
              <div className="s">Try clearing the search or switching tabs.</div>
            </div>
          )}
          {groups.map(g => (
            <NotificationGroup key={g.label} label={g.label}>
              {g.items.map(n => (
                <div key={n.id} style={{ position: "relative" }}>
                  <NotificationCard
                    n={n}
                    onOpen={onOpen}
                    onApprove={onApprove}
                    onReject={onReject}
                  />
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Dismiss"
                    onClick={e => { e.stopPropagation(); dismissNotification(n.id); }}
                    style={{
                      position: "absolute", top: 10, right: 10,
                      opacity: 0.0, transition: "opacity .14s ease",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
            </NotificationGroup>
          ))}
        </div>
      </section>
    </div>
  );
}
