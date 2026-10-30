-- Security hardening (review of 2026-10-30).
--  1. Supabase's auto-generated REST API (PostgREST) is closed: the app talks to Postgres directly, so the
--     Data API was only a second way in that skipped the app's permission checks.
--  2. profiles.email can no longer be edited by its owner (it was used to hijack workspace invitations).
--  3. Plan, demo flag, research limits and retention change only through owner-checked functions.
--  4. Invitations are always accepted explicitly by a confirmed email address; nobody is added silently.
--  5. Members can't plant notifications for teammates, and notification links can't leave the app.
--  6. A user can own at most three workspaces (each one carries its own research budget).

-- ---------------------------------------------------------------------------
-- 1. Data API off. Every PostgREST request fails before it reaches a table or function.
--    Also remove "public" from Settings → API → Exposed schemas in the Supabase dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.data_api_disabled() returns void
language plpgsql as $$
begin
  raise exception 'The CultureCrash Data API is disabled.' using errcode = 'PT403';
end $$;
grant execute on function public.data_api_disabled() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.data_api_disabled''';
    perform pg_notify('pgrst', 'reload config');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Profile email mirrors auth.users and is not user-editable.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (full_name, job_title, notification_prefs, updated_at) on public.profiles to authenticated;

create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.sync_profile_email() from public, anon, authenticated;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Undo any email that was changed through the Data API before this migration.
update public.profiles p set email = u.email
from auth.users u where u.id = p.id and p.email is distinct from u.email;

-- True when the signed-in user's email address has been confirmed.
create or replace function public.my_email_confirmed() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select u.email_confirmed_at is not null from auth.users u where u.id = auth.uid()), false)
$$;
revoke all on function public.my_email_confirmed() from public, anon;
grant execute on function public.my_email_confirmed() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Workspace settings: admins rename; owners change limits and retention; nobody edits plan/demo.
-- ---------------------------------------------------------------------------
revoke update on public.workspaces from authenticated;
grant update (name, updated_at) on public.workspaces to authenticated;

create or replace function public.set_research_limits(ws uuid, budget_usd numeric, per_user_daily int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_workspace_role(ws, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if budget_usd < 0 or budget_usd > 10000 or per_user_daily not between 1 and 200 then
    raise exception 'invalid limits' using errcode = '22023';
  end if;
  update public.workspaces set research_budget_usd_monthly = budget_usd, research_runs_per_user_daily = per_user_daily where id = ws;
end $$;
revoke all on function public.set_research_limits(uuid, numeric, int) from public, anon;
grant execute on function public.set_research_limits(uuid, numeric, int) to authenticated;

create or replace function public.set_data_retention(ws uuid, days int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_workspace_role(ws, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if days is not null and days not in (30, 90, 180, 365) then raise exception 'invalid retention' using errcode = '22023'; end if;
  update public.workspaces set data_retention_days = days where id = ws;
end $$;
revoke all on function public.set_data_retention(uuid, int) from public, anon;
grant execute on function public.set_data_retention(uuid, int) to authenticated;

-- At most three owned workspaces per user (the personal one plus two more).
create or replace function public.create_workspace(ws_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if char_length(trim(ws_name)) not between 1 and 120 then raise exception 'invalid name' using errcode = '22023'; end if;
  if (select count(*) from public.workspace_members where user_id = uid and role = 'owner') >= 3 then
    raise exception 'You can own at most three workspaces.' using errcode = '54000';
  end if;
  insert into public.workspaces (name, created_by) values (trim(ws_name), uid) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  return ws;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Invitations: always pending until the invitee (confirmed email) accepts.
-- ---------------------------------------------------------------------------
alter table public.workspace_invitations add column if not exists declined_at timestamptz;
drop index if exists public.workspace_invitations_open_idx;
create unique index workspace_invitations_open_idx
  on public.workspace_invitations (workspace_id, lower(email))
  where accepted_at is null and revoked_at is null and declined_at is null;

-- Never reveals whether the address has an account; at most 30 invitations per workspace per day.
create or replace function public.invite_member(ws uuid, invite_email text, invite_role public.workspace_role)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_workspace_role(ws, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if invite_role = 'owner' then raise exception 'owners cannot be invited' using errcode = '22023'; end if;
  if (select count(*) from public.workspace_invitations where workspace_id = ws and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'This workspace has sent 30 invitations in the last 24 hours. Try again tomorrow.' using errcode = '54000';
  end if;
  insert into public.workspace_invitations (workspace_id, email, role, invited_by)
  values (ws, lower(trim(invite_email)), invite_role, auth.uid())
  on conflict do nothing;
  return 'invited';
end $$;

-- Invitations addressed to the signed-in user's confirmed email.
create or replace function public.my_pending_invitations()
returns table (id uuid, workspace_id uuid, workspace_name text, role public.workspace_role, invited_by text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.workspace_id, w.name, i.role, coalesce(p.full_name, p.email), i.created_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null and lower(u.email) = lower(i.email)
  left join public.profiles p on p.id = i.invited_by
  where i.accepted_at is null and i.revoked_at is null and i.declined_at is null
    and not exists (select 1 from public.workspace_members m where m.workspace_id = i.workspace_id and m.user_id = auth.uid())
  order by i.created_at desc
$$;
revoke all on function public.my_pending_invitations() from public, anon;
grant execute on function public.my_pending_invitations() to authenticated;

create or replace function public.respond_to_invitation(inv uuid, accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare i public.workspace_invitations;
begin
  select inv_row.* into i from public.workspace_invitations inv_row
  join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null and lower(u.email) = lower(inv_row.email)
  where inv_row.id = inv and inv_row.accepted_at is null and inv_row.revoked_at is null and inv_row.declined_at is null
  for update of inv_row;
  if not found then raise exception 'invitation not found' using errcode = '42501'; end if;
  if accept then
    insert into public.workspace_members (workspace_id, user_id, role) values (i.workspace_id, auth.uid(), i.role)
    on conflict (workspace_id, user_id) do nothing;
    update public.workspace_invitations set accepted_at = now() where id = i.id;
  else
    update public.workspace_invitations set declined_at = now() where id = i.id;
  end if;
  return i.workspace_id;
end $$;
revoke all on function public.respond_to_invitation(uuid, boolean) from public, anon;
grant execute on function public.respond_to_invitation(uuid, boolean) to authenticated;

-- Signup no longer joins invited workspaces automatically (the address may not be confirmed yet).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  display_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, display_name)
  on conflict (id) do nothing;

  insert into public.workspaces (name, created_by)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'workspace_name'), ''),
                   coalesce(display_name, split_part(new.email, '@', 1)) || '''s studio'), new.id)
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Notifications: a member may notify a teammate only as themselves; links stay inside the app.
-- ---------------------------------------------------------------------------
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and exists (select 1 from public.workspace_members m where m.workspace_id = notifications.workspace_id and m.user_id = notifications.user_id)
    and (
      (user_id = auth.uid() and (actor_id is null or actor_id = auth.uid()))
      or (actor_id = auth.uid() and public.has_workspace_role(workspace_id, 'member'))
    )
  );
alter table public.notifications drop constraint if exists notifications_href_check;
alter table public.notifications add constraint notifications_href_check
  check (href is null or (href ~ '^/[^/]' and strpos(href, chr(92)) = 0));
