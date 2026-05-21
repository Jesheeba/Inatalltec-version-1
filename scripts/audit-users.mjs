// List every user in auth.users vs every user in public.users.
// Surfaces orphans: rows in public.users with no matching auth account
// (these are the ones who can't log in).

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

console.log("=== auth.users ===");
const { data: authList } = await admin.auth.admin.listUsers({ perPage: 200 });
for (const u of authList.users) {
  console.log(`  ${u.email?.padEnd(40)}  id=${u.id}  confirmed=${u.email_confirmed_at ? "yes" : "NO"}`);
}

console.log("\n=== public.users ===");
const { data: pubUsers, error } = await admin
  .from("users")
  .select("id, email, full_name, role, auth_id, is_active")
  .order("email");
if (error) { console.error("read err:", error.message); process.exit(1); }
for (const u of pubUsers) {
  const linked = u.auth_id ? "✓" : "✗ orphan (no auth account → CAN'T LOG IN)";
  console.log(`  ${(u.email || "(no email)").padEnd(40)}  role=${u.role?.padEnd(10) || "-"}  ${linked}`);
}

console.log("\n=== Mismatches ===");
const authEmails = new Set(authList.users.map(u => u.email?.toLowerCase()));
const pubEmails = new Set(pubUsers.map(u => u.email?.toLowerCase()));
for (const e of authEmails) if (e && !pubEmails.has(e)) console.log(`  auth has '${e}' but no public.users row`);
for (const u of pubUsers) if (u.email && !authEmails.has(u.email.toLowerCase())) console.log(`  public.users has '${u.email}' but no auth.users row → can't log in`);
