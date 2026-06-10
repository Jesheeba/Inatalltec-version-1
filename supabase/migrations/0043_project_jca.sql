-- ============================================================
-- 0043 — Job Cost Analysis / JCA (Design phase, activity 3)
--
-- Third and final Main-Contractor Design activity. UNLIKE Material
-- Submittal (0040) and Shop Drawing (0042) there is NO revision /
-- client-approval cycle — the JCA is a purely INTERNAL budget the
-- Operations Manager fills in and can edit anytime. The client never
-- sees it.
--
-- One JCA per project, five numeric inputs:
--   materials_budget · manpower_budget · subcontractor_budget ·
--   other_charges · profit_margin_pct
-- Subtotal / profit / total are derived in the UI, NOT stored.
--
-- Every save snapshots the five values into project_jca_history with
-- an optional note ("reason"), building a permanent audit trail of how
-- the budget evolved. History is APPEND-ONLY: no update/delete policy
-- is granted, so rows can't be altered or removed from the app.
--
-- RLS:
--   read  : admin · md · manager · accounts     (Accounts is view-only)
--   write : admin · md · manager                (the MANAGE_JCA roles)
-- Note: Sales / Lead Tech / Workers get NO access — the JCA carries the
-- company's internal cost + margin, so its read set differs from the
-- design-doc set (no lead_worker / sales here; accounts added).
--
-- Strictly additive — touches nothing existing. Idempotent; single txn.
-- ============================================================

begin;

-- ── 1) Tables ───────────────────────────────────────────────
create table if not exists public.project_jca (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null unique references public.projects(id) on delete cascade,
  materials_budget     numeric(14,2) not null default 0,
  manpower_budget      numeric(14,2) not null default 0,
  subcontractor_budget numeric(14,2) not null default 0,
  other_charges        numeric(14,2) not null default 0,
  profit_margin_pct    numeric(6,2)  not null default 0,
  created_by           uuid references public.users(id),
  updated_by           uuid references public.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.project_jca_history (
  id                   uuid primary key default gen_random_uuid(),
  jca_id               uuid not null references public.project_jca(id) on delete cascade,
  materials_budget     numeric(14,2) not null default 0,
  manpower_budget      numeric(14,2) not null default 0,
  subcontractor_budget numeric(14,2) not null default 0,
  other_charges        numeric(14,2) not null default 0,
  profit_margin_pct    numeric(6,2)  not null default 0,
  note                 text,
  edited_by            uuid references public.users(id),
  edited_at            timestamptz not null default now()
);

create index if not exists idx_jca_project      on public.project_jca(project_id);
create index if not exists idx_jca_hist_jca      on public.project_jca_history(jca_id);

-- ── 2) RLS ──────────────────────────────────────────────────
alter table public.project_jca          enable row level security;
alter table public.project_jca_history  enable row level security;

-- JCA: read = admin/md/manager/accounts; write = admin/md/manager.
drop policy if exists jca_read on public.project_jca;
create policy jca_read on public.project_jca for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists jca_write on public.project_jca;
create policy jca_write on public.project_jca for all
  using      (public.fn_my_role() in ('admin','md','manager'))
  with check (public.fn_my_role() in ('admin','md','manager'));

-- History: same read set; INSERT only for the manage roles. No update /
-- delete policy is created on purpose → the audit trail is permanent.
drop policy if exists jca_hist_read on public.project_jca_history;
create policy jca_hist_read on public.project_jca_history for select using (
  public.fn_my_role() in ('admin','md','manager','accounts')
);
drop policy if exists jca_hist_insert on public.project_jca_history;
create policy jca_hist_insert on public.project_jca_history for insert with check (
  public.fn_my_role() in ('admin','md','manager')
);

-- ── 3) updated_at touch trigger ─────────────────────────────
create or replace function public.fn_jca_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
alter function public.fn_jca_touch() owner to postgres;

drop trigger if exists trg_jca_touch on public.project_jca;
create trigger trg_jca_touch before update on public.project_jca
  for each row execute function public.fn_jca_touch();

-- ── 4) Smoke test ───────────────────────────────────────────
do $$
declare v_tabs int; v_pols int; v_trgs int;
begin
  select count(*) into v_tabs from information_schema.tables
   where table_schema='public'
     and table_name in ('project_jca','project_jca_history');
  if v_tabs <> 2 then raise exception '0043 failed: expected 2 tables, found %', v_tabs; end if;

  select count(*) into v_pols from pg_policies
   where schemaname='public'
     and tablename in ('project_jca','project_jca_history');
  if v_pols < 4 then raise exception '0043 failed: RLS policies missing (%)', v_pols; end if;

  select count(*) into v_trgs from pg_trigger where tgname = 'trg_jca_touch';
  if v_trgs < 1 then raise exception '0043 failed: touch trigger missing'; end if;

  raise notice '─── 0043 applied: 2 tables, % policies, JCA history is append-only ───', v_pols;
end $$;

commit;
