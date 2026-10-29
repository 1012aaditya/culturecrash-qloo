import "server-only";
import type { Tx } from "@/lib/db";
import type { ShellNotification } from "@/components/nav/types";

export type NotificationKind = "research_completed" | "research_failed" | "report_shared" | "member_added" | "task_completed";

/** Inserted under the actor's RLS context: the recipient must be a member of the workspace. */
export async function createNotification(tx: Tx, n: {
  workspaceId: string; userId: string; actorId: string | null; kind: NotificationKind; title: string; body?: string | null; href?: string | null;
}) {
  await tx`insert into notifications (workspace_id, user_id, actor_id, kind, title, body, href)
    values (${n.workspaceId}, ${n.userId}, ${n.actorId}, ${n.kind}, ${n.title.slice(0, 200)}, ${n.body?.slice(0, 1000) ?? null}, ${n.href ?? null})`;
}

/** The caller's notifications across all their workspaces (newest 10) and the unread count. */
export async function readNotifications(tx: Tx, userId: string, workspaceId: string): Promise<{ unread: number; items: ShellNotification[] }> {
  const rows = await tx`
    select n.id, n.kind, n.title, n.body, n.href, n.read_at, n.created_at, n.workspace_id, w.name as workspace, coalesce(p.full_name, p.email) as actor
    from notifications n join workspaces w on w.id = n.workspace_id left join profiles p on p.id = n.actor_id
    where n.user_id = ${userId}
    order by n.created_at desc limit 10`;
  const [{ count }] = await tx`select count(*)::int as count from notifications where user_id = ${userId} and read_at is null`;
  return {
    unread: count,
    items: rows.map((r) => ({
      id: r.id, kind: r.kind, title: r.title, body: r.body, href: r.href, actor: r.actor ?? null,
      read: r.read_at !== null, workspace: r.workspace_id === workspaceId ? null : r.workspace, createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}
