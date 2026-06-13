-- ============================================================
-- 0054 — Accountant module · Phase 4 (Slice 4C-2): WPS employer settings
--
-- Adds the organisation-level WPS (Wage Protection System) identifiers to
-- accounting_settings so the payroll WPS file can be generated without the
-- accountant re-typing them every run. These are EMPLOYER-level, stable
-- values issued by MOHRE / the employer's bank:
--
--   • wps_establishment_id — the MOL establishment / employer unique ID
--   • wps_agent_id          — the employer bank routing / WPS Agent ID
--   • wps_bank_name         — optional short bank name (filename / display)
--
-- Strictly ADDITIVE (ADD COLUMN IF NOT EXISTS) — does not alter or drop any
-- existing column, so prior Settings behaviour is untouched. Idempotent;
-- single txn. The accountant fills these in on the Settings tab; the WPS
-- builder (wps.ts) refuses to generate a file until they are present.
-- ============================================================

begin;

alter table public.accounting_settings add column if not exists wps_establishment_id text;
alter table public.accounting_settings add column if not exists wps_agent_id          text;
alter table public.accounting_settings add column if not exists wps_bank_name         text;

-- ── Smoke test ──────────────────────────────────────────────
do $$
declare v_cols int;
begin
  select count(*) into v_cols from information_schema.columns
   where table_schema='public' and table_name='accounting_settings'
     and column_name in ('wps_establishment_id','wps_agent_id','wps_bank_name');
  if v_cols <> 3 then raise exception '0054 failed: expected 3 WPS columns, found %', v_cols; end if;
  raise notice '─── 0054 applied: WPS employer settings columns added ───';
end $$;

commit;
