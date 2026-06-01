"use client";
// ============================================================
// App shell - Sidebar + Topbar + BottomNav
// (Ported from prototype/shell.jsx)
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { useApp, type RouteName } from "@/lib/app-context";
import { db, KPI_OPS, ROLE_LABELS } from "@/lib/db";
import type { IconName, Role } from "@/lib/types";
import { canCreateAnything } from "@/lib/permissions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { NotificationBell } from "./notifications";

interface NavItem { id: RouteName; label: string; icon: IconName; roles: "*" | Role[]; countKey?: keyof typeof KPI_OPS }
interface NavGroup { label: string; items: NavItem[] }

// NAV is grouped to mirror the business: a dedicated "Jobs" group makes the
// three sellable contract types — Main Contractor Jobs, AMC Contracts,
// Repair Tickets — visually equal siblings instead of burying one under
// Operations. URLs / route IDs stay the same so deep links keep working.
//
// Role gates aligned with lib/permissions.ts (post-0016). Per the Installtec
// hierarchy:
//   workers / drivers / subcontractors → MINIMAL sidebar (Dashboard, Notes,
//     Work orders only — their assignment list)
//   lead_worker → Workspace + Jobs (all 3) + WO/Inventory/Logistics + Sites
//   manager / admin / md → full sidebar
//   sales → Workspace + AMC + Customers + Notes
//   service_support → Workspace + Repairs + Customers + Notes
//   accounts → Workspace + AMC + Approvals + Reports + Notes
//   super_admin → Platform group only (plus Workspace via "*")
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Platform", items: [
      { id: "organizations", label: "Organizations", icon: "building", roles: ["super_admin"] },
      { id: "admins", label: "Admins", icon: "shield", roles: ["super_admin"] },
    ]
  },
  {
    label: "Workspace", items: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard", roles: "*" },
      // Growth Plan — 3-month calendar/planner aggregating projects,
      // AMC visits, and WOs. Visible to every operational role (super_admin
      // sits in its own Platform group and doesn't need it).
      { id: "growth-plan", label: "Growth Plan", icon: "calendar",
        roles: ["admin", "md", "manager", "lead_worker", "worker", "driver",
                "subcontractor", "accounts", "sales", "service_support", "estimator"] },
      { id: "notes", label: "Notes", icon: "fileText", roles: "*" },
    ]
  },
  {
    label: "Jobs", items: [
      { id: "projects", label: "Main Contractor Jobs", icon: "briefcase", roles: ["admin", "md", "manager", "lead_worker"] },
      { id: "amc", label: "AMC contracts", icon: "shieldCheck", roles: ["admin", "md", "manager", "sales", "accounts", "lead_worker"] },
      { id: "repair", label: "Repair tickets", icon: "wrench", roles: ["admin", "md", "manager", "service_support", "lead_worker"] },
    ]
  },
  {
    label: "Operations", items: [
      { id: "workorders", label: "Work orders", icon: "briefcase", roles: "*", countKey: "open_wo" },
      { id: "feed", label: "Live feed", icon: "feed", roles: ["admin", "md", "manager", "service_support"] },
      { id: "scheduling", label: "Scheduling", icon: "calendar", roles: ["admin", "md", "manager"] },
      { id: "approvals", label: "Approvals", icon: "inbox", roles: ["admin", "md", "manager", "accounts"], countKey: "approvals_count" },
      { id: "replacements", label: "Replacements", icon: "package", roles: ["admin", "md", "manager", "lead_worker", "worker", "subcontractor", "accounts"] },
      { id: "inventory", label: "Inventory", icon: "package", roles: ["admin", "md", "manager", "lead_worker"] },
      { id: "logistics", label: "Logistics", icon: "truck", roles: ["admin", "md", "manager", "lead_worker"] },
    ]
  },
  {
    label: "Relationships", items: [
      { id: "customers", label: "Customers", icon: "building", roles: ["admin", "md", "manager", "sales", "service_support"] },
      { id: "sites", label: "Sites", icon: "mapPin", roles: ["admin", "md", "manager", "lead_worker"] },
      { id: "team", label: "Team", icon: "users", roles: ["admin", "md", "manager", "lead_worker"] },
      // Sub-contractors directory (migration 0023) — external profiles
      // with HR/compliance fields + per-WO hours. Managed by Ops only;
      // workers see them on the WO detail page, not via a sidebar entry.
      { id: "sub-contractors", label: "Sub-contractors", icon: "users", roles: ["admin", "md", "manager"] },
      { id: "reports", label: "Reports", icon: "chartBar", roles: ["admin", "md", "manager", "accounts"] },
    ]
  },
  {
    label: "System", items: [
      { id: "admin", label: "Admin · Users", icon: "cog", roles: ["admin"] },
    ]
  },
];

