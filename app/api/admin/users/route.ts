// ============================================================
// POST /api/admin/users - provision a new user end-to-end.
//   1. AuthZ: caller must be signed in AND be admin or super_admin
//   2. Create auth.users via service role (with default password)
//   3. Insert public.users row linked to auth_id
//   4. Return { id, credentials: { email, password } }
//
// Password rule: <FirstName>@123 (see defaultPasswordFor in lib/create.ts).
// Auto-confirms the email so the user can sign in immediately.
// ============================================================

import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { defaultPasswordFor } from "@/lib/create";

interface Body {
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  region?: string;
  manager_id?: string | null;
  team_id?: string | null;
  tint?: string;
  organization_id?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  // ── AuthN: who is calling? ────────────────────────────────
  const userClient = supabaseServer();
  const { data: { user: authUser }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authUser) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  // ── AuthZ: only admin / super_admin can provision users ──
  // Service role bypasses RLS so we can read the caller's profile without
  // tripping the recursive RLS policy on public.users.
  const admin = supabaseAdmin();
  const { data: caller } = await admin
    .from("users")
    .select("id, role, email")
    .eq("auth_id", authUser.id)
    .maybeSingle();

  const callerEmail = (caller?.email as string | undefined)?.toLowerCase() ?? "";
  const SUPER_ADMIN_EMAILS = new Set(["superadmin@sirahdigital.in"]); // mirrors layout allowlist
  const isPrivileged =
    caller?.role === "admin" ||
    caller?.role === "super_admin" ||
    SUPER_ADMIN_EMAILS.has(callerEmail);

  if (!isPrivileged) {
    return NextResponse.json({ ok: false, error: "Forbidden - admin role required" }, { status: 403 });
  }

  // ── Input validation ─────────────────────────────────────
  if (!body.email?.trim()) return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  if (!body.full_name?.trim()) return NextResponse.json({ ok: false, error: "Full name is required." }, { status: 400 });
  if (!body.role) return NextResponse.json({ ok: false, error: "Role is required." }, { status: 400 });

  // Only super_admin can mint admin / super_admin accounts.
  if ((body.role === "admin" || body.role === "super_admin") &&
    caller?.role !== "super_admin" && !SUPER_ADMIN_EMAILS.has(callerEmail)) {
    return NextResponse.json({ ok: false, error: "Only Super Admin can create Admin accounts." }, { status: 403 });
  }

  const email = body.email.trim().toLowerCase();
  const fullName = body.full_name.trim();
  const password = defaultPasswordFor(fullName, email);

  // ── Create or reuse the auth user ────────────────────────
  let authId: string;
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list.data?.users.find(u => u.email?.toLowerCase() === email);
  if (existing) {
    authId = existing.id;
    // Reset password to the standard so the credentials we return work.
    await admin.auth.admin.updateUserById(authId, { password, email_confirm: true });
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created.user) {
      return NextResponse.json({ ok: false, error: createErr?.message || "Failed to create auth user" }, { status: 500 });
    }
    authId = created.user.id;
  }

  // ── Build the public.users payload ──────────────────────
  // The pre-v6 schema doesn't have organization_id, so omit it unless
  // it'll cause a problem. Try the full payload; if Postgres rejects the
  // column, retry without it.
  const initialsFrom = (n: string) =>
    n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";

  const baseRow: Record<string, unknown> = {
    auth_id: authId,
    email,
    phone: body.phone || null,
    full_name: fullName,
    initials: initialsFrom(fullName),
    tint: body.tint || "primary",
    role: body.role,
    manager_id: body.manager_id || null,
    team_id: body.team_id || null,
    region: body.region || "UAE",
    is_active: true,
  };
  if (body.organization_id) baseRow.organization_id = body.organization_id;

  // Schema compatibility: the role enum may not have 'super_admin' and the
  // organization_id column may not exist (pre-v6 setup.sql). Try the ideal
  // payload, and on EITHER error, retry with a sanitised row that drops both
  // problem fields. Belt-and-braces so we never end up with an orphan auth
  // user that can't log in.
  const attemptUpsert = (row: Record<string, unknown>) =>
    admin.from("users").upsert(row, { onConflict: "email" }).select("id").single();

  const sanitise = (row: Record<string, unknown>) => {
    const { organization_id: _o, ...withoutOrg } = row;
    void _o;
    return { ...withoutOrg, role: (row.role === "super_admin" ? "admin" : row.role) };
  };

  let { data: upserted, error: upsertErr } = await attemptUpsert(baseRow);

  // Single combined retry - handles both the enum and the missing-column case.
  if (upsertErr &&
    (/invalid input value for enum/i.test(upsertErr.message) ||
      /organization_id/i.test(upsertErr.message) ||
      /column .* does not exist/i.test(upsertErr.message))) {
    ({ data: upserted, error: upsertErr } = await attemptUpsert(sanitise(baseRow)));
  }

  if (upsertErr) {
    // Roll back the orphan auth user so the next attempt isn't blocked by it.
    try { await admin.auth.admin.deleteUser(authId); } catch { /* best effort */ }
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  // ── Explicit audit log entry ─────────────────────────────
  // The auto-trigger fn_admin_audit sees auth.uid() = null under service role,
  // so attribution would be lost. Best-effort insert; never blocks the create.
  try {
    await admin.from("admin_audit_log").insert({
      admin_id: (caller as { id?: string } | null)?.id ?? null,
      action: "create_user",
      target_type: "users",
      target_id: upserted!.id,
      before_value: null,
      after_value: { email, role: body.role, organization_id: body.organization_id ?? null },
    });
  } catch { /* best effort */ }

  return NextResponse.json({
    ok: true,
    id: upserted!.id,
    credentials: { email, password },
  });
}
