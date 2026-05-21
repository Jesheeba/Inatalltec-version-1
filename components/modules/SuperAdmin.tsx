"use client";
// ============================================================
// Super Admin Console - Organizations + cross-org Admins.
// Sits above the tenant: lists every Organization, lets you
// create / edit / deactivate, switch the active preview, and
// see every Admin across the platform.
// Only super_admin role sees this; nav hides the entry for other
// roles and the components below early-return for direct URLs.
// ============================================================

import { useState } from "react";
import { Icon } from "../Icon";
import { useApp, type RouteName } from "@/lib/app-context";
import { db } from "@/lib/db";
import { deleteOrganization, deleteUser } from "@/lib/create";
import type { Organization, User } from "@/lib/types";
import { KPI, PageHeader, EmptyState, RowMenu } from "../shared";

/* ─── Role guard (used by both Organizations and Admins) ─ */
function SuperAdminOnly({ go }: { go: (n: RouteName) => void }) {
  return (
    <div className="main-pad">
      <EmptyState icon="shield" title="Super Admin only"
        sub="This area manages platform-level tenants and admins. Admins manage operational users from their own Admin · Users page."
        action={<button className="btn btn-primary" onClick={() => go("dashboard")}><Icon name="arrowLeft" size={14} /> Back to dashboard</button>} />
    </div>
  );
}

