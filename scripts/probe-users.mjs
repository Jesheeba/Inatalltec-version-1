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
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

// 1) Same select the layout uses
const r1 = await supa.from("users")
  .select("id, full_name, email, phone, initials, tint, role, manager_id, team_id, region, organization_id, is_active")
  .eq("email", "superadmin@sirahdigital.in").maybeSingle();
console.log("With organization_id:", r1.error ? "ERROR: " + r1.error.message : "OK", r1.data);

// 2) Without organization_id
const r2 = await supa.from("users")
  .select("id, full_name, email, phone, initials, tint, role, manager_id, team_id, region, is_active, auth_id")
  .eq("email", "superadmin@sirahdigital.in").maybeSingle();
console.log("Without organization_id:", r2.error ? "ERROR: " + r2.error.message : "OK", r2.data);
