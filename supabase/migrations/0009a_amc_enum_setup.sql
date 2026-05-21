-- ============================================================
-- 0009a — AMC engine, part 1 of 2: enum mutations only
--
-- Why this file is separate from 0009b:
--   Postgres requires every `ALTER TYPE ... ADD VALUE` to be COMMITTED
--   in its own transaction before the new value can be USED (UPDATE
--   row, ::amc_status cast, default expression, anything). The Supabase
--   SQL Editor wraps the body of a single "Run" into one transaction,
--   so the legacy single-file 0009 failed with:
--     ERROR 55P04: unsafe use of new value "draft" of enum type amc_status
--     HINT: New enum values must be committed before they can be used.
--
--   This file therefore contains ONLY bare top-level ALTER TYPE
--   statements. No DO blocks (those are mini-transactions), no
--   BEGIN/COMMIT, no statements that USE the new values. The SQL
--   Editor commits between each top-level statement when there's no
--   explicit transaction, so every ADD VALUE lands cleanly.
--
-- After this file commits, run 0009b_amc_engine_main.sql to do the
-- table rename, column additions, new tables, triggers, etc.
--
-- This file is idempotent for the ADD VALUE steps (IF NOT EXISTS).
-- The RENAME is a one-shot: re-running after success will fail because
-- amc_state no longer exists. That's expected — re-run only if you
-- need to recover from a partial failure (none currently expected).
-- ============================================================

-- 1) Rename the legacy enum so the column type tracks the new name.
--    Old name 'amc_state' came from 0001_init.sql; new name aligns
--    with the contract_status column rename happening in 0009b.
alter type amc_state rename to amc_status;

-- 2) Add the canonical lowercase values. The 8 legacy uppercase values
--    (DRAFT, SIGNED, ACTIVE, PENDING_REACTIVATION, BLOCKED, RENEWAL_DUE,
--    EXPIRED, CANCELLED) stay around — Postgres cannot drop enum values
--    without recreating the type. They become dormant once 0009b's
--    UPDATE rewrites every row to a lowercase value.
alter type amc_status add value if not exists 'draft';
alter type amc_status add value if not exists 'pending_payment';
alter type amc_status add value if not exists 'active';
alter type amc_status add value if not exists 'suspended';
alter type amc_status add value if not exists 'expired';
alter type amc_status add value if not exists 'cancelled';
alter type amc_status add value if not exists 'renewed';

-- ============================================================
-- SMOKE TEST (manual — run this query right after the above to
-- confirm the enum is in the expected shape before applying 0009b).
-- Expected: 15 labels — 8 uppercase legacy + 7 lowercase new.
-- ============================================================
--
-- select enumlabel from pg_enum
--  where enumtypid = 'amc_status'::regtype
--  order by enumsortorder;
--
-- Expected labels (order may vary):
--   DRAFT, SIGNED, ACTIVE, PENDING_REACTIVATION, BLOCKED,
--   RENEWAL_DUE, EXPIRED, CANCELLED,
--   draft, pending_payment, active, suspended, expired,
--   cancelled, renewed
-- ============================================================
