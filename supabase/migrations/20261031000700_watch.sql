-- CultureCrash Watch, Milestone 1: daily news monitoring of a client and up to two competitors.
-- Reuses research_documents (article storage) and research_sources (cost ledger) instead of creating
-- parallel tables: both gain an optional link to a watch, and stop requiring a research run.

-- ---------------------------------------------------------------------------
-- Configuration: one watch per client, with the company and up to two competitors as targets.
-- ---------------------------------------------------------------------------
create table public.watches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null unique references public.clients(id) on delete cascade,
  market text check (market is null or char_length(market) <= 80),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 10),
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly')),
  status text not null default 'active' check (status in ('active', 'paused')),
  last_attempted_at timestamptz,
  last_success_at timestamptz,
  next_run_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index watches_due_idx on public.watches (next_run_at) where status = 'active';

create table public.watch_targets (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.watches(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null check (role in ('company', 'competitor')),
  name text not null check (char_length(name) between 1 and 120),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 5),
  created_at timestamptz not null default now()
);
create unique index watch_targets_name_idx on public.watch_targets (watch_id, lower(name));
create unique index watch_targets_one_company_idx on public.watch_targets (watch_id) where role = 'company';

-- One job per watch per run key ("schedule:2026-10-31", "manual:2026-10-31T14"), so concurrent cron
-- calls or double clicks can never create two jobs for the same run.
create table public.watch_jobs (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.watches(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_key text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'partially_completed', 'failed')),
  attempts int not null default 0,
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  found int not null default 0,
  added int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  unique (watch_id, run_key)
);
create index watch_jobs_queue_idx on public.watch_jobs (status, created_at) where status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- Article storage and cost ledger: rows belong to a research run OR to a watch.
-- ---------------------------------------------------------------------------
alter table public.research_documents
  alter column run_id drop not null,
  alter column project_id drop not null,
  add column watch_id uuid references public.watches(id) on delete cascade,
  add column watch_target_id uuid references public.watch_targets(id) on delete set null,
  add column watch_job_id uuid references public.watch_jobs(id) on delete set null,
  add column discovery_query text,
  -- How precise published_at is: providers sometimes give only "2 days ago" (approximate) or a date (day).
  add column published_precision text check (published_precision in ('exact', 'day', 'approximate')),
  add constraint research_documents_owner check ((run_id is not null and project_id is not null) or watch_id is not null);
-- A story is stored once per watch, however many runs, queries or providers find it again.
create unique index research_documents_watch_url_idx on public.research_documents (watch_id, canonical_url) where watch_id is not null and canonical_url is not null;
create index research_documents_watch_idx on public.research_documents (watch_id, retrieved_at desc) where watch_id is not null;

alter table public.research_sources
  alter column run_id drop not null,
  add column watch_job_id uuid references public.watch_jobs(id) on delete cascade,
  add constraint research_sources_owner check (run_id is not null or watch_job_id is not null);
create index research_sources_watch_job_idx on public.research_sources (watch_job_id) where watch_job_id is not null;

-- The project/workspace guard now allows rows without a project (watch documents); the NOT NULL
-- constraints on every other project table keep them covered.
create or replace function public.enforce_project_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is null then return new; end if;
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.workspace_id = new.workspace_id) then
    raise exception 'project/workspace mismatch' using errcode = '42501';
  end if;
  return new;
end $$;

-- Watch-linked rows must live in the watch's own workspace.
create or replace function public.enforce_watch_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  -- Read through jsonb: the ledger has watch_job_id, the other tables watch_id.
  w := case tg_table_name
    when 'research_sources' then (select j.watch_id from public.watch_jobs j where j.id = (to_jsonb(new) ->> 'watch_job_id')::uuid)
    else (to_jsonb(new) ->> 'watch_id')::uuid end;
  if w is null then return new; end if;
  if not exists (select 1 from public.watches x where x.id = w and x.workspace_id = new.workspace_id) then
    raise exception 'watch/workspace mismatch' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_watch_workspace() from public, anon, authenticated;
create trigger watch_targets_watch_ws before insert or update on public.watch_targets for each row execute function public.enforce_watch_workspace();
create trigger watch_jobs_watch_ws before insert or update on public.watch_jobs for each row execute function public.enforce_watch_workspace();
create trigger research_documents_watch_ws before insert or update on public.research_documents for each row execute function public.enforce_watch_workspace();
create trigger research_sources_watch_ws before insert or update on public.research_sources for each row execute function public.enforce_watch_workspace();
create trigger watches_client_ws before insert or update on public.watches for each row execute function public.enforce_client_workspace();

-- ---------------------------------------------------------------------------
-- Limits: up to two competitors per watch (Milestone 1), and watches per plan.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_watch_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare plan text; allowed int;
begin
  if tg_table_name = 'watch_targets' then
    if new.role = 'competitor' and (select count(*) from public.watch_targets t where t.watch_id = new.watch_id and t.role = 'competitor' and t.id <> new.id) >= 2 then
      raise exception 'A watch can follow at most two competitors.' using errcode = '54000';
    end if;
  else
    select w.plan into plan from public.workspaces w where w.id = new.workspace_id;
    allowed := case plan when 'agency' then 20 when 'studio' then 5 else 1 end;
    if (select count(*) from public.watches x where x.workspace_id = new.workspace_id and x.id <> new.id) >= allowed then
      raise exception 'This workspace''s plan allows % watched client(s). Pause or remove one first.', allowed using errcode = '54000';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.enforce_watch_limits() from public, anon, authenticated;
create trigger watch_targets_limits before insert or update on public.watch_targets for each row execute function public.enforce_watch_limits();
create trigger watches_limits before insert on public.watches for each row execute function public.enforce_watch_limits();

-- ---------------------------------------------------------------------------
-- Row Level Security: members read; members configure and run; admins delete.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['watches', 'watch_targets', 'watch_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated using (public.has_workspace_role(workspace_id, 'member')) with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated using (public.has_workspace_role(workspace_id, 'admin'))$f$, t);
  end loop;
end $$;
grant select, insert, update, delete on public.watches, public.watch_targets, public.watch_jobs to authenticated;
