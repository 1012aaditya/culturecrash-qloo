import "server-only";
import { withUser } from "@/lib/db";
import type { Ctx } from "./workspace";

export async function getDashboard(ctx: Ctx) {
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const runs = await tx`select r.id, r.status, r.mode, r.created_at, r.updated_at, r.error_message, p.id as project_id, p.name as project
      from research_runs r join projects p on p.id = r.project_id where r.workspace_id = ${ws}
      and (r.status in ('queued','running') or r.updated_at > now() - interval '3 days') order by r.updated_at desc limit 5`;
    const reports = await tx`select r.id, r.title, r.updated_at, p.id as project_id, p.name as project,
      (select max(version) from report_versions v where v.report_id = r.id) as version,
      (select count(*) from shared_report_links l join report_versions v on v.id = l.report_version_id where v.report_id = r.id and l.revoked_at is null)::int as shares
      from reports r join projects p on p.id = r.project_id where r.workspace_id = ${ws} order by r.updated_at desc limit 4`;
    const opportunities = await tx`select o.id, o.title, o.status, o.is_demo, o.generator, p.id as project_id, p.name as project
      from opportunities o join projects p on p.id = o.project_id where o.workspace_id = ${ws} and o.status in ('new','saved','investigating')
      order by o.updated_at desc limit 4`;
    const results = await tx`select x.id, x.name, x.status, x.primary_metric, p.id as project_id, p.name as project,
      (select count(*) from experiment_results er where er.experiment_id = x.id)::int as result_count
      from experiments x join projects p on p.id = x.project_id where x.workspace_id = ${ws} order by x.updated_at desc limit 4`;
    const activity = await tx`select a.id, a.summary, a.created_at, a.project_id, coalesce(pr.full_name, pr.email, 'Someone') as actor
      from activity_events a left join profiles pr on pr.id = a.actor_id where a.workspace_id = ${ws} order by a.created_at desc limit 8`;
    return { runs, reports, opportunities, results, activity };
  });
}
