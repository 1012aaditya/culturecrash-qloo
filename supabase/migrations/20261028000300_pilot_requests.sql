-- Pilot requests submitted from the public /pricing page.
-- Written only by the server's privileged connection; no client role may read or write it.

create table if not exists public.pilot_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email like '%_@_%'),
  company text not null check (char_length(company) between 1 and 160),
  team_size text check (team_size is null or char_length(team_size) <= 40),
  message text check (message is null or char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists pilot_requests_email_created_idx
  on public.pilot_requests (lower(email), created_at desc);

alter table public.pilot_requests enable row level security;
alter table public.pilot_requests force row level security;

-- Intentionally no policies: anon and authenticated have no access at all.
revoke all on public.pilot_requests from anon, authenticated;
revoke all on public.pilot_requests from public;
