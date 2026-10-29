-- Private Storage bucket for uploaded brief documents. Object paths are
-- "<workspace_id>/<project_id>/<uuid>.<ext>", so policies key off the first folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brief-documents', 'brief-documents', false, 10485760,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','application/octet-stream'])
on conflict (id) do nothing;

create policy "brief documents: members upload to their workspace" on storage.objects for insert to authenticated
  with check (bucket_id = 'brief-documents' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'member'));
create policy "brief documents: members read their workspace" on storage.objects for select to authenticated
  using (bucket_id = 'brief-documents' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "brief documents: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'brief-documents' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'admin'));
