// ============================================================
// One-shot: seed the Super Admin into Supabase.
//   1. Create auth user (email + password, auto-confirmed)
//   2. Insert / upsert matching row in public.users
// Run: node scripts/seed-super-admin.mjs
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const supa = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const EMAIL = "superadmin@sirahdigital.in";
const PASSWORD = "Sirahdigital@2025";
const FULLNAME = "Sirah Digital Super Admin";

async function main() {
  // 0) Sanity: is public.users reachable?
  const { error: probeErr } = await supa.from("users").select("id").limit(1);
  if (probeErr) {
    console.error("✗ Cannot read public.users - has setup.sql been applied?");
    console.error("  Underlying error:", probeErr.message);
    process.exit(1);
  }
  console.log("✓ public.users reachable");

  // 1) Create or fetch the auth user
  let authUserId = null;

  // First, try listing - if the user already exists, reuse them
  const { data: list, error: listErr } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) { console.error("✗ listUsers failed:", listErr.message); process.exit(1); }
  const existing = list?.users?.find(u => u.email?.toLowerCase() === EMAIL.toLowerCase());

  if (existing) {
    authUserId = existing.id;
    console.log(`✓ auth user already exists (${authUserId}) - updating password & confirming email`);
    const { error: updErr } = await supa.auth.admin.updateUserById(authUserId, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updErr) { console.error("✗ updateUser failed:", updErr.message); process.exit(1); }
  } else {
    const { data: created, error: createErr } = await supa.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULLNAME },
    });
    if (createErr) { console.error("✗ createUser failed:", createErr.message); process.exit(1); }
    authUserId = created.user.id;
    console.log(`✓ auth user created (${authUserId})`);
  }

  // 2) Try to upsert public.users with role='super_admin'
  const baseRow = {
    auth_id: authUserId,
    email: EMAIL,
    full_name: FULLNAME,
    initials: "SA",
    tint: "violet",
    region: "UAE",
    is_active: true,
  };

  // First attempt: super_admin
  let { error: insertErr } = await supa
    .from("users")
    .upsert({ ...baseRow, role: "super_admin" }, { onConflict: "email" });

  if (insertErr && /invalid input value for enum/i.test(insertErr.message)) {
    console.warn("⚠ role enum doesn't include 'super_admin' - falling back to 'admin'");
    console.warn("  To upgrade later, run in Supabase SQL editor:");
    console.warn("    alter type role add value if not exists 'super_admin';");
    console.warn("    update public.users set role = 'super_admin' where email = '" + EMAIL + "';");
    ({ error: insertErr } = await supa
      .from("users")
      .upsert({ ...baseRow, role: "admin" }, { onConflict: "email" }));
  }

  if (insertErr) {
    console.error("✗ Failed to upsert public.users:", insertErr.message);
    process.exit(1);
  }
  console.log("✓ public.users row upserted and linked to auth user");

  // 3) Verify
  const { data: verify, error: verErr } = await supa
    .from("users").select("email, role, auth_id, is_active")
    .eq("email", EMAIL).single();
  if (verErr) { console.error("✗ Verify failed:", verErr.message); process.exit(1); }
  console.log("");
  console.log("┌─────────────────────────────────────────────");
  console.log("│ ✓ DONE - Super Admin ready to sign in");
  console.log("├─────────────────────────────────────────────");
  console.log("│ Email:    ", verify.email);
  console.log("│ Password: ", PASSWORD);
  console.log("│ Role:     ", verify.role);
  console.log("│ auth_id:  ", verify.auth_id);
  console.log("│ active:   ", verify.is_active);
  console.log("└─────────────────────────────────────────────");
}

main().catch(e => { console.error("Unhandled:", e); process.exit(1); });
