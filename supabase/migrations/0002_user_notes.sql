-- ============================================================
-- 0002 - user_notes: per-user "Important Notes" panel.
--   Per-user, never shared across users. organization_id is recorded
--   for scope/analytics but is not a hard FK (the organizations table
--   doesn't exist yet in setup.sql) - safe to add the FK later.
-- ============================================================

create table if not exists user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  organization_id uuid,                                   -- soft link; no FK
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_notes_user_idx       on user_notes(user_id);
create index if not exists user_notes_user_pinned_idx on user_notes(user_id, is_pinned);

-- Keep updated_at fresh on edits.
create or replace function fn_user_notes_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_user_notes_touch on user_notes;
create trigger trg_user_notes_touch
  before update on user_notes
  for each row execute function fn_user_notes_touch();

-- ── RLS - users only ever see / mutate their own notes ──
alter table user_notes enable row level security;

-- fn_my_id() resolves the signed-in user's public.users.id from auth.uid().
drop policy if exists user_notes_select on user_notes;
create policy user_notes_select on user_notes
  for select using (user_id = fn_my_id());

drop policy if exists user_notes_insert on user_notes;
create policy user_notes_insert on user_notes
  for insert with check (user_id = fn_my_id());

drop policy if exists user_notes_update on user_notes;
create policy user_notes_update on user_notes
  for update using (user_id = fn_my_id())
  with check (user_id = fn_my_id());

drop policy if exists user_notes_delete on user_notes;
create policy user_notes_delete on user_notes
  for delete using (user_id = fn_my_id());
