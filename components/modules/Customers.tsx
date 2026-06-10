"use client";
// ============================================================
// Customers module - list + detail (with linked entities)
// (Ported from modules/customers.jsx)
// ============================================================

import { useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db, ROLE_LABELS } from "@/lib/db";
import type { CommEntry, Customer, IconName } from "@/lib/types";
import {
  CardHead, EmptyState, FilterBar, KPI, PageHeader, StatusBadge,
} from "../shared";
import { can, listScopeFor } from "@/lib/permissions";

function Mini({ k, v }: { k: string; v: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="numeric" style={{ font: "600 18px/1.1 var(--font-display)" }}>{v}</div>
      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{k}</div>
    </div>
  );
}

function CustomerCard({ c, onClick }: { c: Customer; onClick: () => void }) {
  const stats = db.byCustomer(c.id);
  return (
    <div className="card card-hover card-pad" onClick={onClick}>
      <div className="row between">
        <div style={{
          width: 44, height: 44, borderRadius: 14,
          background: c.tier === "Strategic" ? "var(--pri-100)" : c.tier === "Key" ? "var(--sec-100)" : "var(--bg-muted)",
          color: c.tier === "Strategic" ? "var(--pri-700)" : c.tier === "Key" ? "var(--sec-700)" : "var(--ink-soft)",
          display: "flex", alignItems: "center", justifyContent: "center",
          font: "600 14px/1 var(--font-display)",
        }}>
          {c.name.split(" ").slice(0, 2).map(w => w[0]).join("")}
        </div>
        <span className="badge badge-outline">{c.tier}</span>
      </div>
      <div style={{ font: "var(--t-h4)", marginTop: 12 }} className="truncate">{c.name}</div>
      <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>{c.sector} · since {c.since.slice(0, 4)}</div>
      <div className="row gap-2" style={{ marginTop: 12, flexWrap: "wrap" }}>
        {c.tags.map(t => <span key={t} className="badge">{t}</span>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
        <Mini k="Jobs" v={stats.projects.length} />
        <Mini k="AMC" v={stats.amcs.length} />
        <Mini k="Repairs" v={stats.repairs.length} />
      </div>
    </div>
  );
}

export function CustomersList() {
  const { openCustomer, openCreate, role } = useApp();
  const scope = listScopeFor(role, "customers");
  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Relationships" title="Customers" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Customer records are visible to Operations Manager, Admin, MD, Sales, and Service Support." />
      </div>
    );
  }
  const all = Object.values(db.CUSTOMERS);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | "Strategic" | "Key" | "Standard">("all");

  const filtered = all.filter(c =>
    (tier === "all" || c.tier === tier) &&
    (!q.trim() || c.name.toLowerCase().includes(q.toLowerCase()) || (c.sector || "").toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Relationships" title="Customers"
        sub={all.length + " customers · 220+ historical relationships"}
        right={can(role, "CREATE_CUSTOMER")
          ? <button className="btn btn-primary" onClick={() => openCreate("customer")}><Icon name="plus" size={14} /> New customer</button>
          : undefined} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active customers" value={all.length} />
        <KPI label="Strategic" value={all.filter(c => c.tier === "Strategic").length} sub="top-tier accounts" />
        <KPI label="AMC penetration" value="67%" sub="of customers on AMC" trend="up" />
        <KPI label="Touches · 30d" value="184" sub="across channels" />
      </div>

      <div className="card card-pad" style={{ padding: 16, marginBottom: 16 }}>
        <div className="row gap-3" style={{ flexWrap: "wrap" }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm" placeholder="Search customers, sectors…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <FilterBar value={tier} onChange={setTier} options={[
            { value: "all", label: "All tiers" },
            { value: "Strategic", label: "Strategic" },
            { value: "Key", label: "Key" },
            { value: "Standard", label: "Standard" },
          ]} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {filtered.map(c => <CustomerCard key={c.id} c={c} onClick={() => openCustomer(c.id)} />)}
      </div>
    </div>
  );
}

function CommRow({ m, last }: { m: CommEntry; last: boolean }) {
  const iconMap: Record<string, { icon: IconName; bg: string; ink: string }> = {
    WhatsApp: { icon: "messageCircle", bg: "var(--suc-100)", ink: "var(--suc-700)" },
    Email: { icon: "mail", bg: "var(--info-100)", ink: "var(--info-700)" },
    "Site visit": { icon: "mapPin", bg: "var(--pri-100)", ink: "var(--pri-700)" },
    System: { icon: "cog", bg: "var(--bg-muted)", ink: "var(--ink-soft)" },
    Invoice: { icon: "receipt", bg: "var(--acc-100)", ink: "var(--acc-700)" },
  };
  const m2 = iconMap[m.kind] || iconMap.System;
  return (
    <div className="row gap-3" style={{ alignItems: "flex-start", position: "relative", paddingBottom: last ? 0 : 6 }}>
      {!last && <div style={{ position: "absolute", left: 18, top: 38, bottom: -6, width: 2, background: "var(--divider)" }} />}
      <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: m2.bg, color: m2.ink, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
        <Icon name={m2.icon} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap-2">
          <span style={{ font: "var(--t-small)", fontWeight: 600 }}>{m.kind}</span>
          <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>· {m.from}</span>
          <span style={{ marginLeft: "auto", font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{m.t}</span>
        </div>
        <div style={{ font: "var(--t-body)", color: "var(--ink-soft)", marginTop: 4 }}>{m.body}</div>
      </div>
    </div>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const { go, openProject, openAmc, openCreate, fmtMoney, dataVersion, role } = useApp();
  void dataVersion;
  const c = db.cust(id);
  if (!c) return <EmptyState icon="alertCircle" title="Customer not found"
    action={<button className="btn btn-primary" onClick={() => go("customers")}>Back to customers</button>} />;
  const stats = db.byCustomer(id);
  const sites = Object.values(db.SITES).filter(s => s.customer === id && s.is_active !== false);
  const comms = db.COMMS[id] || [];
  const [tab, setTab] = useState<"overview" | "projects" | "amc" | "comms">("overview");
  const owner = db.user(c.owner);

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => go("customers")} style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All customers
        </a>
      </div>

      <div className="card card-pad" style={{ marginBottom: 24, display: "flex", gap: 18, alignItems: "center" }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: c.tier === "Strategic"
            ? "linear-gradient(150deg, var(--pri-300), var(--pri-600))"
            : "linear-gradient(150deg, var(--sec-200), var(--sec-500))",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          font: "700 22px/1 var(--font-display)",
        }}>
          {c.name.split(" ").slice(0, 2).map(w => w[0]).join("")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row gap-2" style={{ marginBottom: 2 }}>
            <span className="badge badge-outline">{c.tier}</span>
            <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{c.sector} · Customer since {c.since}</span>
          </div>
          <h1 style={{ font: "var(--t-h1)", margin: "6px 0 0", letterSpacing: "-0.01em" }}>{c.name}</h1>
        </div>
        <div className="row gap-2 hide-mobile">
          <button className="btn btn-ghost"><Icon name="messageCircle" size={14} /> Message</button>
          {can(role, "CREATE_QUOTATION") && (
            <button className="btn btn-primary" onClick={() => openCreate("quotation", { customer_id: id })}><Icon name="plus" size={14} /> New quotation</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI label="Projects" value={stats.projects.length} sub="all active" />
        <KPI label="AMC contracts" value={stats.amcs.length} sub={`${fmtMoney(stats.amcs.reduce((a, b) => a + b.value, 0))} annual`} />
        <KPI label="Repair Services" value={stats.repairs.length} sub={stats.repairs.filter(r => r.state !== "Resolved").length + " open"} />
        <KPI label="Sites" value={sites.length} sub={c.region || "UAE"} />
      </div>

      <div className="seg seg-block" style={{ marginBottom: 20, maxWidth: 560 }}>
        <button data-on={String(tab === "overview")} onClick={() => setTab("overview")}>Overview</button>
        <button data-on={String(tab === "projects")} onClick={() => setTab("projects")}>Jobs · {stats.projects.length}</button>
        <button data-on={String(tab === "amc")} onClick={() => setTab("amc")}>AMC · {stats.amcs.length}</button>
        <button data-on={String(tab === "comms")} onClick={() => setTab("comms")}>Timeline</button>
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
          <section className="card card-pad">
            <div className="row between" style={{ marginBottom: 4 }}>
              <CardHead title={"Sites · " + sites.length} sub="Customer locations under coverage" />
              {can(role, "CREATE_SITE") && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => openCreate("site", { customer_id: id })}>
                  <Icon name="plus" size={12} /> Add site
                </button>
              )}
            </div>
            {sites.length === 0 ? (
              <EmptyState icon="mapPin" title="No sites yet"
                sub="Add a site to start tracking work at this customer's locations." />
            ) : (
              <div className="col gap-2">
                {sites.map(s => (
                  <div key={s.id} onClick={() => go("sites", { id: s.id })}
                    role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go("sites", { id: s.id }); } }}
                    className="row gap-3"
                    style={{ padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-muted)", cursor: "pointer" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--pri-100)", color: "var(--pri-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="mapPin" size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "var(--t-body-md)" }} className="truncate">{s.name}</div>
                      <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }} className="truncate">
                        {[s.area, s.emirate].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <Icon name="chevronRight" size={14} style={{ color: "var(--ink-quiet)" }} />
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="card card-pad">
            <CardHead title="Account owner" />
            <div className="row gap-3" style={{ padding: "8px 0" }}>
              <span className={"avatar avatar-md avatar-" + (owner.tint || "primary")}>{owner.initials}</span>
              <div style={{ flex: 1 }}>
                <div style={{ font: "var(--t-body-md)" }}>{owner.name}</div>
                <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{ROLE_LABELS[owner.role]}</div>
                <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 4 }}>{owner.email} · {owner.phone}</div>
              </div>
            </div>
            <hr className="divider" />
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {c.tags.map(t => <span key={t} className="badge">{t}</span>)}
            </div>
          </section>
        </div>
      )}

      {tab === "projects" && (
        stats.projects.length === 0 ? (
          <EmptyState icon="briefcase" title="No active Projects" sub={c.name + " has no projects on file."} />
        ) : (
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {stats.projects.map(p => (
              <div key={p.id} className="card card-hover card-pad" onClick={() => openProject(p.id)}>
                <div className="row between">
                  <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>{p.code}</span>
                  <StatusBadge state={p.status} />
                </div>
                <div style={{ font: "var(--t-body-md)", marginTop: 8 }}>{p.name}</div>
                <div className="row between" style={{ marginTop: 12 }}>
                  <span className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{fmtMoney(p.value, { compact: true })}</span>
                  <span className="numeric" style={{ font: "var(--t-small)", fontWeight: 600 }}>{p.progress}%</span>
                </div>
                <div className="progress" style={{ marginTop: 6 }}><div style={{ width: p.progress + "%" }} /></div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "amc" && (
        stats.amcs.length === 0 ? (
          <EmptyState icon="shieldCheck" title="No AMC contracts" sub="This customer isn't on a maintenance contract yet."
            action={can(role, "CREATE_AMC")
              ? <button className="btn btn-primary" onClick={() => openCreate("amc", { customer_id: id })}>Quote AMC</button>
              : undefined} />
        ) : (
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {stats.amcs.map(a => (
              <div key={a.id} className="card card-hover card-pad" onClick={() => openAmc(a.id)}>
                <div className="row between">
                  <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>{a.code}</span>
                  <StatusBadge state={a.contract_status} />
                </div>
                <div style={{ font: "var(--t-body-md)", marginTop: 8 }}>{db.site(a.site)?.name ?? "-"}</div>
                <div className="row between" style={{ marginTop: 12 }}>
                  <span className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{a.services.done}/{a.services.total} services</span>
                  <span className="numeric" style={{ font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(a.value, { compact: true })}</span>
                </div>
                <div className="progress" style={{ marginTop: 6 }}><div style={{ width: (a.services.done / a.services.total) * 100 + "%" }} /></div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "comms" && (
        comms.length === 0 ? (
          <EmptyState icon="messageCircle" title="No comms recorded yet"
            sub="Channel touches will surface here as WhatsApp, email, site visits and system events accumulate." />
        ) : (
          <div className="card card-pad">
            <CardHead title="Communication timeline" sub="Unified across WhatsApp, email, site visits, payments, system events" />
            <div className="col" style={{ gap: 14, marginTop: 8 }}>
              {comms.map((m, i) => <CommRow key={m.id} m={m} last={i === comms.length - 1} />)}
            </div>
          </div>
        )
      )}
    </div>
  );
}
