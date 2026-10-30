-- Generate concepts: a job list that the agency's own GPU PC (ComfyUI) polls through /api/worker/*.
-- The PC never touches the database or Storage directly. It authenticates to the website with
-- CC_WORKER_TOKEN, and the website (privileged connection) hands out jobs and accepts results.
-- A finished image waits in `image` until a workspace member's next status check moves it to
-- board-media with their own session (no service-role key), after which the bytes are cleared.

create table public.concept_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  board_id uuid not null references public.inspiration_boards(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  workflow text not null check (workflow in ('w1-concept', 'w3-variation')),
  -- prompt, negative, seed, width, height, denoise; image = short-lived signed URL of the source (w3).
  params jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  error text check (error is null or char_length(error) <= 500),
  worker_id text,
  attempts int not null default 0,
  image bytea check (image is null or octet_length(image) <= 4194304),
  result_path text,
  result_thumb_path text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz
);
create index concept_jobs_queue_idx on public.concept_jobs (created_at) where status = 'queued';
create index concept_jobs_board_idx on public.concept_jobs (board_id, created_at desc);

alter table public.concept_jobs enable row level security;
create policy concept_jobs_select on public.concept_jobs for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy concept_jobs_insert on public.concept_jobs for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'member') and created_by = auth.uid() and status = 'queued' and image is null
    and exists (select 1 from public.inspiration_boards b where b.id = board_id and b.workspace_id = concept_jobs.workspace_id and b.project_id = concept_jobs.project_id));
-- Members finish a job by moving its image to the board (result paths set, bytes cleared).
create policy concept_jobs_update on public.concept_jobs for update to authenticated
  using (public.has_workspace_role(workspace_id, 'member'))
  with check (public.has_workspace_role(workspace_id, 'member'));
grant select, insert, update on public.concept_jobs to authenticated;

-- Heartbeats from GPU PCs. No user data; read and written only by the website's privileged connection.
create table public.creative_workers (
  id text primary key check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  state text not null,
  current_job uuid,
  comfyui boolean not null default false,
  gpu jsonb,
  last_seen timestamptz not null default now()
);
alter table public.creative_workers enable row level security;
