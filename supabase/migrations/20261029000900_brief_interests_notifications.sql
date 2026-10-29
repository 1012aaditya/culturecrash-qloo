-- Audience interests on the brief (resolved to Qloo tags via /v2/tags at research time).
alter table public.campaign_briefs add column if not exists interests text[] not null default '{}';
alter table public.campaign_briefs add constraint campaign_briefs_interests_max check (cardinality(interests) <= 20);

-- In-app notifications. Recipients read and mark their own; members may notify
-- other members of the same workspace (server actions decide when).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('research_completed', 'research_failed', 'report_shared', 'member_added', 'task_completed')),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  href text check (href is null or href ~ '^/[^/]'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and exists (select 1 from public.workspace_members m where m.workspace_id = notifications.workspace_id and m.user_id = notifications.user_id)
    and (actor_id is null or actor_id = auth.uid())
  );
grant select, insert, update, delete on public.notifications to authenticated;

-- Only read_at may change after creation.
create or replace function public.notifications_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.user_id <> old.user_id or new.workspace_id <> old.workspace_id or new.kind <> old.kind or new.title <> old.title
     or new.body is distinct from old.body or new.href is distinct from old.href or new.created_at <> old.created_at then
    raise exception 'notifications are immutable except read_at' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.notifications_guard() from public, anon, authenticated;
create trigger notifications_guard before update on public.notifications for each row execute function public.notifications_guard();
