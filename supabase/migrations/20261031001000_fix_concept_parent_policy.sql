-- Fix: in the insert policy, the unqualified `parent_id` inside the subquery over concept_jobs p resolved
-- to p.parent_id (the inner row), so "Make it fit better" (which sets a parent frame) was always rejected.
-- The outer row is now named explicitly.
drop policy concept_jobs_insert on public.concept_jobs;
create policy concept_jobs_insert on public.concept_jobs for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'member') and created_by = auth.uid() and status = 'queued' and image is null
    and exists (select 1 from public.inspiration_boards b where b.id = concept_jobs.board_id and b.workspace_id = concept_jobs.workspace_id and b.project_id = concept_jobs.project_id)
    and (concept_jobs.direction_id is null or exists (select 1 from public.strategy_directions d where d.id = concept_jobs.direction_id and d.project_id = concept_jobs.project_id))
    and (concept_jobs.parent_id is null or exists (select 1 from public.concept_jobs p where p.id = concept_jobs.parent_id and p.board_id = concept_jobs.board_id)));
