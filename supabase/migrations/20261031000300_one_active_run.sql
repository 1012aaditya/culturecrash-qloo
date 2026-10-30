-- At most one queued or running research run per project (review of 2026-10-30, Phase 2).
-- The app already refuses a second run, but this makes it impossible even for two requests that
-- race past that check. Existing duplicates (from before the check) are closed first, keeping the newest.
update public.research_runs r set status = case when exists (select 1 from public.research_documents d where d.run_id = r.id) then 'partially_completed'::public.run_status else 'failed'::public.run_status end,
  stage = 'done', stop_reason = 'stale', completed_at = now(), error_code = 'partial',
  error_message = 'Closed because another run on this project was started at the same time.'
where r.status in ('queued', 'running')
  and exists (select 1 from public.research_runs n where n.project_id = r.project_id and n.status in ('queued', 'running') and n.created_at > r.created_at);

create unique index if not exists research_runs_one_active_per_project
  on public.research_runs (project_id) where status in ('queued', 'running');
