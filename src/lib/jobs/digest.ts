import "server-only";
import { privilegedSql } from "@/lib/db";
import { emailConfigured, sendEmail } from "@/lib/email";
import { weeklyDigestEmail } from "@/lib/email/templates";

/** Weekly digest for users who opted in (Settings → Notifications), one email per user. */
export async function runWeeklyDigest() {
  if (!emailConfigured()) return { sent: 0, skipped: "email not configured" };
  const sql = privilegedSql();
  const rows = await sql`
    select p.id as user_id, p.email, w.name as workspace,
      (select count(*)::int from activity_events a where a.workspace_id = w.id and a.created_at > now() - interval '7 days') as activity,
      (select count(*)::int from research_runs r where r.workspace_id = w.id and r.status in ('completed', 'partially_completed') and r.completed_at > now() - interval '7 days') as runs,
      (select count(*)::int from report_versions v join reports rp on rp.id = v.report_id where rp.workspace_id = w.id and v.created_at > now() - interval '7 days') as reports,
      (select count(*)::int from background_tasks t where t.workspace_id = w.id and t.status in ('queued','running','awaiting_review')) as open_tasks
    from profiles p
    join workspace_members m on m.user_id = p.id
    join workspaces w on w.id = m.workspace_id and not w.is_demo
    where coalesce((p.notification_prefs ->> 'weekly_digest')::boolean, false)
    order by p.id, w.name`;
  type Digest = { email: string; workspaces: { name: string; activity: number; runs: number; reports: number; openTasks: number }[] };
  const byUser = new Map<string, Digest>();
  for (const r of rows) {
    const u: Digest = byUser.get(r.user_id) ?? { email: r.email, workspaces: [] };
    u.workspaces.push({ name: r.workspace, activity: r.activity, runs: r.runs, reports: r.reports, openTasks: r.open_tasks });
    byUser.set(r.user_id, u);
  }
  let sent = 0;
  for (const u of byUser.values()) {
    if (!u.email || u.workspaces.every((w) => w.activity + w.openTasks === 0)) continue;
    if ((await sendEmail(weeklyDigestEmail({ to: u.email, workspaces: u.workspaces }))).sent) sent++;
  }
  return { sent };
}
