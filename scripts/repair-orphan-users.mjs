// Repair every auth.users row that has no matching public.users row.
//   - Confirm the email (so sign-in is allowed)
//   - Reset password to <FirstName>@123 derived from email local-part
//     (capitalised, e.g. haja@... → Haja@123, jesheebafathimamh@... → Jesheebafathimamh@123)
//   - Insert a public.users row with role='admin' (UI promotes to super_admin
//     by email allowlist if needed)
//
// Idempotent: safe to re-run.

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

function defaultPassword(emailLocal) {
  const cleaned = emailLocal.replace(/[^a-zA-Z0-9]/g, "");
  const cap = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return `${cap}@123`;
}
function initialsFrom(local) {
  return local.slice(0, 2).toUpperCase() || "?";
}

const { data: authList } = await admin.auth.admin.listUsers({ perPage: 200 });
const { data: pubUsers } = await admin.from("users").select("auth_id, email");
const linkedAuthIds = new Set(pubUsers.map(u => u.auth_id).filter(Boolean));

const orphans = authList.users.filter(u => !linkedAuthIds.has(u.id));
if (orphans.length === 0) { console.log("✓ No orphans to repair."); process.exit(0); }

console.log(`Repairing ${orphans.length} orphan auth user(s)...\n`);

for (const au of orphans) {
  const email = au.email;
  if (!email) { console.log(`  ⚠ auth user ${au.id} has no email - skipping`); continue; }

  const local = email.split("@")[0] || "user";
  const password = defaultPassword(local);
  const fullName = (au.user_metadata?.full_name) || (local.charAt(0).toUpperCase() + local.slice(1));

  console.log(`  ${email}`);
  console.log(`    → password: ${password}`);

  // 1. Confirm + reset password
  const { error: updErr } = await admin.auth.admin.updateUserById(au.id, {
    password, email_confirm: true,
  });
  if (updErr) { console.log(`    ✗ updateUser: ${updErr.message}`); continue; }
  console.log(`    ✓ email confirmed, password reset`);

  // 2. Insert public.users row (with retry fallback)
  const baseRow = {
    auth_id: au.id,
    email,
    full_name: fullName,
    initials: initialsFrom(local),
    tint: "primary",
    role: "admin", // safe default; enum may not have super_admin
    region: "UAE",
    is_active: true,
  };
  const { error: insErr } = await admin.from("users").upsert(baseRow, { onConflict: "email" });
  if (insErr) { console.log(`    ✗ insert public.users: ${insErr.message}`); continue; }
  console.log(`    ✓ public.users row created\n`);
}

console.log("Done. Try logging in with the emails + passwords above.");
