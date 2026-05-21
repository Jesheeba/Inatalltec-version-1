// Pre-flight audit for migration 0009 (AMC engine, Option C - rename + extend).
// Confirms it is safe to drop+recreate amc_service_schedule, lists enum values,
// counts contracts that need their state mapped, and checks whether
// amc_payments has any rows (= whether the existing fn_amc_payment_received
// trigger has ever fired).

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

async function count(table) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) return { error: error.message };
  return { count };
}

console.log("─── Migration 0009 pre-flight audit ───\n");

console.log("1. amc_service_schedule row count:");
console.log("  ", await count("amc_service_schedule"));

console.log("\n2. amc_contracts row count + state distribution:");
const { data: contracts, error: cErr } = await admin
  .from("amc_contracts").select("id, code, state");
if (cErr) console.log("  ERROR:", cErr.message);
else {
  console.log(`   total: ${contracts.length}`);
  const dist = new Map();
  for (const c of contracts) dist.set(c.state ?? "(null)", (dist.get(c.state ?? "(null)") ?? 0) + 1);
  for (const [k, v] of dist) console.log(`   ${v.toString().padStart(3)}  state=${JSON.stringify(k)}`);
}

console.log("\n3. amc_payments row count:");
console.log("  ", await count("amc_payments"));

console.log("\n4. Existing amc_state enum values:");
// Postgres exposes this via pg_enum, but PostgREST won't query system tables.
// Workaround: try to insert a sentinel value and inspect the rejection, OR
// use rpc. Easiest is to dump the migration file we already have for ground truth:
console.log("   (from 0001_init.sql line 25):");
console.log("   'DRAFT','SIGNED','ACTIVE','PENDING_REACTIVATION','BLOCKED','RENEWAL_DUE','EXPIRED','CANCELLED'");

console.log("\n5. Does amc_status enum already exist (would conflict with rename)?");
// Try selecting a column typed as amc_status — if it doesn't exist this errors.
const { error: probe } = await admin.from("amc_contracts").select("contract_status").limit(1);
console.log("   probe of amc_contracts.contract_status:", probe ? `not present (${probe.message})` : "ALREADY EXISTS (column found)");

console.log("\n─── audit complete ───");
