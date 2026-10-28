import "server-only";
import { withUser, type Tx } from "@/lib/db";
import type { Ctx } from "./workspace";
import type { ProjectSummary } from "@/lib/progress";
export * from "@/lib/progress";

const summarySelect = (tx: Tx) => tx`
  select p.id, p.name, p.category, p.market, p.status, p.is_demo, p.client_id, c.name as client_name,
    p.owner_id, pr.full_name as owner_name, p.updated_at, p.created_at,
    (select (case when coalesce(b.brand,'') <> '' then 1 else 0 end) + (case when coalesce(b.product,'') <> '' then 1 else 0 end)
          + (case when coalesce(b.category,'') <> '' then 1 else 0 end) + (case when coalesce(b.market,'') <> '' then 1 else 0 end)
          + (case when coalesce(b.audience,'') <> '' then 1 else 0 end) + (case when coalesce(b.objective,'') <> '' then 1 else 0 end)
       from campaign_briefs b where b.project_id = p.id) as brief_filled,
    (select r.status from research_runs r where r.project_id = p.id order by r.created_at desc limit 1) as last_run_status,
    (select r.mode from research_runs r where r.project_id = p.id order by r.created_at desc limit 1) as last_run_mode,
    exists (select 1 from research_runs r where r.project_id = p.id and r.status = 'completed') as has_completed_run,
    (select count(*) from evidence_items e where e.project_id = p.id)::int as evidence_count,
    (select count(*) from opportunities o where o.project_id = p.id and o.status <> 'dismissed')::int as opportunity_count,
    (select count(*) from strategy_versions s where s.project_id = p.id)::int as strategy_count,
    (p.selected_direction_id is not null) as has_selected_direction,
    (select count(*) from creative_briefs cb where cb.project_id = p.id)::int as creative_brief_count,
    (select count(*) from experiments x where x.project_id = p.id)::int as experiment_count,
    (select count(*) from experiment_results er join experiments x on x.id = er.experiment_id where x.project_id = p.id)::int as result_count,
    (select count(*) from reports rp where rp.project_id = p.id)::int as report_count
  from projects p
  left join clients c on c.id = p.client_id
  left join profiles pr on pr.id = p.owner_id`;

type Row = Record<string, unknown>;

function mapSummary(r: Row): ProjectSummary {
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as string | null,
    market: r.market as string | null,
    status: r.status as ProjectSummary["status"],
    isDemo: r.is_demo as boolean,
    clientId: r.client_id as string | null,
    clientName: r.client_name as string | null,
    ownerId: r.owner_id as string | null,
    ownerName: r.owner_name as string | null,
    updatedAt: new Date(r.updated_at as string).toISOString(),
    createdAt: new Date(r.created_at as string).toISOString(),
    briefFilled: Number(r.brief_filled ?? 0),
    lastRunStatus: (r.last_run_status as ProjectSummary["lastRunStatus"]) ?? null,
    lastRunMode: (r.last_run_mode as ProjectSummary["lastRunMode"]) ?? null,
    hasCompletedRun: Boolean(r.has_completed_run),
    evidenceCount: Number(r.evidence_count),
    opportunityCount: Number(r.opportunity_count),
    strategyCount: Number(r.strategy_count),
    hasSelectedDirection: Boolean(r.has_selected_direction),
    creativeBriefCount: Number(r.creative_brief_count),
    experimentCount: Number(r.experiment_count),
    resultCount: Number(r.result_count),
    reportCount: Number(r.report_count),
  };
}

export async function listProjects(ctx: Ctx, opts: { includeArchived?: boolean } = {}) {
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`
      select * from (${summarySelect(tx)}) s
      where s.id in (select id from projects where workspace_id = ${ctx.workspace.workspaceId})
        ${opts.includeArchived ? tx`` : tx`and s.status <> 'archived'`}
      order by s.updated_at desc
      limit 500`;
    return rows.map(mapSummary);
  });
}

export async function getProjectSummary(ctx: Ctx, projectId: string): Promise<ProjectSummary | null> {
  if (!isUuid(projectId)) return null;
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`select * from (${summarySelect(tx)}) s where s.id = ${projectId}`;
    return rows[0] ? mapSummary(rows[0]) : null;
  });
}

export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
