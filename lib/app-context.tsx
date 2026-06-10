"use client";
// ============================================================
// Installtec OS - App Context (ported from prototype/shell.jsx)
// One context, one navigation, one role-aware permission model.
// State-based route from prototype is replaced with Next.js App Router;
// the context surfaces `go(name, params)` that pushes the URL.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { db, DEFAULT_ORG_ID, NOTIFICATIONS } from "./db";
import { supabaseBrowser } from "./supabase/client";
import { mapNotificationRow, NOTIFICATION_COLUMNS } from "./notifications";
import { formatCurrency, type CurrencyOptions } from "./format";
import type { HydrationBundle } from "./hydrate";
import type { Notification, Organization, Role, User } from "./types";

export type RouteName =
  | "dashboard" | "workorders" | "feed" | "scheduling" | "approvals"
  | "projects" | "amc" | "repair" | "inventory" | "logistics"
  | "replacements"
  // Material Requests — on-site procurement workflow (migration 0038).
  | "material-requests"
  // Growth Plan — calendar/planner aggregating projects, AMC visits, WOs.
  | "growth-plan"
  // Sub-contractors directory (migration 0023).
  | "sub-contractors"
  | "customers" | "sites" | "team" | "reports" | "admin" | "notifications"
  | "organizations" | "admins"
  // Phase 10 — Accountant module (AR aging + outstanding balances).
  | "accountant"
  // Phase 11 — Quotations tracker.
  | "quotations"
  // pseudo-route - sidebar item opens the Notes slide-out panel instead
  // of navigating; no /notes page exists.
  | "notes";

export interface FollowTarget { kind: string; id: string }
export interface Slideover { kind: "wo" | "approval"; id: string }
export interface ModalState { kind: "reactivation"; data: { id: string } }

export type CreateKind =
  | "picker" | "user" | "customer" | "site" | "project" | "amc"
  | "workorder" | "repair" | "material_request" | "delivery"
  | "team_member" | "quotation" | "organization" | "note"
  | "amc_payment" | "replacement_request" | "sub_contractor"
  | "sub_hours" | "free_call" | "quotation_v2";
export interface CreateState { kind: CreateKind; prefill?: Record<string, unknown> }

interface Ctx {
  me: User;
  userId: string;
  setUserId: (id: string) => void;
  role: Role;
  // True when `me` came from a real Supabase session (set by the server
  // layout). The dev role-switcher hides itself when this is true.
  hasRealAuth: boolean;

  // Active organization - drives branding, currency, locale.
  // Super Admin can switch via `setActiveOrgId` to preview / configure other orgs.
  currentOrg: Organization | null;
  activeOrgId: string;
  setActiveOrgId: (id: string) => void;
  fmtMoney: (amount: number | null | undefined, opts?: CurrencyOptions) => string;

  route: { name: RouteName; params: Record<string, string> };
  go: (name: RouteName, params?: Record<string, string>) => void;

  cmdkOpen: boolean;
  setCmdk: (open: boolean | ((o: boolean) => boolean)) => void;

  notifOpen: boolean;
  setNotif: (open: boolean | ((o: boolean) => boolean)) => void;

  // "Important Notes" slide-out (per-user, persisted in Supabase user_notes).
  notesOpen: boolean;
  setNotesOpen: (open: boolean | ((o: boolean) => boolean)) => void;
  notesVersion: number;
  bumpNotes: () => void;

  // Main sidebar visibility. Persisted in localStorage so the user's
  // preference survives refreshes. Default: open on desktop, closed on mobile.
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean | ((o: boolean) => boolean)) => void;
  toggleSidebar: () => void;

  slideover: Slideover | null;
  setSlideover: (s: Slideover | null) => void;
  openWO: (id: string) => void;
  openApproval: (id: string) => void;
  openCustomer: (id: string) => void;
  openProject: (id: string) => void;
  openAmc: (id: string) => void;
  openReplacement: (id: string) => void;
  // Navigate to /growth-plan. Optional `range` pre-selects the calendar
  // range filter ("today" | "week" | "month" | "3months") via query
  // string so dashboard widgets can deep-link straight into a scope.
  openGrowthPlan: (range?: string) => void;
  followTarget: (target: FollowTarget | null | undefined) => void;

  modal: ModalState | null;
  setModal: (m: ModalState | null) => void;

  create: CreateState | null;
  openCreate: (kind: CreateKind, prefill?: Record<string, unknown>) => void;
  closeCreate: () => void;
  dataVersion: number;
  bumpData: () => void;

  toast: string | null;
  fireToast: (msg: string) => void;
  dismissToast: () => void;

  notifications: Notification[];
  setNotifications: (n: Notification[]) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  pushNotification: (n: Omit<Notification, "id" | "read"> & { id?: string; read?: boolean }) => void;
  unreadCount: number;
}