/* ─── Organizations ─────────────────────────────────────── */
export function Organizations() {
  const { openCreate, bumpData, fireToast, setActiveOrgId, activeOrgId, dataVersion, role, go } = useApp();
  void dataVersion;
  if (role !== "super_admin") return <SuperAdminOnly go={go} />;
  const orgs = Object.values(db.ORGANIZATIONS);

  const onDelete = async (o: Organization) => {
    if (!window.confirm(`Delete ${o.display_name}? This cannot be undone.`)) return;
    const res = await deleteOrganization(o.id);
    if (res.ok) { bumpData(); fireToast(`${o.display_name} removed.`); }
    else fireToast(res.error);
  };

  const totalUsers = Object.values(db.USERS).filter(u => u.role !== "super_admin").length;
  const adminCount = Object.values(db.USERS).filter(u => u.role === "admin").length;

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Platform governance" title="Organizations"
        sub="Every tenant on the platform - branding, currency, locale and domain configured per org."
        right={
          <button className="btn btn-primary" onClick={() => openCreate("organization")}>
            <Icon name="plus" size={14} /> New organization
          </button>
        } />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active organizations" value={orgs.filter(o => o.is_active).length} />
        <KPI label="Admins" value={adminCount} />
        <KPI label="Total users" value={totalUsers} sub="across all organizations" />
        <KPI label="Currencies in use" value={new Set(orgs.map(o => o.default_currency)).size} />
      </div>

      {orgs.length === 0 ? (
        <EmptyState icon="building" title="No organizations yet"
          sub="Create the first organization to get started - it'll own its own users, customers and operations."
          action={<button className="btn btn-primary" onClick={() => openCreate("organization")}><Icon name="plus" size={14} /> Create organization</button>} />
      ) : (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {orgs.map(o => {
            const isActive = o.id === activeOrgId;
            const userCount = Object.values(db.USERS).filter(u => u.organization_id === o.id).length;
            return (
              <div key={o.id} className="card" style={{
                padding: 0, display: "flex", flexDirection: "column",
                outline: isActive ? "2px solid var(--pri-500)" : "none",
              }}>
                {/* Branding strip - preview of the org's color palette */}
                <div style={{
                  height: 64, display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderTopLeftRadius: "var(--r-md)", borderTopRightRadius: "var(--r-md)",
                  background: `linear-gradient(135deg, ${o.primary_color} 0%, ${o.secondary_color} 70%, ${o.accent_color} 100%)`,
                  color: "white",
                }}>
                  {o.logo_url ? (
                    <img src={o.logo_url} alt={o.display_name}
                      style={{ width: 36, height: 36, borderRadius: 8, background: "white", padding: 4, objectFit: "contain" }} />
                  ) : (
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.22)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
                    }}>{o.display_name.charAt(0)}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }} className="truncate">{o.display_name}</div>
                    <div style={{ font: "var(--t-micro)", opacity: 0.85 }} className="truncate">{o.tagline ?? o.name}</div>
                  </div>
                </div>

                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="badge badge-outline">{o.default_currency}</span>
                    <span className="badge badge-outline">{o.default_locale}</span>
                    {isActive && <span className="badge badge-success"><span className="dot dot-success" /> Active preview</span>}
                    {!o.is_active && <span className="badge badge-warning">Deactivated</span>}
                  </div>

                  <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                    <div><strong style={{ color: "var(--ink)" }}>{userCount}</strong> users · <strong style={{ color: "var(--ink)" }}>{o.subdomain}</strong>.platform</div>
                    {o.custom_domain && (
                      <div className="truncate">Custom: {o.custom_domain} {o.domain_verified ? "·  ✓ verified" : "·  pending"}</div>
                    )}
                  </div>

                  <div style={{ marginTop: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn btn-ghost btn-sm" disabled={isActive}
                      onClick={() => { setActiveOrgId(o.id); fireToast(`Previewing ${o.display_name}`); }}>
                      <Icon name="check" size={12} /> {isActive ? "Active" : "Preview"}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openCreate("organization", { id: o.id })}>
                      <Icon name="pen" size={12} /> Edit
                    </button>
                    <div style={{ marginLeft: "auto" }}>
                      <RowMenu items={[
                        {
                          label: "Delete organization",
                          icon: "trash",
                          destructive: true,
                          onClick: () => onDelete(o),
                        },
                      ]} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Admins (cross-organization) ──────────────────────── */
export function Admins() {
  const { openCreate, bumpData, fireToast, dataVersion, role, go, me } = useApp();
  void dataVersion;
  const [orgFilter, setOrgFilter] = useState<string>("");
  if (role !== "super_admin") return <SuperAdminOnly go={go} />;
  const orgs = Object.values(db.ORGANIZATIONS);

  // This page lists the platform's organisation-level Admins.
  //   - Hide super_admins (they sit above tenancy and are managed elsewhere)
  //   - Hide self (it's odd to see your own row in a list you'd take action on)
  //   - Dedupe by email so a stale local row + a hydrated UUID row don't both render
  const admins = (() => {
    const seen = new Map<string, User>();
    for (const u of Object.values(db.USERS)) {
      if (u.role !== "admin") continue;
      if (u.id === me.id) continue;
      const key = (u.email || "").toLowerCase();
      const prev = seen.get(key);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u.id);
      const prevIsUuid = prev && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prev.id);
      if (!prev || (isUuid && !prevIsUuid)) seen.set(key, u);
    }
    return Array.from(seen.values());
  })();

  const visible = orgFilter
    ? admins.filter(a => a.organization_id === orgFilter)
    : admins;

  const onDelete = async (u: User) => {
    if (!window.confirm(`Remove admin ${u.name}? This cannot be undone.`)) return;
    const res = await deleteUser(u.id);
    if (res.ok) { bumpData(); fireToast(`${u.name} removed.`); }
    else fireToast(res.error);
  };

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Platform governance" title="Admins"
        sub="Every organization Admin across the platform - created by Super Admin, governs their own org."
        right={
          <button className="btn btn-primary" onClick={() => openCreate("user", { role: "admin" })}>
            <Icon name="plus" size={14} /> New admin
          </button>
        } />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Total admins" value={admins.length} />
        <KPI label="Organizations covered" value={new Set(admins.map(a => a.organization_id)).size} />
        <KPI label="2FA enabled" value="-" sub="wire to auth in slice 2" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Filter by org</span>
          <select className="select" style={{ maxWidth: 240 }}
            value={orgFilter} onChange={e => setOrgFilter(e.target.value)}>
            <option value="">All organizations</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.display_name}</option>)}
          </select>
        </div>
        {visible.length === 0 ? (
          <EmptyState icon="users" title="No admins yet"
            sub="Create the first admin - they'll govern their organization's users, approvals and config."
            action={<button className="btn btn-primary" onClick={() => openCreate("user", { role: "admin" })}><Icon name="plus" size={14} /> Create admin</button>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Organization</th>
                  <th className="hide-mobile">Region</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(u => {
                  const org = u.organization_id ? db.org(u.organization_id) : null;
                  return (
                    <tr key={u.id}>
                      <td data-th="Admin">
                        <div className="row gap-3">
                          <span className={"avatar avatar-sm avatar-" + (u.tint || "primary")}>{u.initials}</span>
                          <div>
                            <div style={{ font: "var(--t-body-md)" }}>{u.name}</div>
                            <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td data-th="Organization">
                        {org ? <span className="badge badge-outline">{org.display_name}</span> : "-"}
                      </td>
                      <td data-th="Region" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                        {u.region}
                      </td>
                      <td data-th="Status">
                        <span className="badge badge-success"><span className="dot dot-success" /> Active</span>
                      </td>
                      <td>
                        <RowMenu items={[
                          {
                            label: "Remove admin",
                            icon: "trash",
                            destructive: true,
                            onClick: () => onDelete(u),
                          },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
