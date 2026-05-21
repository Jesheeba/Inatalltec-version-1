import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingSplash } from "@/components/shared/LoadingSplash";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { hydrateAll } from "@/lib/hydrate";
import type { Role, Tint, User } from "@/lib/types";

// TEMPORARY (until the `role` enum gains 'super_admin' via DDL):
// any email in this list is treated as super_admin in the UI even if the
// DB stores them as 'admin'. Remove this once you run:
//   alter type role add value if not exists 'super_admin';
//   update public.users set role = 'super_admin' where email = '...';
const SUPER_ADMIN_EMAILS = new Set<string>([
  "superadmin@sirahdigital.in",
]);

// Server layout for the authenticated app routes. The shell itself
// (sidebar/topbar/bottomnav + overlay portals) is a client component.
// We resolve the signed-in Supabase user → users-table row here so the
// rest of the app sees the real signed-in identity (not the seeded mock).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests; this is defensive.
  if (!authUser) redirect("/login");

  // Profile lookup goes through the service-role client.
  //   Reason: the RLS helper functions (fn_my_id / fn_is_admin) on public.users
  //   in setup.sql call back into users, which triggers infinite recursion under
  //   RLS and returns "stack depth limit exceeded". We've already authenticated
  //   the user via auth.getUser(); scoping the lookup by auth_id keeps this safe.
  // Also schema-tolerant: v6 select first, fall back without organization_id if
  // the column doesn't exist yet (pre-v6 setup.sql).
  const admin = supabaseAdmin();
  const V6_COLS = "id, full_name, email, phone, initials, tint, role, manager_id, team_id, region, organization_id, is_active";
  const PRE_COLS = "id, full_name, email, phone, initials, tint, role, manager_id, team_id, region, is_active";

  let row: Record<string, unknown> | null = null;
  let error: { message?: string; code?: string } | null = null;

  const first = await admin.from("users").select(V6_COLS).eq("auth_id", authUser.id).maybeSingle();
  if (first.error && /organization_id/i.test(first.error.message)) {
    const fallback = await admin.from("users").select(PRE_COLS).eq("auth_id", authUser.id).maybeSingle();
    row = fallback.data as Record<string, unknown> | null;
    error = fallback.error;
  } else {
    row = first.data as Record<string, unknown> | null;
    error = first.error;
  }

  // Auth user exists but has no profile in the users table - surface this
  // clearly instead of dropping them onto a half-broken dashboard.
  if (error || !row || row.is_active === false) {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}>
        <div className="card card-pad-lg" style={{ width: "100%", maxWidth: 460, textAlign: "center" }}>
          <div style={{ font: "var(--t-h2)", marginBottom: 6 }}>Account not provisioned</div>
          <div style={{ font: "var(--t-body)", color: "var(--ink-mute)", marginBottom: 16 }}>
            Your sign-in worked, but <strong>{authUser.email}</strong> isn't linked to a profile yet.
            An administrator needs to add your account to the users table.
          </div>
          <form action="/api/auth/signout" method="post">
            <button className="btn btn-soft btn-block">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  const fullName = (row.full_name as string) ?? "";
  const email = (row.email as string) ?? authUser.email ?? "";
  // Allowlist override: see SUPER_ADMIN_EMAILS comment above.
  const effectiveRole: Role = SUPER_ADMIN_EMAILS.has(email.toLowerCase())
    ? "super_admin"
    : (row.role as Role);

  const currentUser: User = {
    id: row.id as string,
    name: fullName,
    email,
    phone: (row.phone as string) ?? "",
    initials: (row.initials as string) ?? fullName.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase() ?? "?",
    tint: (row.tint as Tint) ?? "primary",
    role: effectiveRole,
    mgr: (row.manager_id as string | null) ?? null,
    team: (row.team_id as string | null) ?? null,
    skills: [],
    region: (row.region as string) ?? "UAE",
    organization_id: (row.organization_id as string | undefined) ?? undefined,
  };

  // Fetch every active user so the in-memory db.USERS used by list views
  // survives a page reload. Soft-deleted users (is_active=false) are excluded
  // so they don't reappear after deletion. Schema-tolerant in the same way as
  // the single-row fetch above.
  const listRes = await admin.from("users").select(V6_COLS).eq("is_active", true);
  const list = listRes.error && /organization_id/i.test(listRes.error.message)
    ? await admin.from("users").select(PRE_COLS).eq("is_active", true)
    : listRes;

  const initialUsers: User[] = ((list.data ?? []) as Record<string, unknown>[]).map(r => {
    const rEmail = ((r.email as string) ?? "").toLowerCase();
    const rRole: Role = SUPER_ADMIN_EMAILS.has(rEmail) ? "super_admin" : (r.role as Role);
    const rName = (r.full_name as string) ?? "";
    return {
      id: r.id as string,
      name: rName,
      email: (r.email as string) ?? "",
      phone: (r.phone as string) ?? "",
      initials: (r.initials as string) ?? rName.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase() ?? "?",
      tint: (r.tint as Tint) ?? "primary",
      role: rRole,
      mgr: (r.manager_id as string | null) ?? null,
      team: (r.team_id as string | null) ?? null,
      skills: [],
      region: (r.region as string) ?? "UAE",
      organization_id: (r.organization_id as string | undefined) ?? undefined,
    };
  });

  // Hydrate every list view's source-of-truth from Supabase in a single
  // parallel fan-out. This replaces the previous mock-data fallback -
  // db.PROJECTS / db.CUSTOMERS / db.AMCS / etc. are populated from real
  // rows on every page load, so creates persist visibly across refreshes.
  const bundle = await hydrateAll(admin);

  return (
    <>
      <AppShell currentUser={currentUser} initialUsers={initialUsers} initialBundle={bundle}>
        {children}
      </AppShell>
      <LoadingSplash />
    </>
  );
}
