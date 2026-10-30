-- CultureCrash Watch, Milestone 2: persistent monitoring.
--  1. Every sighting of a story is kept (watch_observations), not only the first, with a daily per-company
--     count view on top — the raw history later milestones measure trends from.
--  2. Failure tracking: jobs say whether a failure is worth retrying, and watches count failed runs in a
--     row so the owner is told once a watch has been failing for three days.

-- ---------------------------------------------------------------------------
-- 1. Sightings: one row per story per search per job.
-- ---------------------------------------------------------------------------
create table public.watch_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  watch_id uuid not null references public.watches(id) on delete cascade,
  watch_job_id uuid not null references public.watch_jobs(id) on delete cascade,
  watch_target_id uuid references public.watch_targets(id) on delete set null,
  -- Retention deletes the story, and its sightings with it.
  document_id uuid not null references public.research_documents(id) on delete cascade,
  provider text not null,
  task_key text not null,
  -- Position in the provider's results (1 = top), so later milestones can weigh prominence.
  rank int not null check (rank >= 1),
  seen_at timestamptz not null default now(),
  unique (watch_job_id, document_id, task_key)
);
create index watch_observations_watch_idx on public.watch_observations (watch_id, seen_at desc);
create index watch_observations_document_idx on public.watch_observations (document_id);

create trigger watch_observations_watch_ws before insert or update on public.watch_observations
  for each row execute function public.enforce_watch_workspace();

alter table public.watch_observations enable row level security;
alter table public.watch_observations force row level security;
create policy watch_observations_select on public.watch_observations for select to authenticated using (public.is_workspace_member(workspace_id));
create policy watch_observations_insert on public.watch_observations for insert to authenticated with check (public.has_workspace_role(workspace_id, 'member'));
create policy watch_observations_delete on public.watch_observations for delete to authenticated using (public.has_workspace_role(workspace_id, 'admin'));
grant select, insert, delete on public.watch_observations to authenticated;

-- Per company per day (UTC): stories seen, stories found for the first time, and distinct publishers.
-- Copies of the same story on other sites count once. Plain counts — no trend scoring.
create view public.watch_daily_counts with (security_invoker = true) as
  select o.watch_id, o.watch_target_id, (o.seen_at at time zone 'UTC')::date as day,
    count(distinct coalesce(d.duplicate_of, d.id))::int as stories_seen,
    count(distinct coalesce(d.duplicate_of, d.id)) filter (where d.watch_job_id = o.watch_job_id)::int as new_stories,
    count(distinct d.publisher)::int as publishers
  from public.watch_observations o
  join public.research_documents d on d.id = o.document_id
  group by o.watch_id, o.watch_target_id, (o.seen_at at time zone 'UTC')::date;
grant select on public.watch_daily_counts to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Failure tracking.
-- ---------------------------------------------------------------------------
-- False when retrying can't help (budget used up, no key configured, nobody to run the watch as).
alter table public.watch_jobs add column retryable boolean not null default true;
alter table public.watches add column consecutive_failures int not null default 0 check (consecutive_failures >= 0);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('research_completed', 'research_failed', 'report_shared', 'member_added', 'task_completed', 'watch_failing', 'watch_assigned'));
