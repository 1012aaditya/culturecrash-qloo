-- Supabase Storage for brief documents (applied on Supabase only; plain Postgres has no storage schema).
-- Images (moodboards) are accepted, matching what the app uploads, and members can remove the files
-- they uploaded so deleting a document also deletes its stored original.
update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream'
] where id = 'brief-documents';

create policy "brief documents: uploaders delete their files" on storage.objects for delete to authenticated
  using (bucket_id = 'brief-documents' and owner_id = auth.uid()::text
    and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'member'));
