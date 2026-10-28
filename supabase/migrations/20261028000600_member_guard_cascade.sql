-- Allow workspace deletion: when the parent workspace is being deleted (cascade),
-- removing its owner memberships must not trip the "keep an owner" guard.
create or replace function public.guard_member_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ws uuid := coalesce(new.workspace_id, old.workspace_id);
  owners int;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = ws) then
    return old; -- cascade from a workspace delete (already authorised by the workspaces policy)
  end if;
  if (tg_op in ('INSERT', 'UPDATE') and new.role = 'owner')
     or (tg_op in ('UPDATE', 'DELETE') and old.role = 'owner') then
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
