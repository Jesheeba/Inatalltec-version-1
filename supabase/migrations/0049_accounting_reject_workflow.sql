-- ============================================================
-- 0049 — Accountant module · Phase 2 (Slice 2B.6): Reject workflow
--
-- Adds a first-class "rejected" state + rejection metadata to both the
-- invoice and purchase-order approval workflows, so an approver can send
-- a submitted document back with a reason. The originator then Revises
-- (→ draft to edit & resubmit) or cancels/voids.
--
--   pending_approval → rejected → (revise) → draft → pending_approval …
--                                → (cancel/void) → cancelled
--
-- Why a real status (not just "back to draft"): it's filterable and
-- reportable, the reason lives on the record (and in po_history for POs),
-- and the Revise step is an explicit, auditable action.
--
-- Changes:
--   • invoice_status / po_status enums  → add 'rejected'
--   • invoices / purchase_orders        → rejection_reason, rejected_by,
--                                          rejected_at columns
--   • fn_po_audit()                     → records the reason on the
--                                          'rejected' transition
--
-- ENUM-IN-TRANSACTION NOTE (Postgres 12+, Supabase = 15): adding an enum
-- value inside a txn is allowed, but the new label may NOT be USED as an
-- enum literal in the same txn. Nothing here does — fn_po_audit compares
-- new.status::text = 'rejected' (a text comparison), and the smoke test
-- reads pg_enum.enumlabel (text). The label is only ever used as a value
-- later, from the app, in separate transactions.
--
-- Strictly additive. Reuses fn_acct_touch() (0045). Idempotent; single txn.
-- ============================================================

begin;

-- ── 1) Extend the status enums ──────────────────────────────
alter type invoice_status add value if not exists 'rejected';
alter type po_status      add value if not exists 'rejected';

-- ── 2) Rejection metadata (who / why / when) ────────────────
alter table public.invoices
  add column if not exists rejection_reason text,
  add column if not exists rejected_by uuid references public.users(id),
  add column if not exists rejected_at timestamptz;

alter table public.purchase_orders
  add column if not exists rejection_reason text,
  add column if not exists rejected_by uuid references public.users(id),
  add column if not exists rejected_at timestamptz;

-- ── 3) Enrich PO audit so a rejection logs its reason ───────
-- Replaces the 0048 function; the triggers (trg_po_audit_ins/upd) keep
-- pointing at it. Text comparison only — safe in this same txn.
create or replace function public.fn_po_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into po_history (po_id, action, detail, changed_by)
      values (new.id, 'created', 'Purchase order created', new.last_action_by);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.status::text = 'rejected' then
      insert into po_history (po_id, action, detail, changed_by)
        values (new.id, 'rejected',
                'Rejected: ' || coalesce(nullif(btrim(new.rejection_reason), ''), '(no reason given)'),
                new.last_action_by);
    else
      insert into po_history (po_id, action, detail, changed_by)
        values (new.id, new.status::text, 'Status changed to ' || new.status, new.last_action_by);
    end if;
  end if;
  return null;
end $$;
alter function public.fn_po_audit() owner to postgres;

-- ── 4) Smoke test ───────────────────────────────────────────
do $$
declare v_inv_enum int; v_po_enum int; v_inv_cols int; v_po_cols int;
begin
  select count(*) into v_inv_enum from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'invoice_status' and e.enumlabel = 'rejected';
  if v_inv_enum <> 1 then raise exception '0049 failed: invoice_status missing rejected'; end if;

  select count(*) into v_po_enum from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'po_status' and e.enumlabel = 'rejected';
  if v_po_enum <> 1 then raise exception '0049 failed: po_status missing rejected'; end if;

  select count(*) into v_inv_cols from information_schema.columns
   where table_schema='public' and table_name='invoices'
     and column_name in ('rejection_reason','rejected_by','rejected_at');
  if v_inv_cols <> 3 then raise exception '0049 failed: invoice rejection columns missing (%)', v_inv_cols; end if;

  select count(*) into v_po_cols from information_schema.columns
   where table_schema='public' and table_name='purchase_orders'
     and column_name in ('rejection_reason','rejected_by','rejected_at');
  if v_po_cols <> 3 then raise exception '0049 failed: PO rejection columns missing (%)', v_po_cols; end if;

  raise notice '─── 0049 applied: reject workflow (enums + columns + PO audit) ───';
end $$;

commit;
