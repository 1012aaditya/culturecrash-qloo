-- Product sharpening (review of 2026-10-30, Phase 4).

-- Client Devil's Advocate critiques are saved per strategy version, so they can be reread,
-- answered with a revision and included in reports and pitch packs.
create table public.strategy_critiques (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.strategy_versions(id) on delete cascade,
  critique jsonb not null,
  generator text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index strategy_critiques_version_idx on public.strategy_critiques (version_id, created_at desc);
alter table public.strategy_critiques enable row level security;
alter table public.strategy_critiques force row level security;
grant select, insert, delete on public.strategy_critiques to authenticated;
create policy strategy_critiques_select on public.strategy_critiques for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy strategy_critiques_insert on public.strategy_critiques for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'member') and created_by = auth.uid());
create policy strategy_critiques_delete on public.strategy_critiques for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));
create trigger strategy_critiques_project_ws before insert or update on public.strategy_critiques
  for each row execute function public.enforce_project_workspace();

-- Rate results: successes out of exposures (sample_size), so variants can be compared statistically.
alter table public.experiment_results add column if not exists successes bigint
  check (successes is null or (successes >= 0 and sample_size is not null and successes <= sample_size));

-- An experiment's hypothesis, method, primary metric and decision rule are fixed once results arrive.
alter table public.experiments add column if not exists design_locked_at timestamptz;
update public.experiments x set design_locked_at = (select min(r.created_at) from public.experiment_results r where r.experiment_id = x.id)
where design_locked_at is null and exists (select 1 from public.experiment_results r where r.experiment_id = x.id);
