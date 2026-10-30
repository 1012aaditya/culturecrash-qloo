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
  // Each user's digest for this week is claimed in the database before sending, so a cron retry
  // (or a run that timed out halfway) sends only what's left. Sends go out a few at a time and stop
  // well inside the function limit; the next run picks up anyone not yet claimed.
  const weekStart = (await sql`select date_trunc('week', now())::date as d`)[0].d as string;
  const deadline = Date.now() + 45_000;
  const due = [...byUser.entries()].filter(([, u]) => u.email && u.workspaces.some((w) => w.activity + w.openTasks > 0));
  let sent = 0;
  let deferred = 0;
  for (let i = 0; i < due.length; i += 5) {
    if (Date.now() > deadline) { deferred = due.length - i; break; }
    await Promise.all(due.slice(i, i + 5).map(async ([userId, u]) => {
      const [claim] = await sql`insert into digest_deliveries (user_id, week_start) values (${userId}, ${weekStart}) on conflict do nothing returning user_id`;
      if (!claim) return; // already sent this week
      const ok = (await sendEmail(weeklyDigestEmail({ to: u.email, workspaces: u.workspaces }))).sent;
      if (ok) sent++;
      else await sql`delete from digest_deliveries where user_id = ${userId} and week_start = ${weekStart}`; // retry next run
    }));
  }
  return { sent, deferred };
}
