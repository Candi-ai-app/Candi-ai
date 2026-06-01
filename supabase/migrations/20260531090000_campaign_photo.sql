-- Candidate photo for campaigns + public Storage bucket for uploads.
-- Optional feature: photo_url stays null when no photo is provided.

-- 1. Column on campaigns for the candidate photo's public URL.
alter table public.campaigns
  add column if not exists photo_url text;

-- 2. Public Storage bucket that holds candidate photos.
insert into storage.buckets (id, name, public)
values ('candidates', 'candidates', true)
on conflict (id) do nothing;

-- 3. RLS on storage.objects: authenticated users may upload to `candidates`,
--    and anyone may read (the bucket is public). Drop-then-create so the
--    migration is safely re-runnable.
drop policy if exists "candidates upload (authenticated)" on storage.objects;
create policy "candidates upload (authenticated)"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'candidates');

drop policy if exists "candidates update (authenticated)" on storage.objects;
create policy "candidates update (authenticated)"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'candidates')
  with check (bucket_id = 'candidates');

drop policy if exists "candidates read (public)" on storage.objects;
create policy "candidates read (public)"
  on storage.objects for select
  to public
  using (bucket_id = 'candidates');
