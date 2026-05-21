// Diagnostic: list every distinct projects.status and projects.stage value
// so we can flag any free-text that the 0008 enum migration would mis-map.

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

const { data, error } = await admin.from("projects").select("id, code, name, status, stage");
if (error) { console.error(error.message); process.exit(1); }

const byStatus = new Map();
const byStage  = new Map();
for (const r of data ?? []) {
  byStatus.set(r.status ?? "(null)", (byStatus.get(r.status ?? "(null)") ?? 0) + 1);
  byStage.set (r.stage  ?? "(null)", (byStage.get (r.stage  ?? "(null)") ?? 0) + 1);
}

console.log(`projects: ${data?.length ?? 0} rows\n`);
console.log("status distribution:");
for (const [k, v] of byStatus) console.log(`  ${v.toString().padStart(4)}  ${JSON.stringify(k)}`);
console.log("\nstage distribution:");
for (const [k, v] of byStage)  console.log(`  ${v.toString().padStart(4)}  ${JSON.stringify(k)}`);