const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

// Darken/lighten a hex color by `percent` (negative = darker). Used to
// derive --pri-600/700 etc. from a single org primary color.
function shade(hex: string, percent: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const num = parseInt(h, 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const NAME_FROM_PATH = (path: string): RouteName => {
  // Allow hyphens in the first segment so multi-word routes like
  // "growth-plan" resolve correctly. The previous regex stopped at the
  // first hyphen and silently fell back to "dashboard".
  const m = path.match(/^\/([a-z-]+)/);
  const name = (m ? m[1] : "dashboard") as RouteName;
  const known: RouteName[] = ["dashboard", "workorders", "feed", "scheduling", "approvals", "projects", "amc", "repair", "inventory", "logistics", "replacements", "material-requests", "growth-plan", "sub-contractors", "customers", "sites", "team", "reports", "accountant", "quotations", "admin", "notifications", "organizations", "admins"];
  return known.includes(name) ? name : "dashboard";
};

export function AppProvider({
  children,
  initialUserId = "u_root",
  currentUser,
  initialUsers,
  initialBundle,
  initialNotifications,
}: {
  children: React.ReactNode;
  initialUserId?: string;
  currentUser?: User;
  initialUsers?: User[];
  initialBundle?: HydrationBundle;
  initialNotifications?: Notification[];
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";
  const search = useSearchParams();

  // Hydrate db.* once from the server-fetched bundles so every list view
  // (Projects, Customers, Admins, dashboards, etc.) renders real data on
  // first paint and survives a page refresh. The local Super-Admin seed
  // (u_root) is preserved as a fallback identity.
  // useState initialiser runs exactly once per provider instance, so this
  // is safe to mutate module state from here.
  useState(() => {
    if (initialUsers && initialUsers.length > 0) {
      const preserved = db.USERS["u_root"];
      for (const u of initialUsers) db.USERS[u.id] = u;
      if (preserved && !db.USERS["u_root"]) db.USERS["u_root"] = preserved;
    }
    if (initialBundle) {
      for (const c of initialBundle.customers) db.CUSTOMERS[c.id] = c;
      for (const s of initialBundle.sites) db.SITES[s.id] = s;
      for (const t of initialBundle.teams) db.TEAMS[t.id] = t;
      for (const p of initialBundle.projects) db.PROJECTS[p.id] = p;
      for (const a of initialBundle.amcs) db.AMCS[a.id] = a;
      for (const s of initialBundle.amcServices) db.AMC_SERVICE_SCHEDULE[s.id] = s;
      for (const r of initialBundle.repairs) db.REPAIRS[r.id] = r;
      for (const w of initialBundle.workOrders) db.WORK_ORDERS[w.id] = w;
      for (const e of initialBundle.workOrderTimeEntries) db.WORK_ORDER_TIME_ENTRIES[e.id] = e;
      for (const s of initialBundle.subContractors) db.SUB_CONTRACTORS[s.id] = s;
      for (const j of initialBundle.workOrderSubContractors) db.WORK_ORDER_SUB_CONTRACTORS[j.id] = j;
      for (const h of initialBundle.workOrderSubContractorHours) db.WORK_ORDER_SUB_CONTRACTOR_HOURS[h.id] = h;
      for (const fc of initialBundle.freeCalls) db.FREE_CALLS[fc.id] = fc;
      for (const q of initialBundle.quotations) db.QUOTATIONS[q.id] = q;
      for (const t of initialBundle.woTasks) db.WO_TASKS[t.id] = t;
      for (const d of initialBundle.amcDocuments) db.AMC_DOCUMENTS[d.id] = d;
      for (const a of initialBundle.approvals) db.APPROVALS[a.id] = a;
      for (const r of initialBundle.replacements) db.REPLACEMENTS[r.id] = r;
      for (const m of initialBundle.materialRequests) db.MATERIAL_REQUESTS[m.id] = m;
      for (const d of initialBundle.replacementDocuments) db.REPLACEMENT_DOCUMENTS[d.id] = d;
      for (const s of initialBundle.materialSubmittals) db.MATERIAL_SUBMITTALS[s.id] = s;
      for (const r of initialBundle.materialSubmittalRevisions) db.MATERIAL_SUBMITTAL_REVISIONS[r.id] = r;
      for (const i of initialBundle.materialItems) db.MATERIAL_ITEMS[i.id] = i;
      for (const d of initialBundle.shopDrawings) db.SHOP_DRAWINGS[d.id] = d;
      for (const r of initialBundle.shopDrawingRevisions) db.SHOP_DRAWING_REVISIONS[r.id] = r;
      for (const f of initialBundle.shopDrawingFiles) db.SHOP_DRAWING_FILES[f.id] = f;
      for (const j of initialBundle.projectJca) db.PROJECT_JCA[j.id] = j;
      for (const h of initialBundle.projectJcaHistory) db.PROJECT_JCA_HISTORY[h.id] = h;
    }
    return true;
  });

  const [userId, setUserId] = useState<string>(currentUser?.id ?? initialUserId);
  const [activeOrgId, setActiveOrgId] = useState<string>(currentUser?.organization_id ?? DEFAULT_ORG_ID);
  const [cmdkOpen, setCmdk] = useState(false);
  const [notifOpen, setNotif] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesVersion, setNotesVersion] = useState(0);
  const bumpNotes = useCallback(() => setNotesVersion(v => v + 1), []);

  // Sidebar collapse. IMPORTANT: the initial value MUST be the same on the
  // server and on the client's first render, otherwise React throws a
  // hydration mismatch (the Topbar toggle's aria-label and the AppShell
  // backdrop both depend on this). So we seed the SSR default (`false`) and
  // apply the persisted / viewport-aware preference in an effect after mount.
  const [sidebarCollapsed, setSidebarCollapsedRaw] = useState<boolean>(false);
  useEffect(() => {
    let initial: boolean;
    try {
      const stored = window.localStorage.getItem("sidebar_collapsed");
      if (stored === "true") initial = true;
      else if (stored === "false") initial = false;
      else initial = window.matchMedia("(max-width: 1024px)").matches;
    } catch {
      // private mode etc. - fall back to viewport-aware default
      initial = window.matchMedia("(max-width: 1024px)").matches;
    }
    setSidebarCollapsedRaw(initial);
  }, []);
  const setSidebarCollapsed = useCallback((next: boolean | ((o: boolean) => boolean)) => {
    setSidebarCollapsedRaw(prev => {
      const v = typeof next === "function" ? next(prev) : next;
      try { window.localStorage.setItem("sidebar_collapsed", String(v)); } catch { /* ignore */ }
      return v;
    });
  }, []);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(o => !o), [setSidebarCollapsed]);
  const [slideover, setSlideover] = useState<Slideover | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [create, setCreate] = useState<CreateState | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>(
    initialNotifications && initialNotifications.length > 0 ? initialNotifications : NOTIFICATIONS,
  );

  // When a real signed-in user is passed from the server layout, that is the
  // source of truth for `me`. Otherwise we fall back to the mock dict lookup
  // (dev / role-switcher path).
  const hasRealAuth = !!currentUser;
  const me = hasRealAuth ? currentUser! : db.user(userId);
  const role = me.role;

  // currentOrg: super_admin previews via activeOrgId; everyone else is locked to
  // their own org (RLS will enforce this server-side once live).
  const currentOrg = useMemo<Organization | null>(() => {
    const id = role === "super_admin" ? activeOrgId : (me.organization_id ?? DEFAULT_ORG_ID);
    return db.org(id);
  }, [role, activeOrgId, me.organization_id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject org branding into CSS variables + document title.
  // The :root tokens in globals.css supply mint/violet/peach defaults;
  // overriding here lets every component that uses var(--pri-500) etc.
  // pick up the active org's colors at runtime - no recompile, no Tailwind theme.
  useEffect(() => {
    if (typeof document === "undefined" || !currentOrg) return;
    const r = document.documentElement.style;
    r.setProperty("--pri-500", currentOrg.primary_color);
    r.setProperty("--pri-600", shade(currentOrg.primary_color, -12));
    r.setProperty("--pri-700", shade(currentOrg.primary_color, -25));
    r.setProperty("--sec-500", currentOrg.secondary_color);
    r.setProperty("--sec-600", shade(currentOrg.secondary_color, -12));
    r.setProperty("--sec-700", shade(currentOrg.secondary_color, -25));
    r.setProperty("--acc-500", currentOrg.accent_color);
    r.setProperty("--acc-600", shade(currentOrg.accent_color, -12));
    r.setProperty("--acc-700", shade(currentOrg.accent_color, -25));
    document.title = `${currentOrg.display_name} · OS`;
  }, [currentOrg]);

  const fmtMoney = useCallback(
    (amount: number | null | undefined, opts?: CurrencyOptions) => formatCurrency(amount, currentOrg, opts),
    [currentOrg],
  );

  // Route name derived from pathname
  const routeName = NAME_FROM_PATH(pathname);
  const routeParams = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    search?.forEach((v, k) => (p[k] = v));
    const seg = pathname.split("/").filter(Boolean);
    if (seg.length >= 2) p.id = seg[1];
    return p;
  }, [pathname, search]);

  // Cmd/Ctrl-K opens command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdk(o => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close slideover/modal on route change
  useEffect(() => { setSlideover(null); }, [pathname]);

  const go = useCallback((name: RouteName, params: Record<string, string> = {}) => {
    setSlideover(null);
    const id = params.id;
    const qs = Object.entries(params).filter(([k]) => k !== "id").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const href = `/${name}${id ? `/${id}` : ""}${qs ? `?${qs}` : ""}`;
    router.push(href);
  }, [router]);

  const openWO = useCallback((id: string) => setSlideover({ kind: "wo", id }), []);
  const openApproval = useCallback((id: string) => setSlideover({ kind: "approval", id }), []);
  const openCustomer = useCallback((id: string) => go("customers", { id }), [go]);
  const openProject = useCallback((id: string) => go("projects", { id }), [go]);
  const openAmc = useCallback((id: string) => go("amc", { id }), [go]);
  const openReplacement = useCallback((id: string) => go("replacements", { id }), [go]);
  const openGrowthPlan = useCallback((range?: string) =>
    go("growth-plan", range ? { range } : {}), [go]);

  const followTarget = useCallback((target?: FollowTarget | null) => {
    if (!target) return;
    switch (target.kind) {
      case "wo": return openWO(target.id);
      case "approval": return openApproval(target.id);
      case "customer": return openCustomer(target.id);
      case "project": return openProject(target.id);
      case "amc": return openAmc(target.id);
      case "repair": return go("repair", { id: target.id });
      case "replacement": return openReplacement(target.id);
    }
  }, [openWO, openApproval, openCustomer, openProject, openAmc, openReplacement, go]);

  const fireToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const openCreate = useCallback((kind: CreateKind, prefill?: Record<string, unknown>) => setCreate({ kind, prefill }), []);
  const closeCreate = useCallback(() => setCreate(null), []);
  const bumpData = useCallback(() => setDataVersion(v => v + 1), []);

  // Persisted notifications live in Supabase (real UUID ids). Synthetic
  // pending-confirmation rows ("pc_…") and optimistic pushes ("n_…") are
  // client-only — never write those back to the DB.
  const isPersisted = (id: string) => !id.startsWith("pc_") && !id.startsWith("n_");

  // Pull the signed-in user's notifications fresh from Supabase. RLS plus an
  // explicit user_id filter keep it to their own rows (admins can read all,
  // so the filter is required). Best-effort — failures leave state as-is.
  const refreshNotifications = useCallback(async () => {
    if (!hasRealAuth || !me.id) return;
    try {
      const { data } = await supabaseBrowser()
        .from("notifications")
        .select(NOTIFICATION_COLUMNS)
        .eq("user_id", me.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setNotifications(data.map(mapNotificationRow));
    } catch { /* offline / not configured - keep current state */ }
  }, [hasRealAuth, me.id]);

  const markAllRead = useCallback(() => {
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
    if (!hasRealAuth || !me.id) return;
    try {
      void supabaseBrowser().from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null).eq("user_id", me.id);
    } catch { /* best-effort */ }
  }, [hasRealAuth, me.id]);

  const markRead = useCallback((id: string) => {
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
    if (!hasRealAuth || !isPersisted(id)) return;
    try {
      void supabaseBrowser().from("notifications")
        .update({ read_at: new Date().toISOString() }).eq("id", id);
    } catch { /* best-effort */ }
  }, [hasRealAuth]);

  const dismissNotification = useCallback((id: string) => setNotifications(ns => ns.filter(n => n.id !== id)), []);
  const pushNotification = useCallback((n: Omit<Notification, "id" | "read"> & { id?: string; read?: boolean }) => {
    setNotifications(ns => [
      { id: n.id ?? "n_" + Date.now().toString(36), read: n.read ?? false, ...n } as Notification,
      ...ns,
    ]);
  }, []);

  // Keep the bell fresh: pull once on mount, then again each time the user
  // opens the dropdown. This is the "you see them when you open the app"
  // Phase-1 behaviour — live/push delivery is a later phase.
  useEffect(() => { void refreshNotifications(); }, [refreshNotifications]);
  useEffect(() => { if (notifOpen) void refreshNotifications(); }, [notifOpen, refreshNotifications]);

  // v1.2 — Surface every pending-confirmation item as a live notification.
  // Synthetic rows derived from the data mirror; they auto-vanish when the
  // underlying WO / Replacement leaves pending_confirmation. They can't be
  // dismissed manually — the only way out is to action them. That's the
  // point of an actionable inbox.
  const syntheticNotifications = useMemo<Notification[]>(() => {
    const out: Notification[] = [];
    const isManager = role === "admin" || role === "md" || role === "manager";
    const rel = (iso: string): string => {
      if (!iso) return "";
      const then = new Date(iso).getTime();
      if (Number.isNaN(then)) return "";
      const ms = Date.now() - then;
      if (ms < 60_000) return "just now";
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
      if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
      return `${Math.floor(ms / 86_400_000)}d ago`;
    };

    for (const wo of Object.values(db.WORK_ORDERS)) {
      if (wo.status !== "pending_confirmation") continue;
      const isLead = wo.assignedLead === me.id;
      if (!isLead && !isManager) continue;
      // Find the most-recent closed time entry on this WO so we can name
      // the worker and timestamp the moment they finished.
      const entries = Object.values(db.WORK_ORDER_TIME_ENTRIES)
        .filter(e => e.workOrderId === wo.id && e.endedAt);
      entries.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
      const latest = entries[0];
      const iso = latest?.endedAt ?? wo.scheduledEnd ?? wo.scheduledStart;
      const workerName = latest?.userId ? db.user(latest.userId).name : "A team member";
      out.push({
        id:       `pc_wo_${wo.id}`,
        t:        rel(iso),
        iso,
        read:     false,
        kind:     "workorder",
        title:    `${wo.code} ready for confirmation`,
        body:     `${workerName} finished work on "${wo.title}" — review and mark done.`,
        target:   { kind: "wo", id: wo.id },
        priority: "normal",
        actions:  ["view"],
      });
    }

    for (const rr of Object.values(db.REPLACEMENTS)) {
      if (rr.status !== "pending_confirmation") continue;
      const isRequester = rr.requestedBy === me.id;
      if (!isRequester && !isManager) continue;
      const iso = rr.installedAt ?? rr.requestedAt;
      const installerName = rr.installedBy ? db.user(rr.installedBy).name : "Installer";
      out.push({
        id:       `pc_rr_${rr.id}`,
        t:        rel(iso),
        iso,
        read:     false,
        kind:     "signoff",
        title:    `${rr.code} installed — confirm`,
        body:     `${installerName} installed ${rr.quantity}× ${rr.itemName} — confirm it's correct.`,
        target:   { kind: "replacement", id: rr.id },
        priority: "normal",
        actions:  ["view"],
      });
    }

    out.sort((a, b) => (b.iso ?? "").localeCompare(a.iso ?? ""));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, me.id, dataVersion]);

  // Merge synthetic (live) on top of persisted notifications. Synthetic
  // IDs are namespaced (`pc_…`) so they can't collide with pushed ones.
  const allNotifications = useMemo(
    () => [...syntheticNotifications, ...notifications],
    [syntheticNotifications, notifications],
  );
  const unreadCount = allNotifications.filter(n => !n.read).length;

  const value: Ctx = {
    me, userId, setUserId, role, hasRealAuth,
    currentOrg, activeOrgId, setActiveOrgId, fmtMoney,
    route: { name: routeName, params: routeParams }, go,
    cmdkOpen, setCmdk,
    notifOpen, setNotif,
    notesOpen, setNotesOpen, notesVersion, bumpNotes,
    sidebarCollapsed, setSidebarCollapsed, toggleSidebar,
    slideover, setSlideover, openWO, openApproval, openCustomer, openProject, openAmc, openReplacement, openGrowthPlan, followTarget,
    modal, setModal,
    create, openCreate, closeCreate, dataVersion, bumpData,
    toast, fireToast, dismissToast,
    notifications: allNotifications, setNotifications, markAllRead, markRead, dismissNotification, pushNotification, unreadCount,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
