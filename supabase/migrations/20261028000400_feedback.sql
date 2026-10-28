-- In-product feedback from /help. Members write their own rows; each user reads only
-- their own submissions. Triage happens through the privileged connection.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'idea', 'question', 'other')),
  message text not null check (char_length(message) between 1 and 4000),
  page text check (page is null or char_length(page) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_created_idx on public.feedback (user_id, created_at desc);
create index if not exists feedback_workspace_created_idx on public.feedback (workspace_id, created_at desc);

alter table public.feedback enable row level security;
alter table public.feedback force row level security;

revoke all on public.feedback from public, anon;
grant select, insert on public.feedback to authenticated;

create policy feedback_insert on public.feedback for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());

create policy feedback_select_own on public.feedback for select to authenticated
  using (user_id = auth.uid());
