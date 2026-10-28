-- Creates a clearly labelled demonstration workspace for the calling user.
-- The application only exposes this when CC_DEMO_MODE=enabled (never in production).
create or replace function public.create_demo_workspace() returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid; cl uuid; pr uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select w.id into ws from workspaces w join workspace_members m on m.workspace_id = w.id
    where w.is_demo and m.user_id = uid and m.role = 'owner' limit 1;
  if ws is not null then return ws; end if;
  insert into workspaces (name, is_demo, created_by) values ('Demo workspace (fixture data)', true, uid) returning id into ws;
  insert into workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  insert into clients (workspace_id, name, industry, notes, created_by)
    values (ws, 'Sample client (demo)', 'Beauty & skincare', 'Demonstration client. All data in this workspace is fictional.', uid) returning id into cl;
  insert into projects (workspace_id, client_id, name, category, market, owner_id, is_demo, status)
    values (ws, cl, 'Skincare Launch (demo)', 'Skincare', 'India', uid, true, 'active') returning id into pr;
  insert into campaign_briefs (project_id, workspace_id, brand, product, category, market, audience, objective, existing_positioning, competitors, updated_by)
    values (pr, ws, 'Lumen (sample)', 'Premium skincare line', 'Skincare', 'India', 'Gen Z in Indian metros who treat skincare as self-expression',
      'Launch the line and build consideration among new customers', 'Clinical efficacy for sensitive skin', array['Competitor A (sample)', 'Competitor B (sample)'], uid);
  insert into activity_events (workspace_id, project_id, actor_id, verb, object_type, object_id, summary)
    values (ws, pr, uid, 'created', 'workspace', ws, 'created a demonstration workspace with fictional data');
  return ws;
end $$;
revoke all on function public.create_demo_workspace() from public, anon;
grant execute on function public.create_demo_workspace() to authenticated;
