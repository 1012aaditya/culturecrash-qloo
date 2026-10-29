-- Qloo-first research: allow the search-suggestions source type (Google autocomplete phrasing,
-- which is not trend data) and index Qloo popularity observations for per-entity history.
alter table public.research_documents drop constraint if exists research_documents_source_type_check;
alter table public.research_documents add constraint research_documents_source_type_check check (source_type in (
  'web_page', 'news', 'encyclopedia', 'community_post', 'video', 'brand_site', 'client_document', 'demo_fixture', 'search_suggestions'));
create index if not exists trend_observations_ref_idx on public.trend_observations (workspace_id, provider, metric, source_ref, collected_at);
create index if not exists research_sources_provider_idx on public.research_sources (workspace_id, provider, retrieved_at desc);
