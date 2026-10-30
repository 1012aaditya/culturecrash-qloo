-- CultureCrash Watch: insights.
--  1. Claude reads each story: is it really about the company (else hidden as off-topic), what kind of
--     news it is (topic) and how important it is (1–5). Rules still pre-filter listings and name clashes.
--  2. A one-off 30-day backfill job per watch (run_key 'backfill:30d') fills in history for the charts.

alter table public.research_documents drop constraint if exists research_documents_watch_relevance_check;
alter table public.research_documents
  add constraint research_documents_watch_relevance_check check (watch_relevance in ('relevant', 'listing', 'name_clash', 'off_topic')),
  add column watch_topic text check (watch_topic in ('launch', 'collaboration', 'marketing', 'financial', 'leadership', 'retail', 'sustainability', 'legal', 'other')),
  add column watch_importance smallint check (watch_importance between 1 and 5);
create index research_documents_watch_published_idx on public.research_documents (watch_id, (coalesce(published_at, retrieved_at)) desc) where watch_id is not null;
