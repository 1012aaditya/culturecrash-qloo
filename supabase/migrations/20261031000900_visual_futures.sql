-- Visual futures: concept frames per strategy direction, an evidence trail behind every AI image, and
-- the art-director loop (an improved frame points to the frame it improves on).
--   direction_id  the strategy direction the frame visualises (reports group frames by it)
--   parent_id     the frame this one improves on
--   provenance    what the frame was built from: direction, Qloo signals, evidence, prompt, placement
--   fit           the cultural-fit check of the result, copied from the card for reports

alter table public.concept_jobs
  add column direction_id uuid references public.strategy_directions(id) on delete set null,
  add column parent_id uuid references public.concept_jobs(id) on delete set null,
  add column provenance jsonb not null default '{}'::jsonb check (octet_length(provenance::text) <= 20000),
  add column fit jsonb check (fit is null or octet_length(fit::text) <= 4000);
create index concept_jobs_direction_idx on public.concept_jobs (direction_id) where status = 'done';

-- The direction and the parent frame must belong to the same project and board as the job.
drop policy concept_jobs_insert on public.concept_jobs;
create policy concept_jobs_insert on public.concept_jobs for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'member') and created_by = auth.uid() and status = 'queued' and image is null
    and exists (select 1 from public.inspiration_boards b where b.id = board_id and b.workspace_id = concept_jobs.workspace_id and b.project_id = concept_jobs.project_id)
    and (direction_id is null or exists (select 1 from public.strategy_directions d where d.id = direction_id and d.project_id = concept_jobs.project_id))
    and (parent_id is null or exists (select 1 from public.concept_jobs p where p.id = parent_id and p.board_id = concept_jobs.board_id)));
