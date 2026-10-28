-- Row Level Security, grants and privileged functions.
-- Roles: owner > admin > member > viewer. Viewers are read-only.

-- ---------------------------------------------------------------------------
-- Grants: anon gets nothing except the shared-report function.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Generic workspace-scoped policies: members read, members+ write, admins+ delete.
do $$
declare t text;
begin
  foreach t in array array[
    'clients','brand_profiles','projects','campaign_briefs','brief_documents',
    'research_runs','research_sources','cultural_entities','entity_relationships',
    'strategy_versions','strategy_directions','evidence_items','opportunities',
    'creative_briefs','experiments','experiment_variants','experiment_results',
    'reports','background_tasks'
  ]
  loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
      using (public.is_workspace_member(workspace_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.has_workspace_role(workspace_id, 'member'))
      with check (public.has_workspace_role(workspace_id, 'member'))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (public.has_workspace_role(workspace_id, 'admin'))$f$, t);
  end loop;
end $$;

-- Owners of a project may delete it even as a plain member.
create policy projects_owner_delete on public.projects for delete to authenticated
  using (owner_id = auth.uid() and public.has_workspace_role(workspace_id, 'member'));

-- Report versions are immutable snapshots: no update policy.
create policy report_versions_select on public.report_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy report_versions_insert on public.report_versions for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'member'));
create policy report_versions_delete on public.report_versions for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));

create policy shared_links_select on public.shared_report_links for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy shared_links_insert on public.shared_report_links for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'member') and created_by = auth.uid());
create policy shared_links_update on public.shared_report_links for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin') or created_by = auth.uid())
  with check (public.is_workspace_member(workspace_id));

-- Profiles: self, plus co-members (name/email only is exposed by the app).
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid() or exists (
      select 1 from public.workspace_members a
      join public.workspace_members b on a.workspace_id = b.workspace_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Workspaces
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.has_workspace_role(id, 'admin')) with check (public.has_workspace_role(id, 'admin'));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (public.has_workspace_role(id, 'owner'));

-- Membership
create policy members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy members_insert on public.workspace_members for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'admin') and role <> 'owner');
create policy members_update on public.workspace_members for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));
create policy members_delete on public.workspace_members for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'admin') or user_id = auth.uid());

-- Guard owner rows: only owners may create/alter/remove owner memberships; never orphan a workspace.
create or replace function public.guard_member_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ws uuid := coalesce(new.workspace_id, old.workspace_id);
  owners int;
begin
  -- Privileged internal callers (signup trigger, create_workspace) run without a JWT subject.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if (tg_op in ('INSERT', 'UPDATE') and new.role = 'owner')
     or (tg_op in ('UPDATE', 'DELETE') and old.role = 'owner') then
    -- Bootstrapping a brand-new workspace (no members yet) is the only ownerless path.
    if tg_op = 'INSERT' and not exists (select 1 from public.workspace_members where workspace_id = ws) then
      return new;
    end if;
    if not public.has_workspace_role(ws, 'owner') then
      raise exception 'Only workspace owners can change owner memberships' using errcode = '42501';
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner' then
    select count(*) into owners from public.workspace_members
      where workspace_id = ws and role = 'owner' and user_id <> old.user_id;
    if owners = 0 and (tg_op = 'DELETE' or new.role <> 'owner') then
      raise exception 'A workspace must keep at least one owner' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger workspace_members_guard before insert or update or delete on public.workspace_members
  for each row execute function public.guard_member_change();

create policy invitations_select on public.workspace_invitations for select to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));
create policy invitations_insert on public.workspace_invitations for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'admin'));
create policy invitations_update on public.workspace_invitations for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

-- Conversations are private to their author inside the workspace.
create policy conversations_all on public.conversations for all to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy conversation_messages_all on public.conversation_messages for all to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid() and c.workspace_id = conversation_messages.workspace_id));

-- Comments: members write as themselves; authors or admins delete.
create policy comments_select on public.comments for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'member') and author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.has_workspace_role(workspace_id, 'admin'));

