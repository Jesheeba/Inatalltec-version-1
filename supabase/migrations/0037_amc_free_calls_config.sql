-- ============================================================
-- 0037 — Per-contract free-call entitlement configuration
-- ============================================================
-- Until now every AMC implicitly assumed 10 free calls
-- (amc_contracts.free_calls_included default 10 from 0001), regardless
-- of what the customer actually negotiated. This migration makes the
-- entitlement explicit and three-valued, plus an "unset" state that the
-- UI flags so the Operations Manager confirms real terms.
--
--   free_calls_mode:
--     NULL        → unset. UI shows a red "No free calls assigned"
--                   warning on the AMC detail page + the contract list.
--     'limited'   → capped. The cap lives in free_calls_included
--                   (existing column), e.g. "1 of 10 included".
--     'unlimited' → no cap. KPI shows the used count + "Unlimited".
--     'none'      → contract includes no free calls; visits are billable.
--
-- Existing rows are intentionally left at NULL (unset) so the historical
-- implicit-10 assumption surfaces as a missing-configuration warning
-- rather than silently carrying forward.
--
-- free_calls_included is reused as the 'limited' cap; it keeps its
-- existing NOT NULL DEFAULT 10 (harmless for the other modes, which
-- never read it). free_calls_used (the running counter) is unchanged.
-- ============================================================

alter table amc_contracts
  add column if not exists free_calls_mode text;

-- free_calls_included was NOT NULL DEFAULT 10 (the old implicit cap). It is
-- now the 'limited' cap and is NULL for unlimited / none / unset, so relax
-- the constraint and drop the default. Existing rows keep their value 10,
-- but their NULL mode marks them "unset" so the UI ignores the stale cap.
alter table amc_contracts alter column free_calls_included drop not null;
alter table amc_contracts alter column free_calls_included drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'amc_free_calls_mode_chk'
  ) then
    alter table amc_contracts
      add constraint amc_free_calls_mode_chk
      check (free_calls_mode is null
             or free_calls_mode in ('limited', 'unlimited', 'none'));
  end if;
end $$;

comment on column amc_contracts.free_calls_mode is
  'Free-call entitlement: NULL=unset (warn), limited (cap=free_calls_included), unlimited, none.';
