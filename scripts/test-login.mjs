// Probe the full login chain:
// 1. Confirm auth user exists + can sign in with the password
// 2. Confirm public.users row exists with the right auth_id
// 3. Surface any cause of the "Account not provisioned" branch

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

const URL  = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SRV  = env.SUPABASE_SECRET_KEY;
const EMAIL = "superadmin@sirahdigital.in";
const PWD   = "Sirahdigital@2025";

const admin = createClient(URL, SRV,  { auth: { autoRefreshToken: false, persistSession: false } });
const anon  = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

console.log("=== 1. Auth user exists? ===");
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) { console.error("listUsers error:", listErr.message); process.exit(1); }
const u = list.users.find(x => x.email?.toLowerCase() === EMAIL.toLowerCase());
if (!u) { console.error("✗ No auth user with that email."); process.exit(1); }
console.log("✓ auth.users id:", u.id);
console.log("  email_confirmed_at:", u.email_confirmed_at);
console.log("  banned_until:", u.banned_until || "(none)");
console.log("  last_sign_in_at:", u.last_sign_in_at || "(never)");

console.log("\n=== 2. Can we sign in with the password (using ANON key, like the browser)? ===");
const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PWD });
if (signErr) {
  console.error("✗ signInWithPassword failed:", signErr.message);
  console.error("  status:", signErr.status, "code:", signErr.code);
} else {
  console.log("✓ Sign-in succeeded. Session user id:", signIn.user?.id);
}

console.log("\n=== 3. public.users row? ===");
const { data: row, error: rowErr } = await admin
  .from("users")
  .select("id, full_name, email, role, auth_id, is_active")
  .eq("auth_id", u.id)
  .maybeSingle();
if (rowErr) { console.error("✗ row query error:", rowErr.message); process.exit(1); }
if (!row)   { console.error("✗ No public.users row links to auth_id", u.id); process.exit(1); }
console.log("✓ public.users row:", row);

console.log("\n=== Summary ===");
console.log("Login should work in the browser at /login with:");
console.log("  email:    ", EMAIL);
console.log("  password: ", PWD);
