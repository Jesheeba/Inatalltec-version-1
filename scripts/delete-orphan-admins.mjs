// One-shot cleanup: remove haja + jesheebafathimamh from Supabase
// (both auth.users and public.users). Preserves superadmin@sirahdigital.in.

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

const TARGETS = ["haja@installtec.com", "jesheebafathimamh@gmail.com"];

for (const email of TARGETS) {
  console.log(`\n${email}`);

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const au = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  const { error: pErr } = await admin.from("users").delete().eq("email", email);
  if (pErr) console.log(`  ✗ public.users delete: ${pErr.message}`);
  else      console.log(`  ✓ public.users row removed`);

  if (au) {
    try { await admin.auth.admin.deleteUser(au.id); console.log(`  ✓ auth.users row removed`); }
    catch (e) { console.log(`  ✗ auth.users delete: ${e.message}`); }
  } else {
    console.log(`  · no auth.users row to remove`);
  }
}

console.log("\nFinal state:");
const { data: still } = await admin.from("users").select("email, role").order("email");
for (const u of still) console.log(`  ${u.email}  role=${u.role}`);
