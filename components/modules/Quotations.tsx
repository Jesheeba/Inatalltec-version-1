"use client";
// ============================================================
// Quotations module (Phase 11, minimal)
//
// CRUD list of quotations. Each row carries title + customer + value +
// a status pill (draft → sent → accepted → converted, with rejected as
// a side branch). Status changes go through updateQuotationStatus().
// Convert action creates the downstream project or AMC via the same
// helpers the create modals use, then flips status to 'converted'
// with the FK populated.
//
// Permission: admin / md / manager / sales. Same allowlist as the RLS
// quote_write policy from migration 0028.
// ============================================================

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { updateQuotationStatus, convertQuotation } from "@/lib/create";
import {
  EmptyState, FilterBar, KPI, PageHeader, SignOutButton,
} from "../shared";
import type { Quotation, QuotationStatus } from "@/lib/types";

const ALLOWED_WRITE = new Set<string>(["admin", "md", "manager", "sales"]);
const ALLOWED_READ  = new Set<string>(["admin", "md", "manager", "sales", "accounts", "estimator"]);

const STATUS_OPTIONS: QuotationStatus[] = ["draft", "sent", "accepted", "rejected", "converted"];
const STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "Draft", sent: "Sent", accepted: "Accepted",
  rejected: "Rejected", converted: "Converted",
};
const STATUS_PILL_CLS: Record<QuotationStatus, string> = {
  draft:     "badge-outline",
  sent:      "badge-primary",
  accepted:  "badge-success",
  rejected:  "badge-warning",
  converted: "badge-violet",
};