create policy activity_select on public.activity_events for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy activity_insert on public.activity_events for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and actor_id = auth.uid());

create policy integration_select on public.integration_settings for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy integration_write on public.integration_settings for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'admin'));
create policy integration_update on public.integration_settings for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

create policy usage_insert on public.usage_events for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());
create policy usage_select on public.usage_events for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Cross-row integrity: child rows must live in the same workspace as their project.
-- Prevents a member of workspace A attaching rows to a project in workspace B.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_project_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.workspace_id = new.workspace_id) then
    raise exception 'project/workspace mismatch' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['campaign_briefs','brief_documents','research_runs','cultural_entities',
    'strategy_versions','strategy_directions','evidence_items','opportunities','creative_briefs',
    'experiments','reports','conversations','comments']
  loop
    execute format('create trigger %1$s_project_ws before insert or update on public.%1$I
      for each row execute function public.enforce_project_workspace()', t);
  end loop;
end $$;

create or replace function public.enforce_client_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients c where c.id = new.client_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'client/workspace mismatch' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger projects_client_ws before insert or update on public.projects
  for each row execute function public.enforce_client_workspace();
create trigger brand_profiles_client_ws before insert or update on public.brand_profiles
  for each row execute function public.enforce_client_workspace();

-- ---------------------------------------------------------------------------
-- Signup: profile, personal workspace, pending invitations
-- ---------------------------------------------------------------------------
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

  insert into public.workspace_members (workspace_id, user_id, role)
  select i.workspace_id, new.id, i.role from public.workspace_invitations i
  where lower(i.email) = lower(new.email) and i.accepted_at is null and i.revoked_at is null
  on conflict do nothing;
  update public.workspace_invitations set accepted_at = now()
  where lower(email) = lower(new.email) and accepted_at is null and revoked_at is null;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Create an additional workspace for the calling user (they become its owner).
create or replace function public.create_workspace(ws_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if char_length(trim(ws_name)) not between 1 and 120 then raise exception 'invalid name' using errcode = '22023'; end if;
  insert into public.workspaces (name, created_by) values (trim(ws_name), uid) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  return ws;
end $$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

-- Invite an existing user directly (or leave a pending invitation for signup).
create or replace function public.invite_member(ws uuid, invite_email text, invite_role public.workspace_role)
returns text
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not public.has_workspace_role(ws, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if invite_role = 'owner' then raise exception 'owners cannot be invited' using errcode = '22023'; end if;
  select id into target from public.profiles where lower(email) = lower(trim(invite_email));
  if target is not null then
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, target, invite_role)
    on conflict (workspace_id, user_id) do nothing;
    return 'added';
  end if;
  insert into public.workspace_invitations (workspace_id, email, role, invited_by)
  values (ws, lower(trim(invite_email)), invite_role, auth.uid())
  on conflict do nothing;
  return 'invited';
end $$;
revoke all on function public.invite_member(uuid, text, public.workspace_role) from public, anon;
grant execute on function public.invite_member(uuid, text, public.workspace_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared reports: token-hash lookup, no table access for anon.
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_report(p_token_hash text)
returns table (title text, version int, snapshot jsonb, created_at timestamptz, expires_at timestamptz, contains_demo_data boolean)
language plpgsql security definer set search_path = public as $$
declare link public.shared_report_links;
begin
  select * into link from public.shared_report_links l
  where l.token_hash = p_token_hash and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());
  if not found then return; end if;
  update public.shared_report_links set access_count = access_count + 1, last_accessed_at = now() where id = link.id;
  return query
    select r.title, v.version, v.snapshot, v.created_at, link.expires_at, v.contains_demo_data
    from public.report_versions v join public.reports r on r.id = v.report_id
    where v.id = link.report_version_id;
end $$;
revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;

-- Count research runs started today, used for per-workspace rate limiting.
create or replace function public.research_runs_today(ws uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.research_runs
  where workspace_id = ws and created_at > now() - interval '24 hours'
    and public.is_workspace_member(ws)
$$;
grant execute on function public.research_runs_today(uuid) to authenticated;
