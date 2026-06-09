"use client";
// ============================================================
// Remaining modules - scheduling, projects, repair, inventory,
// logistics, team, reports, livefeed, admin
// (Ported from modules/misc.jsx)
// ============================================================

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db, ROLE_LABELS, isCoreOperationalRole } from "@/lib/db";
import { can, listScopeFor } from "@/lib/permissions";
import { hasWorkerConflict } from "@/lib/conflicts";
import {
  deleteUser, updateProject,
  PROJECT_STATUSES, PROJECT_STAGES,
  PROJECT_STATUS_LABEL, PROJECT_STAGE_LABEL,
  type ProjectStatus, type ProjectStage,
} from "@/lib/create";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatLongDateTime, formatMonthDay } from "@/lib/dates";
import type { Project, User } from "@/lib/types";
import {
  CardHead, ChoicePill, EmptyState, FeedItem, FilterBar, KPI, PageHeader, RowMenu, StatusBadge, WoCard,
} from "../shared";
import {
  AdvancePhaseButton, PhaseBadge, PhaseHistoryTimeline, PhaseStepper,
} from "../PhaseTracker";
import { MaterialRequestsSection } from "./MaterialRequests";

/* ─── Scheduling ───────────────────────────────────────── */
export function Scheduling() {
  const { openWO, openCreate, role, dataVersion } = useApp();
  void dataVersion; // re-render the board whenever WO mirrors change
  const hours: number[] = [];
  for (let h = 7; h <= 19; h++) hours.push(h);

  // Live date scoping — the board keys off the wall clock instead of a
  // hard-coded demo date, so "today" always means the current day. Mirrors
  // the pattern used by the field Dashboard (Dashboard.tsx).
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const eyebrowText = `Today · ${formatMonthDay(now)}`;

  const wos = Object.values(db.WORK_ORDERS).filter(w => w.scheduledStart.startsWith(todayKey));
  const leads = Array.from(new Set(wos.map(w => w.assignedLead)));

  // Distinct on-duty crew today = every lead + assignee on a scheduled WO.
  const crew = new Set<string>();
  for (const w of wos) {
    if (w.assignedLead) crew.add(w.assignedLead);
    for (const a of w.assigned ?? []) crew.add(a);
  }

  // Delivery orders = WOs whose type is DELIVERY (no separate entity exists).
  const deliveries = wos.filter(w => w.type === "DELIVERY");

  // Real conflict count — a WO is in conflict when its assigned lead is
  // double-booked over an overlapping window (see lib/conflicts.ts). Counts
  // each conflicting WO once; excludes itself from the overlap check.
  const conflictCount = wos.filter(w =>
    w.assignedLead && hasWorkerConflict(w.assignedLead, w.scheduledStart, w.scheduledEnd, w.id)
  ).length;

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
      <PageHeader eyebrow={eyebrowText} title="Scheduling & dispatch"
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
        <KPI label="Deliveries" value={deliveries.length} sub={deliveries.length === 1 ? "delivery order" : "delivery orders"} />
        <KPI label="Crew on duty" value={crew.size} sub={leads.length + (leads.length === 1 ? " lead · " : " leads · ") + crew.size + " on duty"} />
        <KPI label="Conflicts" value={conflictCount} sub={conflictCount === 0 ? "all clear" : "needs attention"} trend={conflictCount === 0 ? "up" : "down"} />
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
  all: { title: "No Projects yet", sub: 'Click "+ New Project" to create your first one.' },
  upcoming: { title: "No upcoming projects", sub: 'Plan ahead - create a project with status "Planned".' },
  active: { title: "No active projects right now" },
  on_hold: { title: "No projects on hold" },
  completed: { title: "No completed projects yet" },
  cancelled: { title: "No cancelled projects" },
};

export function ProjectsList() {
  const { openProject, openCreate, fmtMoney, me, role } = useApp();
  const router = useRouter();
  const search = useSearchParams();
  const scope = listScopeFor(role, "projects");
  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Engineering" title="Projects" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Projects are visible to Operations Manager, Admin, MD, and Lead Technicians." />
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
  const headerTitle = managerScope ? "My Projects" : "Projects";

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Engineering" title={headerTitle}
        sub="Full installation contracts — supply, design, T&C"
        right={can(role, "CREATE_PROJECT")
          ? <button className="btn btn-primary" onClick={() => openCreate("project")}><Icon name="plus" size={14} /> New Project</button>
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
            <input className="input input-sm" placeholder="Search projects…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {filtered.length === 0
        ? (
          <EmptyState
            icon="briefcase"
            title={q.trim() ? "No matching projects" : PROJECT_TAB_EMPTY[tab].title}
            sub={q.trim() ? `Nothing matches "${q.trim()}" in this tab.` : PROJECT_TAB_EMPTY[tab].sub}
            action={tab === "all" && !q.trim() && can(role, "CREATE_PROJECT")
              ? <button className="btn btn-primary" onClick={() => openCreate("project")}><Icon name="plus" size={14} /> New Project</button>
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
  if (!p) return <EmptyState icon="alertCircle" title="Project not found"
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
          <Icon name="chevronLeft" size={14} /> All Projects
        </a>
      </div>
      <PageHeader eyebrow={"Project · " + p.code} title={p.name} sub={[cust?.name, site?.name].filter(Boolean).join(" · ") || "-"}
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

      {/* Phase tracker (migration 0020) — only Main Contractor projects
          have phases. The stepper shows all 6; the badge + advance
          button sit on the right. Hidden controls when role isn't
          allowed to change phases (canChangeProjectPhase). */}
      <section className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="row between" style={{ flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div className="row gap-3" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ font: "var(--t-h3)" }}>Phase</div>
            <PhaseBadge phase={p.currentPhase} showUnset />
          </div>
          <AdvancePhaseButton
            projectId={id}
            currentPhase={p.currentPhase}
            onAdvanced={() => setHistoryTick(t => t + 1)} />
        </div>
        <PhaseStepper phase={p.currentPhase} />
      </section>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Contract value" value={fmtMoney(p.value, { compact: true })} />
        <KPI label="Progress" value={p.progress + "%"}>
          <div className="progress" style={{ marginTop: 8 }}><div style={{ width: p.progress + "%" }} /></div>
        </KPI>
        <KPI label="Stage" value={PROJECT_STAGE_LABEL[p.stage as ProjectStage] ?? p.stage} />
        <KPI label="Due" value={p.dueAt} />
        <ProjectManHoursKpi projectId={id} />
        <ProjectManpowerKpi projectId={id} />
      </div>

      <ProjectQuotationLink projectId={id} />

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
            <div className="row gap-2">
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
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => openCreate("delivery", {
                  source_kind: "project",
                  source_id: id,
                  customer_id: p.customer,
                  site_id: p.site || undefined,
                })}
              >
                <Icon name="truck" size={13} /> Schedule Delivery
              </button>
            </div>
          ) : undefined}
        />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {wos.map(w => <WoCard key={w.id} wo={w} compact onClick={() => openWO(w.id)} />)}
          {wos.length === 0 && (
            <EmptyState
              icon="briefcase"
              title="No work orders yet"
              action={canCreateWo ? (
                <div className="row gap-2">
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
                  <button
                    className="btn btn-ghost"
                    onClick={() => openCreate("delivery", {
                      source_kind: "project",
                      source_id: id,
                      customer_id: p.customer,
                      site_id: p.site || undefined,
                    })}
                  >
                    <Icon name="truck" size={14} /> Schedule Delivery
                  </button>
                </div>
              ) : undefined}
            />
          )}
        </div>
      </section>

      <MaterialRequestsSection
        requests={db.materialRequestsForProject(id)}
        title="Material requests"
        emptyHint="Materials requested by technicians across this project's work orders will appear here." />

      <ProjectStatusHistory projectId={id} reloadKey={historyTick} />

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <CardHead title="Phase history" sub="Every Design → DLP → Closed transition" />
        <PhaseHistoryTimeline projectId={id} reloadKey={historyTick} />
      </section>
    </div>
  );
}

