// One-shot diagnostic: report Supabase Auth users + users-table rows
// + whether they're linked via auth_id. Read-only - makes no changes.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const out = { auth_users: [], profile_rows: [], linked: [], orphan_auth: [], orphan_profile: [] };

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 100 });
if (listErr) { console.error("auth.admin.listUsers failed:", listErr.message); process.exit(2); }
out.auth_users = (list?.users ?? []).map(u => ({ id: u.id, email: u.email, created_at: u.created_at, confirmed: !!u.email_confirmed_at }));

const { data: rows, error: rowsErr } = await sb
  .from("users")
  .select("id, auth_id, email, full_name, role, is_active")
  .limit(100);
if (rowsErr) { console.error("users SELECT failed:", rowsErr.message); process.exit(3); }
out.profile_rows = rows ?? [];

for (const au of out.auth_users) {
  const match = out.profile_rows.find(r => r.auth_id === au.id);
  if (match) out.linked.push({ email: au.email, role: match.role, name: match.full_name, active: match.is_active });
  else out.orphan_auth.push({ email: au.email, id: au.id });
}
out.orphan_profile = out.profile_rows.filter(r => !r.auth_id);

console.log(JSON.stringify(out, null, 2));
