-- CultureCrash core schema
-- Workspace-scoped, RLS-enforced. Every user-facing table carries workspace_id so
-- policies can be evaluated without joins, and cross-workspace leakage is impossible
-- even if application code passes the wrong identifier.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.project_status as enum ('draft', 'active', 'archived');
create type public.run_status as enum ('queued', 'running', 'completed', 'failed');
create type public.data_mode as enum ('live', 'demo');
create type public.evidence_type as enum (
  'provider_observation', 'external_source', 'ai_interpretation',
  'hypothesis', 'experiment_result', 'approved_conclusion'
);
create type public.review_status as enum ('unreviewed', 'approved', 'rejected', 'needs_validation');
create type public.opportunity_status as enum ('new', 'saved', 'investigating', 'dismissed', 'linked');
create type public.direction_status as enum ('draft', 'superseded', 'selected');
create type public.experiment_status as enum ('draft', 'planned', 'running', 'completed', 'cancelled');
create type public.task_status as enum ('queued', 'running', 'completed', 'failed', 'awaiting_review');

-- ---------------------------------------------------------------------------
-- Utility
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Identity & workspaces
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  job_title text,
  notification_prefs jsonb not null default '{"research_completed": true, "report_shared": true, "weekly_digest": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles (lower(email));

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  is_demo boolean not null default false,
  plan text not null default 'pilot' check (plan in ('pilot', 'studio', 'agency')),
  research_runs_daily_limit int not null default 25 check (research_runs_daily_limit between 0 and 1000),
  data_retention_days int check (data_retention_days is null or data_retention_days >= 30),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member' check (role <> 'owner'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index workspace_invitations_open_idx
  on public.workspace_invitations (workspace_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Role helpers. SECURITY DEFINER so policies on workspace_members itself don't recurse.
create or replace function public.workspace_role_rank(r public.workspace_role) returns int
language sql immutable as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'member' then 2 else 1 end
$$;

create or replace function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  )
$$;

create or replace function public.has_workspace_role(ws uuid, min_role public.workspace_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and public.workspace_role_rank(m.role) >= public.workspace_role_rank(min_role)
  )
$$;

-- ---------------------------------------------------------------------------
-- Clients & brand memory
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  industry text,
  website text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_workspace_idx on public.clients (workspace_id, name);

create table public.brand_profiles (
  client_id uuid primary key references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  guidelines text,
  approved_messaging text,
  positioning text,
  audience_definitions text,
  prior_decisions text,
  approval_status text not null default 'draft' check (approval_status in ('draft', 'approved')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projects & briefs
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  category text,
  market text,
  status public.project_status not null default 'draft',
  owner_id uuid references auth.users(id) on delete set null,
  is_demo boolean not null default false,
  selected_direction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_workspace_updated_idx on public.projects (workspace_id, updated_at desc);
create index projects_client_idx on public.projects (client_id);

create table public.campaign_briefs (
  project_id uuid primary key references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand text,
  product text,
  category text,
  market text,
  audience text,
  objective text,
  existing_positioning text,
  competitors text[] not null default '{}',
  brand_guidelines text,
  budget_range text,
  timeframe text,
  public_urls text[] not null default '{}',
  additional_context text,
  revision int not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(competitors) <= 20),
  check (cardinality(public_urls) <= 20)
);

create table public.brief_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  storage_path text,
  extracted_text text,
  extraction_status text not null check (extraction_status in ('extracted', 'unsupported', 'failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index brief_documents_project_idx on public.brief_documents (project_id);

-- ---------------------------------------------------------------------------
-- Research
-- ---------------------------------------------------------------------------
create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status public.run_status not null default 'queued',
  mode public.data_mode not null,
  provider text not null default 'qloo',
  question text not null,
  plan jsonb not null default '{}'::jsonb,
  brief_revision int,
  idempotency_key text not null,
  error_code text,
  error_message text,
  interpretation jsonb,
  interpretation_generator text,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);
create index research_runs_project_idx on public.research_runs (project_id, created_at desc);

-- One row per provider request (provenance ledger).
create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  endpoint text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null check (status in ('ok', 'empty', 'error')),
  http_status int,
  result_count int not null default 0,
  duration_ms int,
  error_message text,
  raw_response jsonb,
  retrieved_at timestamptz not null default now()
);
create index research_sources_run_idx on public.research_sources (run_id);

create table public.cultural_entities (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id uuid references public.research_sources(id) on delete set null,
  provider_entity_id text not null,
  name text not null,
  entity_type text not null,
  role text not null check (role in ('seed', 'result', 'tag', 'audience')),
  affinity numeric,
  popularity numeric,
  tags jsonb not null default '[]'::jsonb,
  properties jsonb not null default '{}'::jsonb,
  retrieved_at timestamptz not null default now(),
  unique (run_id, provider_entity_id, role)
);
create index cultural_entities_run_idx on public.cultural_entities (run_id);
create index cultural_entities_project_name_idx on public.cultural_entities (project_id, name);

create table public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_entity_id uuid not null references public.cultural_entities(id) on delete cascade,
  to_entity_id uuid not null references public.cultural_entities(id) on delete cascade,
  relation text not null check (relation in ('signal_to_result', 'explainability')),
  value numeric,
  source_id uuid references public.research_sources(id) on delete set null,
  created_at timestamptz not null default now()
);
create index entity_relationships_run_idx on public.entity_relationships (run_id);

