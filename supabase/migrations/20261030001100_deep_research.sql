-- Adaptive multi-source research (Phase 1/2).
-- Extends the existing research job (research_runs), provider-call ledger (research_sources)
-- and evidence model (evidence_items) instead of creating parallel structures.

alter type public.run_status add value if not exists 'partially_completed';
alter type public.run_status add value if not exists 'cancelled';

-- Research jobs -------------------------------------------------------------
alter table public.research_runs
  add column if not exists depth text check (depth in ('quick', 'standard', 'deep')),
  add column if not exists research_question text check (char_length(research_question) <= 1000),
  add column if not exists stage text check (stage in ('queued', 'planning', 'affinity', 'searching', 'retrieving', 'extracting', 'analyzing', 'follow_up', 'synthesizing', 'done')),
  add column if not exists budget jsonb not null default '{}'::jsonb,
  add column if not exists usage jsonb not null default '{}'::jsonb,
  add column if not exists coverage jsonb not null default '[]'::jsonb,
  add column if not exists report jsonb,
  add column if not exists stop_reason text,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists parent_run_id uuid references public.research_runs(id) on delete set null,
  add column if not exists started_by_heartbeat timestamptz;

-- Provider-call ledger: cost and attribution per call --------------------------
alter table public.research_sources
  add column if not exists question_key text,
  add column if not exists round int,
  add column if not exists units numeric,
  add column if not exists cost_usd_estimated numeric(12, 6),
  add column if not exists cost_usd_actual numeric(12, 6),
  add column if not exists tokens_in int,
  add column if not exists tokens_out int,
  add column if not exists cached boolean not null default false;

-- Retrieved documents (web pages, videos, posts, client documents) ------------
create table public.research_documents (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid references public.research_sources(id) on delete set null,
  provider text not null,
  source_type text not null check (source_type in ('web_page', 'news', 'encyclopedia', 'community_post', 'video', 'brand_site', 'client_document', 'demo_fixture')),
  canonical_url text,
  external_id text,
  title text not null check (char_length(title) <= 500),
  publisher text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  language text,
  geography text,
  excerpt text check (char_length(excerpt) <= 8000),
  content_hash text,
  extraction_status text not null default 'snippet' check (extraction_status in ('snippet', 'extracted', 'blocked_by_robots', 'failed', 'skipped')),
  independence_group text,
  duplicate_of uuid references public.research_documents(id) on delete set null,
  question_keys text[] not null default '{}',
  quality jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  usage_restrictions text,
  is_demo boolean not null default false,
  unique (run_id, canonical_url)
);
create index research_documents_run_idx on public.research_documents (run_id);
create index research_documents_project_idx on public.research_documents (project_id, retrieved_at desc);
create index research_documents_hash_idx on public.research_documents (run_id, content_hash);

-- Evidence claims: claim type, supporting documents, quality, contradictions -----
alter table public.evidence_items
  add column if not exists claim_type text check (claim_type in (
    'observed_measurement', 'source_fact', 'source_opinion', 'model_interpretation',
    'strategic_hypothesis', 'experiment_result', 'validated_conclusion')),
  add column if not exists document_ids uuid[] not null default '{}',
  add column if not exists excerpt text check (char_length(excerpt) <= 2000),
  add column if not exists question_key text,
  add column if not exists extraction_method text,
  add column if not exists quality jsonb not null default '{}'::jsonb,
  add column if not exists independent_sources int,
  add column if not exists contradicts uuid[] not null default '{}',
  add column if not exists scope jsonb not null default '{}'::jsonb;
create index if not exists evidence_items_run_type_idx on public.evidence_items (run_id, claim_type);

-- Client documents, chunked for retrieval (keyword search; embeddings later) ----
create table public.brand_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.brief_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idx int not null,
  content text not null check (char_length(content) <= 6000),
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  unique (document_id, idx)
);
create index brand_document_chunks_tsv_idx on public.brand_document_chunks using gin (tsv);
create index brand_document_chunks_project_idx on public.brand_document_chunks (project_id);

-- Provider response cache, isolated per workspace --------------------------------
create table public.provider_cache (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  cache_key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (workspace_id, provider, cache_key)
);
create index provider_cache_expiry_idx on public.provider_cache (expires_at);

-- Repeated measurements for trends (kept distinct per provider + metric) ---------
create table public.trend_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete set null,
  topic text not null check (char_length(topic) <= 200),
  provider text not null,
  metric text not null,
  value numeric not null,
  unit text not null,
  geography text,
  period_start timestamptz,
  period_end timestamptz,
  collected_at timestamptz not null default now(),
  source_ref text,
  method text,
  limitations text
);
create index trend_observations_topic_idx on public.trend_observations (workspace_id, topic, metric, period_end);

-- Workspace research limits -------------------------------------------------------
alter table public.workspaces
  add column if not exists research_budget_usd_monthly numeric(10, 2) not null default 25,
  add column if not exists research_runs_per_user_daily int not null default 15;

-- Row Level Security ----------------------------------------------------------------
alter table public.research_documents enable row level security;
alter table public.brand_document_chunks enable row level security;
alter table public.provider_cache enable row level security;
alter table public.trend_observations enable row level security;
alter table public.research_documents force row level security;
alter table public.brand_document_chunks force row level security;
alter table public.provider_cache force row level security;
alter table public.trend_observations force row level security;

do $$
declare t text;
begin
  foreach t in array array['research_documents', 'brand_document_chunks', 'provider_cache', 'trend_observations']
  loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
      using (public.is_workspace_member(workspace_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.has_workspace_role(workspace_id, 'member'))
      with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (public.has_workspace_role(workspace_id, 'member'))$f$, t);
  end loop;
end $$;
grant select, insert, update, delete on public.research_documents, public.brand_document_chunks, public.provider_cache, public.trend_observations to authenticated;

-- Child rows must belong to the project's workspace (same guard as the other project tables).
create trigger research_documents_project_ws before insert or update on public.research_documents
  for each row execute function public.enforce_project_workspace();
create trigger brand_document_chunks_project_ws before insert or update on public.brand_document_chunks
  for each row execute function public.enforce_project_workspace();

-- Research runs started today by one user (per-user rate limit).
create or replace function public.research_runs_today_by_user(ws uuid, uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.research_runs
  where workspace_id = ws and started_by = uid and created_at > now() - interval '24 hours'
    and public.is_workspace_member(ws);
$$;
revoke all on function public.research_runs_today_by_user(uuid, uuid) from public, anon;
grant execute on function public.research_runs_today_by_user(uuid, uuid) to authenticated;

-- Research spend this calendar month (estimated + actual), for the workspace budget.
create or replace function public.research_spend_this_month(ws uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(s.cost_usd_actual, s.cost_usd_estimated, 0)), 0)
  from public.research_sources s
  where s.workspace_id = ws and s.retrieved_at >= date_trunc('month', now())
    and public.is_workspace_member(ws);
$$;
revoke all on function public.research_spend_this_month(uuid) from public, anon;
grant execute on function public.research_spend_this_month(uuid) to authenticated;