/* ─── Project workforce rollups (Phase 5D.1) ─────────────── */
//
// Total man-hours = worker hours (sum of wo.durationMinutes / 60 across
// every WO on this project — trigger-computed from
// work_order_time_entries, migration 0022) + sub-contractor hours (sum
// of every work_order_sub_contractor_hours entry on those same WOs,
// migration 0026). Subtitle breaks down both streams so accounts can
// see what's worker vs sub. KPI re-renders on dataVersion.
function ProjectManHoursKpi({ projectId }: { projectId: string }) {
  const { dataVersion } = useApp();
  const { workerHrs, subHrs } = useMemo(() => {
    let workerMinutes = 0;
    let subHours = 0;
    const woIds = new Set<string>();
    for (const w of Object.values(db.WORK_ORDERS)) {
      if (w.source.kind !== "project" || w.source.id !== projectId) continue;
      workerMinutes += w.durationMinutes || 0;
      woIds.add(w.id);
    }
    for (const e of Object.values(db.WORK_ORDER_SUB_CONTRACTOR_HOURS)) {
      if (woIds.has(e.workOrderId)) subHours += e.hours;
    }
    return { workerHrs: workerMinutes / 60, subHrs: subHours };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, dataVersion]);
  const total = workerHrs + subHrs;
  return (
    <KPI label="Total man-hours" value={`${total.toFixed(1)} hrs`}
      sub={`${workerHrs.toFixed(1)} team · ${subHrs.toFixed(1)} sub`} />
  );
}

// Migration 0035 — surfaces the auto-generated quotation that was
// created alongside this project (project_id FK on quotations).
// Shows nothing when the project pre-dates 0035 or RLS hides the row.
// Clicking "Open" navigates to /quotations?open=<id> which auto-opens
// the editor on mount.
function ProjectQuotationLink({ projectId }: { projectId: string }) {
  const { go, dataVersion } = useApp();
  void dataVersion;
  const quotation = useMemo(
    () => Object.values(db.QUOTATIONS).find(q => q.projectId === projectId) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, dataVersion],
  );
  if (!quotation) return null;
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <div className="row gap-3" style={{ alignItems: "center" }}>
        <Icon name="fileText" size={18} style={{ color: "var(--pri-700)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
            Quotation · {quotation.code}
          </div>
          <div className="truncate" style={{ font: "var(--t-body-md)", fontWeight: 600 }}>
            {quotation.title}
          </div>
        </div>
        <button className="btn btn-primary btn-sm"
                onClick={() => go("quotations", { open: quotation.id })}>
          Open quotation <Icon name="arrowRight" size={12} />
        </button>
      </div>
    </section>
  );
}

