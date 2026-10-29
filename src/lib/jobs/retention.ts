import "server-only";
import { privilegedSql } from "@/lib/db";

/**
 * Daily retention job (privileged; runs only from the authenticated cron route).
 * For each workspace with data_retention_days set, removes data older than the window:
 * raw provider payloads (the request ledger row itself is kept for provenance), copilot
 * conversations, activity events, and finished background tasks. Globally it deletes
 * pilot requests after 12 months and share links that expired more than 30 days ago.
 */
export async function runRetention() {
  const sql = privilegedSql();
  return sql.begin(async (tx) => {
    const raw = await tx`
      update research_sources s set raw_response = null
      from workspaces w
      where w.id = s.workspace_id and w.data_retention_days is not null and s.raw_response is not null
        and s.retrieved_at < now() - make_interval(days => w.data_retention_days)
      returning s.id`;
    const conv = await tx`
      delete from conversations c using workspaces w
      where w.id = c.workspace_id and w.data_retention_days is not null
        and not exists (select 1 from conversation_messages m where m.conversation_id = c.id and m.created_at >= now() - make_interval(days => w.data_retention_days))
        and c.created_at < now() - make_interval(days => w.data_retention_days)
      returning c.id`;
    const activity = await tx`
      delete from activity_events a using workspaces w
      where w.id = a.workspace_id and w.data_retention_days is not null and a.created_at < now() - make_interval(days => w.data_retention_days)
      returning a.id`;
    const tasks = await tx`
      delete from background_tasks t using workspaces w
      where w.id = t.workspace_id and w.data_retention_days is not null and t.finished_at is not null
        and t.finished_at < now() - make_interval(days => w.data_retention_days)
      returning t.id`;
    const pilots = await tx`delete from pilot_requests where created_at < now() - interval '12 months' returning id`;
    const links = await tx`delete from shared_report_links where expires_at is not null and expires_at < now() - interval '30 days' returning id`;
    return {
      rawResponsesCleared: raw.length, conversationsDeleted: conv.length, activityDeleted: activity.length,
      tasksDeleted: tasks.length, pilotRequestsDeleted: pilots.length, expiredLinksDeleted: links.length,
    };
  });
}
