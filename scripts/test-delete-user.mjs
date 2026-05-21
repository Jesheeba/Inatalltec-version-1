// Exercise the DELETE /api/admin/users/[id] logic directly.
// Creates a throwaway user, deletes it, confirms both auth.users and
// public.users are gone. If this passes, the bug is in the dev server cache.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const EMAIL = `delete-test-${Date.now().toString(36)}@installtec.com`;

console.log("=== 1. Create throwaway user ===");
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email: EMAIL, password: "Throwaway@123", email_confirm: true,
  user_metadata: { full_name: "Throwaway" },
});
if (cErr) { console.error("✗", cErr.message); process.exit(1); }
const authId = created.user.id;
console.log("✓ auth user:", authId);

const { data: upserted, error: uErr } = await admin.from("users").upsert({
  auth_id: authId, email: EMAIL, full_name: "Throwaway",
  initials: "TH", tint: "primary", role: "admin", region: "UAE", is_active: true,
}, { onConflict: "email" }).select("id").single();
if (uErr) { console.error("✗", uErr.message); process.exit(1); }
const pubId = upserted.id;
console.log("✓ public.users row:", pubId);

console.log("\n=== 2. Delete via the same logic the API route uses ===");
const { error: dErr } = await admin.from("users").delete().eq("id", pubId);
if (dErr) { console.error("✗ public delete:", dErr.message); process.exit(1); }
console.log("✓ public.users row deleted");

try { await admin.auth.admin.deleteUser(authId); console.log("✓ auth user deleted"); }
catch (e) { console.error("✗ auth delete:", e.message); }

console.log("\n=== 3. Confirm both are really gone ===");
const { data: stillPub } = await admin.from("users").select("id").eq("email", EMAIL);
const { data: stillAuth } = await admin.auth.admin.listUsers({ perPage: 200 });
const stillAuthRow = stillAuth.users.find(u => u.email === EMAIL);
console.log("public.users rows for that email:", stillPub?.length ?? 0);
console.log("auth.users rows for that email: ", stillAuthRow ? 1 : 0);

if ((stillPub?.length ?? 0) === 0 && !stillAuthRow) {
  console.log("\n✓ DELETE LOGIC WORKS. The bug is in your dev server - restart it.");
} else {
  console.log("\n✗ DELETE LOGIC FAILED - bug is in code, not cache.");
}
