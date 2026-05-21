// ============================================================
// DELETE /api/admin/users/:id - soft-delete a user.
//   1. AuthZ: caller must be signed in AND be admin / super_admin
//   2. Lookup target's role + active state
//   3. Soft-delete public.users (is_active=false, deactivated_at=now())
//      - preserves history; the (app)/layout.tsx active-user check then
//        refuses further app access on next sign-in.
//   4. Write an explicit admin_audit_log entry attributing the action to the
//      caller (service-role writes don't propagate auth.uid() to the
//      auto-trigger, so attribution would otherwise be lost).
//   5. Refuse to delete yourself; only super_admin can deactivate other admins.
// ============================================================

import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

const SUPER_ADMIN_EMAILS = new Set(["superadmin@sirahdigital.in"]); // mirrors layout allowlist

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const targetId = ctx.params.id;
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }

  // ── AuthN: who is calling? ────────────────────────────────
  const userClient = supabaseServer();
  const { data: { user: authUser } } = await userClient.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: caller } = await admin
    .from("users")
    .select("id, role, email")
    .eq("auth_id", authUser.id)
    .maybeSingle();

  const callerEmail = (caller?.email as string | undefined)?.toLowerCase() ?? "";
  const callerIsSuper =
    caller?.role === "super_admin" || SUPER_ADMIN_EMAILS.has(callerEmail);
  const callerIsAdmin = caller?.role === "admin" || callerIsSuper;

  if (!callerIsAdmin) {
    return NextResponse.json({ ok: false, error: "Forbidden - admin role required" }, { status: 403 });
  }

  if (caller?.id === targetId) {
    return NextResponse.json({ ok: false, error: "You can't delete your own account." }, { status: 400 });
  }

  // ── Look up the target ───────────────────────────────────
  const { data: target } = await admin
    .from("users")
    .select("id, email, role, is_active")
    .eq("id", targetId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  // Only super_admin can deactivate admins / super_admins
  if ((target.role === "admin" || target.role === "super_admin") && !callerIsSuper) {
    return NextResponse.json({ ok: false, error: "Only Super Admin can deactivate Admin accounts." }, { status: 403 });
  }

  if (target.is_active === false) {
    return NextResponse.json({ ok: true, note: "Already inactive" });
  }

  // ── Soft delete ──────────────────────────────────────────
  // Schema-tolerant: pre-v6 setups (setup.sql) don't have `deactivated_at`.
  // Try the full update; on ANY error, retry with just is_active so a stale
  // schema can't block the soft delete. We don't gate on the error message -
  // PostgREST's missing-column message varies (e.g. PGRST204 "Could not find
  // the column in the schema cache") and we got bitten by that already.
  const nowIso = new Date().toISOString();
  let usedDeactivatedAt = false;

  const fullUpdate = await admin
    .from("users")
    .update({ is_active: false, deactivated_at: nowIso })
    .eq("id", targetId);

  let updateErr: { message: string } | null = fullUpdate.error;

  if (fullUpdate.error) {
    const minimal = await admin
      .from("users")
      .update({ is_active: false })
      .eq("id", targetId);
    updateErr = minimal.error;
  } else {
    usedDeactivatedAt = true;
  }

  if (updateErr) {
    // Surface the real error so a real bug isn't hidden behind a generic 500.
    return NextResponse.json(
      { ok: false, error: `Soft-delete update failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  // ── Explicit audit log entry ─────────────────────────────
  // The auto-trigger fn_admin_audit sees auth.uid() = null under service role,
  // so attribution would be lost. Best-effort insert; never blocks the delete.
  try {
    const after: Record<string, unknown> = { is_active: false };
    if (usedDeactivatedAt) after.deactivated_at = nowIso;
    await admin.from("admin_audit_log").insert({
      admin_id: caller?.id ?? null,
      action: "soft_delete",
      target_type: "users",
      target_id: targetId,
      before_value: { is_active: true },
      after_value: after,
    });
  } catch { /* best effort */ }

  return NextResponse.json({ ok: true });
}
