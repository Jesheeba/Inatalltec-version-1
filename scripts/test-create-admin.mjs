// Exercise the /api/admin/users logic directly (bypassing HTTP / auth)
// to confirm the underlying Supabase operations work end-to-end.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i+1).trim()]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

// Mimic what /api/admin/users would do for a new admin
const EMAIL = `test-admin-${Date.now().toString(36)}@installtec.com`;
const FULLNAME = "Test Admin";
const PASSWORD = "Test@123";

console.log(`Creating: ${EMAIL}`);

// Step 1: auth.admin.createUser
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
  user_metadata: { full_name: FULLNAME },
});
if (cErr) { console.error("✗ auth.admin.createUser:", cErr.message); process.exit(1); }
console.log("✓ auth user created:", created.user.id);

// Step 2: upsert public.users (try super_admin first, fall back)
const baseRow = {
  auth_id: created.user.id,
  email: EMAIL,
  phone: null,
  full_name: FULLNAME,
  initials: "TA",
  tint: "primary",
  role: "admin",
  manager_id: null,
  team_id: null,
  region: "UAE",
  is_active: true,
  organization_id: "org_installtec", // mimic what the form sends
};

let { data: row, error: insErr } = await admin
  .from("users")
  .upsert(baseRow, { onConflict: "email" })
  .select("id")
  .single();

if (insErr) {
  console.error("✗ first upsert:", insErr.message);
  // Retry without org_id and with role=admin (which it already is)
  const { organization_id: _drop, ...withoutOrg } = baseRow;
  void _drop;
  ({ data: row, error: insErr } = await admin.from("users").upsert(withoutOrg, { onConflict: "email" }).select("id").single());
  if (insErr) {
    console.error("✗ retry upsert:", insErr.message);
    await admin.auth.admin.deleteUser(created.user.id);
    process.exit(1);
  }
  console.log("✓ public.users created (retry without org_id):", row.id);
} else {
  console.log("✓ public.users created (first try):", row.id);
}

// Verify
const { data: verify } = await admin.from("users")
  .select("id, email, role, auth_id, is_active").eq("email", EMAIL).single();
console.log("\nVerify:", verify);

// Cleanup
console.log("\nCleaning up test user...");
await admin.from("users").delete().eq("email", EMAIL);
await admin.auth.admin.deleteUser(created.user.id);
console.log("✓ done");
