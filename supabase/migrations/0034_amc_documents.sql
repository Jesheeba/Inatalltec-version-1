-- ============================================================
-- 0034 — AMC documents (optional uploads, anytime)
--
-- Adds a documents feature to AMC contracts. The OM can upload the
-- signed contract scan, related paperwork, or any file at any point
-- after contract creation. Document upload is OPTIONAL — no part of
-- the AMC engine requires it.
--
-- WHO CAN UPLOAD: admin · md · manager · sales (locked spec)
-- WHO CAN READ:   anyone who can read the parent amc_contracts row
-- WHO CAN DELETE: admin · md · manager · sales (same as upload)
--
-- FILE CONSTRAINTS (enforced client-side in lib/create.ts):
--   • Any mime type
--   • 25 MB cap per file
--
-- STORAGE:
--   Binaries live in Supabase Storage bucket 'amc-documents' (private).
--   Metadata (file_name, path, size, mime, uploader) lives in this table.
--   Path convention: `<amc_id>/<uuid>-<sanitized_filename>` so deleting
--   the contract row cascades cleanup via on delete cascade + a manual
--   Storage sweep (handled in the client deleteAmcDocument helper).
-- ============================================================

begin;

-- ─── 1) Metadata table ──────────────────────────────────────
create table if not exists public.amc_documents (
  id              uuid        primary key default gen_random_uuid(),
  amc_id          uuid        not null references public.amc_contracts(id) on delete cascade,
  file_name       text        not null,
  file_path       text        not null,
  file_size_bytes bigint,
  mime_type       text,
  uploaded_by     uuid        references public.users(id),
  uploaded_at     timestamptz not null default now()
);

create index if not exists amc_documents_amc_id_idx
  on public.amc_documents (amc_id);
create index if not exists amc_documents_uploaded_at_idx
  on public.amc_documents (uploaded_at desc);

alter table public.amc_documents enable row level security;

-- Reads: piggyback on amc_contracts visibility. Anyone who can SELECT
-- the parent row can see its documents. (amc_contracts has its own RLS
-- gating per migration 0007/0016 — we don't duplicate it here.)
drop policy if exists amc_documents_read on public.amc_documents;
create policy amc_documents_read on public.amc_documents
  for select using (
    exists (
      select 1 from public.amc_contracts c where c.id = amc_documents.amc_id
    )
  );

-- Writes: admin · md · manager · sales only.
drop policy if exists amc_documents_insert on public.amc_documents;
create policy amc_documents_insert on public.amc_documents
  for insert with check (
    public.fn_my_role() in ('admin','md','manager','sales')
  );

drop policy if exists amc_documents_delete on public.amc_documents;
create policy amc_documents_delete on public.amc_documents
  for delete using (
    public.fn_my_role() in ('admin','md','manager','sales')
  );

-- ─── 2) Storage bucket (private) ───────────────────────────
--
-- A private bucket means objects are only accessible via signed URLs
-- or authenticated session reads gated by storage.objects RLS below.
insert into storage.buckets (id, name, public)
values ('amc-documents', 'amc-documents', false)
on conflict (id) do nothing;

-- ─── 3) Storage RLS on storage.objects ─────────────────────
--
-- Same role gating as the metadata table. Bucket-scoped so other
-- buckets' policies are untouched.
drop policy if exists amc_docs_storage_read on storage.objects;
create policy amc_docs_storage_read on storage.objects
  for select using (
    bucket_id = 'amc-documents'
  );

drop policy if exists amc_docs_storage_insert on storage.objects;
create policy amc_docs_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'amc-documents'
    and public.fn_my_role() in ('admin','md','manager','sales')
  );

drop policy if exists amc_docs_storage_delete on storage.objects;
create policy amc_docs_storage_delete on storage.objects
  for delete using (
    bucket_id = 'amc-documents'
    and public.fn_my_role() in ('admin','md','manager','sales')
  );

-- ─── 4) Smoke test ─────────────────────────────────────────
do $$
declare
  v_table_count    int;
  v_bucket_count   int;
  v_table_pols     int;
  v_storage_pols   int;
begin
  -- Table exists.
  select count(*) into v_table_count
    from information_schema.tables
   where table_schema='public' and table_name='amc_documents';
  if v_table_count <> 1 then
    raise exception '0034 failed: amc_documents table missing';
  end if;

  -- Bucket created.
  select count(*) into v_bucket_count
    from storage.buckets where id='amc-documents';
  if v_bucket_count <> 1 then
    raise exception '0034 failed: amc-documents bucket missing';
  end if;

  -- Table policies: 3 (read, insert, delete).
  select count(*) into v_table_pols
    from pg_policies
   where schemaname='public' and tablename='amc_documents';
  if v_table_pols < 3 then
    raise exception '0034 failed: amc_documents policies missing (count=%)', v_table_pols;
  end if;

  -- Storage policies: 3 (amc_docs_storage_read/insert/delete).
  select count(*) into v_storage_pols
    from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname like 'amc_docs_storage_%';
  if v_storage_pols < 3 then
    raise exception '0034 failed: storage.objects amc-documents policies missing (count=%)', v_storage_pols;
  end if;

  raise notice '─── 0034 applied ───';
  raise notice 'amc_documents: % table policies', v_table_pols;
  raise notice 'storage.objects: % amc-documents policies', v_storage_pols;
  raise notice 'Bucket amc-documents (private) ready';
end $$;

commit;
