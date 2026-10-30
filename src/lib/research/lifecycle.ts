import "server-only";
import type { Sql, Tx } from "@/lib/db";

/**
 * Research runs execute inside a Vercel function (maxDuration 300 s). Nothing runs after the platform
 * kills that function, so a run must either finish itself before the deadline or be closed by whoever
 * looks at it next. These helpers do the closing; every caller guards on status, so a run is only ever
 * closed once and a late worker can't overwrite the result.
 */
export const RUN_MAX_DURATION_S = 300;
/** The worker stops starting new work and writes its result this long after it starts. */
export const RUN_DEADLINE_MS = (RUN_MAX_DURATION_S - 45) * 1000;

export type CloseReason = "time_limit" | "stale" | "cancelled";

const MESSAGE: Record<CloseReason, string> = {
  time_limit: "The research job reached its time limit. Sources and claims collected before then are kept.",
  stale: "The research worker stopped responding. Sources and claims collected before then are kept.",
  cancelled: "Research was cancelled before it started.",
};

/** Closes one queued/running run, keeping whatever it collected. Returns false if it was already finished. */
export async function closeRun(tx: Tx | Sql, runId: string, reason: CloseReason): Promise<boolean> {
  const rows = await tx`
    update research_runs set
      status = case when ${reason}::text = 'cancelled' then 'cancelled'::run_status
        when exists (select 1 from research_documents d where d.run_id = research_runs.id)
          or exists (select 1 from cultural_entities e where e.run_id = research_runs.id and e.role <> 'seed') then 'partially_completed'::run_status
        else 'failed'::run_status end,
      stage = 'done', stop_reason = ${reason}, completed_at = now(),
      error_code = case when ${reason}::text = 'cancelled' then null else 'partial' end, error_message = ${MESSAGE[reason]}
    where id = ${runId} and status in ('queued', 'running')
    returning status`;
  if (!rows.length) return false;
  await tx`update background_tasks set status = ${rows[0].status === "failed" ? "failed" : "completed"}, finished_at = now(),
    error_message = ${rows[0].status === "failed" ? MESSAGE[reason] : null}
    where ref_id = ${runId} and kind = 'research_run' and status in ('queued', 'running')`;
  return true;
}

/**
 * Closes runs whose worker is gone: queued for 2+ minutes without starting (the background job never ran),
 * no heartbeat for 3 minutes, or running longer than the function limit allows. Scoped to one project
 * when given (as the signed-in user, under RLS), otherwise every project (privileged cron).
 */
export async function sweepStaleRuns(tx: Tx | Sql, projectId?: string): Promise<number> {
  const stale = await tx`
    select id from research_runs
    where ${projectId ? tx`project_id = ${projectId} and` : tx``} (
      (status = 'queued' and created_at < now() - interval '2 minutes')
      or (status = 'running' and (coalesce(started_by_heartbeat, started_at, created_at) < now() - interval '3 minutes'
        or coalesce(started_at, created_at) < now() - make_interval(secs => ${RUN_MAX_DURATION_S + 60})))
    )`;
  let closed = 0;
  for (const r of stale) if (await closeRun(tx, r.id as string, "stale")) closed++;
  return closed;
}

/** Strategy, creative-brief and similar tasks left "running" by a function that was killed mid-generation. */
export async function sweepStaleTasks(tx: Tx | Sql, projectId?: string): Promise<number> {
  const rows = await tx`
    update background_tasks set status = 'failed', finished_at = now(),
      error_message = 'Generation stopped before it finished (the request timed out). Nothing was saved; try again.'
    where ${projectId ? tx`project_id = ${projectId} and` : tx``} kind <> 'research_run' and status in ('queued', 'running')
      and coalesce(started_at, created_at) < now() - make_interval(secs => ${RUN_MAX_DURATION_S + 60})
    returning id`;
  return rows.length;
}