-- ---------------------------------------------------------------------------
-- Strategy (declared before evidence so evidence can reference versions)
-- ---------------------------------------------------------------------------
create table public.strategy_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version int not null,
  run_id uuid references public.research_runs(id) on delete set null,
  generator text not null,
  is_demo boolean not null default false,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table public.strategy_directions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.strategy_versions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slot int not null check (slot between 1 and 3),
  revision int not null default 1,
  parent_id uuid references public.strategy_directions(id) on delete set null,
  name text not null,
  content jsonb not null,
  evidence_ids uuid[] not null default '{}',
  is_exploratory boolean not null default false,
  status public.direction_status not null default 'draft',
  revision_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index strategy_directions_project_idx on public.strategy_directions (project_id, version_id, slot, revision);

alter table public.projects
  add constraint projects_selected_direction_fk
  foreign key (selected_direction_id) references public.strategy_directions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Evidence
-- ---------------------------------------------------------------------------
create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete cascade,
  evidence_type public.evidence_type not null,
  claim text not null,
  source_provider text,
  source_ref text,
  source_url text check (source_url is null or source_url ~* '^https?://'),
  source_timestamp timestamptz,
  retrieved_at timestamptz,
  raw_metadata jsonb not null default '{}'::jsonb,
  normalized_value numeric,
  limitations text,
  entity_ids uuid[] not null default '{}',
  strategy_version_id uuid references public.strategy_versions(id) on delete set null,
  review_status public.review_status not null default 'unreviewed',
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index evidence_items_project_idx on public.evidence_items (project_id, created_at desc);
create index evidence_items_run_idx on public.evidence_items (run_id);
create index evidence_items_claim_trgm_idx on public.evidence_items using gin (to_tsvector('english', claim));

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete set null,
  title text not null,
  description text not null,
  why_it_matters text,
  unknowns text,
  strategic_use text,
  validation_step text,
  status public.opportunity_status not null default 'new',
  evidence_ids uuid[] not null default '{}',
  entity_ids uuid[] not null default '{}',
  linked_direction_id uuid references public.strategy_directions(id) on delete set null,
  generator text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_project_idx on public.opportunities (project_id, status);

create table public.creative_briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction_id uuid references public.strategy_directions(id) on delete set null,
  content jsonb not null,
  generator text not null,
  is_demo boolean not null default false,
  revision int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index creative_briefs_project_idx on public.creative_briefs (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Experiments
-- ---------------------------------------------------------------------------
create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction_id uuid references public.strategy_directions(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  hypothesis text not null,
  rationale text,
  audience text,
  method text,
  primary_metric text not null,
  secondary_metrics text[] not null default '{}',
  budget_assumptions text,
  timeline text,
  decision_threshold text,
  status public.experiment_status not null default 'draft',
  interpretation text,
  next_action text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index experiments_project_idx on public.experiments (project_id, updated_at desc);

create table public.experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  description text,
  is_control boolean not null default false,
  created_at timestamptz not null default now()
);
create index experiment_variants_experiment_idx on public.experiment_variants (experiment_id);

create table public.experiment_results (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  variant_id uuid references public.experiment_variants(id) on delete cascade,
  metric text not null,
  value numeric not null,
  sample_size int check (sample_size is null or sample_size >= 0),
  observed_on date,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index experiment_results_experiment_idx on public.experiment_results (experiment_id);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_project_idx on public.reports (project_id, updated_at desc);

-- Immutable snapshots: a report version never changes after creation.
create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version int not null,
  sections text[] not null,
  snapshot jsonb not null,
  run_id uuid references public.research_runs(id) on delete set null,
  strategy_version_id uuid references public.strategy_versions(id) on delete set null,
  contains_demo_data boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (report_id, version)
);

create table public.shared_report_links (
  id uuid primary key default gen_random_uuid(),
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash text not null unique,
  label text,
  expires_at timestamptz,
  revoked_at timestamptz,
  access_count int not null default 0,
  last_accessed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Copilot, collaboration, operations
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_project_user_idx on public.conversations (project_id, user_id);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_calls jsonb not null default '[]'::jsonb,
  generator text,
  created_at timestamptz not null default now()
);
create index conversation_messages_conversation_idx on public.conversation_messages (conversation_id, created_at);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  target_type text not null check (target_type in ('evidence', 'direction', 'opportunity', 'experiment')),
  target_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index comments_target_idx on public.comments (target_type, target_id, created_at);

create table public.background_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null check (kind in ('research_run', 'strategy_generation', 'creative_brief', 'report_generation')),
  label text not null,
  status public.task_status not null default 'queued',
  ref_id uuid,
  result_href text,
  error_message text,
  attempts int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index background_tasks_workspace_idx on public.background_tasks (workspace_id, created_at desc);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  verb text not null,
  object_type text not null,
  object_id uuid,
  summary text not null,
  created_at timestamptz not null default now()
);
create index activity_events_workspace_idx on public.activity_events (workspace_id, created_at desc);

-- Non-secret integration configuration. Provider secrets live in server env vars only.
create table public.integration_settings (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('qloo', 'llm', 'web_research')),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, provider)
);

-- Product analytics & usage metering. Never stores brief content.
create table public.usage_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index usage_events_workspace_event_idx on public.usage_events (workspace_id, event, created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','clients','brand_profiles','projects','campaign_briefs',
    'research_runs','evidence_items','opportunities','creative_briefs','experiments','reports',
    'conversations','background_tasks']
  loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