function navForRole(role: Role): NavGroup[] {
  return NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i => i.roles === "*" || (i.roles as Role[]).includes(role)),
  })).filter(g => g.items.length > 0);
}

/* ─── Sidebar ───────────────────────────────────────────── */
export function Sidebar() {
  const { route, go, me, role, currentOrg, notesOpen, setNotesOpen } = useApp();
  const groups = navForRole(role);
  const brandTitle = currentOrg?.display_name ?? "Installtec";
  const brandSub = currentOrg?.tagline ?? "Operations";

  return (
    <aside className="side">
      <div className="side-brand">
        <div className="side-brand-logo">
          {currentOrg?.logo_url ? (
            <img src={currentOrg.logo_url} alt={brandTitle}
              style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" fill="white" opacity="0.18" />
              <path d="M8 11l3 3 5-5" />
            </svg>
          )}
        </div>
        <div className="side-brand-text">
          <div className="title">{brandTitle}</div>
          <div className="sub">{brandSub}</div>
        </div>
      </div>

      <div className="side-scroll">
        {groups.map(g => (
          <div key={g.label}>
            <div className="side-group">{g.label}</div>
            {g.items.map(i => {
              const raw = i.countKey ? KPI_OPS[i.countKey] : null;
              const count = typeof raw === "number" ? raw : null;
              // "notes" is a pseudo-route - clicking opens the slide-out
              // instead of navigating. Active state mirrors the panel state.
              const isPanel = i.id === "notes";
              const active = isPanel ? notesOpen : route.name === i.id;
              const onClick = () => isPanel ? setNotesOpen(true) : go(i.id);
              return (
                <div key={i.id}
                  className={"side-item" + (active ? " active" : "")}
                  onClick={onClick}>
                  <Icon name={i.icon} size={18} />
                  <span className="label">{i.label}</span>
                  {count != null && <span className="badge-count">{count}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="side-foot">
        <div className="side-user">
          <span className={"avatar avatar-" + (me.tint || "primary")}>{me.initials}</span>
          <div className="side-user-info">
            <div className="name truncate">{me.name}</div>
            <div className="role truncate">{ROLE_LABELS[me.role] || me.role}</div>
          </div>
          <Icon name="chevronDown" size={14} style={{ color: "var(--ink-quiet)" }} />
        </div>
      </div>
    </aside>
  );
}

/* ─── Topbar ────────────────────────────────────────────── */
const TITLE_MAP: Record<RouteName, string> = {
  dashboard: "Dashboard",
  workorders: "Work orders",
  feed: "Live operations feed",
  scheduling: "Scheduling & dispatch",
  approvals: "Approvals",
  projects: "Main Contractor Jobs",
  amc: "AMC contracts",
  repair: "Repair tickets",
  inventory: "Inventory",
  logistics: "Logistics",
  customers: "Customers",
  sites: "Sites",
  replacements: "Replacements",
  "growth-plan": "Growth Plan",
  "sub-contractors": "Sub-contractors",
  team: "Team",
  reports: "Reports",
  admin: "Admin · Users",
  notifications: "Notifications",
  organizations: "Organizations",
  admins: "Admins",
  notes: "Notes",
};

export function Topbar() {
  const { route, setCmdk, setUserId, userId, role, openCreate, go, dataVersion, hasRealAuth, sidebarCollapsed, toggleSidebar } = useApp();
  void dataVersion; // re-read db.USERS whenever a create/delete bumps the version
  const customUsers = Object.values(db.USERS);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const router = useRouter();
  const mockMode = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  // Role switcher is a dev-only preview. Only meaningful in mock mode - once
  // real Supabase auth is in play (`hasRealAuth`), switching userId locally
  // diverges from the actual signed-in session and RLS scope.
  const roleSwitcherOn =
    process.env.NEXT_PUBLIC_ROLE_SWITCHER === "true" && mockMode && !hasRealAuth;

  const signOut = async () => {
    try { await supabaseBrowser().auth.signOut(); } catch { /* no-op in mock */ }
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="topbar">
      <button
        className="btn btn-ghost btn-icon"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
        aria-expanded={!sidebarCollapsed}
        title={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
      >
        <Icon name="panelLeft" size={18} />
      </button>
      <div className="topbar-bread">
        <span className="crumb">Installtec</span>
        <span className="sep">/</span>
        <span className="crumb active">{TITLE_MAP[route.name] || route.name}</span>
      </div>

      <div className="topbar-cmd input-search-wrap" style={{ position: "relative" }}>
        <Icon name="search" size={14} />
        <input className="input" placeholder="Search anything - Cmd K" onFocus={() => setCmdk(true)} readOnly />
        <span className="kbd"><span>⌘</span><span>K</span></span>
      </div>

      <div style={{ flex: 1 }} className="hide-mobile" />

      {roleSwitcherOn && (
        <div style={{ position: "relative" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setRoleMenuOpen(o => !o)} title="Switch role">
            <Icon name="user" size={14} />
            <span className="hide-mobile">{ROLE_LABELS[role]}</span>
            <Icon name="chevronDown" size={12} />
          </button>
          {roleMenuOpen && (
            <>
              <div onClick={() => setRoleMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
              <div style={{
                position: "absolute", top: "110%", right: 0, zIndex: 20,
                background: "var(--bg-elev)", borderRadius: "var(--r-md)",
                boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)",
                padding: 6, minWidth: 240,
              }}>
                <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", padding: "6px 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Switch user - preview
                </div>
                {customUsers.length === 0 ? (
                  <div style={{ padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                      No users yet. Add one in Admin to preview their dashboard.
                    </div>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => { setRoleMenuOpen(false); go("admin"); }}>
                      <Icon name="plus" size={12} /> Open Admin
                    </button>
                  </div>
                ) : (
                  customUsers.map(u => {
                    const isActive = u.id === userId;
                    return (
                      <div key={u.id} onClick={() => { setUserId(u.id); setRoleMenuOpen(false); }}
                        style={{
                          padding: "8px 10px", borderRadius: "var(--r-sm)",
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                          background: isActive ? "var(--bg-muted)" : "transparent",
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-muted)"}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = isActive ? "var(--bg-muted)" : "transparent"}>
                        <span className={"avatar avatar-sm avatar-" + (u.tint || "primary")}>{u.initials}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: "var(--t-small)", fontWeight: 600 }} className="truncate">{u.name}</div>
                          <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{ROLE_LABELS[u.role]}</div>
                        </div>
                        {isActive && <Icon name="check" size={14} style={{ color: "var(--pri-600)" }} />}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      <NotificationBell />

      {canCreateAnything(role) && (
        <button className="btn btn-primary btn-sm hide-mobile" onClick={() => openCreate("picker")}>
          <Icon name="plus" size={14} /> Create
        </button>
      )}

      <button className="btn btn-ghost btn-sm" onClick={signOut} title="Sign out">
        <Icon name="arrowRight" size={14} />
        <span className="hide-mobile">Sign out</span>
      </button>
    </header>
  );
}

/* ─── Bottom nav (mobile) ───────────────────────────────── */
export function BottomNav() {
  const { route, go, role, openCreate } = useApp();
  const isField = role === "worker" || role === "lead_worker" || role === "driver";
  const items: RouteName[] = isField
    ? ["dashboard", "workorders", "feed", "team", "customers"]
    : ["dashboard", "workorders", "feed", "approvals", "customers"];

  return (
    <nav className="bnav">
      <button data-on={String(route.name === items[0])} onClick={() => go(items[0])}>
        <Icon name="dashboard" size={20} /><span>Home</span>
      </button>
      <button data-on={String(route.name === items[1])} onClick={() => go(items[1])}>
        <Icon name="briefcase" size={20} /><span>WO</span>
      </button>
      <button className="fab" onClick={() => openCreate("picker")}><Icon name="plus" size={22} /></button>
      <button data-on={String(route.name === items[3])} onClick={() => go(items[3])}>
        <Icon name={items[3] === "team" ? "users" : "inbox"} size={20} />
        <span>{items[3] === "team" ? "Team" : "Approve"}</span>
      </button>
      <button data-on={String(route.name === items[4])} onClick={() => go(items[4])}>
        <Icon name="building" size={20} /><span>Customers</span>
      </button>
    </nav>
  );
}
