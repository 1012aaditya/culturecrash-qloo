-- CultureCrash Watch, Milestone 4 (part A): relevance and story grouping.
--  1. Each watch story gets a relevance verdict: relevant, a resale listing, or a name clash (something
--     else with the same name). Hidden items are kept, with the reason, never deleted.
--  2. Stories about the same event across outlets point at the event's first story (watch_event_lead).
--  3. Daily counts leave hidden items out and also count distinct events.

alter table public.research_documents
  add column watch_relevance text check (watch_relevance in ('relevant', 'listing', 'name_clash')),
  add column watch_relevance_reason text check (char_length(watch_relevance_reason) <= 300),
  add column watch_event_lead uuid references public.research_documents(id) on delete set null;
create index research_documents_watch_event_idx on public.research_documents (watch_event_lead) where watch_event_lead is not null;

-- Same columns as before (security_invoker keeps Row Level Security), relevant stories only, plus events.
create or replace view public.watch_daily_counts with (security_invoker = true) as
  select o.watch_id, o.watch_target_id, (o.seen_at at time zone 'UTC')::date as day,
    count(distinct coalesce(d.duplicate_of, d.id))::int as stories_seen,
    count(distinct coalesce(d.duplicate_of, d.id)) filter (where d.watch_job_id = o.watch_job_id)::int as new_stories,
    count(distinct d.publisher)::int as publishers,
    count(distinct coalesce(d.watch_event_lead, d.duplicate_of, d.id))::int as events_seen
  from public.watch_observations o
  join public.research_documents d on d.id = o.document_id
  where coalesce(d.watch_relevance, 'relevant') = 'relevant'
  group by o.watch_id, o.watch_target_id, (o.seen_at at time zone 'UTC')::date;
