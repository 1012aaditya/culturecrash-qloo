-- Hardening flagged by the Supabase security advisor.
-- Trigger functions never need EXECUTE grants to fire; helpers are for signed-in users only.
revoke execute on function public.enforce_project_workspace() from public, anon, authenticated;
revoke execute on function public.enforce_client_workspace() from public, anon, authenticated;
revoke execute on function public.guard_member_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_workspace_member(uuid) from public, anon;
revoke execute on function public.has_workspace_role(uuid, public.workspace_role) from public, anon;
revoke execute on function public.research_runs_today(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, public.workspace_role) to authenticated;
grant execute on function public.research_runs_today(uuid) to authenticated;
-- get_shared_report stays executable by anon: it is the only public entry point (token-hash lookup).

alter function public.touch_updated_at() set search_path = public;
alter function public.workspace_role_rank(public.workspace_role) set search_path = public;
