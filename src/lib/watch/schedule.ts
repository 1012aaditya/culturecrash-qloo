import "server-only";
import { privilegedSql } from "@/lib/db";
import { env } from "@/lib/env";
import { processWatchJob, type ClaimedJob } from "./collect";
import { backfillKeys } from "./plan";

/** Vercel Hobby runs cron once a day, so one run must finish every due watch; stop well before 300 s. */
const RUN_BUDGET_MS = 240_000;
/** A job whose heartbeat is older than this lost its worker (function timeout or crash). */
const STALE_MINUTES = 5;
const MAX_ATTEMPTS = 3;
/** About how many watches one worker gets through in its time budget (a watch takes ~25 s). */
const JOBS_PER_WORKER = 8;
/** Extra workers the daily run may start, each its own function invocation with its own time budget. */
const MAX_EXTRA_WORKERS = 12;

/** Starts one extra worker. The default calls the app's own authenticated worker route. */
export type Dispatch = () => Promise<unknown>;

/**
 * The daily Watch run, called by the authenticated cron route:
 *  1. jobs that lost their worker go back in the queue (up to three attempts), the rest are marked failed;
 *  2. every active watch that is due gets today's job — the unique (watch, run key) means concurrent cron
 *     calls can't create two;
 *  3. when there are more jobs than one function can finish, extra workers start alongside this one;
 *     every worker claims jobs with FOR UPDATE SKIP LOCKED, so no job is ever taken twice;
 *  4. jobs from today that failed for reasons that can pass are given one more attempt.
 */
export async function runWatchCron(opts: { now?: Date; budgetMs?: number; dispatch?: Dispatch } = {}) {
  const sql = privilegedSql();
  const started = Date.now();
  const deadline = started + (opts.budgetMs ?? RUN_BUDGET_MS);
  const runKey = `schedule:${(opts.now ?? new Date()).toISOString().slice(0, 10)}`;

  const revived = await sql`update watch_jobs set status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'failed' end,
      error_message = case when attempts < ${MAX_ATTEMPTS} then error_message else 'Stopped responding three times.' end,
      finished_at = case when attempts < ${MAX_ATTEMPTS} then null else now() end
    where status = 'running' and coalesce(heartbeat_at, started_at, created_at) < now() - make_interval(mins => ${STALE_MINUTES})
    returning id`;

  // "Due" includes the next hour: Hobby cron fires anywhere inside its hour, so a watch due at 06:40 is caught at 06:05.
  const enqueued = await sql`insert into watch_jobs (watch_id, workspace_id, run_key)
    select w.id, w.workspace_id, ${runKey} from watches w
    where w.status = 'active' and w.next_run_at <= now() + interval '1 hour'
    on conflict (watch_id, run_key) do nothing
    returning id`;

  // Watches that have never had their history filled in get it once (new watches usually already have).
  const keys = backfillKeys(env().WATCH_BACKFILL_DAYS);
  if (keys.length) {
    await sql`insert into watch_jobs (watch_id, workspace_id, run_key)
      select w.id, w.workspace_id, k from watches w, unnest(${keys}::text[]) as k where w.status = 'active'
      on conflict (watch_id, run_key) do nothing`;
  }

  const [{ queued }] = await sql`select count(*)::int as queued from watch_jobs where status = 'queued' and attempts < ${MAX_ATTEMPTS}`;
  const extra = Math.min(MAX_EXTRA_WORKERS, Math.max(0, Math.ceil(queued / JOBS_PER_WORKER) - 1));
  const dispatch = opts.dispatch ?? callWorkerRoute;
  // Started, not awaited yet: they run in parallel with this function's own work below.
  const workers = Array.from({ length: extra }, () => dispatch().catch((e) => console.error("[watch] worker failed to start", e instanceof Error ? e.message : e)));

  const results = await drain(deadline);
  await Promise.allSettled(workers);

  // A run that failed outright on its first attempt for a passing reason (timeouts, provider errors) gets
  // one more go today. collect.ts counts such a failure towards "failing in a row" only if this won't happen.
  const retried = await sql`update watch_jobs set status = 'queued', finished_at = null
    where run_key = ${runKey} and status = 'failed' and retryable and attempts = 1
    returning id`;
  if (retried.length) results.push(...(await drain(deadline)));

  return { revived: revived.length, enqueued: enqueued.length, workers: extra, retried: retried.length, processed: results.length, results, ms: Date.now() - started };
}

/** Workers that load a watch's history in parallel inside one request (each history chunk takes about 100 s). */
export async function runHistoryWorkers(count = env().WATCH_HISTORY_WORKERS) {
  await Promise.allSettled(Array.from({ length: count }, () => runWatchWorker({ budgetMs: 270_000 })));
}

/** One extra worker: claims and processes jobs until its own time budget runs out. Never starts more workers. */
export async function runWatchWorker(opts: { budgetMs?: number } = {}) {
  const started = Date.now();
  const results = await drain(started + (opts.budgetMs ?? RUN_BUDGET_MS));
  return { processed: results.length, results, ms: Date.now() - started };
}

async function drain(deadline: number) {
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
      await privilegedSql()`update watch_jobs set error_message = ${e instanceof Error ? e.message.slice(0, 300) : "Unexpected error"} where id = ${job.id}`;
      results.push({ jobId: job.id, status: "error", added: 0 });
    }
  }
  return results;
}

/** Atomically takes the oldest queued job; concurrent callers skip rows another caller has locked. */
export async function claimNext(): Promise<ClaimedJob | null> {
  const [job] = await privilegedSql()`update watch_jobs set status = 'running', attempts = attempts + 1, started_at = now(), heartbeat_at = now()
    where id = (select id from watch_jobs where status = 'queued' and attempts < ${MAX_ATTEMPTS} order by created_at for update skip locked limit 1)
    returning id, watch_id, workspace_id, attempts, run_key`;
  return (job as ClaimedJob | undefined) ?? null;
}

/** Each worker is a separate request to the cron route, so it gets its own function and time limit. */
async function callWorkerRoute() {
  const e = env();
  if (!e.CRON_SECRET) throw new Error("CRON_SECRET is not set");
  const res = await fetch(new URL("/api/cron/watch-worker", e.APP_BASE_URL), {
    headers: { authorization: `Bearer ${e.CRON_SECRET}` },
    signal: AbortSignal.timeout(290_000),
  });
  if (!res.ok) throw new Error(`worker route answered ${res.status}`);
  return res.json();
}
