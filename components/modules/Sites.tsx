"use client";
// ============================================================
// Sites module — list + detail.
//
// Sites are the physical locations under a customer. They're not just
// a free-text field on a work order — every WO / AMC / Repair / Main
// Contractor Job points back at a site row, and operations needs to
// see "everything happening at THIS location" in one place.
//
// Data flow:
//   - SitesList reads db.SITES (server-hydrated) → filters by ?customer=
//     and a search box → renders a table.
//   - SiteDetail renders KPIs + linked-entity sections by filtering
//     the in-memory mirrors. No per-detail fetch — we trust hydration.
//   - Create / edit / delete write through lib/create.ts (createSite,
//     updateSite, deleteSite) → Supabase → mirror updates in place.
// ============================================================

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { deleteSite } from "@/lib/create";
import { can, listScopeFor } from "@/lib/permissions";
import type { Site } from "@/lib/types";
import {
  CardHead, EmptyState, KPI, PageHeader,
} from "../shared";

/* ─── List ─────────────────────────────────────────────── */
export function SitesList() {
  const { openCreate, fireToast, bumpData, dataVersion, role, me } = useApp();
  void dataVersion; // re-render after every site write
  const router = useRouter();
  const params = useSearchParams();
  const customerFilter = params?.get("customer") || "";
  const [q, setQ] = useState("");
  const scope = listScopeFor(role, "sites");

  const all = useMemo(() => {
    if (scope === "hidden") return [];
    const everything = Object.values(db.SITES).filter(s => s.is_active !== false);
    if (scope === "all") return everything;
    // workers/drivers see only sites they have active WO assignments at.
    const mySiteIds = new Set(
      Object.values(db.WORK_ORDERS)
        .filter(w => w.assigned?.includes(me.id) && w.site)
        .map(w => w.site)
    );
    return everything.filter(s => mySiteIds.has(s.id));
  }, [dataVersion, scope, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Relationships" title="Sites" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Sites are visible to Operations Manager, Admin, MD, Lead Technicians, and field crew with site assignments." />
      </div>
    );
  }

  const filtered = useMemo(() => {
    let list = all;
    if (customerFilter) list = list.filter(s => s.customer === customerFilter);
    const lq = q.trim().toLowerCase();
    if (lq) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(lq) ||
        (s.area || "").toLowerCase().includes(lq) ||
        (s.address_line_1 || "").toLowerCase().includes(lq) ||
        (db.cust(s.customer)?.name || "").toLowerCase().includes(lq)
      );
    }
    return list;
  }, [all, customerFilter, q]);

  const clearCustomerFilter = () => router.replace("/sites");
  const customers = Object.values(db.CUSTOMERS);
  const activeCustomer = customerFilter ? db.cust(customerFilter) : null;

  return (
    <div className="main-pad">
      <PageHeader
        eyebrow="Relationships"
        title="Sites"
        sub="All customer locations where work is delivered"
        right={can(role, "CREATE_SITE")
          ? <button className="btn btn-primary"
              onClick={() => openCreate("site", customerFilter ? { customer_id: customerFilter } : undefined)}>
              <Icon name="plus" size={14} /> New site
            </button>
          : undefined}
      />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active sites" value={all.length} />
        <KPI label="Customers covered" value={new Set(all.map(s => s.customer)).size} />
        <KPI label="With contact details" value={all.filter(s => s.contact_name || s.contact_phone).length} sub="for field crew" />
      </div>

      {activeCustomer && (
        <div className="row gap-2" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          <span className="badge"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px" }}>
            Customer · {activeCustomer.name} · {filtered.length}
            <button onClick={clearCustomerFilter}
              className="btn btn-ghost btn-icon btn-sm"
              style={{ padding: 0, height: 18, width: 18, minHeight: "auto" }}
              aria-label="Clear customer filter">
              <Icon name="x" size={12} />
            </button>
          </span>
        </div>
      )}

      <div className="card card-pad" style={{ padding: 16, marginBottom: 16 }}>
        <div className="row gap-3" style={{ flexWrap: "wrap" }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm" placeholder="Search by site, city, or customer…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select
            className="input input-sm"
            style={{ maxWidth: 260 }}
            value={customerFilter}
            onChange={e => {
              const v = e.target.value;
              router.replace(v ? `/sites?customer=${encodeURIComponent(v)}` : "/sites");
            }}
            aria-label="Filter by customer"
          >
            <option value="">All customers</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="mapPin"
          title={q.trim() || customerFilter ? "No sites match" : "No sites yet"}
          sub={
            q.trim() || customerFilter
              ? "Try clearing filters or search by another term."
              : "Add a site to start tracking work at specific customer locations."
          }
          action={
            !q.trim() && !customerFilter && can(role, "CREATE_SITE")
              ? <button className="btn btn-primary" onClick={() => openCreate("site")}>
                  <Icon name="plus" size={14} /> New site
                </button>
              : undefined
          }
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Customer</th>
                  <th className="hide-mobile">Address</th>
                  <th className="hide-mobile">City</th>
                  <th className="hide-mobile">Contact</th>
                  <th style={{ width: 80 }}>WOs</th>
                  <th style={{ width: 72 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => <SiteRow key={s.id} s={s} onDelete={() => onDelete(s, fireToast, bumpData)} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

async function onDelete(s: Site, fireToast: (m: string) => void, bumpData: () => void) {
  if (!window.confirm(`Remove site "${s.name}"? It stays linked to past work orders for history.`)) return;
  const res = await deleteSite(s.id);
  if (!res.ok) { fireToast(`Couldn't delete: ${res.error}`); return; }
  fireToast(`Site "${s.name}" archived`);
  bumpData();
}

function SiteRow({ s, onDelete }: { s: Site; onDelete: () => void }) {
  const router = useRouter();
  const cust = db.cust(s.customer);
  const wos = Object.values(db.WORK_ORDERS).filter(w => w.site === s.id);
  const open = () => router.push(`/sites/${s.id}`);
  const openCustomer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cust) router.push(`/customers/${cust.id}`);
  };
  const fullAddress = [s.address_line_1, s.address_line_2].filter(Boolean).join(", ");
  const contact = s.contact_name || s.contact_phone || "—";

  return (
    <tr onClick={open}>
      <td data-th="Site">
        <div style={{ font: "var(--t-body-md)" }}>{s.name}</div>
        {s.emirate && <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{s.emirate}</div>}
      </td>
      <td data-th="Customer">
        {cust ? (
          <a onClick={openCustomer} style={{ cursor: "pointer", color: "var(--pri-700)" }}>
            {cust.name}
          </a>
        ) : "—"}
      </td>
      <td data-th="Address" className="hide-mobile">
        <div className="truncate" style={{ maxWidth: 240, font: "var(--t-small)" }} title={fullAddress || ""}>
          {fullAddress || "—"}
        </div>
      </td>
      <td data-th="City" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
        {s.area || "—"}
      </td>
      <td data-th="Contact" className="hide-mobile" style={{ font: "var(--t-small)" }}>{contact}</td>
      <td data-th="WOs" className="numeric" style={{ font: "var(--t-small)" }}>{wos.length}</td>
      <td onClick={e => e.stopPropagation()} style={{ textAlign: "right" }}>
        <button className="btn btn-ghost btn-icon btn-sm" aria-label="Delete site" onClick={onDelete}>
          <Icon name="trash" size={14} />
        </button>
      </td>
    </tr>
  );
}

/* ─── Detail ───────────────────────────────────────────── */
export function SiteDetail({ id }: { id: string }) {
  const { go, openCreate, openProject, openAmc, openWO, fireToast, bumpData, dataVersion } = useApp();
  void dataVersion;
  const s = db.site(id);
  if (!s) {
    return (
      <EmptyState icon="alertCircle" title="Site not found"
        action={<button className="btn btn-primary" onClick={() => go("sites")}>Back to sites</button>} />
    );
  }
  const cust = db.cust(s.customer);
  const projects = Object.values(db.PROJECTS).filter(p => p.site === id);
  const amcs     = Object.values(db.AMCS).filter(a => a.site === id);
  const wos      = Object.values(db.WORK_ORDERS).filter(w => w.site === id);
  const repairs  = Object.values(db.REPAIRS).filter(r => r.site === id);
  const openRepairs = repairs.filter(r => r.state !== "Resolved").length;
  const activeJobs  = projects.filter(p => p.status === "in_progress" || p.status === "planned").length;
  const activeAmcs  = amcs.filter(a => a.contract_status === "active").length;

  const onDelete = async () => {
    if (!window.confirm(`Archive site "${s.name}"? Existing work orders keep their reference.`)) return;
    const res = await deleteSite(id);
    if (!res.ok) { fireToast(`Couldn't delete: ${res.error}`); return; }
    fireToast(`Site "${s.name}" archived`);
    bumpData();
    go("sites");
  };

  const onEdit = () => openCreate("site", { id, ...siteToPrefill(s) });

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => go("sites")}
          style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All sites
        </a>
      </div>
      <PageHeader
        eyebrow="Site"
        title={s.name}
        sub={[cust?.name, s.area, s.emirate].filter(Boolean).join(" · ") || "—"}
        right={
          <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={onEdit}>
              <Icon name="pen" size={14} /> Edit
            </button>
            <button className="btn btn-ghost" onClick={onDelete}>
              <Icon name="trash" size={14} /> Archive
            </button>
          </div>
        }
      />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Work orders" value={wos.length} sub="total at this site" />
        <KPI label="Active jobs" value={activeJobs} sub={`${projects.length} total`} />
        <KPI label="Active AMCs" value={activeAmcs} sub={`${amcs.length} total`} />
        <KPI label="Open repairs" value={openRepairs} sub={`${repairs.length} total`} />
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <section className="card card-pad">
          <CardHead title="Site overview" sub="Address, contact, and access notes" />
          <div className="col gap-3">
            <KvRow k="Customer" v={
              cust
                ? <a onClick={() => go("customers", { id: cust.id })}
                    style={{ cursor: "pointer", color: "var(--pri-700)" }}>{cust.name}</a>
                : "—"
            } />
            <KvRow k="Address" v={[s.address_line_1, s.address_line_2].filter(Boolean).join(", ") || "—"} />
            <KvRow k="City" v={s.area || "—"} />
            <KvRow k="Emirate" v={s.emirate || "—"} />
            <KvRow k="GPS" v={
              typeof s.geo_lat === "number" && typeof s.geo_lng === "number"
                ? <span className="numeric">{s.geo_lat.toFixed(5)}, {s.geo_lng.toFixed(5)}</span>
                : "—"
            } />
          </div>
        </section>

        <section className="card card-pad">
          <CardHead title="Contact" sub="On-site point of contact" />
          <div className="col gap-3">
            <KvRow k="Name" v={s.contact_name || "—"} />
            <KvRow k="Phone" v={s.contact_phone || "—"} />
            <KvRow k="Email" v={s.contact_email || "—"} />
            <KvRow k="Access notes" v={s.access || "—"} multiline />
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <CardHead title={"Projects · " + projects.length} />
        {projects.length === 0 ? (
          <EmptyState icon="briefcase" title="No jobs at this site yet" />
        ) : (
          <div className="col gap-2">
            {projects.map(p => (
              <div key={p.id} onClick={() => openProject(p.id)} className="row gap-3"
                role="button" tabIndex={0}
                style={{ padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-muted)", cursor: "pointer" }}>
                <span className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{p.code}</span>
                <div style={{ flex: 1, font: "var(--t-body-md)" }} className="truncate">{p.name}</div>
                <span className="badge">{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <CardHead title={"AMC contracts · " + amcs.length} />
        {amcs.length === 0 ? (
          <EmptyState icon="shieldCheck" title="No AMC contracts cover this site" />
        ) : (
          <div className="col gap-2">
            {amcs.map(a => (
              <div key={a.id} onClick={() => openAmc(a.id)} className="row gap-3"
                role="button" tabIndex={0}
                style={{ padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-muted)", cursor: "pointer" }}>
                <span className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{a.code}</span>
                <div style={{ flex: 1, font: "var(--t-body-md)" }} className="truncate">
                  {db.cust(a.customer)?.name ?? "—"}
                </div>
                <span className="badge">{a.contract_status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <CardHead title={"Work orders · " + wos.length} sub="Most recent first" />
        {wos.length === 0 ? (
          <EmptyState icon="briefcase" title="No work orders at this site yet" />
        ) : (
          <div className="col gap-2">
            {wos.slice(0, 10).map(w => (
              <div key={w.id} onClick={() => openWO(w.id)} className="row gap-3"
                role="button" tabIndex={0}
                style={{ padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-muted)", cursor: "pointer" }}>
                <span className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{w.code}</span>
                <div style={{ flex: 1, font: "var(--t-body-md)" }} className="truncate">{w.title}</div>
                <span className="badge">{w.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KvRow({ k, v, multiline }: { k: string; v: React.ReactNode; multiline?: boolean }) {
  return (
    <div className={multiline ? "" : "row between"} style={multiline ? { display: "flex", flexDirection: "column", gap: 4 } : { gap: 12 }}>
      <span style={{ font: "var(--t-small)", color: "var(--ink-mute)", flexShrink: 0 }}>{k}</span>
      <span style={{ font: "var(--t-body-md)", textAlign: multiline ? "left" : "right" }}>{v}</span>
    </div>
  );
}

function siteToPrefill(s: Site) {
  return {
    customer_id: s.customer,
    name: s.name,
    address_line_1: s.address_line_1 ?? "",
    address_line_2: s.address_line_2 ?? "",
    area: s.area ?? "",
    emirate: s.emirate ?? "",
    contact_name: s.contact_name ?? "",
    contact_phone: s.contact_phone ?? "",
    contact_email: s.contact_email ?? "",
    access_instructions: s.access ?? "",
    geo_lat: typeof s.geo_lat === "number" ? s.geo_lat : undefined,
    geo_lng: typeof s.geo_lng === "number" ? s.geo_lng : undefined,
  };
}
