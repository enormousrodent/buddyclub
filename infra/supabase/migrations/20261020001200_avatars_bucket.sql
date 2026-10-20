-- Profile photos (owner request 2026-10-20). One public-read Storage bucket; each account may
-- write only under its own folder (<auth uid>/...). The API stores the resulting public URL in
-- identity.user_profiles.avatar_url, which already exists.
-- Reverse: delete from storage.objects where bucket_id = 'avatars'; delete from storage.buckets
-- where id = 'avatars'; drop the four policies below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars are public to read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "people upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "people replace their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "people delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
