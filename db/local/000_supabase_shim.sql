-- LOCAL DEVELOPMENT / TEST ONLY.
-- Recreates the small part of the Supabase platform that CultureCrash's migrations
-- rely on (roles, auth.users, auth.uid()). Never apply this to a Supabase project:
-- Supabase already provides these objects.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
