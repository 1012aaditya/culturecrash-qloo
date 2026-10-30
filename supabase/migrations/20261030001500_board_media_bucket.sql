-- Private Storage bucket for inspiration-board images. Object paths are
-- "<workspace_id>/<project_id>/<board_id>/<uuid>.<ext>", so policies key off the first folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-media', 'board-media', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do nothing;

create policy "board media: members upload to their workspace" on storage.objects for insert to authenticated
  with check (bucket_id = 'board-media' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'member'));
create policy "board media: members read their workspace" on storage.objects for select to authenticated
  using (bucket_id = 'board-media' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "board media: members delete in their workspace" on storage.objects for delete to authenticated
  using (bucket_id = 'board-media' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'member'));
