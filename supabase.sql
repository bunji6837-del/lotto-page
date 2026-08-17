-- =========================================================
-- 기존 로또 캡처 기능 유지 + 개인 사진 관리자 페이지 추가
-- 기존 lotto_captures / lotto_page_notes 데이터는 삭제하지 않습니다.
-- =========================================================

-- 기존 로또 캡처 테이블에 memo가 없을 때만 추가
alter table public.lotto_captures
add column if not exists memo text not null default '';

-- 기존 로또 캡처 정책
alter table public.lotto_captures enable row level security;
alter table public.lotto_page_notes enable row level security;

drop policy if exists "lotto_captures_select_policy" on public.lotto_captures;
drop policy if exists "lotto_captures_insert_policy" on public.lotto_captures;
drop policy if exists "lotto_captures_update_policy" on public.lotto_captures;
drop policy if exists "lotto_captures_delete_policy" on public.lotto_captures;

create policy "lotto_captures_select_policy"
on public.lotto_captures
for select
to public
using (true);

create policy "lotto_captures_insert_policy"
on public.lotto_captures
for insert
to authenticated
with check (true);

create policy "lotto_captures_update_policy"
on public.lotto_captures
for update
to authenticated
using (true)
with check (true);

create policy "lotto_captures_delete_policy"
on public.lotto_captures
for delete
to authenticated
using (true);

drop policy if exists "lotto_page_notes_select_policy" on public.lotto_page_notes;
drop policy if exists "lotto_page_notes_insert_policy" on public.lotto_page_notes;
drop policy if exists "lotto_page_notes_update_policy" on public.lotto_page_notes;
drop policy if exists "lotto_page_notes_delete_policy" on public.lotto_page_notes;

create policy "lotto_page_notes_select_policy"
on public.lotto_page_notes
for select
to public
using (true);

create policy "lotto_page_notes_insert_policy"
on public.lotto_page_notes
for insert
to authenticated
with check (true);

create policy "lotto_page_notes_update_policy"
on public.lotto_page_notes
for update
to authenticated
using (true)
with check (true);

create policy "lotto_page_notes_delete_policy"
on public.lotto_page_notes
for delete
to authenticated
using (true);

-- =========================================================
-- 개인 사진 관리자 페이지 전용 테이블
-- 사용자별로 자기 사진만 조회/수정/삭제 가능
-- =========================================================

create table if not exists public.admin_private_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_path text not null,
  memo text not null default '',
  created_at timestamptz not null default now()
);

-- Existing installations also need this column before video uploads are used.
alter table public.admin_private_photos
add column if not exists media_type text not null default 'image'
check (media_type in ('image', 'video'));

create index if not exists admin_private_photos_owner_created_idx
on public.admin_private_photos (owner_id, created_at desc);

alter table public.admin_private_photos enable row level security;

drop policy if exists "admin_private_photos_select_own" on public.admin_private_photos;
drop policy if exists "admin_private_photos_insert_own" on public.admin_private_photos;
drop policy if exists "admin_private_photos_update_own" on public.admin_private_photos;
drop policy if exists "admin_private_photos_delete_own" on public.admin_private_photos;

create policy "admin_private_photos_select_own"
on public.admin_private_photos
for select
to authenticated
using (owner_id = auth.uid());

create policy "admin_private_photos_insert_own"
on public.admin_private_photos
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "admin_private_photos_update_own"
on public.admin_private_photos
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "admin_private_photos_delete_own"
on public.admin_private_photos
for delete
to authenticated
using (owner_id = auth.uid());

grant select, insert, update, delete
on public.admin_private_photos
to authenticated;

-- =========================================================
-- 개인 사진 전용 비공개 Storage 버킷
-- public = false 이므로 공개 URL로 접근할 수 없습니다.
-- 화면에서는 로그인 후 임시 signed URL을 생성합니다.
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'admin-private-photos',
  'admin-private-photos',
  false,
  524288000,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']
)
on conflict (id)
do update set
  public = false,
  file_size_limit = 524288000,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'];

drop policy if exists "admin_private_storage_select_own" on storage.objects;
drop policy if exists "admin_private_storage_insert_own" on storage.objects;
drop policy if exists "admin_private_storage_update_own" on storage.objects;
drop policy if exists "admin_private_storage_delete_own" on storage.objects;

create policy "admin_private_storage_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'admin-private-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "admin_private_storage_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'admin-private-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "admin_private_storage_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'admin-private-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'admin-private-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "admin_private_storage_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'admin-private-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
