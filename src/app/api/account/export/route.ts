import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";

/**
 * Exports the signed-in user's own personal data as JSON. Runs as the user, so RLS
 * limits every query; only rows authored by (or describing) the user are included.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await withUser(user.id, async (tx) => {
    const [profile] = await tx`select id, email, full_name, job_title, notification_prefs, created_at, updated_at from profiles where id = ${user.id}`;
    const memberships = await tx`select w.id as workspace_id, w.name as workspace, m.role, m.created_at as joined_at
      from workspace_members m join workspaces w on w.id = m.workspace_id where m.user_id = ${user.id} order by m.created_at`;
    const activity = await tx`select a.workspace_id, a.project_id, a.verb, a.object_type, a.object_id, a.summary, a.created_at
      from activity_events a where a.actor_id = ${user.id} order by a.created_at desc limit 5000`;
    const comments = await tx`select c.workspace_id, c.project_id, c.target_type, c.target_id, c.body, c.created_at
      from comments c where c.author_id = ${user.id} order by c.created_at desc limit 5000`;
    const conversations = await tx`select c.id, c.workspace_id, c.project_id, c.title, c.created_at,
        coalesce((select json_agg(json_build_object('role', m.role, 'content', m.content, 'created_at', m.created_at) order by m.created_at)
          from conversation_messages m where m.conversation_id = c.id), '[]'::json) as messages
      from conversations c where c.user_id = ${user.id} order by c.created_at desc limit 500`;
    const feedback = await tx`select category, message, page, created_at from feedback where user_id = ${user.id} order by created_at desc`;
    const usage = await tx`select workspace_id, project_id, event, created_at from usage_events where user_id = ${user.id} order by created_at desc limit 5000`;
    return { profile, memberships, activity, comments, conversations, feedback, usage_events: usage };
  });
  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      format: "culturecrash-personal-export/1",
      note: "Personal data for this account only. Workspace records you created (briefs, research, reports) belong to their workspace and are not included.",
      ...data,
    },
    null,
    2,
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="culturecrash-export-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
