-- Inspiration boards, production hardening:
--  * inspiration_board_versions: periodic snapshots of a board for restore (the app keeps the latest 30).
--  * inspiration_board_media: every file stored for a board, so files no card or kept version uses
--    can be removed from the private bucket instead of accumulating.
create table public.inspiration_board_versions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.inspiration_boards(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  revision integer not null,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 2000000),
  card_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inspiration_board_versions_board_idx on public.inspiration_board_versions (board_id, created_at desc);

create table public.inspiration_board_media (
  path text primary key check (char_length(path) <= 300),
  board_id uuid not null references public.inspiration_boards(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('image', 'thumb', 'preview')),
  bytes integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set when no card uses the file any more; cleared if it comes back (undo, restore).
  unused_since timestamptz
);
create index inspiration_board_media_board_idx on public.inspiration_board_media (board_id, unused_since);

do $$
declare t text;
begin
  foreach t in array array['inspiration_board_versions', 'inspiration_board_media']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.has_workspace_role(workspace_id, 'member')) with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated using (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format('create trigger %1$s_project_ws before insert or update on public.%1$I for each row execute function public.enforce_project_workspace()', t);
  end loop;
end $$;
