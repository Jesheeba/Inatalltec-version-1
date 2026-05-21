// Simulate the exact query the server layout runs, but via the
// anon key + the user's session JWT (just like the browser → middleware → layout chain).
// This will reveal if RLS is the culprit.

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

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

console.log("=== 1. Sign in as the user (anon key path) ===");
const { data: signIn, error: signErr } = await supa.auth.signInWithPassword({
  email: "superadmin@sirahdigital.in",
  password: "Sirahdigital@2025",
});
if (signErr) { console.error("✗ sign-in failed:", signErr.message); process.exit(1); }
console.log("✓ signed in, auth user id:", signIn.user.id);

console.log("\n=== 2. Run the layout's V6 select (with organization_id) ===");
const r1 = await supa.from("users")
  .select("id, full_name, email, phone, initials, tint, role, manager_id, team_id, region, organization_id, is_active")
  .eq("auth_id", signIn.user.id)
  .maybeSingle();
console.log("error:", r1.error?.message || "(none)");
console.log("data: ", r1.data);

console.log("\n=== 3. Run the layout's PRE_COLS fallback (no organization_id) ===");
const r2 = await supa.from("users")
  .select("id, full_name, email, phone, initials, tint, role, manager_id, team_id, region, is_active")
  .eq("auth_id", signIn.user.id)
  .maybeSingle();
console.log("error:", r2.error?.message || "(none)");
console.log("data: ", r2.data);

console.log("\n=== 4. Does the regex 'organization_id' match the V6 error? ===");
if (r1.error) {
  console.log("matches /organization_id/i?", /organization_id/i.test(r1.error.message));
  console.log("matches /column/i?         ", /column/i.test(r1.error.message));
}
