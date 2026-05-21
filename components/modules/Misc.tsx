"use client";
// ============================================================
// Remaining modules - scheduling, projects, repair, inventory,
// logistics, team, reports, livefeed, admin
// (Ported from modules/misc.jsx)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db, ROLE_LABELS, isCoreOperationalRole } from "@/lib/db";
import { can, listScopeFor } from "@/lib/permissions";
import {
  deleteUser, updateProject,
  PROJECT_STATUSES, PROJECT_STAGES,
  PROJECT_STATUS_LABEL, PROJECT_STAGE_LABEL,
  type ProjectStatus, type ProjectStage,
} from "@/lib/create";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Project, User } from "@/lib/types";
import {
  CardHead, ChoicePill, EmptyState, FeedItem, FilterBar, KPI, PageHeader, RowMenu, StatusBadge, WoCard,
} from "../shared";

/* ─── Scheduling ───────────────────────────────────────── */
export function Scheduling() {
  const { openWO, openCreate, role } = useApp();
  const hours: number[] = [];
  for (let h = 7; h <= 19; h++) hours.push(h);
  const wos = Object.values(db.WORK_ORDERS).filter(w => w.scheduledStart.startsWith("2025-05-16"));
  const leads = Array.from(new Set(wos.map(w => w.assignedLead)));

  const colorMap = (type: string) => {
    if (type === "AMC") return { bg: "var(--pri-100)", bar: "var(--pri-500)", ink: "var(--pri-700)" };
    if (type === "PROJECT") return { bg: "var(--info-100)", bar: "var(--info-500)", ink: "var(--info-700)" };
    if (type === "REPAIR") return { bg: "var(--warn-100)", bar: "var(--warn-500)", ink: "var(--warn-700)" };
    if (type === "DELIVERY") return { bg: "var(--bg-muted)", bar: "var(--ink-quiet)", ink: "var(--ink-mute)" };
    if (type === "SURVEY") return { bg: "var(--sec-100)", bar: "var(--sec-500)", ink: "var(--sec-700)" };
    return { bg: "var(--bg-muted)", bar: "var(--ink-quiet)", ink: "var(--ink-mute)" };
  };

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Today · 16 May" title="Scheduling & dispatch"
        sub="Unified calendar · drag-drop on desktop, tap-to-select on mobile · conflict detection live."
        right={
          <div className="row gap-2">
            <div className="seg hide-mobile">
              <button data-on="true">Day</button>
              <button>Week</button>
              <button>Month</button>
            </div>
            {can(role, "CREATE_WORK_ORDER") && (
              <button className="btn btn-primary" onClick={() => openCreate("workorder")}><Icon name="plus" size={14} /> Schedule WO</button>
            )}
          </div>
        }
      />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Today" value={wos.length} sub="scheduled WOs" />
        <KPI label="In progress" value={wos.filter(w => w.status === "in_progress").length} />
        <KPI label="Crew on duty" value={leads.length} sub={leads.length + " leads · 7 techs"} />
        <KPI label="Conflicts" value="0" sub="all clear" trend="up" />
      </div>

      <div className="card card-pad">
        <div className="row" style={{ gap: 0, paddingBottom: 8, borderBottom: "1px solid var(--divider)", marginBottom: 14 }}>
          <div style={{ width: 200, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
            {hours.map(h => (
              <div key={h} className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{h}:00</div>
            ))}
          </div>
        </div>

        {leads.map(uid => {
          const u = db.user(uid);
          const myWOs = wos.filter(w => w.assignedLead === uid);
          return (
            <div key={uid} className="row" style={{ gap: 0, marginBottom: 10 }}>
              <div className="row gap-2" style={{ width: 200, flexShrink: 0, paddingRight: 12 }}>
                <span className={"avatar avatar-" + (u.tint || "primary")}>{u.initials}</span>
                <div>
                  <div style={{ font: "var(--t-small)", fontWeight: 600 }} className="truncate">{u.name}</div>
                  <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{ROLE_LABELS[u.role]}</div>
                </div>
              </div>
              <div style={{ flex: 1, position: "relative", height: 56, background: "var(--bg-muted)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${hours.length}, 1fr)`, pointerEvents: "none" }}>
                  {hours.map((_, i) => <div key={i} style={{ borderRight: "1px solid var(--bg-elev)" }} />)}
                </div>
                {myWOs.map(w => {
                  const sh = parseInt(w.scheduledStart.split("T")[1].slice(0, 2));
                  const sm = parseInt(w.scheduledStart.split("T")[1].slice(3, 5));
                  const eh = parseInt(w.scheduledEnd.split("T")[1].slice(0, 2));
                  const em = parseInt(w.scheduledEnd.split("T")[1].slice(3, 5));
                  const start = sh + sm / 60 - 7;
                  const end = eh + em / 60 - 7;
                  const left = (start / hours.length) * 100;
                  const width = ((end - start) / hours.length) * 100;
                  const c = colorMap(w.type);
                  return (
                    <div key={w.id} onClick={() => openWO(w.id)} style={{
                      position: "absolute",
                      left: `${left}%`, width: `calc(${width}% - 4px)`,
                      top: 6, bottom: 6,
                      background: c.bg, color: c.ink,
                      borderLeft: "3px solid " + c.bar,
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer", overflow: "hidden",
                      display: "flex", flexDirection: "column", justifyContent: "center",
                    }}>
                      <div className="truncate" style={{ font: "var(--t-small)", fontWeight: 600 }}>{w.title}</div>
                      <div className="truncate" style={{ font: "var(--t-micro)", opacity: 0.7 }}>{w.code} · {db.cust(w.customer)?.name ?? "-"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Projects ─────────────────────────────────────────── */
function ProjectCard({ p, onClick }: { p: Project; onClick: () => void }) {
  const { fmtMoney } = useApp();
  const cust = db.cust(p.customer);
  const mgr = db.user(p.manager);
  return (
    <div className="card card-hover card-pad" onClick={onClick}>
      <div className="row between">
        <span className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>{p.code}</span>
        <StatusBadge state={p.status} />
      </div>
      <div style={{ font: "var(--t-h4)", marginTop: 8 }}>{p.name}</div>
      <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>{cust?.name ?? "-"}</div>
      <div className="row between" style={{ marginTop: 14 }}>
        <span className="numeric" style={{ font: "var(--t-small)" }}>{fmtMoney(p.value, { compact: true })}</span>
        <span className="numeric" style={{ font: "var(--t-small)", fontWeight: 600 }}>{p.progress}%</span>
      </div>
      <div className="progress" style={{ marginTop: 6 }}><div style={{ width: p.progress + "%" }} /></div>
      <div className="row between" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
        <div className="row gap-2">
          <span className={"avatar avatar-sm avatar-" + (mgr.tint || "primary")}>{mgr.initials}</span>
          <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{p.stage}</span>
        </div>
        <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Due {p.dueAt.slice(5).replace("-", "/")}</span>
      </div>
    </div>
  );
}

// Dismissable filter chip used at the top of ProjectsList when the URL
// scopes the view (?manager=me or ?team=<id>). Composes with the status
// tab strip — clearing the chip drops only its own param.
function ScopeChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 10px", borderRadius: "var(--r-pill)",
      background: "var(--pri-50)", color: "var(--pri-700)",
      border: "1px solid var(--pri-200)",
      font: "var(--t-small)", fontWeight: 500,
    }}>
      <Icon name="filter" size={12} />
      Filtered: {label}
      <button onClick={onClear} aria-label="Clear filter"
        style={{
          background: "transparent", border: 0, padding: 0, marginLeft: 4,
          color: "var(--pri-700)", cursor: "pointer", display: "inline-flex",
        }}>
        <Icon name="x" size={12} />
      </button>
    </span>
  );
}

// URL ?status= keys → ProjectStatus enum. Keep the URL keys readable
// ("upcoming"/"active") and decoupled from the DB enum so we can rename
// either side independently.
type ProjectTab = "all" | "upcoming" | "active" | "on_hold" | "completed" | "cancelled";
const PROJECT_TABS: ProjectTab[] = ["all", "upcoming", "active", "on_hold", "completed", "cancelled"];
const PROJECT_TAB_LABEL: Record<ProjectTab, string> = {
  all: "All",
  upcoming: "Upcoming",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};
const PROJECT_TAB_STATUS: Record<Exclude<ProjectTab, "all">, ProjectStatus> = {
  upcoming: "planned",
  active: "in_progress",
  on_hold: "on_hold",
  completed: "completed",
  cancelled: "cancelled",
};
const PROJECT_TAB_EMPTY: Record<ProjectTab, { title: string; sub?: string }> = {
  all: { title: "No Main Contractor jobs yet", sub: 'Click "+ New Main Contractor Job" to create your first one.' },
  upcoming: { title: "No upcoming jobs", sub: 'Plan ahead - create a job with status "Planned".' },
  active: { title: "No active jobs right now" },
  on_hold: { title: "No jobs on hold" },
  completed: { title: "No completed jobs yet" },
  cancelled: { title: "No cancelled jobs" },
};

export function ProjectsList() {
  const { openProject, openCreate, fmtMoney, me, role } = useApp();
  const router = useRouter();
  const search = useSearchParams();
  const scope = listScopeFor(role, "projects");
  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Engineering" title="Main Contractor Jobs" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Main Contractor Jobs are visible to Operations Manager, Admin, MD, and Lead Technicians." />
      </div>
    );
  }

  // /projects with no ?status= param → Active by default. We honour the
  // spec's URL scheme for every other tab (e.g. ?status=on_hold) and use
  // ?status=all for the explicit "All" tab so refresh/bookmark behaves
  // consistently - bare /projects always resolves to the default.
  const rawTab = search?.get("status") ?? "";
  const tab: ProjectTab = (PROJECT_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as ProjectTab)
    : "active";

  // Scope filters that compose on top of the status tab.
  //   ?manager=me  → only my projects (dashboard "See all" deep-link)
  //   ?team=<id>   → only projects belonging to a given team (lead worker)
  const managerScope = search?.get("manager") === "me";
  const teamScope = search?.get("team") ?? null;

  const setTab = (next: ProjectTab) => {
    const params = new URLSearchParams(search?.toString() ?? "");
    if (next === "active") params.delete("status");
    else params.set("status", next);
    const qs = params.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects");
  };

  const clearManagerScope = () => {
    const params = new URLSearchParams(search?.toString() ?? "");
    params.delete("manager");
    const qs = params.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects");
  };
  const clearTeamScope = () => {
    const params = new URLSearchParams(search?.toString() ?? "");
    params.delete("team");
    const qs = params.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects");
  };

  // Apply the scope filters FIRST so the per-tab counts reflect "what's
  // available within my scope" rather than the whole org.
  //
  // Role scope (lib/permissions.ts):
  //   - manager / admin / md → all projects
  //   - lead_worker          → projects where they are the assigned Lead Tech
  //                            (projects.lead_tech_id, migration 0018)
  //                            OR have an active WO assignment on the project.
  //                            Either path keeps the list non-empty: a Lead can
  //                            create WOs the moment they're assigned to a job,
  //                            rather than waiting for a WO to assign them in.
  const allProjects = Object.values(db.PROJECTS);
  const scoped = useMemo(() => {
    let list = allProjects;
    if (scope === "mine") {
      const myProjectIds = new Set(
        Object.values(db.WORK_ORDERS)
          .filter(w => w.assigned?.includes(me.id) && w.source.kind === "project")
          .map(w => w.source.id)
      );
      list = list.filter(p => p.leadTechId === me.id || myProjectIds.has(p.id));
    }
    if (managerScope) list = list.filter(p => p.manager === me.id);
    if (teamScope) list = list.filter(p => p.team === teamScope);
    return list;
  }, [allProjects, scope, managerScope, teamScope, me.id]);

  const [q, setQ] = useState("");

  // Counts per tab - recompute whenever the underlying project list
  // changes (a create/delete bumps dataVersion which re-renders us).
  const counts = useMemo(() => {
    const c: Record<ProjectTab, number> = {
      all: scoped.length, upcoming: 0, active: 0, on_hold: 0, completed: 0, cancelled: 0,
    };
    for (const p of scoped) {
      const status = p.status as ProjectStatus;
      if (status === "planned") c.upcoming++;
      else if (status === "in_progress") c.active++;
      else if (status === "on_hold") c.on_hold++;
      else if (status === "completed") c.completed++;
      else if (status === "cancelled") c.cancelled++;
    }
    return c;
  }, [scoped]);

  const filtered = useMemo(() => {
    const byTab = tab === "all"
      ? scoped
      : scoped.filter(p => p.status === PROJECT_TAB_STATUS[tab]);
    const needle = q.trim().toLowerCase();
    if (!needle) return byTab;
    return byTab.filter(p =>
      p.name.toLowerCase().includes(needle) ||
      p.code.toLowerCase().includes(needle),
    );
  }, [scoped, tab, q]);

  const scopeActive = managerScope || teamScope;
  const headerTitle = managerScope ? "My Main Contractor Jobs" : "Main Contractor Jobs";

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Engineering" title={headerTitle}
        sub="Full installation contracts — supply, design, T&C"
        right={can(role, "CREATE_PROJECT")
          ? <button className="btn btn-primary" onClick={() => openCreate("project")}><Icon name="plus" size={14} /> New Main Contractor Job</button>
          : undefined} />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active" value={counts.active} />
        <KPI label="Value in flight" value={fmtMoney(scoped.reduce((a, b) => a + b.value, 0), { compact: true })} />
        <KPI label="On hold" value={counts.on_hold} sub="paused / blocking" trend="down" />
        <KPI label="Variation orders" value="4" sub="this month" />
      </div>

      {scopeActive && (
        <div className="row gap-2" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {managerScope && (
            <ScopeChip label={`My jobs · ${scoped.length}`} onClear={clearManagerScope} />
          )}
          {teamScope && (
            <ScopeChip label={`Team · ${db.TEAMS[teamScope]?.name ?? teamScope} · ${scoped.length}`} onClear={clearTeamScope} />
          )}
        </div>
      )}

      <div className="card card-pad" style={{ padding: 16, marginBottom: 16 }}>
        <FilterBar<ProjectTab>
          value={tab}
          onChange={setTab}
          options={PROJECT_TABS.map(t => ({ value: t, label: PROJECT_TAB_LABEL[t], count: counts[t] }))}
        />
        <div className="row gap-3" style={{ flexWrap: "wrap", marginTop: 12 }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm" placeholder="Search Main Contractor jobs…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {filtered.length === 0
        ? (
          <EmptyState
            icon="briefcase"
            title={q.trim() ? "No matching jobs" : PROJECT_TAB_EMPTY[tab].title}
            sub={q.trim() ? `Nothing matches "${q.trim()}" in this tab.` : PROJECT_TAB_EMPTY[tab].sub}
            action={tab === "all" && !q.trim() && can(role, "CREATE_PROJECT")
              ? <button className="btn btn-primary" onClick={() => openCreate("project")}><Icon name="plus" size={14} /> New Main Contractor Job</button>
              : undefined}
          />
        )
        : (
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
            {filtered.map(p => <ProjectCard key={p.id} p={p} onClick={() => openProject(p.id)} />)}
          </div>
        )}
    </div>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const { go, openWO, openCreate, openCustomer, fmtMoney, fireToast, bumpData, dataVersion, role, me } = useApp();
  // Subscribe to dataVersion so a status/stage change re-renders the badge.
  void dataVersion;
  const p = db.proj(id);
  if (!p) return <EmptyState icon="alertCircle" title="Main Contractor job not found"
    action={<button className="btn btn-primary" onClick={() => go("projects")}>Back</button>} />;
  const cust = db.cust(p.customer);
  const site = db.site(p.site);
  const wos = db.byProject(id).wos;
  // Lead Tech assignment (migration 0018). Operations Manager / Admin / MD
  // can reassign here; everyone else sees the name as read-only text. The
  // CREATE_PROJECT permission gates write access — same as job creation.
  const canEditLead = can(role, "CREATE_PROJECT");
  // "+ Create Work Order" button — admin/MD/manager always; the assigned
  // Lead Tech also (they staff the WO crew). Other lead_workers don't see
  // it on a project they're not running.
  const isAssignedLead = role === "lead_worker" && p.leadTechId === me.id;
  const canCreateWo = canEditLead || isAssignedLead;
  const leadTechOptions = useMemo(
    () => Object.values(db.USERS).filter(u => u.role === "lead_worker"),
    [dataVersion],
  );

  // History reloader handle - refetch after each successful update so the
  // newly-inserted audit row appears without a page refresh.
  const [historyTick, setHistoryTick] = useState(0);

  const onChangeStatus = async (next: ProjectStatus) => {
    if (next === p.status) return;
    const prev = p.status as ProjectStatus;
    // Optimistic: mutate the in-memory mirror so the pill updates instantly.
    db.PROJECTS[id] = { ...p, status: next };
    bumpData();
    const res = await updateProject(id, { status: next });
    if (!res.ok) {
      db.PROJECTS[id] = { ...p, status: prev };
      bumpData();
      fireToast(`Couldn't update status: ${res.error}`);
      return;
    }
    fireToast(`Status → ${PROJECT_STATUS_LABEL[next]}`);
    setHistoryTick(t => t + 1);
  };

  const onChangeStage = async (next: ProjectStage) => {
    if (next === p.stage) return;
    const prev = p.stage as ProjectStage;
    db.PROJECTS[id] = { ...p, stage: next };
    bumpData();
    const res = await updateProject(id, { stage: next });
    if (!res.ok) {
      db.PROJECTS[id] = { ...p, stage: prev };
      bumpData();
      fireToast(`Couldn't update stage: ${res.error}`);
      return;
    }
    fireToast(`Stage → ${PROJECT_STAGE_LABEL[next]}`);
    setHistoryTick(t => t + 1);
  };

  const onChangeLeadTech = async (nextId: string) => {
    if (nextId === p.leadTechId) return;
    const prevId = p.leadTechId;
    db.PROJECTS[id] = { ...p, leadTechId: nextId };
    bumpData();
    const res = await updateProject(id, { lead_tech_id: nextId || null });
    if (!res.ok) {
      db.PROJECTS[id] = { ...p, leadTechId: prevId };
      bumpData();
      fireToast(`Couldn't reassign Lead: ${res.error}`);
      return;
    }
    const nextUser = nextId ? db.user(nextId) : null;
    fireToast(nextUser ? `Lead Tech → ${nextUser.name}` : "Lead Tech cleared");
  };

  const statusOptions = PROJECT_STATUSES.map(s => ({
    value: s, label: PROJECT_STATUS_LABEL[s], cls: STATUS_PILL_CLS[s],
  }));
  const stageOptions = PROJECT_STAGES.map(s => ({
    value: s, label: PROJECT_STAGE_LABEL[s],
  }));

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => go("projects")} style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All Main Contractor Jobs
        </a>
      </div>
      <PageHeader eyebrow={"Main Contractor Job · " + p.code} title={p.name} sub={[cust?.name, site?.name].filter(Boolean).join(" · ") || "-"}
        right={
          <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            <ChoicePill<ProjectStatus>
              ariaLabel="Job status"
              value={p.status as ProjectStatus}
              options={statusOptions}
              onChange={onChangeStatus}
            />
            <ChoicePill<ProjectStage>
              ariaLabel="Job stage"
              value={p.stage as ProjectStage}
              options={stageOptions}
              onChange={onChangeStage}
            />
          </div>
        } />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Contract value" value={fmtMoney(p.value, { compact: true })} />
        <KPI label="Progress" value={p.progress + "%"}>
          <div className="progress" style={{ marginTop: 8 }}><div style={{ width: p.progress + "%" }} /></div>
        </KPI>
        <KPI label="Stage" value={PROJECT_STAGE_LABEL[p.stage as ProjectStage] ?? p.stage} />
        <KPI label="Due" value={p.dueAt} />
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <section className="card card-pad">
          <CardHead title="Milestones" sub="Standard UAE payment-term ladder" />
          <div style={{ position: "relative", paddingTop: 12, paddingBottom: 12 }}>
            <div style={{ position: "absolute", left: 22, top: 32, bottom: 32, width: 2, background: "var(--divider)" }} />
            <div className="col" style={{ gap: 12 }}>
              {p.milestones.map(m => (
                <div key={m.id} className="row gap-3">
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: m.done ? "var(--suc-500)" : "var(--bg-elev)",
                    border: m.done ? "none" : "2px solid var(--border-strong)",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, zIndex: 1,
                  }}>
                    {m.done
                      ? <Icon name="check" size={20} strokeWidth={2.5} />
                      : <span style={{ font: "600 12px/1", color: "var(--ink-mute)" }} className="numeric">{m.pct}%</span>}
                  </div>
                  <div style={{
                    flex: 1, padding: 12,
                    background: m.done ? "var(--suc-50)" : "var(--bg-muted)",
                    borderRadius: "var(--r-md)",
                    border: "1px solid " + (m.done ? "var(--suc-100)" : "var(--border)"),
                  }}>
                    <div style={{ font: "var(--t-body-md)" }}>{m.name}</div>
                    <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
                      {m.done ? "Completed" : "Pending"} · payment at {m.pct}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card card-pad">
          <CardHead title="Team & metadata" />
          <div className="col gap-3">
            <LeadTechRow
              leadTechId={p.leadTechId}
              canEdit={canEditLead}
              leadTechOptions={leadTechOptions}
              onChange={onChangeLeadTech}
            />
            <div className="row between"><span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Started</span><span className="numeric" style={{ font: "var(--t-small)" }}>{p.startedAt}</span></div>
            <div className="row between"><span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Due</span><span className="numeric" style={{ font: "var(--t-small)" }}>{p.dueAt}</span></div>
            <div className="row between"><span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Customer</span>
              {cust
                ? <a onClick={() => openCustomer(p.customer)} style={{ font: "var(--t-small)", cursor: "pointer", color: "var(--pri-700)" }}>{cust.name}</a>
                : <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>-</span>}
            </div>
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <CardHead
          title={"Work orders · " + wos.length}
          right={canCreateWo ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openCreate("workorder", {
                source_kind: "project",
                source_id: id,
                customer_id: p.customer,
                site_id: p.site || undefined,
              })}
            >
              <Icon name="plus" size={13} /> Create Work Order
            </button>
          ) : undefined}
        />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {wos.map(w => <WoCard key={w.id} wo={w} compact onClick={() => openWO(w.id)} />)}
          {wos.length === 0 && (
            <EmptyState
              icon="briefcase"
              title="No work orders yet"
              action={canCreateWo ? (
                <button
                  className="btn btn-primary"
                  onClick={() => openCreate("workorder", {
                    source_kind: "project",
                    source_id: id,
                    customer_id: p.customer,
                    site_id: p.site || undefined,
                  })}
                >
                  <Icon name="plus" size={14} /> Create Work Order
                </button>
              ) : undefined}
            />
          )}
        </div>
      </section>

      <ProjectStatusHistory projectId={id} reloadKey={historyTick} />
    </div>
  );
}

/* ─── Lead Tech row (used by ProjectDetail; mirrored in Amc.tsx) ─── */
// Renders the assigned Lead Technician with an inline reassign dropdown
// for users who can write the parent record. Operations Manager / Admin /
// MD get the editable Select; everyone else sees a read-only label, even
// the Lead Tech themselves — per spec, only Operations Manager can change
// who's running execution on a job.
function LeadTechRow({
  leadTechId, canEdit, leadTechOptions, onChange,
}: {
  leadTechId: string;
  canEdit: boolean;
  leadTechOptions: User[];
  onChange: (id: string) => void;
}) {
  const leadTech = leadTechId ? db.user(leadTechId) : null;
  return (
    <div className="row gap-3" style={{ padding: 10, background: "var(--bg-muted)", borderRadius: "var(--r-md)" }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11,
        background: "var(--sec-100)", color: "var(--sec-700)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name="hardHat" size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Lead Technician
        </div>
        {canEdit ? (
          <select
            className="input input-sm"
            value={leadTechId}
            onChange={e => onChange(e.target.value)}
            style={{ marginTop: 4, width: "100%" }}
          >
            <option value="">— Unassigned —</option>
            {leadTechOptions.map(u => (
              <option key={u.id} value={u.id}>{u.name} · {ROLE_LABELS[u.role]}</option>
            ))}
          </select>
        ) : (
          <div style={{ font: "var(--t-body-md)", marginTop: 3 }}>
            {leadTech ? `${leadTech.name} · ${ROLE_LABELS[leadTech.role]}` : "— Unassigned —"}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Project status / stage helpers ─────────────────── */

const STATUS_PILL_CLS: Record<ProjectStatus, string> = {
  planned: "badge-info",
  in_progress: "badge-primary",
  on_hold: "badge-warning",
  completed: "badge-success",
  cancelled: "badge-danger",
};

/* ─── Project status history ─────────────────────────── */

interface HistoryRow {
  id: string;
  old_status: ProjectStatus | null;
  new_status: ProjectStatus;
  old_stage: ProjectStage | null;
  new_stage: ProjectStage | null;
  changed_by: string | null;
  changed_at: string;
}

function ProjectStatusHistory({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const { data, error } = await supabaseBrowser()
        .from("project_status_history")
        .select("id, old_status, new_status, old_stage, new_stage, changed_by, changed_at")
        .eq("project_id", projectId)
        .order("changed_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) { setError(error.message); setRows([]); return; }
      setRows((data ?? []) as HistoryRow[]);
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  const visible = useMemo(() => {
    if (!rows) return [];
    return showAll ? rows : rows.slice(0, 20);
  }, [rows, showAll]);

  return (
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <CardHead title="Status history" sub="Every status / stage change with actor and timestamp" />
      {rows === null ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>
      ) : error ? (
        <div style={{ font: "var(--t-small)", color: "var(--dan-700)", padding: 8 }}>Couldn't load history: {error}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="clock" title="No changes yet"
          sub="Change the status or stage above - every change is recorded here." />
      ) : (
        <>
          <div className="col" style={{ gap: 8 }}>
            {visible.map(r => <HistoryEntry key={r.id} row={r} />)}
          </div>
          {rows.length > 20 && !showAll && (
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>
                View all {rows.length} entries
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function HistoryEntry({ row }: { row: HistoryRow }) {
  const actor = row.changed_by ? db.user(row.changed_by) : null;
  const when = formatHistoryDate(row.changed_at);
  const statusChanged = row.old_status !== row.new_status;
  const stageChanged = row.old_stage !== row.new_stage && row.old_stage !== null;

  return (
    <div className="row gap-3" style={{
      padding: 10, background: "var(--bg-muted)",
      borderRadius: "var(--r-md)", border: "1px solid var(--border)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--bg-elev)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon name="clock" size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--t-body-md)" }}>
          {statusChanged && (
            <>
              Status <span style={{ color: "var(--ink-mute)" }}>
                {row.old_status ? PROJECT_STATUS_LABEL[row.old_status] : "-"}
              </span> → <strong>{PROJECT_STATUS_LABEL[row.new_status]}</strong>
            </>
          )}
          {statusChanged && stageChanged && <span style={{ color: "var(--ink-quiet)" }}> · </span>}
          {stageChanged && row.new_stage && (
            <>
              Stage <span style={{ color: "var(--ink-mute)" }}>
                {row.old_stage ? PROJECT_STAGE_LABEL[row.old_stage] : "-"}
              </span> → <strong>{PROJECT_STAGE_LABEL[row.new_stage]}</strong>
            </>
          )}
        </div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
          {actor ? actor.name : "Unknown user"} · {when}
        </div>
      </div>
    </div>
  );
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ─── Repair ──────────────────────────────────────────── */
export function Repair() {
  const { openCreate, role, me } = useApp();
  const scope = listScopeFor(role, "repairs");
  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Service support" title="Repair tickets" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Repair tickets are visible to Operations Manager, Admin, MD, Service Support, and Lead Technicians." />
      </div>
    );
  }
  const everything = Object.values(db.REPAIRS);
  // lead_worker sees repairs where they are the assigned Lead Tech
  // (repair_tickets.lead_tech_id, migration 0018) OR have an active WO
  // assignment on the ticket. Either path keeps the list non-empty so
  // they can spawn WOs without waiting to be assigned to one first.
  const all = scope === "all"
    ? everything
    : (() => {
        const myRepairIds = new Set(
          Object.values(db.WORK_ORDERS)
            .filter(w => w.assigned?.includes(me.id) && w.source.kind === "repair")
            .map(w => w.source.id)
        );
        return everything.filter(r => r.leadTechId === me.id || myRepairIds.has(r.id));
      })();
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Service support" title="Repair tickets" sub="Own products + 3rd-party · multi-visit · SLA-tracked"
        right={can(role, "CREATE_REPAIR")
          ? <button className="btn btn-primary" onClick={() => openCreate("repair")}><Icon name="plus" size={14} /> Log ticket</button>
          : undefined} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Open" value={all.filter(t => t.state !== "Resolved").length} />
        <KPI label="SLA at risk" value="2" trend="down" />
        <KPI label="Avg TAT" value="3.2h" />
        <KPI label="Repeat-failure" value="1" sub="CAM-B-204" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Code</th>
                <th>Title</th>
                <th className="hide-mobile">Customer · Site</th>
                <th className="hide-mobile" style={{ width: 140 }}>Classification</th>
                <th className="hide-mobile" style={{ width: 100 }}>SLA</th>
                <th style={{ width: 110 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {all.map(t => {
                const c = db.cust(t.customer);
                const s = db.site(t.site);
                const slaPct = (t.sla.elapsed / t.sla.target) * 100;
                return (
                  <tr key={t.id}>
                    <td data-th="Code" className="numeric" style={{ fontFamily: "var(--font-mono)", font: "var(--t-small)", color: "var(--ink-mute)" }}>{t.code}</td>
                    <td data-th="Title">
                      <div style={{ font: "var(--t-body-md)" }}>{t.title}</div>
                      {t.flagged && <span className="badge badge-danger" style={{ marginTop: 4 }}>{t.flagged}</span>}
                    </td>
                    <td data-th="Customer" className="hide-mobile">
                      <div style={{ font: "var(--t-small)" }}>{c?.name ?? "-"}</div>
                      <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{s?.name ?? "-"}</div>
                    </td>
                    <td data-th="Class" className="hide-mobile"><span className="badge badge-outline">{t.classification}</span></td>
                    <td data-th="SLA" className="hide-mobile">
                      <div className={"progress" + (slaPct > 85 ? " progress-warning" : " progress-success") + " progress-thin"}>
                        <div style={{ width: Math.min(100, slaPct) + "%" }} />
                      </div>
                      <div className="numeric" style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginTop: 4 }}>{t.sla.elapsed}/{t.sla.target}m</div>
                    </td>
                    <td data-th="State"><StatusBadge state={t.state} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Inventory ───────────────────────────────────────── */
export function Inventory() {
  const { openCreate, fmtMoney, role } = useApp();
  const all = db.INVENTORY;
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Materials" title="Inventory"
        sub="Central · vehicle · site stock · BOQ reconciliation · serial number tracking."
        right={can(role, "CREATE_MATERIAL_REQUEST")
          ? <button className="btn btn-primary" onClick={() => openCreate("material_request")}><Icon name="plus" size={14} /> Material request</button>
          : undefined} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Stock value" value={fmtMoney(all.reduce((a, b) => a + b.value, 0), { compact: true })} />
        <KPI label="SKUs tracked" value={all.length} />
        <KPI label="Low stock" value={all.filter(i => i.central <= i.reorderAt).length} trend="down" />
        <KPI label="In transit" value="2" sub="from supplier" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>SKU</th><th>Item</th><th className="hide-mobile" style={{ width: 90 }}>Central</th><th className="hide-mobile" style={{ width: 90 }}>Vehicles</th><th className="hide-mobile" style={{ width: 80 }}>Sites</th><th style={{ width: 120 }}>Status</th></tr></thead>
            <tbody>
              {all.map(i => {
                const low = i.central <= i.reorderAt;
                return (
                  <tr key={i.id}>
                    <td data-th="SKU" className="numeric" style={{ fontFamily: "var(--font-mono)", font: "var(--t-small)", color: "var(--ink-mute)" }}>{i.sku}</td>
                    <td data-th="Item">{i.name}</td>
                    <td data-th="Central" className="hide-mobile numeric" style={{ fontWeight: 600 }}>{i.central}</td>
                    <td data-th="Vehicles" className="hide-mobile numeric">{i.vehicles}</td>
                    <td data-th="Sites" className="hide-mobile numeric">{i.sites}</td>
                    <td data-th="Status">
                      {low
                        ? <span className="badge badge-warning"><span className="dot dot-warning" /> Reorder</span>
                        : <span className="badge badge-success"><span className="dot dot-success" /> OK</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Logistics ───────────────────────────────────────── */
export function Logistics() {
  const { openWO, openCreate, role } = useApp();
  const deliveries = Object.values(db.WORK_ORDERS).filter(w => w.type === "DELIVERY");
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Drivers & vehicles" title="Logistics"
        sub="Material delivery work orders · pickup tasks · vehicle stock."
        right={can(role, "CREATE_WORK_ORDER")
          ? <button className="btn btn-primary" onClick={() => openCreate("delivery")}><Icon name="plus" size={14} /> New delivery</button>
          : undefined} />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="In transit" value={deliveries.filter(d => d.status === "in_progress").length} />
        <KPI label="Today's deliveries" value={deliveries.length} />
        <KPI label="Vehicles" value="3" sub="2 active" />
        <KPI label="On time %" value="96%" trend="up" />
      </div>
      <div className="card card-pad">
        <CardHead title="Delivery work orders" />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {deliveries.map(w => <WoCard key={w.id} wo={w} compact onClick={() => openWO(w.id)} />)}
        </div>
      </div>
    </div>
  );
}

/* ─── Team ────────────────────────────────────────────── */
function UserCard({ u }: { u: User }) {
  const myWOs = Object.values(db.WORK_ORDERS).filter(w => w.assigned && w.assigned.includes(u.id));
  const activeWO = myWOs.find(w => w.status === "in_progress");
  return (
    <div className="card card-hover card-pad">
      <div className="row gap-3">
        <span className={"avatar avatar-lg avatar-" + (u.tint || "primary")}>{u.initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--t-body-md)" }} className="truncate">{u.name}</div>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{ROLE_LABELS[u.role]}</div>
        </div>
        {activeWO
          ? <span className="badge badge-success"><span className="dot dot-success dot-pulse" /> Live</span>
          : <span className="badge badge-outline">Idle</span>}
      </div>
      {u.skills.length > 0 && (
        <div className="row gap-2" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {u.skills.map(s => <span key={s} className="badge">{s}</span>)}
        </div>
      )}
      <div className="row between" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
        <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{myWOs.length} WOs · 32h this week</span>
        <button className="btn btn-ghost btn-icon btn-sm"><Icon name="messageCircle" size={13} /></button>
      </div>
    </div>
  );
}
export function Team() {
  const { openCreate, dataVersion } = useApp();
  void dataVersion;
  // Operational workforce only — see lib/db.ts for the CORE/OPTIONAL/PLATFORM
  // breakdown. Filters out super_admin (platform role) AND optional roles
  // (sales / estimator / service_support) which aren't part of Installtec's
  // day-to-day team today. When the Access Control panel lands, this filter
  // will read enabled roles per-org instead.
  const users = useMemo(
    () => Object.values(db.USERS).filter(u => isCoreOperationalRole(u.role)),
    [dataVersion],
  );
  const subcontractors = users.filter(u => u.role === "subcontractor").length;
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Workforce" title="Team"
        sub="Skill tags · availability calendar · capacity heatmap."
        right={<button className="btn btn-primary" onClick={() => openCreate("team_member")}><Icon name="plus" size={14} /> Add member</button>} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active staff" value={users.length} />
        <KPI label="Utilisation" value="87%" trend="up" />
        <KPI label="Subcontractors" value={subcontractors} />
        <KPI label="On leave today" value="0" />
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {users.map(u => <UserCard key={u.id} u={u} />)}
      </div>
    </div>
  );
}

/* ─── Reports ─────────────────────────────────────────── */
export function Reports() {
  const { fmtMoney } = useApp();
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Analytics" title="Reports" sub="Job, technician, customer, operational reporting." />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="MTD revenue" value={fmtMoney(1_280_000, { compact: true })} sub="8.2% vs LM" trend="up" />
        <KPI label="Avg WO cost" value={fmtMoney(2840)} sub="margin 38%" />
        <KPI label="Free-call conversion" value="62%" trend="up" />
        <KPI label="Customer rating" value="4.6 ★" />
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
        <section className="card card-pad">
          <CardHead title="Revenue trend · 12 weeks" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 200 }}>
            {[42, 55, 48, 62, 58, 70, 66, 82, 75, 88, 92, 100].map((h, i) => (
              <div key={i} style={{
                flex: 1, height: h + "%",
                background: "linear-gradient(to top, var(--pri-500), var(--pri-300))",
                borderRadius: "6px 6px 0 0",
                opacity: i === 11 ? 1 : 0.85,
              }} />
            ))}
          </div>
        </section>
        <section className="card card-pad">
          <CardHead title="Margin by stream" />
          <div className="col gap-3">
            {[{ k: "Main Contractor", v: 38, c: "var(--pri-500)" }, { k: "AMC", v: 52, c: "var(--sec-500)" }, { k: "Repair", v: 28, c: "var(--acc-500)" }].map(r => (
              <div key={r.k}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ font: "var(--t-small)" }}>{r.k}</span>
                  <span className="numeric" style={{ font: "var(--t-small)", fontWeight: 600 }}>{r.v}%</span>
                </div>
                <div className="progress"><div style={{ width: r.v + "%", background: r.c }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Live feed (full page) ──────────────────────────── */
export function LiveFeed() {
  const { followTarget } = useApp();
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Realtime" title="Live operations feed"
        sub="Every event from the field, in order. Scope-filtered to your jobs."
        right={<div className="seg"><button data-on="true">All</button><button>Check-ins</button><button>SLA</button><button>Approvals</button></div>}
      />
      <div className="card" style={{ padding: 8 }}>
        {db.FEED.map(f => <FeedItem key={f.id} item={f} onClick={() => followTarget(f.target)} />)}
      </div>
    </div>
  );
}

/* ─── Admin (users) ──────────────────────────────────── */
// Real Supabase UUIDs match this; the mock id format (u_xxxxxx) won't.
// We use this to dedupe rows that are present under both a stale mock id
// and a hydrated UUID (e.g. created in one mode, refreshed in the other).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Admin() {
  const { openCreate, bumpData, fireToast, me, dataVersion } = useApp();
  void dataVersion; // re-read db.USERS whenever a create/delete bumps the version

  // Scope to the operational users this admin governs:
  //   - hide super_admin and admin (they're managed at the platform level)
  //   - hide self
  //   - scope to the same organization (multi-tenant - admin only sees their org's people)
  //   - dedupe by email; prefer the row whose id is a real Supabase UUID
  const visible = useMemo<User[]>(() => {
    const seen = new Map<string, User>();
    for (const u of Object.values(db.USERS)) {
      if (u.role === "super_admin" || u.role === "admin") continue;
      if (u.id === me.id) continue;
      if (me.organization_id && u.organization_id && u.organization_id !== me.organization_id) continue;
      const key = u.email.toLowerCase();
      const prev = seen.get(key);
      if (!prev || (UUID_RE.test(u.id) && !UUID_RE.test(prev.id))) {
        seen.set(key, u);
      }
    }
    return Array.from(seen.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, me.organization_id, dataVersion]);

  const all = visible;
  const [busyId, setBusyId] = useState<string | null>(null);

  const onDelete = async (u: User) => {
    if (u.id === me.id) { fireToast("You can't delete your own account."); return; }
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    setBusyId(u.id);
    const res = await deleteUser(u.id);
    setBusyId(null);
    if (res.ok) { bumpData(); fireToast(`${u.name} removed.`); }
    else fireToast(res.error);
  };

  return (
    <div className="main-pad">
      <PageHeader eyebrow="System administration" title="My team"
        sub="Operational users you've onboarded - technicians, leads, drivers, sales, accounts. Other Admins are managed by Super Admin."
        right={<button className="btn btn-primary" onClick={() => openCreate("user")}><Icon name="plus" size={14} /> New user</button>} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active users" value={all.length} />
        <KPI label="Roles in use" value="11" />
        <KPI label="Teams" value={Object.keys(db.TEAMS).length} />
        <KPI label="2FA enabled" value="9 / 12" trend="down" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>User</th><th>Role</th><th className="hide-mobile">Manager</th><th className="hide-mobile">Region</th><th style={{ width: 100 }}>Status</th><th style={{ width: 60 }}></th></tr></thead>
            <tbody>
              {all.map(u => {
                const mgr = u.mgr ? db.user(u.mgr) : null;
                const isBusy = busyId === u.id;
                const isSelf = u.id === me.id;
                return (
                  <tr key={u.id} style={{ opacity: isBusy ? 0.5 : 1 }}>
                    <td data-th="User">
                      <div className="row gap-3">
                        <span className={"avatar avatar-sm avatar-" + (u.tint || "primary")}>{u.initials}</span>
                        <div><div style={{ font: "var(--t-body-md)" }}>{u.name}</div><div style={{ font: "var(--t-micro)", color: "var(--ink-mute)" }}>{u.email}</div></div>
                      </div>
                    </td>
                    <td data-th="Role"><span className="badge badge-outline">{ROLE_LABELS[u.role]}</span></td>
                    <td data-th="Manager" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{mgr ? mgr.name : "-"}</td>
                    <td data-th="Region" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{u.region}</td>
                    <td data-th="Status"><span className="badge badge-success"><span className="dot dot-success" /> Active</span></td>
                    <td>
                      <RowMenu
                        disabled={isBusy}
                        items={[
                          {
                            label: "Delete user",
                            icon: "trash",
                            destructive: true,
                            disabled: isSelf,
                            hint: isSelf ? "You can't delete your own account" : undefined,
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
      </div>
    </div>
  );
}
