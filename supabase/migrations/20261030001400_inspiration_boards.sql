-- Inspiration boards: free-form visual canvases per campaign (images, notes, links, Qloo entities, groups).
-- A board is one document: `content` holds the React Flow nodes and viewport, saved whole with an
-- optimistic `revision` check. Media lives in the private `board-media` bucket (separate migration).
create table public.inspiration_boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  content jsonb not null default '{"nodes": [], "viewport": null}'::jsonb
    check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 2000000),
  palette text[] not null default '{}' check (cardinality(palette) <= 12),
  revision integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inspiration_boards_project_idx on public.inspiration_boards (project_id, updated_at desc);

alter table public.inspiration_boards enable row level security;
alter table public.inspiration_boards force row level security;
grant select, insert, update, delete on public.inspiration_boards to authenticated;

create policy inspiration_boards_select on public.inspiration_boards for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy inspiration_boards_insert on public.inspiration_boards for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'member'));
create policy inspiration_boards_update on public.inspiration_boards for update to authenticated
  using (public.has_workspace_role(workspace_id, 'member'))
  with check (public.has_workspace_role(workspace_id, 'member'));
create policy inspiration_boards_delete on public.inspiration_boards for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'member'));

create trigger inspiration_boards_project_ws before insert or update on public.inspiration_boards
  for each row execute function public.enforce_project_workspace();
