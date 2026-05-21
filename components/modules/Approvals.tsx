"use client";
// ============================================================
// Approvals module - queue + chain config view
// (Ported from modules/approvals.jsx)
// ============================================================

import { Fragment, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import type { Approval } from "@/lib/types";
import {
  EmptyState, FilterBar, KPI, PageHeader,
} from "../shared";

function ApprovalQueueCard({ ap, onClick }: { ap: Approval; onClick: () => void }) {
  const { fmtMoney } = useApp();
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
    <div className="card card-hover" onClick={onClick}
      style={{
        padding: 18,
        borderLeft: ap.priority === "high" ? "3px solid var(--pri-500)" : "1px solid var(--border)",
        paddingLeft: ap.priority === "high" ? 15 : 18,
      }}>
      <div className="row between">
        <div className="row gap-2">
          <span className={"badge " + kindCls}>{ap.kind}</span>
          <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>{ap.code}</span>
          {ap.priority === "high" && <span className="badge badge-danger">High</span>}
        </div>
        <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{ap.openedAt}</span>
      </div>
      <div style={{ font: "var(--t-body-md)", marginTop: 8, color: "var(--ink)" }}>{ap.context}</div>
      <div className="row gap-2" style={{ marginTop: 8 }}>
        <span className={"avatar avatar-sm avatar-" + (requester.tint || "primary")}>{requester.initials}</span>
        <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {requester.name}
          {ap.amount ? <> · <span className="numeric" style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtMoney(ap.amount)}</span></> : ""}
        </span>
      </div>
      <div className="row gap-1" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
        <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Chain</span>
        <div style={{ flex: 1 }} className="row gap-1">
          {ap.chain.map((s, i) => {
            const u = db.user(s.user);
            return (
              <Fragment key={s.step}>
                <div title={u.name + " · " + s.state} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: "var(--r-pill)",
                  background: s.state === "approved" ? "var(--suc-50)" : s.state === "pending" ? "var(--pri-50)" : "var(--bg-muted)",
                  border: "1px solid " + (s.state === "approved" ? "var(--suc-100)" : s.state === "pending" ? "var(--pri-200)" : "var(--border)"),
                  opacity: s.state === "queued" ? 0.6 : 1,
                  font: "var(--t-micro)",
                  color: s.state === "approved" ? "var(--suc-700)" : s.state === "pending" ? "var(--pri-700)" : "var(--ink-mute)",
                }}>
                  <span className={"avatar avatar-sm avatar-" + (u.tint || "primary")} style={{ width: 18, height: 18, fontSize: 9, border: "none" }}>{u.initials}</span>
                  <span style={{ fontWeight: 600 }}>{u.name.split(" ")[0]}</span>
                  {s.state === "approved" && <Icon name="check" size={11} />}
                  {s.state === "pending" && <span className="dot dot-primary" />}
                </div>
                {i < ap.chain.length - 1 && <Icon name="chevronRight" size={12} style={{ color: "var(--ink-quiet)" }} />}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChainConfig() {
  const CHAINS = [
    { type: "Quotation", cond: "Value < AED 50K", steps: ["sales (Sales Mgr)"] },
    { type: "Quotation", cond: "AED 50K – 200K", steps: ["sales (Sales Mgr)", "manager (Ops Mgr)"] },
    { type: "Quotation", cond: "> AED 200K", steps: ["sales (Sales Mgr)", "manager (Ops Mgr)", "md (MD)"] },
    { type: "AMC Reactivation", cond: "Any", steps: ["manager (assigned)"] },
    { type: "AMC Block Override", cond: "Any", steps: ["md (MD)"] },
    { type: "Material Request", cond: "< AED 5K", steps: ["lead_worker (Lead)"] },
    { type: "Material Request", cond: "≥ AED 5K", steps: ["lead_worker (Lead)", "manager (Ops Mgr)"] },
    { type: "Overtime Request", cond: "Any", steps: ["lead_worker (Lead)", "manager (Ops Mgr)"] },
    { type: "Variation Order", cond: "Any", steps: ["manager (Ops Mgr)", "md (MD)"] },
    { type: "Subcontractor Payment", cond: "Any", steps: ["manager", "accounts", "md"] },
    { type: "Leave Request", cond: "Any", steps: ["lead_worker (Lead)", "manager (Ops Mgr)"] },
    { type: "Invoice Approval", cond: "Any", steps: ["accounts", "manager (Ops Mgr)"] },
  ];
  return (
    <>
      <PageHeader title="Approval chain configuration"
        sub="Define who approves what. Chains are admin-configured; the system resolves the actual approver dynamically using the requester's scope (team, manager, customer assignment)."
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> Add chain</button>} />
      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th style={{ width: 200 }}>Approval type</th><th style={{ width: 180 }}>Conditions</th><th>Chain</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {CHAINS.map((c, i) => (
                <tr key={i}>
                  <td data-th="Type"><span style={{ font: "var(--t-body-md)" }}>{c.type}</span></td>
                  <td data-th="Conditions" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{c.cond}</td>
                  <td data-th="Chain">
                    <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                      {c.steps.map((s, j) => (
                        <Fragment key={j}>
                          <span className="badge badge-outline">{s}</span>
                          {j < c.steps.length - 1 && <Icon name="chevronRight" size={12} style={{ color: "var(--ink-quiet)" }} />}
                        </Fragment>
                      ))}
                    </div>
                  </td>
                  <td><button className="btn btn-ghost btn-icon btn-sm"><Icon name="pen" size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function Approvals() {
  const { openApproval, setModal } = useApp();
  const [filter, setFilter] = useState<"pending" | "all" | "config">("pending");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const all = Object.values(db.APPROVALS);
  const list = kindFilter === "all" ? all : all.filter(a => a.kind === kindFilter);
  const kinds = Array.from(new Set(all.map(a => a.kind)));

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Workflow" title="Approvals"
        sub="Universal approval router · admin-configured chains · dynamic approver resolution."
        right={
          <div className="seg hide-mobile">
            <button data-on={String(filter === "pending")} onClick={() => setFilter("pending")}>Awaiting me · {all.length}</button>
            <button data-on={String(filter === "all")} onClick={() => setFilter("all")}>All</button>
            <button data-on={String(filter === "config")} onClick={() => setFilter("config")}>Chain config</button>
          </div>
        }
      />

      {filter === "config" ? <ChainConfig /> : (
        <>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
            <KPI accent="primary" label="Awaiting you" value={all.length} />
            <KPI label="High priority" value={all.filter(a => a.priority === "high").length} />
            <KPI label="Avg cycle time" value="2h 14m" trend="up" sub="↓ 28% MoM" />
            <KPI label="Approved this week" value="42" />
          </div>

          <div className="card card-pad" style={{ padding: 14, marginBottom: 16 }}>
            <FilterBar value={kindFilter} onChange={setKindFilter}
              options={[{ value: "all", label: "All kinds" }, ...kinds.map(k => ({ value: k, label: k }))]} />
          </div>

          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
            <div className="col gap-3">
              {list.map(a => (
                <ApprovalQueueCard key={a.id} ap={a} onClick={() =>
                  a.kind === "AMC Reactivation"
                    ? setModal({ kind: "reactivation", data: { id: a.target.id } })
                    : openApproval(a.id)} />
              ))}
              {list.length === 0 && <EmptyState icon="inbox" title="All caught up" sub="No approvals awaiting your action." />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
