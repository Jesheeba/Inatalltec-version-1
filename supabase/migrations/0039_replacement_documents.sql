-- ============================================================
-- 0039 — Replacement documents + refund photo
--
-- Adds supporting-evidence uploads to replacement records (migration
-- 0017). Two capabilities:
--   1. General documents — multiple files per replacement (PDF, DOCX,
--      JPG, PNG). Stored in a new `replacement_documents` metadata table
--      + the private 'replacement-documents' Storage bucket.
--   2. Refund photo — ONE dedicated image of the refundable item, stored
--      as columns on replacement_requests (single value, replaceable).
--      The binary lives in the same private bucket under a `refund/` path.
--
-- File rules (enforced client-side in lib/create.ts): 10 MB cap;
-- documents = pdf/docx/jpg/png, refund photo = jpg/png.
--
-- WHO CAN UPLOAD: admin · md · manager · lead_worker
--   (mirrors who can create/edit replacements — see rr_update in 0017)
-- WHO CAN READ:   anyone who can read the parent replacement (incl. accounts)
-- WHO CAN DELETE: the original uploader, or md/admin
--
-- Mirrors the AMC-documents pattern from 0034. Idempotent; single txn.
-- ============================================================

begin;

-- ─── 1) Documents metadata table ────────────────────────────
create table if not exists public.replacement_documents (
  id                     uuid        primary key default gen_random_uuid(),
  replacement_request_id uuid        not null references public.replacement_requests(id) on delete cascade,
  file_name              text        not null,
  file_path              text        not null,
  file_size_bytes        bigint,
  mime_type              text,
  uploaded_by            uuid        references public.users(id),
  uploaded_at            timestamptz not null default now()
);

create index if not exists replacement_documents_rr_id_idx
  on public.replacement_documents (replacement_request_id);
create index if not exists replacement_documents_uploaded_at_idx
  on public.replacement_documents (uploaded_at desc);

alter table public.replacement_documents enable row level security;

-- Reads: piggyback on the parent replacement's visibility.
drop policy if exists replacement_documents_read on public.replacement_documents;
create policy replacement_documents_read on public.replacement_documents
  for select using (
    exists (
      select 1 from public.replacement_requests rr
      where rr.id = replacement_documents.replacement_request_id
    )
  );

-- Writes: the replacement editor roles only.
drop policy if exists replacement_documents_insert on public.replacement_documents;
create policy replacement_documents_insert on public.replacement_documents
  for insert with check (
    public.fn_my_role() in ('admin','md','manager','lead_worker')
  );

-- Delete: the original uploader, or md/admin — protects evidence.
drop policy if exists replacement_documents_delete on public.replacement_documents;
create policy replacement_documents_delete on public.replacement_documents
  for delete using (
    uploaded_by = public.fn_my_id() or public.fn_is_md_or_admin()
  );

-- ─── 2) Refund photo columns on replacement_requests ────────
alter table public.replacement_requests
  add column if not exists refund_photo_path        text,
  add column if not exists refund_photo_name        text,
  add column if not exists refund_photo_uploaded_at timestamptz,
  add column if not exists refund_photo_uploaded_by uuid references public.users(id);

-- (No new policy needed — these columns are written via the existing
--  rr_update policy, which already allows admin/md/manager/lead_worker.)

-- ─── 3) Storage bucket (private) ────────────────────────────
insert into storage.buckets (id, name, public)
values ('replacement-documents', 'replacement-documents', false)
on conflict (id) do nothing;

-- ─── 4) Storage RLS on storage.objects (bucket-scoped) ──────
drop policy if exists replacement_docs_storage_read on storage.objects;
create policy replacement_docs_storage_read on storage.objects
  for select using (
    bucket_id = 'replacement-documents'
  );

drop policy if exists replacement_docs_storage_insert on storage.objects;
create policy replacement_docs_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'replacement-documents'
    and public.fn_my_role() in ('admin','md','manager','lead_worker')
  );

drop policy if exists replacement_docs_storage_delete on storage.objects;
create policy replacement_docs_storage_delete on storage.objects
  for delete using (
    bucket_id = 'replacement-documents'
    and (public.fn_my_role() in ('admin','md','manager','lead_worker'))
  );

-- ─── 5) Smoke test ─────────────────────────────────────────
do $$
declare
  v_table   int;
  v_bucket  int;
  v_cols    int;
  v_tpols   int;
  v_spols   int;
begin
  select count(*) into v_table from information_schema.tables
   where table_schema='public' and table_name='replacement_documents';
  if v_table <> 1 then raise exception '0039 failed: replacement_documents table missing'; end if;

  select count(*) into v_bucket from storage.buckets where id='replacement-documents';
  if v_bucket <> 1 then raise exception '0039 failed: replacement-documents bucket missing'; end if;

  select count(*) into v_cols from information_schema.columns
   where table_schema='public' and table_name='replacement_requests'
     and column_name in ('refund_photo_path','refund_photo_name','refund_photo_uploaded_at','refund_photo_uploaded_by');
  if v_cols <> 4 then raise exception '0039 failed: expected 4 refund_photo columns, found %', v_cols; end if;

  select count(*) into v_tpols from pg_policies
   where schemaname='public' and tablename='replacement_documents';
  if v_tpols < 3 then raise exception '0039 failed: replacement_documents policies missing (%)', v_tpols; end if;

  select count(*) into v_spols from pg_policies
   where schemaname='storage' and tablename='objects' and policyname like 'replacement_docs_storage_%';
  if v_spols < 3 then raise exception '0039 failed: storage policies missing (%)', v_spols; end if;

  raise notice '─── 0039 applied: table + bucket + % refund cols + % table pols + % storage pols ───',
    v_cols, v_tpols, v_spols;
end $$;

commit;
