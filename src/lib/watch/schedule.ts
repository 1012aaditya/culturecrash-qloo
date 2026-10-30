import "server-only";
import { privilegedSql } from "@/lib/db";
import { processWatchJob, type ClaimedJob } from "./collect";

/** Vercel Hobby runs cron once a day, so one run must finish every due watch; stop well before 300 s. */
const RUN_BUDGET_MS = 240_000;
/** A job whose heartbeat is older than this lost its worker (function timeout or crash). */
const STALE_MINUTES = 5;
const MAX_ATTEMPTS = 3;

/**
 * The daily Watch run, called by the authenticated cron route:
 *  1. jobs that lost their worker go back in the queue (up to three attempts), the rest are marked failed;
 *  2. every active watch that is due gets today's job — the unique (watch, run key) means concurrent cron
 *     calls can't create two;
 *  3. jobs are claimed one at a time with FOR UPDATE SKIP LOCKED, so parallel runs never take the same job,
 *     and processed until the time budget is used.
 */
export async function runWatchCron(opts: { now?: Date; budgetMs?: number } = {}) {
  const sql = privilegedSql();
  const started = Date.now();
  const deadline = started + (opts.budgetMs ?? RUN_BUDGET_MS);
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);

  const revived = await sql`update watch_jobs set status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'failed' end,
      error_message = case when attempts < ${MAX_ATTEMPTS} then error_message else 'Stopped responding three times.' end,
      finished_at = case when attempts < ${MAX_ATTEMPTS} then null else now() end
    where status = 'running' and coalesce(heartbeat_at, started_at, created_at) < now() - make_interval(mins => ${STALE_MINUTES})
    returning id`;

  // "Due" includes the next hour: Hobby cron fires anywhere inside its hour, so a watch due at 06:40 is caught at 06:05.
  const enqueued = await sql`insert into watch_jobs (watch_id, workspace_id, run_key)
    select w.id, w.workspace_id, ${`schedule:${today}`} from watches w
    where w.status = 'active' and w.next_run_at <= now() + interval '1 hour'
    on conflict (watch_id, run_key) do nothing
    returning id`;

  const results: { jobId: string; status: string; added: number }[] = [];
  while (Date.now() < deadline - 20_000) {
    const job = await claimNext();
    if (!job) break;
    try {
      const out = await processWatchJob(job, { deadline: deadline - 15_000 });
      results.push({ jobId: job.id, status: out.status, added: out.added });
    } catch (e) {
      // Unexpected errors leave the job for the stale sweep to retry; record what happened.
      console.error("[watch] job failed", job.id, e instanceof Error ? e.message : e);
      await sql`update watch_jobs set error_message = ${e instanceof Error ? e.message.slice(0, 300) : "Unexpected error"} where id = ${job.id}`;
      results.push({ jobId: job.id, status: "error", added: 0 });
    }
  }
  return { revived: revived.length, enqueued: enqueued.length, processed: results.length, results, ms: Date.now() - started };
}

/** Atomically takes the oldest queued job; concurrent callers skip rows another caller has locked. */
export async function claimNext(): Promise<ClaimedJob | null> {
  const [job] = await privilegedSql()`update watch_jobs set status = 'running', attempts = attempts + 1, started_at = now(), heartbeat_at = now()
    where id = (select id from watch_jobs where status = 'queued' and attempts < ${MAX_ATTEMPTS} order by created_at for update skip locked limit 1)
    returning id, watch_id, workspace_id`;
  return (job as ClaimedJob | undefined) ?? null;
}
