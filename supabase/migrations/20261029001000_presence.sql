-- Presence: who is viewing a project page and which field they are editing.
-- One row per user per project, refreshed by a heartbeat; rows older than ~30 s
-- are treated as gone (and are pruned by the retention job).
create table public.presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  page text not null check (char_length(page) <= 40),
  field text check (char_length(field) <= 60),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index presence_project_idx on public.presence (project_id, updated_at desc);
alter table public.presence enable row level security;

create policy presence_select on public.presence for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy presence_insert on public.presence for insert to authenticated
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy presence_update on public.presence for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy presence_delete on public.presence for delete to authenticated
  using (user_id = auth.uid());
grant select, insert, update, delete on public.presence to authenticated;

-- The project must belong to the workspace on the row.
create or replace function public.presence_project_ws() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.workspace_id = new.workspace_id) then
    raise exception 'presence project/workspace mismatch' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.presence_project_ws() from public, anon, authenticated;
create trigger presence_project_ws before insert or update on public.presence for each row execute function public.presence_project_ws();