export function Quotations() {
  const { role, openCreate, fmtMoney, fireToast, bumpData, openProject, openAmc, dataVersion } = useApp();
  void dataVersion;
  const canWrite = ALLOWED_WRITE.has(role);

  if (!ALLOWED_READ.has(role)) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Sales" title="Quotations" right={<SignOutButton />} />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Quotations are managed by MD / Admin / Operations Manager / Sales." />
      </div>
    );
  }

  type Filter = QuotationStatus | "all";
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [convertTarget, setConvertTarget] = useState<{ id: string; target: "project" | "amc" } | null>(null);

  const all = useMemo(
    () => Object.values(db.QUOTATIONS).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: all.length, draft: 0, sent: 0, accepted: 0, rejected: 0, converted: 0 };
    for (const x of all) c[x.status] = (c[x.status] || 0) + 1;
    return c;
  }, [all]);

  let list = all;
  if (filter !== "all") list = list.filter(x => x.status === filter);
  if (q.trim()) {
    const lq = q.toLowerCase();
    list = list.filter(x =>
      x.code.toLowerCase().includes(lq)
      || x.title.toLowerCase().includes(lq)
      || (db.cust(x.customerId ?? "")?.name ?? "").toLowerCase().includes(lq)
    );
  }

  const totalValue = list.reduce((s, x) => s + (x.valueAed || 0), 0);

  const onStatusChange = async (quotation: Quotation, next: QuotationStatus) => {
    if (next === quotation.status) return;
    if (next === "converted") {
      fireToast("Use the Convert button to flip to converted.");
      return;
    }
    const res = await updateQuotationStatus(quotation.id, next);
    if (!res.ok) { fireToast(`Couldn't update: ${res.error}`); return; }
    fireToast(`${quotation.code} → ${STATUS_LABEL[next]}`);
    bumpData();
  };

  const onConvert = async () => {
    if (!convertTarget) return;
    const res = await convertQuotation(convertTarget.id, convertTarget.target);
    if (!res.ok) { fireToast(res.error); return; }
    fireToast(`Quotation converted to ${convertTarget.target === "project" ? "project" : "AMC"}`);
    bumpData();
    setConvertTarget(null);
    if (convertTarget.target === "project") openProject(res.targetId);
    else openAmc(res.targetId);
  };

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Sales" title="Quotations"
        sub="Quick tracker — title, value, status, convert"
        right={
          <div className="row gap-2">
            {canWrite && (
              <button className="btn btn-primary" onClick={() => openCreate("quotation_v2")}>
                <Icon name="plus" size={14} /> New quotation
              </button>
            )}
            <SignOutButton />
          </div>
        } />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Total quotations" value={all.length} />
        <KPI label="Accepted" value={counts.accepted} />
        <KPI label="Converted" value={counts.converted} />
        <KPI label="Pipeline value (filtered)" value={fmtMoney(totalValue, { compact: true })}
             sub={`${list.length} row${list.length === 1 ? "" : "s"} in view`} />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm" placeholder="Search code, title, customer…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <FilterBar<Filter> value={filter} onChange={setFilter} options={[
            { value: "all",       label: "All",       count: counts.all },
            { value: "draft",     label: "Draft",     count: counts.draft },
            { value: "sent",      label: "Sent",      count: counts.sent },
            { value: "accepted",  label: "Accepted",  count: counts.accepted },
            { value: "rejected",  label: "Rejected",  count: counts.rejected },
            { value: "converted", label: "Converted", count: counts.converted },
          ]} />
        </div>
      </div>

      {list.length === 0 ? (
        all.length === 0 ? (
          <EmptyState icon="fileText" title="No quotations yet"
            sub={canWrite
              ? "Click + New quotation to track your first quote."
              : "Quotations will appear here once Sales logs them."} />
        ) : (
          <EmptyState icon="fileText" title="No quotations match"
            sub="Try a different filter or clear the search." />
        )
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Customer</th>
                  <th style={{ textAlign: "right" }}>Value</th>
                  <th>Status</th>
                  <th>Valid until</th>
                  <th style={{ width: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map(x => {
                  const cust = x.customerId ? db.cust(x.customerId) : null;
                  return (
                    <tr key={x.id}>
                      <td style={{ font: "var(--t-small)", fontWeight: 600 }}>{x.code}</td>
                      <td style={{ font: "var(--t-small)" }}>{x.title}</td>
                      <td style={{ font: "var(--t-small)" }}>{cust?.name ?? "—"}</td>
                      <td className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>
                        {fmtMoney(x.valueAed, { compact: true })}
                      </td>
                      <td>
                        {canWrite && x.status !== "converted" ? (
                          <select className="input input-sm"
                                  value={x.status}
                                  onChange={e => onStatusChange(x, e.target.value as QuotationStatus)}
                                  style={{ width: "auto", display: "inline-block" }}>
                            {STATUS_OPTIONS.filter(s => s !== "converted").map(s => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`badge ${STATUS_PILL_CLS[x.status]}`}>{STATUS_LABEL[x.status]}</span>
                        )}
                      </td>
                      <td className="numeric" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                        {x.validUntil ?? "—"}
                      </td>
                      <td>
                        {canWrite && x.status === "accepted" && !x.convertedToProjectId && !x.convertedToAmcId && (
                          <div className="row gap-1">
                            <button className="btn btn-primary btn-sm"
                                    onClick={() => setConvertTarget({ id: x.id, target: "project" })}>
                              → Project
                            </button>
                            <button className="btn btn-ghost btn-sm"
                                    onClick={() => setConvertTarget({ id: x.id, target: "amc" })}>
                              → AMC
                            </button>
                          </div>
                        )}
                        {x.convertedToProjectId && (
                          <button className="btn btn-ghost btn-sm" onClick={() => openProject(x.convertedToProjectId!)}>
                            View project <Icon name="arrowRight" size={12} />
                          </button>
                        )}
                        {x.convertedToAmcId && (
                          <button className="btn btn-ghost btn-sm" onClick={() => openAmc(x.convertedToAmcId!)}>
                            View AMC <Icon name="arrowRight" size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {convertTarget && (
        <div className="modal-back" onClick={() => setConvertTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: 24 }}>
              <div style={{ font: "var(--t-h3)", marginBottom: 8 }}>
                Convert to {convertTarget.target === "project" ? "Main Contractor Job" : "AMC contract"}?
              </div>
              <div style={{ font: "var(--t-body)", color: "var(--ink-mute)", marginBottom: 20 }}>
                A new {convertTarget.target === "project" ? "project" : "AMC"} will be created using this
                quotation's title, customer, and value. The quotation will be marked as Converted and
                you'll be taken to the new record.
              </div>
              <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setConvertTarget(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={onConvert}>
                  <Icon name="check" size={14} /> Confirm convert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
