-- CultureCrash Watch, Milestone 3: websites, newsroom feeds and YouTube.
--  1. watch_pages: pages and RSS/Atom feeds watched for a company, each with an honest status
--     (watching, blocked by the site, disallowed by robots.txt, needs a real browser, failing).
--  2. watch_page_snapshots: the page's normalised text lines when it was first seen and whenever it
--     changed meaningfully, so the next check can tell real changes from rotating banners and dates.
--  3. watch_video_stats: public view/like/comment counts for watched YouTube videos, one row per check,
--     kept for at most 30 days (YouTube API terms).

create table public.watch_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  watch_id uuid not null references public.watches(id) on delete cascade,
  watch_target_id uuid not null references public.watch_targets(id) on delete cascade,
  url text not null check (char_length(url) <= 2000 and url ~ '^https?://'),
  kind text not null default 'page' check (kind in ('page', 'feed')),
  -- A feed found through a watched page's <link rel="alternate">.
  discovered_from uuid references public.watch_pages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'ok', 'blocked', 'robots', 'needs_browser', 'error')),
  status_detail text check (char_length(status_detail) <= 300),
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  consecutive_errors int not null default 0 check (consecutive_errors >= 0),
  created_at timestamptz not null default now(),
  unique (watch_id, url)
);
create index watch_pages_watch_idx on public.watch_pages (watch_id);

create table public.watch_page_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  watch_id uuid not null references public.watches(id) on delete cascade,
  page_id uuid not null references public.watch_pages(id) on delete cascade,
  watch_job_id uuid references public.watch_jobs(id) on delete set null,
  content_hash text not null,
  -- Normalised text lines (dates, times and tracking tokens masked), capped by the app at 20,000 characters.
  lines text[] not null,
  fetched_at timestamptz not null default now()
);
create index watch_page_snapshots_page_idx on public.watch_page_snapshots (page_id, fetched_at desc);

create table public.watch_video_stats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  watch_id uuid not null references public.watches(id) on delete cascade,
  document_id uuid not null references public.research_documents(id) on delete cascade,
  watch_job_id uuid references public.watch_jobs(id) on delete set null,
  views bigint check (views >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  fetched_at timestamptz not null default now()
);
create index watch_video_stats_document_idx on public.watch_video_stats (document_id, fetched_at desc);

-- Same-workspace guard as the other Watch tables.
create trigger watch_pages_watch_ws before insert or update on public.watch_pages for each row execute function public.enforce_watch_workspace();
create trigger watch_page_snapshots_watch_ws before insert or update on public.watch_page_snapshots for each row execute function public.enforce_watch_workspace();
create trigger watch_video_stats_watch_ws before insert or update on public.watch_video_stats for each row execute function public.enforce_watch_workspace();

-- At most three pages and two feeds per company, and a page's company must belong to the same watch.
create or replace function public.enforce_watch_page_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare allowed int := case new.kind when 'page' then 3 else 2 end;
begin
  if not exists (select 1 from public.watch_targets t where t.id = new.watch_target_id and t.watch_id = new.watch_id) then
    raise exception 'watch/target mismatch' using errcode = '42501';
  end if;
  if (select count(*) from public.watch_pages p where p.watch_target_id = new.watch_target_id and p.kind = new.kind and p.id <> new.id) >= allowed then
    raise exception 'A company can have at most three watched pages and two feeds.' using errcode = '54000';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_watch_page_limits() from public, anon, authenticated;
create trigger watch_pages_limits before insert or update of watch_target_id, kind, watch_id on public.watch_pages
  for each row execute function public.enforce_watch_page_limits();

do $$
declare t text;
begin
  foreach t in array array['watch_pages', 'watch_page_snapshots', 'watch_video_stats'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated using (public.has_workspace_role(workspace_id, 'member')) with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated using (public.has_workspace_role(workspace_id, 'member'))$f$, t);
  end loop;
end $$;
grant select, insert, update, delete on public.watch_pages, public.watch_page_snapshots, public.watch_video_stats to authenticated;