// Manpower = count of distinct users who logged any time entry on any WO
// in this project + count of distinct sub-contractors who logged any
// hours entry on those same WOs. Sub of the KPI carries the breakdown
// so the headline number stays a single digit-or-two for at-a-glance.
function ProjectManpowerKpi({ projectId }: { projectId: string }) {
  const { dataVersion } = useApp();
  const { workers, subs } = useMemo(() => {
    const woIds = new Set<string>();
    for (const w of Object.values(db.WORK_ORDERS)) {
      if (w.source.kind === "project" && w.source.id === projectId) woIds.add(w.id);
    }
    const workerIds = new Set<string>();
    for (const e of Object.values(db.WORK_ORDER_TIME_ENTRIES)) {
      if (e.userId && woIds.has(e.workOrderId)) workerIds.add(e.userId);
    }
    const subIds = new Set<string>();
    for (const e of Object.values(db.WORK_ORDER_SUB_CONTRACTOR_HOURS)) {
      if (woIds.has(e.workOrderId)) subIds.add(e.subContractorId);
    }
    return { workers: workerIds.size, subs: subIds.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, dataVersion]);
  const total = workers + subs;
  return (
    <KPI label="Manpower" value={total}
      sub={`${workers} team member${workers === 1 ? "" : "s"} · ${subs} sub${subs === 1 ? "" : "s"}`} />
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
  return formatLongDateTime(d);
}

/* ─── Repair ──────────────────────────────────────────── */
export function Repair() {
  const { openCreate, role, me } = useApp();
  const router = useRouter();
  const scope = listScopeFor(role, "repairs");
  if (scope === "hidden") {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Service support" title="Repair Services" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Repair Services are visible to Operations Manager, Admin, MD, Service Support, and Lead Technicians." />
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
      <PageHeader eyebrow="Service support" title="Repair Services" sub="Own products + 3rd-party · multi-visit · SLA-tracked"
        right={can(role, "CREATE_REPAIR")
          ? <button className="btn btn-primary" onClick={() => openCreate("repair")}><Icon name="plus" size={14} /> Log service</button>
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
                  <tr key={t.id}
                      onClick={() => router.push(`/repair/${t.id}`)}
                      style={{ cursor: "pointer" }}>
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

/* ─── Repair detail ───────────────────────────────────── */
// Mirrors ProjectDetail / AmcDetail. Lead Tech reassign + create WO from
// repair context + linked WO list. There is no repair_status_history
// table in the schema today, so the status-history section is omitted
// (would need a migration to add — out of scope here).
export function RepairDetail({ id }: { id: string }) {
  const { openWO, openCreate, openCustomer, fireToast, bumpData, dataVersion, role, me } = useApp();
  void dataVersion;
  const router = useRouter();
  const t = db.REPAIRS[id];
  if (!t) {
    return (
      <div className="main-pad">
        <EmptyState icon="alertCircle" title="Repair Service not found"
          action={<button className="btn btn-primary" onClick={() => router.push("/repair")}>Back to repairs</button>} />
      </div>
    );
  }
  const cust = db.cust(t.customer);
  const site = db.site(t.site);
  const wos = Object.values(db.WORK_ORDERS).filter(w => w.source.kind === "repair" && w.source.id === id);

  // Lead Tech assignment — same role gating as Project/AMC: anyone with
  // CREATE_REPAIR can reassign; others see read-only. CREATE_REPAIR is
  // already in lib/permissions.ts.
  const canEditLead = can(role, "CREATE_REPAIR");
  const isAssignedLead = role === "lead_worker" && t.leadTechId === me.id;
  const canCreateWo = canEditLead || isAssignedLead;
  const leadTechOptions = useMemo(
    () => Object.values(db.USERS).filter(u => u.role === "lead_worker"),
    [dataVersion],
  );

  const onChangeLeadTech = async (nextId: string) => {
    if (nextId === t.leadTechId) return;
    const prevId = t.leadTechId;
    db.REPAIRS[id] = { ...t, leadTechId: nextId };
    bumpData();
    const { error } = await supabaseBrowser()
      .from("repair_tickets")
      .update({ lead_tech_id: nextId || null })
      .eq("id", id);
    if (error) {
      db.REPAIRS[id] = { ...t, leadTechId: prevId };
      bumpData();
      fireToast(`Couldn't reassign Lead: ${error.message}`);
      return;
    }
    const nextUser = nextId ? db.user(nextId) : null;
    fireToast(nextUser ? `Lead Tech → ${nextUser.name}` : "Lead Tech cleared");
  };

  const slaPct = (t.sla.elapsed / t.sla.target) * 100;

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => router.push("/repair")}
           style={{ font: "var(--t-small)", color: "var(--ink-mute)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All Repair Services
        </a>
      </div>

      <PageHeader
        eyebrow={"Repair · " + t.code}
        title={t.title}
        sub={[cust?.name, site?.name].filter(Boolean).join(" · ") || "-"}
        right={
          <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            {t.priority === "high" && <span className="badge badge-danger">High priority</span>}
            <StatusBadge state={t.state} />
          </div>
        } />

      {t.flagged && (
        <div className="card card-pad" style={{
          marginBottom: 16,
          background: "var(--dan-50)", borderColor: "var(--dan-100)",
        }}>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <Icon name="alertCircle" size={16} style={{ color: "var(--dan-700)" }} />
            <span style={{ font: "var(--t-body-md)", color: "var(--dan-700)", fontWeight: 600 }}>
              {t.flagged}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Classification" value={t.classification} />
        <KPI label="Visits" value={t.visits} />
        <KPI label="Opened" value={formatLongDateTime(new Date(t.openedAt))} />
        <KPI label="SLA" value={`${t.sla.elapsed}/${t.sla.target}m`}>
          <div className={"progress" + (slaPct > 85 ? " progress-warning" : " progress-success")} style={{ marginTop: 8 }}>
            <div style={{ width: Math.min(100, slaPct) + "%" }} />
          </div>
        </KPI>
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <section className="card card-pad">
          <CardHead title="Team & metadata" />
          <div className="col gap-3">
            <LeadTechRow
              leadTechId={t.leadTechId}
              canEdit={canEditLead}
              leadTechOptions={leadTechOptions}
              onChange={onChangeLeadTech}
            />
            <div className="row between">
              <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Customer</span>
              {cust
                ? <a onClick={() => openCustomer(t.customer)}
                     style={{ font: "var(--t-small)", cursor: "pointer", color: "var(--pri-700)" }}>{cust.name}</a>
                : <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>-</span>}
            </div>
            <div className="row between">
              <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Site</span>
              <span style={{ font: "var(--t-small)" }}>{site?.name ?? "-"}</span>
            </div>
            <div className="row between">
              <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Priority</span>
              <span style={{ font: "var(--t-small)", textTransform: "capitalize" }}>{t.priority}</span>
            </div>
          </div>
        </section>

        <section className="card card-pad">
          <CardHead title="SLA" />
          <div className="col gap-3">
            <div className="row between">
              <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Elapsed</span>
              <span className="numeric" style={{ font: "var(--t-small)" }}>{t.sla.elapsed} min</span>
            </div>
            <div className="row between">
              <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Target</span>
              <span className="numeric" style={{ font: "var(--t-small)" }}>{t.sla.target} min</span>
            </div>
            <div className="row between">
              <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Status</span>
              {t.sla.breach
                ? <span className="badge badge-danger">Breached</span>
                : slaPct > 85
                  ? <span className="badge badge-warning">At risk</span>
                  : <span className="badge badge-success">On track</span>}
            </div>
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <CardHead
          title={`Work orders · ${wos.length}`}
          right={canCreateWo ? (
            <div className="row gap-2">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => openCreate("workorder", {
                  source_kind: "repair",
                  source_id: id,
                  customer_id: t.customer,
                  site_id: t.site || undefined,
                })}>
                <Icon name="plus" size={13} /> Create Work Order
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => openCreate("delivery", {
                  source_kind: "repair",
                  source_id: id,
                  customer_id: t.customer,
                  site_id: t.site || undefined,
                })}>
                <Icon name="truck" size={13} /> Schedule Delivery
              </button>
            </div>
          ) : undefined} />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {wos.map(w => <WoCard key={w.id} wo={w} compact onClick={() => openWO(w.id)} />)}
          {wos.length === 0 && (
            <EmptyState
              icon="briefcase"
              title="No work orders yet"
              action={canCreateWo ? (
                <div className="row gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => openCreate("workorder", {
                      source_kind: "repair",
                      source_id: id,
                      customer_id: t.customer,
                      site_id: t.site || undefined,
                    })}>
                    <Icon name="plus" size={14} /> Create Work Order
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => openCreate("delivery", {
                      source_kind: "repair",
                      source_id: id,
                      customer_id: t.customer,
                      site_id: t.site || undefined,
                    })}>
                    <Icon name="truck" size={14} /> Schedule Delivery
                  </button>
                </div>
              ) : undefined} />
          )}
        </div>
      </section>
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
  const { openWO, openCreate, role, dataVersion } = useApp();
  const deliveries = Object.values(db.WORK_ORDERS).filter(w => w.type === "DELIVERY");
  const drivers = useMemo(
    () => Object.values(db.USERS).filter(u => u.role === "driver"),
    [dataVersion],
  );
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
        <KPI label="Drivers present" value={drivers.length} />
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
// Monday 00:00 of the current week, as an ISO string. Used to scope
// the per-user "Xh this week" totals on the Team page cards.
function startOfThisWeekIso(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatHoursShort(h: number): string {
  if (h <= 0) return "0h";
  if (h >= 10) return `${Math.round(h)}h`;
  // 7.5 → "7.5h", 8.0 → "8h"
  const s = h.toFixed(1);
  return s.endsWith(".0") ? `${s.slice(0, -2)}h` : `${s}h`;
}

// Roles allowed to drill into a technician's hours log on the Team page.
// Workers / drivers / subcontractors see the cards but the card click
// is a no-op for them (their own hours show up on their Dashboard).
const TECH_DETAIL_ROLES = new Set<string>(["admin", "md", "manager", "lead_worker"]);

function UserCard({ u, selected, canOpen, onOpen }: {
  u: User;
  selected: boolean;
  canOpen: boolean;
  onOpen: () => void;
}) {
  const myWOs = Object.values(db.WORK_ORDERS).filter(w => w.assigned && w.assigned.includes(u.id));
  const activeWO = myWOs.find(w => w.status === "in_progress");
  // Real per-user hours this week — sums durationMinutes (trigger-computed
  // in work_order_time_entries) for every closed entry whose endedAt is on
  // or after this Monday 00:00. Replaces the hardcoded "32h" mock.
  const weekStartIso = startOfThisWeekIso();
  const weekMinutes = Object.values(db.WORK_ORDER_TIME_ENTRIES)
    .filter(e => e.userId === u.id && e.endedAt && e.endedAt >= weekStartIso)
    .reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
  const weekHoursLabel = formatHoursShort(weekMinutes / 60);
  return (
    <div
      className="card card-hover card-pad"
      onClick={canOpen ? onOpen : undefined}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onKeyDown={canOpen ? (e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }) : undefined}
      style={{
        cursor: canOpen ? "pointer" : "default",
        outline: selected ? "2px solid var(--pri-500)" : undefined,
        outlineOffset: selected ? "2px" : undefined,
      }}>
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
        <span style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{myWOs.length} WOs · {weekHoursLabel} this week</span>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={e => e.stopPropagation()}>
          <Icon name="messageCircle" size={13} />
        </button>
      </div>
    </div>
  );
}
export function Team() {
  const { openCreate, dataVersion, role } = useApp();
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
  // Click-to-drill state. Gated by role so workers/drivers don't see
  // each other's hours logs (they get their own on the field dashboard).
  const canDrill = TECH_DETAIL_ROLES.has(role);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = selectedUserId ? db.user(selectedUserId) : null;
  return (
    <div className="main-pad">
      <PageHeader eyebrow="Workforce" title="Team"
        sub="Skill tags · availability calendar · capacity heatmap."
        right={can(role, "CREATE_TEAM_MEMBER")
          ? <button className="btn btn-primary" onClick={() => openCreate("team_member")}><Icon name="plus" size={14} /> Add member</button>
          : undefined} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="Active staff" value={users.length} />
        <KPI label="Utilisation" value="87%" trend="up" />
        <KPI label="Subcontractors" value={subcontractors} />
        <KPI label="On leave today" value="0" />
      </div>

      <div style={{
        display: "grid", gap: 14,
        // 200px floor lets two cards sit side-by-side on ~414px phones
        // and four-up on desktop. The global @media (max-width: 520px)
        // KPI rule already handles the KPI strip above.
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))",
      }}>
        {users.map(u => (
          <UserCard
            key={u.id}
            u={u}
            selected={u.id === selectedUserId}
            canOpen={canDrill}
            onOpen={() => setSelectedUserId(prev => (prev === u.id ? null : u.id))} />
        ))}
      </div>

      {canDrill && selectedUser && (
        <TechnicianDetail
          user={selectedUser}
          onClose={() => setSelectedUserId(null)} />
      )}
    </div>
  );
}

/* ─── Technician detail (Team drill-down) ────────────────
 *
 * Opens below the team grid when an Admin / MD / Operations Manager /
 * Lead Technician clicks a member card. Shows the user's full info
 * plus a hours log filtered by project (any container — project,
 * AMC contract, or repair ticket) and a date range.
 *
 * Data source: WORK_ORDER_TIME_ENTRIES filtered by userId. We sum
 * durationMinutes and join the WorkOrder.source { kind, id } against
 * the in-memory mirror to label the container in the table.
 *
 * No backend round-trip; everything reads from the hydration mirror.
 * ─────────────────────────────────────────────────────── */
interface TechSessionRow {
  id: string;
  date: string;            // YYYY-MM-DD from endedAt or startedAt
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  workOrderId: string;
  woCode: string;
  woTitle: string;
  containerKind: "project" | "amc" | "repair";
  containerId: string;
  containerLabel: string;  // human-friendly: "PRJ-2026-001 · Tower-A"
  note: string | null;
}

function describeContainer(kind: "project" | "amc" | "repair", id: string): string {
  if (kind === "project") {
    const p = db.proj(id);
    return p ? `${p.code} · ${p.name}` : "Project (deleted)";
  }
  if (kind === "amc") {
    const a = db.amc(id);
    if (!a) return "AMC (deleted)";
    const cust = a.customer ? db.cust(a.customer)?.name : null;
    return cust ? `${a.code} · ${cust}` : a.code;
  }
  const r = db.REPAIRS[id];
  return r ? `${r.code} · ${r.title}` : "Repair (deleted)";
}

function TechnicianDetail({
  user, onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const { dataVersion, openWO, fmtMoney } = useApp();
  void dataVersion;
  void fmtMoney;

  // ── Filters ───────────────────────────────────────────
  // containerFilter = "all" | "<kind>:<id>"
  const [containerFilter, setContainerFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to,   setTo]   = useState<string>("");

  // ── All rows for this user (unfiltered) ───────────────
  const allRows = useMemo<TechSessionRow[]>(() => {
    const rows: TechSessionRow[] = [];
    for (const e of Object.values(db.WORK_ORDER_TIME_ENTRIES)) {
      if (e.userId !== user.id) continue;
      const wo = db.wo(e.workOrderId);
      if (!wo) continue;
      const dateRef = e.endedAt ?? e.startedAt;
      rows.push({
        id: e.id,
        date: dateRef ? dateRef.slice(0, 10) : "—",
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        durationMinutes: e.durationMinutes || 0,
        workOrderId: wo.id,
        woCode: wo.code,
        woTitle: wo.title,
        containerKind: wo.source.kind,
        containerId: wo.source.id,
        containerLabel: describeContainer(wo.source.kind, wo.source.id),
        note: e.note,
      });
    }
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, dataVersion]);

  // ── Distinct containers the user has worked on (for the filter) ──
  const containerOptions = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; kind: string }>();
    for (const r of allRows) {
      const key = `${r.containerKind}:${r.containerId}`;
      if (!seen.has(key)) {
        seen.set(key, { key, label: r.containerLabel, kind: r.containerKind });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [allRows]);

  // ── Apply filters ──────────────────────────────────────
  const filtered = useMemo(() => {
    return allRows.filter(r => {
      if (containerFilter !== "all") {
        const key = `${r.containerKind}:${r.containerId}`;
        if (key !== containerFilter) return false;
      }
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      return true;
    });
  }, [allRows, containerFilter, from, to]);

  const totalMinutes = filtered.reduce((s, r) => s + r.durationMinutes, 0);
  const totalHours   = totalMinutes / 60;
  const distinctWos  = new Set(filtered.map(r => r.workOrderId)).size;

  const onClearFilters = () => {
    setContainerFilter("all");
    setFrom("");
    setTo("");
  };

  const formatDuration = (mins: number): string => {
    if (mins <= 0) return "—";
    const h = Math.floor(mins / 60);
    const m = mins - h * 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  return (
    <section
      className="card card-pad"
      style={{ marginTop: 24, scrollMarginTop: 80 }}>
      <div className="row gap-3" style={{
        alignItems: "flex-start",
        marginBottom: 16,
        flexWrap: "wrap",
      }}>
        <span className={"avatar avatar-lg avatar-" + (user.tint || "primary")}>{user.initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--t-h3)" }} className="truncate">{user.name}</div>
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", wordBreak: "break-word" }}>
            {ROLE_LABELS[user.role]}
            {user.email   ? ` · ${user.email}`   : ""}
            {user.phone   ? ` · ${user.phone}`   : ""}
          </div>
          {user.skills.length > 0 && (
            <div className="row gap-2" style={{ marginTop: 8, flexWrap: "wrap" }}>
              {user.skills.map(s => <span key={s} className="badge">{s}</span>)}
            </div>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          aria-label="Close"
          onClick={onClose}
          style={{ padding: "4px 8px", flexShrink: 0 }}>
          <Icon name="x" size={13} />
        </button>
      </div>

      {/* Filters — switch to grid so each control gets a full-width
          row on phones (no horizontal scroll), then flows into a 3-up
          layout once the parent has ~640px or more of breathing room. */}
      <div className="card card-pad" style={{ marginBottom: 16, background: "var(--bg-muted)" }}>
        <div style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
          alignItems: "flex-end",
        }}>
          <div className="col" style={{ minWidth: 0 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>
              Project / AMC / Repair
            </label>
            <select
              className="input input-sm"
              value={containerFilter}
              style={{ width: "100%" }}
              onChange={e => setContainerFilter(e.target.value)}>
              <option value="all">All ({containerOptions.length})</option>
              {containerOptions.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="col" style={{ minWidth: 0 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>From</label>
            <input
              className="input input-sm" type="date"
              value={from} max={to || undefined}
              style={{ width: "100%" }}
              onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="col" style={{ minWidth: 0 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>To</label>
            <input
              className="input input-sm" type="date"
              value={to} min={from || undefined}
              style={{ width: "100%" }}
              onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        {(containerFilter !== "all" || from || to) && (
          <div style={{ marginTop: 10, textAlign: "right" }}>
            <button className="btn btn-ghost btn-sm" onClick={onClearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Totals */}
      <div style={{
        display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        marginBottom: 16,
      }}>
        <KPI label="Total hours" value={formatHoursShort(totalHours)}
             sub={`${filtered.length} session${filtered.length === 1 ? "" : "s"}`} />
        <KPI label="Work orders" value={distinctWos}
             sub={containerFilter === "all" ? "across all jobs" : "in filter"} />
        <KPI label="Date range"
             value={from || to ? `${from || "—"} → ${to || "—"}` : "All time"}
             sub={containerFilter === "all" ? "all jobs" : "filtered job"} />
      </div>

      {/* Session table */}
      {filtered.length === 0 ? (
        <EmptyState icon="clock" title="No sessions in this range"
          sub={allRows.length === 0
            ? `${user.name} has no logged hours yet.`
            : "Try widening the date range or clearing the project filter."} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Date</th>
                  <th style={{ width: 120 }}>Job code</th>
                  <th>Project / AMC / Repair</th>
                  <th>Work order</th>
                  <th className="numeric" style={{ textAlign: "right", width: 110 }}>Duration</th>
                  <th style={{ width: 40 }} aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td data-th="Date" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                      {r.date}
                    </td>
                    <td data-th="Job code" style={{ font: "var(--t-small)", fontWeight: 600 }}>
                      <span className="badge badge-outline" style={{ font: "var(--t-micro)" }}>
                        {r.containerKind === "project" ? "Project" : r.containerKind === "amc" ? "AMC" : "Repair"}
                      </span>
                    </td>
                    <td data-th="Container" style={{ font: "var(--t-small)" }}>
                      {r.containerLabel}
                    </td>
                    <td data-th="Work order" style={{ font: "var(--t-small)" }}>
                      <span style={{ fontWeight: 600 }}>{r.woCode}</span>
                      <span style={{ color: "var(--ink-mute)" }}> · {r.woTitle}</span>
                    </td>
                    <td data-th="Duration" className="numeric"
                        style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatDuration(r.durationMinutes)}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Open work order"
                        aria-label="Open work order"
                        onClick={() => openWO(r.workOrderId)}
                        style={{ padding: "4px 8px" }}>
                        <Icon name="externalLink" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── Reports (Phase 7) ──────────────────────────────────
 *
 * Three tabbed report views, no charts (boss wants numbers).
 *
 *   • Projects     — main contractor jobs + AMC contracts + repair
 *                    tickets each as a row, hours rolled up from their
 *                    work orders.
 *   • Sub-contractors — directory rolled up by entry table.
 *   • Workers      — users with role worker / lead_worker rolled up
 *                    from work_order_time_entries.
 *
 * Each tab has:
 *   • Filter bar (date range default last 90 days + per-tab filters)
 *   • Sortable table (click headers; default = total hours desc)
 *   • Export CSV button that downloads exactly what's on screen,
 *     respecting filters AND sort order.
 *
 * No backend round-trips — every selector reads off the in-memory
 * mirror, which already carries every entry the current user is
 * allowed to see (per RLS at hydration).
 * ─────────────────────────────────────────────────────── */

const ALLOWED_REPORTS_ROLES = new Set<string>(["admin", "md", "manager", "accounts"]);
type ReportTab = "project" | "sub" | "worker";

export function Reports() {
  const { role } = useApp();
  const [tab, setTab] = useState<ReportTab>("project");

  if (!ALLOWED_REPORTS_ROLES.has(role)) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Analytics" title="Reports" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Reports are available to MD / Admin / Operations Manager / Accounts." />
      </div>
    );
  }

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Analytics" title="Reports"
        sub="Manpower, man-hours, and project breakdowns" />

      <div className="card card-pad" style={{ marginBottom: 16, padding: 8 }}>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          {([
            { k: "project", label: "Projects" },
            { k: "sub",     label: "Sub-contractors" },
            { k: "worker",  label: "Team" },
          ] as { k: ReportTab; label: string }[]).map(t => (
            <button key={t.k}
              className={"btn btn-sm " + (tab === t.k ? "btn-primary" : "btn-ghost")}
              onClick={() => setTab(t.k)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "project" && <ProjectReport />}
      {tab === "sub"     && <SubContractorReport />}
      {tab === "worker"  && <WorkerReport />}
    </div>
  );
}

/* ─── shared helpers ─────────────────────────────────── */

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
}
function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
}
function twoDigits(n: number): string { return n < 10 ? `0${n}` : String(n); }

function formatYmdShort(yyyyMmDd: string | null): string {
  if (!yyyyMmDd) return "—";
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  return formatMonthDay(new Date(y, m - 1, d, 12, 0, 0));
}

/** Excel-safe CSV. BOM prefix ensures UTF-8 detection; embedded
 *  commas / quotes / newlines are escaped per RFC 4180. */
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
  const csv = lines.join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reusable sortable header cell. */
function SortHead<K extends string>({
  k, current, dir, onSort, children, align,
}: {
  k: K; current: K; dir: "asc" | "desc";
  onSort: (k: K) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = k === current;
  return (
    <th onClick={() => onSort(k)}
        style={{
          cursor: "pointer", userSelect: "none",
          textAlign: align ?? "left",
          background: active ? "var(--bg-muted)" : undefined,
        }}>
      <span className="row gap-1" style={{
        alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}>
        {children}
        {active && (
          <Icon name={dir === "asc" ? "arrowUp" : "arrowDown"} size={11}
                style={{ color: "var(--ink-mute)" }} />
        )}
      </span>
    </th>
  );
}

/** Standard date-range + Export-CSV bar shown above every report. */
function ReportToolbar({
  from, to, setFrom, setTo, onExport, extra,
}: {
  from: string; to: string;
  setFrom: (s: string) => void; setTo: (s: string) => void;
  onExport: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="row gap-3" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="col" style={{ minWidth: 140 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>From</label>
          <input className="input input-sm" type="date" value={from}
                 max={to} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="col" style={{ minWidth: 140 }}>
          <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>To</label>
          <input className="input input-sm" type="date" value={to}
                 min={from} max={todayYmd()} onChange={e => setTo(e.target.value)} />
        </div>
        {extra}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={onExport}>
          <Icon name="fileText" size={14} /> Export CSV
        </button>
      </div>
    </div>
  );
}

/* ─── A. PROJECT REPORT ──────────────────────────────── */

type ProjectType = "main_contractor" | "amc" | "repair";
type StatusFilter = "all" | "active" | "completed";
type TypeFilter   = "all" | ProjectType;

interface ProjectReportRow {
  containerId: string;
  type: ProjectType;
  code: string;
  title: string;
  status: string;
  isActive: boolean;
  workerHrs: number;
  subHrs: number;
  totalHrs: number;
  workers: number;
  subs: number;
  manpower: number;
}

type ProjectSortKey = "code" | "title" | "status" | "totalHrs" | "workerHrs" | "subHrs" | "manpower" | "workers" | "subs";

function ProjectReport() {
  const { dataVersion } = useApp();
  void dataVersion;
  const [from, setFrom] = useState(daysAgoYmd(90));
  const [to,   setTo]   = useState(todayYmd());
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [typeF,   setTypeF]   = useState<TypeFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState<ProjectSortKey>("totalHrs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (containerId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(containerId)) next.delete(containerId);
      else next.add(containerId);
      return next;
    });
  };

  const rows = useMemo<ProjectReportRow[]>(() => {
    return buildProjectRows(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, dataVersion]);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusF === "active")    out = out.filter(r => r.isActive);
    if (statusF === "completed") out = out.filter(r => !r.isActive);
    if (typeF !== "all")         out = out.filter(r => r.type === typeF);
    // Default: drop containers with zero hours in range — those are
    // noise. Toggle off to see every project including idle ones.
    if (!showAll) out = out.filter(r => r.totalHrs > 0);
    return out;
  }, [rows, statusF, typeF, showAll]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp: number;
      if (sortKey === "code" || sortKey === "title" || sortKey === "status") {
        cmp = (a[sortKey] as string).localeCompare(b[sortKey] as string);
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [filtered, sortKey, sortDir]);

  const onSort = (k: ProjectSortKey) => {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "code" || k === "title" || k === "status" ? "asc" : "desc"); }
  };

  const onExport = () => {
    downloadCsv(
      `project-report-${todayYmd()}.csv`,
      ["Type", "Code", "Title", "Status", "Total Hours", "Team Hours", "Sub Hours", "Manpower", "Team", "Subs"],
      sorted.map(r => [
        TYPE_LABEL[r.type], r.code, r.title, r.status,
        r.totalHrs.toFixed(2), r.workerHrs.toFixed(2), r.subHrs.toFixed(2),
        r.manpower, r.workers, r.subs,
      ]),
    );
  };

  return (
    <>
      <ReportToolbar from={from} to={to} setFrom={setFrom} setTo={setTo}
        onExport={onExport}
        extra={
          <>
            <div className="col" style={{ minWidth: 140 }}>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>Status</label>
              <select className="input input-sm" value={statusF}
                      onChange={e => setStatusF(e.target.value as StatusFilter)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="col" style={{ minWidth: 160 }}>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>Type</label>
              <select className="input input-sm" value={typeF}
                      onChange={e => setTypeF(e.target.value as TypeFilter)}>
                <option value="all">All</option>
                <option value="main_contractor">Project</option>
                <option value="amc">AMC</option>
                <option value="repair">Repair</option>
              </select>
            </div>
            <div className="row" style={{ alignItems: "center", gap: 8, paddingBottom: 4 }}>
              <input id="rpt-proj-showall" type="checkbox" checked={showAll}
                     onChange={e => setShowAll(e.target.checked)}
                     style={{ width: 18, height: 18 }} />
              <label htmlFor="rpt-proj-showall" style={{ font: "var(--t-small)" }}>
                Show projects with no hours
              </label>
            </div>
          </>
        } />

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Type</th>
                <SortHead<ProjectSortKey> k="code"      current={sortKey} dir={sortDir} onSort={onSort}>Code</SortHead>
                <SortHead<ProjectSortKey> k="title"     current={sortKey} dir={sortDir} onSort={onSort}>Title</SortHead>
                <SortHead<ProjectSortKey> k="status"    current={sortKey} dir={sortDir} onSort={onSort}>Status</SortHead>
                <SortHead<ProjectSortKey> k="totalHrs"  current={sortKey} dir={sortDir} onSort={onSort} align="right">Total hrs</SortHead>
                <SortHead<ProjectSortKey> k="workerHrs" current={sortKey} dir={sortDir} onSort={onSort} align="right">Team hrs</SortHead>
                <SortHead<ProjectSortKey> k="subHrs"    current={sortKey} dir={sortDir} onSort={onSort} align="right">Sub hrs</SortHead>
                <SortHead<ProjectSortKey> k="manpower"  current={sortKey} dir={sortDir} onSort={onSort} align="right">Manpower</SortHead>
                <SortHead<ProjectSortKey> k="workers"   current={sortKey} dir={sortDir} onSort={onSort} align="right"># Team</SortHead>
                <SortHead<ProjectSortKey> k="subs"      current={sortKey} dir={sortDir} onSort={onSort} align="right"># Subs</SortHead>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 24, color: "var(--ink-mute)" }}>
                  No hours in this date range
                </td></tr>
              ) : sorted.map(r => {
                const isOpen = expanded.has(r.containerId);
                const canExpand = r.totalHrs > 0;
                return (
                  <Fragment key={r.containerId}>
                    <tr onClick={() => canExpand && toggleExpand(r.containerId)}
                        style={{
                          cursor: canExpand ? "pointer" : "default",
                          background: isOpen ? "var(--bg-muted)" : undefined,
                        }}>
                      <td data-th="" style={{ textAlign: "center", color: "var(--ink-mute)" }}>
                        {canExpand && (
                          <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={14} />
                        )}
                      </td>
                      <td data-th="Type">
                        <span className="badge badge-outline" style={{ font: "var(--t-micro)" }}>{TYPE_LABEL[r.type]}</span>
                      </td>
                      <td data-th="Code" style={{ font: "var(--t-small)", fontWeight: 600 }}>{r.code}</td>
                      <td data-th="Title" style={{ font: "var(--t-small)" }}>{r.title}</td>
                      <td data-th="Status" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{r.status}</td>
                      <td data-th="Total hrs" className="numeric" style={{ textAlign: "right", fontWeight: 600 }}>{r.totalHrs > 0 ? r.totalHrs.toFixed(1) : "—"}</td>
                      <td data-th="Team hrs" className="numeric" style={{ textAlign: "right" }}>{r.workerHrs > 0 ? r.workerHrs.toFixed(1) : "—"}</td>
                      <td data-th="Sub hrs" className="numeric" style={{ textAlign: "right" }}>{r.subHrs > 0 ? r.subHrs.toFixed(1) : "—"}</td>
                      <td data-th="Manpower" className="numeric" style={{ textAlign: "right" }}>{r.manpower > 0 ? r.manpower : "—"}</td>
                      <td data-th="# Team" className="numeric" style={{ textAlign: "right" }}>{r.workers > 0 ? r.workers : "—"}</td>
                      <td data-th="# Subs" className="numeric" style={{ textAlign: "right" }}>{r.subs > 0 ? r.subs : "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={11} style={{ padding: 0, background: "var(--bg-muted)" }}>
                          <ProjectBreakdownPanel containerId={r.containerId} from={from} to={to} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const TYPE_LABEL: Record<ProjectType, string> = {
  main_contractor: "Project",
  amc: "AMC",
  repair: "Repair",
};

function buildProjectRows(from: string, to: string): ProjectReportRow[] {
  // Group WOs by container (project / amc / repair). Then per container
  // sum worker + sub hours filtered by date.
  const wosByProject = new Map<string, string[]>();
  const wosByAmc     = new Map<string, string[]>();
  const wosByRepair  = new Map<string, string[]>();
  for (const w of Object.values(db.WORK_ORDERS)) {
    const target =
      w.source.kind === "project" ? wosByProject :
      w.source.kind === "amc"     ? wosByAmc     : wosByRepair;
    const list = target.get(w.source.id) ?? [];
    list.push(w.id);
    target.set(w.source.id, list);
  }

  const rows: ProjectReportRow[] = [];

  const tallyHours = (woIds: string[]) => {
    const ids = new Set(woIds);
    let workerMinutes = 0;
    let subHours = 0;
    const workers = new Set<string>();
    const subs = new Set<string>();
    for (const e of Object.values(db.WORK_ORDER_TIME_ENTRIES)) {
      if (!ids.has(e.workOrderId)) continue;
      if (!e.endedAt) continue;
      const ymd = e.endedAt.slice(0, 10);
      if (ymd < from || ymd > to) continue;
      workerMinutes += e.durationMinutes;
      if (e.userId) workers.add(e.userId);
    }
    for (const e of Object.values(db.WORK_ORDER_SUB_CONTRACTOR_HOURS)) {
      if (!ids.has(e.workOrderId)) continue;
      if (e.entryDate < from || e.entryDate > to) continue;
      subHours += e.hours;
      subs.add(e.subContractorId);
    }
    return { workerHrs: workerMinutes / 60, subHrs: subHours, workers, subs };
  };

  for (const p of Object.values(db.PROJECTS)) {
    const t = tallyHours(wosByProject.get(p.id) ?? []);
    rows.push({
      containerId: "p:" + p.id, type: "main_contractor",
      code: p.code, title: p.name, status: p.status,
      isActive: isProjectActive(p.status),
      workerHrs: t.workerHrs, subHrs: t.subHrs, totalHrs: t.workerHrs + t.subHrs,
      workers: t.workers.size, subs: t.subs.size,
      manpower: t.workers.size + t.subs.size,
    });
  }
  for (const a of Object.values(db.AMCS)) {
    const t = tallyHours(wosByAmc.get(a.id) ?? []);
    const cust = db.cust(a.customer);
    rows.push({
      containerId: "a:" + a.id, type: "amc",
      code: a.code, title: cust?.name ?? "—",
      status: a.contract_status,
      isActive: isAmcActive(a.contract_status),
      workerHrs: t.workerHrs, subHrs: t.subHrs, totalHrs: t.workerHrs + t.subHrs,
      workers: t.workers.size, subs: t.subs.size,
      manpower: t.workers.size + t.subs.size,
    });
  }
  for (const r of Object.values(db.REPAIRS)) {
    const t = tallyHours(wosByRepair.get(r.id) ?? []);
    rows.push({
      containerId: "r:" + r.id, type: "repair",
      code: r.code, title: r.title, status: r.state,
      isActive: isRepairActive(r.state),
      workerHrs: t.workerHrs, subHrs: t.subHrs, totalHrs: t.workerHrs + t.subHrs,
      workers: t.workers.size, subs: t.subs.size,
      manpower: t.workers.size + t.subs.size,
    });
  }
  return rows;
}

interface BreakdownWorker {
  userId: string;
  name: string;
  role: string;
  hrs: number;
  wos: number;
}
interface BreakdownSub {
  subId: string;
  name: string;
  company: string;
  hrs: number;
  wos: number;
}

function buildContainerBreakdown(containerId: string, from: string, to: string): { workers: BreakdownWorker[]; subs: BreakdownSub[] } {
  const [k, id] = containerId.split(":") as ["p" | "a" | "r", string];
  const kind = k === "p" ? "project" : k === "a" ? "amc" : "repair";
  const woIds = new Set<string>();
  for (const w of Object.values(db.WORK_ORDERS)) {
    if (w.source.kind === kind && w.source.id === id) woIds.add(w.id);
  }

  const workerAcc = new Map<string, { minutes: number; wos: Set<string> }>();
  for (const e of Object.values(db.WORK_ORDER_TIME_ENTRIES)) {
    if (!woIds.has(e.workOrderId)) continue;
    if (!e.endedAt || !e.userId) continue;
    const ymd = e.endedAt.slice(0, 10);
    if (ymd < from || ymd > to) continue;
    const cur = workerAcc.get(e.userId) ?? { minutes: 0, wos: new Set<string>() };
    cur.minutes += e.durationMinutes;
    cur.wos.add(e.workOrderId);
    workerAcc.set(e.userId, cur);
  }

  const subAcc = new Map<string, { hrs: number; wos: Set<string> }>();
  for (const e of Object.values(db.WORK_ORDER_SUB_CONTRACTOR_HOURS)) {
    if (!woIds.has(e.workOrderId)) continue;
    if (e.entryDate < from || e.entryDate > to) continue;
    const cur = subAcc.get(e.subContractorId) ?? { hrs: 0, wos: new Set<string>() };
    cur.hrs += e.hours;
    cur.wos.add(e.workOrderId);
    subAcc.set(e.subContractorId, cur);
  }

  const workers: BreakdownWorker[] = Array.from(workerAcc, ([userId, v]) => {
    const u = db.user(userId);
    return {
      userId,
      name: u?.name ?? "Unknown",
      role: (u?.role && ROLE_LABELS[u.role]) || u?.role || "—",
      hrs: v.minutes / 60,
      wos: v.wos.size,
    };
  }).sort((a, b) => b.hrs - a.hrs);

  const subs: BreakdownSub[] = Array.from(subAcc, ([subId, v]) => {
    const s = db.subContractor(subId);
    return {
      subId,
      name: s?.name ?? "Unknown",
      company: s?.company ?? "—",
      hrs: v.hrs,
      wos: v.wos.size,
    };
  }).sort((a, b) => b.hrs - a.hrs);

  return { workers, subs };
}

function ProjectBreakdownPanel({ containerId, from, to }: { containerId: string; from: string; to: string }) {
  const { dataVersion } = useApp();
  void dataVersion;
  const { workers, subs } = useMemo(
    () => buildContainerBreakdown(containerId, from, to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containerId, from, to, dataVersion],
  );

  return (
    <div style={{ padding: 16, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <div>
        <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
          <Icon name="users" size={14} style={{ color: "var(--ink-mute)" }} />
          <span style={{ font: "var(--t-small)", fontWeight: 600 }}>
            Team ({workers.length})
          </span>
        </div>
        {workers.length === 0 ? (
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: "8px 0" }}>
            No team hours logged in this range.
          </div>
        ) : (
          <table className="table" style={{ font: "var(--t-small)" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="numeric" style={{ textAlign: "right" }}>Hours</th>
                <th className="numeric" style={{ textAlign: "right" }}>WOs</th>
              </tr>
            </thead>
            <tbody>
              {workers.map(w => (
                <tr key={w.userId}>
                  <td style={{ fontWeight: 600 }}>{w.name}</td>
                  <td style={{ color: "var(--ink-mute)" }}>{w.role}</td>
                  <td className="numeric" style={{ textAlign: "right", fontWeight: 600 }}>{w.hrs.toFixed(1)}</td>
                  <td className="numeric" style={{ textAlign: "right" }}>{w.wos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
          <Icon name="briefcase" size={14} style={{ color: "var(--ink-mute)" }} />
          <span style={{ font: "var(--t-small)", fontWeight: 600 }}>
            Sub-contractors ({subs.length})
          </span>
        </div>
        {subs.length === 0 ? (
          <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: "8px 0" }}>
            No sub-contractor hours logged in this range.
          </div>
        ) : (
          <table className="table" style={{ font: "var(--t-small)" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th className="numeric" style={{ textAlign: "right" }}>Hours</th>
                <th className="numeric" style={{ textAlign: "right" }}>WOs</th>
              </tr>
            </thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.subId}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: "var(--ink-mute)" }}>{s.company}</td>
                  <td className="numeric" style={{ textAlign: "right", fontWeight: 600 }}>{s.hrs.toFixed(1)}</td>
                  <td className="numeric" style={{ textAlign: "right" }}>{s.wos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function isProjectActive(s: string): boolean {
  const t = s.toLowerCase();
  return !(t.includes("completed") || t.includes("closed") || t.includes("cancel"));
}
function isAmcActive(s: string): boolean {
  return !(s === "expired" || s === "cancelled" || s === "renewed");
}
function isRepairActive(s: string): boolean {
  return s !== "Resolved";
}

/* ─── B. SUB-CONTRACTOR REPORT ───────────────────────── */

interface SubReportRow {
  id: string;
  name: string;
  company: string;
  phone: string;
  emiratesId: string;
  isActive: boolean;
  totalHrs: number;
  projects: number;
  wos: number;
  lastEntry: string | null; // YYYY-MM-DD
}
type SubSortKey = "name" | "company" | "totalHrs" | "projects" | "wos" | "lastEntry";

function SubContractorReport() {
  const { dataVersion } = useApp();
  void dataVersion;
  const router = useRouter();
  const [from, setFrom] = useState(daysAgoYmd(90));
  const [to,   setTo]   = useState(todayYmd());
  const [activeOnly, setActiveOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SubSortKey>("totalHrs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo<SubReportRow[]>(() => {
    return Object.values(db.SUB_CONTRACTORS).map(s => {
      const entries = db.hoursForSub(s.id).filter(e => e.entryDate >= from && e.entryDate <= to);
      const projectIds = new Set<string>();
      const woIds = new Set<string>();
      let last: string | null = null;
      let total = 0;
      for (const e of entries) {
        total += e.hours;
        woIds.add(e.workOrderId);
        const wo = db.wo(e.workOrderId);
        if (wo?.source.kind === "project") projectIds.add(wo.source.id);
        if (!last || e.entryDate > last) last = e.entryDate;
      }
      return {
        id: s.id,
        name: s.name,
        company: s.company ?? "—",
        phone: s.phone ?? "—",
        emiratesId: s.emiratesId ?? "—",
        isActive: s.isActive,
        totalHrs: total,
        projects: projectIds.size,
        wos: woIds.size,
        lastEntry: last,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, dataVersion]);

  const filtered = useMemo(() => {
    let out = rows;
    if (activeOnly) out = out.filter(r => r.isActive);
    // Drop subs with zero hours in range so the report is signal-only.
    out = out.filter(r => r.totalHrs > 0);
    return out;
  }, [rows, activeOnly]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp: number;
      if (sortKey === "lastEntry") {
        cmp = (a.lastEntry ?? "").localeCompare(b.lastEntry ?? "");
      } else if (sortKey === "totalHrs" || sortKey === "projects" || sortKey === "wos") {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      } else {
        cmp = (a[sortKey] as string).localeCompare(b[sortKey] as string);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [filtered, sortKey, sortDir]);

  const onSort = (k: SubSortKey) => {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" || k === "company" ? "asc" : "desc"); }
  };

  const onExport = () => {
    downloadCsv(
      `sub-contractor-report-${todayYmd()}.csv`,
      ["Name", "Company", "Phone", "Emirates ID", "Total Hours", "# Projects", "# WOs", "Last Entry"],
      sorted.map(r => [
        r.name, r.company, r.phone, r.emiratesId,
        r.totalHrs.toFixed(2), r.projects, r.wos, r.lastEntry ?? "—",
      ]),
    );
  };

  return (
    <>
      <ReportToolbar from={from} to={to} setFrom={setFrom} setTo={setTo}
        onExport={onExport}
        extra={
          <div className="row" style={{ alignItems: "center", gap: 8, paddingBottom: 4 }}>
            <input id="rpt-sub-active" type="checkbox" checked={activeOnly}
                   onChange={e => setActiveOnly(e.target.checked)}
                   style={{ width: 18, height: 18 }} />
            <label htmlFor="rpt-sub-active" style={{ font: "var(--t-small)" }}>
              Active only
            </label>
          </div>
        } />

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <SortHead<SubSortKey> k="name"      current={sortKey} dir={sortDir} onSort={onSort}>Name</SortHead>
                <SortHead<SubSortKey> k="company"   current={sortKey} dir={sortDir} onSort={onSort}>Company</SortHead>
                <th className="hide-mobile">Phone</th>
                <th className="hide-mobile">Emirates ID</th>
                <SortHead<SubSortKey> k="totalHrs"  current={sortKey} dir={sortDir} onSort={onSort} align="right">Total hrs</SortHead>
                <SortHead<SubSortKey> k="projects"  current={sortKey} dir={sortDir} onSort={onSort} align="right"># Projects</SortHead>
                <SortHead<SubSortKey> k="wos"       current={sortKey} dir={sortDir} onSort={onSort} align="right"># WOs</SortHead>
                <SortHead<SubSortKey> k="lastEntry" current={sortKey} dir={sortDir} onSort={onSort} align="right">Last entry</SortHead>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--ink-mute)" }}>
                  No hours in this date range
                </td></tr>
              ) : sorted.map(r => (
                <tr key={r.id}
                    onClick={() => router.push(`/sub-contractors/${r.id}`)}
                    style={{ cursor: "pointer" }}>
                  <td data-th="Name" style={{ font: "var(--t-small)", fontWeight: 600 }}>
                    {r.name}
                    {!r.isActive && <span className="badge badge-outline"
                      style={{ marginLeft: 6, font: "var(--t-micro)" }}>Inactive</span>}
                  </td>
                  <td data-th="Company" style={{ font: "var(--t-small)" }}>{r.company}</td>
                  <td data-th="Phone" className="hide-mobile numeric" style={{ font: "var(--t-small)" }}>{r.phone}</td>
                  <td data-th="Emirates ID" className="hide-mobile numeric"
                      style={{ font: "var(--t-small)", fontFamily: "var(--font-mono)" }}>{r.emiratesId}</td>
                  <td data-th="Total hrs" className="numeric" style={{ textAlign: "right", fontWeight: 600 }}>{r.totalHrs.toFixed(1)}</td>
                  <td data-th="# Projects" className="numeric" style={{ textAlign: "right" }}>{r.projects}</td>
                  <td data-th="# WOs" className="numeric" style={{ textAlign: "right" }}>{r.wos}</td>
                  <td data-th="Last entry" className="numeric" style={{ textAlign: "right", color: "var(--ink-mute)" }}>{formatYmdShort(r.lastEntry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ─── C. WORKER REPORT ───────────────────────────────── */

interface WorkerReportRow {
  id: string;
  name: string;
  role: string;
  totalHrs: number;
  projects: number;
  wos: number;
  lastEntry: string | null; // YYYY-MM-DD
}
type WorkerSortKey = "name" | "role" | "totalHrs" | "projects" | "wos" | "lastEntry";
type RoleFilter = "all" | "worker" | "lead_worker";

function WorkerReport() {
  const { dataVersion } = useApp();
  void dataVersion;
  const [from, setFrom] = useState(daysAgoYmd(90));
  const [to,   setTo]   = useState(todayYmd());
  const [roleF, setRoleF] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState<WorkerSortKey>("totalHrs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo<WorkerReportRow[]>(() => {
    const candidates = Object.values(db.USERS).filter(u => u.role === "worker" || u.role === "lead_worker");
    return candidates.map(u => {
      let totalMinutes = 0;
      const projects = new Set<string>();
      const wos = new Set<string>();
      let last: string | null = null;
      for (const e of Object.values(db.WORK_ORDER_TIME_ENTRIES)) {
        if (e.userId !== u.id) continue;
        if (!e.endedAt) continue;
        const ymd = e.endedAt.slice(0, 10);
        if (ymd < from || ymd > to) continue;
        totalMinutes += e.durationMinutes;
        wos.add(e.workOrderId);
        const wo = db.wo(e.workOrderId);
        if (wo?.source.kind === "project") projects.add(wo.source.id);
        if (!last || ymd > last) last = ymd;
      }
      return {
        id: u.id, name: u.name, role: u.role,
        totalHrs: totalMinutes / 60,
        projects: projects.size,
        wos: wos.size,
        lastEntry: last,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, dataVersion]);

  const filtered = useMemo(() => {
    let out = rows;
    if (roleF !== "all") out = out.filter(r => r.role === roleF);
    out = out.filter(r => r.totalHrs > 0);
    return out;
  }, [rows, roleF]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp: number;
      if (sortKey === "lastEntry") {
        cmp = (a.lastEntry ?? "").localeCompare(b.lastEntry ?? "");
      } else if (sortKey === "totalHrs" || sortKey === "projects" || sortKey === "wos") {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      } else {
        cmp = (a[sortKey] as string).localeCompare(b[sortKey] as string);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [filtered, sortKey, sortDir]);

  const onSort = (k: WorkerSortKey) => {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" || k === "role" ? "asc" : "desc"); }
  };

  const onExport = () => {
    downloadCsv(
      `team-report-${todayYmd()}.csv`,
      ["Name", "Role", "Total Hours", "# Projects", "# WOs", "Last Entry"],
      sorted.map(r => [
        r.name, ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] ?? r.role,
        r.totalHrs.toFixed(2), r.projects, r.wos, r.lastEntry ?? "—",
      ]),
    );
  };

  return (
    <>
      <ReportToolbar from={from} to={to} setFrom={setFrom} setTo={setTo}
        onExport={onExport}
        extra={
          <div className="col" style={{ minWidth: 160 }}>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", marginBottom: 4 }}>Role</label>
            <select className="input input-sm" value={roleF}
                    onChange={e => setRoleF(e.target.value as RoleFilter)}>
              <option value="all">All</option>
              <option value="worker">Technician</option>
              <option value="lead_worker">Lead Technician</option>
            </select>
          </div>
        } />

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <SortHead<WorkerSortKey> k="name"      current={sortKey} dir={sortDir} onSort={onSort}>Name</SortHead>
                <SortHead<WorkerSortKey> k="role"      current={sortKey} dir={sortDir} onSort={onSort}>Role</SortHead>
                <SortHead<WorkerSortKey> k="totalHrs"  current={sortKey} dir={sortDir} onSort={onSort} align="right">Total hrs</SortHead>
                <SortHead<WorkerSortKey> k="projects"  current={sortKey} dir={sortDir} onSort={onSort} align="right"># Projects</SortHead>
                <SortHead<WorkerSortKey> k="wos"       current={sortKey} dir={sortDir} onSort={onSort} align="right"># WOs</SortHead>
                <SortHead<WorkerSortKey> k="lastEntry" current={sortKey} dir={sortDir} onSort={onSort} align="right">Last entry</SortHead>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--ink-mute)" }}>
                  No hours in this date range
                </td></tr>
              ) : sorted.map(r => (
                <tr key={r.id}>
                  <td data-th="Name" style={{ font: "var(--t-small)", fontWeight: 600 }}>{r.name}</td>
                  <td data-th="Role" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
                    {ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] ?? r.role}
                  </td>
                  <td data-th="Total hrs" className="numeric" style={{ textAlign: "right", fontWeight: 600 }}>{r.totalHrs.toFixed(1)}</td>
                  <td data-th="# Projects" className="numeric" style={{ textAlign: "right" }}>{r.projects}</td>
                  <td data-th="# WOs" className="numeric" style={{ textAlign: "right" }}>{r.wos}</td>
                  <td data-th="Last entry" className="numeric" style={{ textAlign: "right", color: "var(--ink-mute)" }}>{formatYmdShort(r.lastEntry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
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
