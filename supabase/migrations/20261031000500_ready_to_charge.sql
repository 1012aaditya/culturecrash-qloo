-- Ready to charge (review of 2026-10-30, Phase 5).

-- Weekly digest deliveries: a row is claimed before sending, so a retried cron run never emails twice.
create table public.digest_deliveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.digest_deliveries enable row level security;
alter table public.digest_deliveries force row level security;
revoke all on public.digest_deliveries from anon, authenticated;

-- Members can remove brief documents they uploaded (the generic policy only let admins delete, so a
-- member's delete silently did nothing). Admins can still remove any.
create policy brief_documents_uploader_delete on public.brief_documents for delete to authenticated
  using (created_by = auth.uid() and public.has_workspace_role(workspace_id, 'member'));
