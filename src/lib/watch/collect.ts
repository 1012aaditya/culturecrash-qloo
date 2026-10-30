import "server-only";
import { privilegedSql, withUser, type Tx } from "@/lib/db";
import { createNotification } from "@/lib/data/notifications";
import { env } from "@/lib/env";
import { cacheGet, cacheKey, cachePut } from "@/lib/research/deep/cache";
import { countryCode } from "@/lib/research/deep/planner";
import { exaSearch } from "@/lib/research/deep/providers/alt-web";
import { serperNews } from "@/lib/research/deep/providers/serper";
import { youtubeSearch, youtubeVideoStats } from "@/lib/research/deep/providers/youtube";
import type { Hit, ProviderCall } from "@/lib/research/deep/types";
import { canonicalizeUrl } from "@/lib/research/deep/url";
import { platformHeadroomUsd } from "@/lib/research/spend";
import { classifyWatch } from "./classify";
import { FAILING_AFTER, SERPER_PAGE_SIZE, backfillRange, buildBackfillPlan, buildWatchPlan, matchTarget, nextRunAfter, type WatchTarget, type WatchTask } from "./plan";
import { lockWatch, refineWatch } from "./refine";
import { checkSites } from "./sites";
import { loadKnown, storeItem, type Known } from "./store";

/** attempts and run_key come from the queue: a scheduled job that fails on its first attempt is retried the same day. */
export type ClaimedJob = { id: string; watch_id: string; workspace_id: string; attempts?: number; run_key?: string };
export type JobOutcome = { status: "completed" | "partially_completed" | "failed"; found: number; added: number; error: string | null; retryable: boolean };

/** Searches running at once within one job (each spends most of its time waiting on the provider). */
const SEARCH_CONCURRENCY = 4;
const TIME_LIMIT = "Stopped at the time limit; the rest runs next time.";

/** Resolves to the promise's value, or null if it hasn't settled within `ms` (the promise is then abandoned). */
async function withWatchdog<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => { onTimeout(); resolve(null); }, ms); });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `fn` over `items`, at most `limit` at a time. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/** Watch results are cached a little under a day: a re-run the same day costs nothing and finds nothing new. */
const CACHE_HOURS = 20;

type Watch = Record<string, unknown> & { id: string; client_id: string; client_name: string; client_industry: string | null; frequency: "daily" | "weekly" };

/**
 * Runs one claimed Watch job as the person the watch belongs to, so Row Level Security, the workspace
 * research budget and the platform spend cap apply exactly as they do for research. Each search is its
 * own short transaction (never held open across a network call), and one provider failing never stops
 * the others; searches that failed get one more try at the end. Stories go into research_documents (one
 * row per story per watch), every sighting into watch_observations, every call into research_sources.
 */
export async function processWatchJob(job: ClaimedJob, opts: { deadline?: number } = {}): Promise<JobOutcome> {
  const deadline = opts.deadline ?? Date.now() + 240_000;
  const watch = await loadWatch(job.watch_id);
  if (!watch) return finishPrivileged(job, undefined, { status: "failed", found: 0, added: 0, error: "This watch no longer exists.", retryable: false });
  const userId = await runAs(watch);
  if (!userId) {
    return finishPrivileged(job, watch, { status: "failed", found: 0, added: 0, error: "Nobody in this workspace can run this watch. Re-save it to take it over.", retryable: false });
  }
  const ws = job.workspace_id;

  const setup = await withUser(userId, async (tx) => ({
    targets: (await tx`select id, role, name, aliases from watch_targets where watch_id = ${job.watch_id} order by role, created_at`) as unknown as WatchTarget[],
    // What the watch already holds, for duplicate checks across runs (exact URLs are also blocked by a unique index).
    known: await loadKnown(tx, job.watch_id),
  }));
  if (!setup.targets.length) return finish(userId, job, watch, { status: "failed", found: 0, added: 0, error: "No company is set on this watch.", retryable: false });

  const known = setup.known;
  // A backfill job fills in the last 30 days by publication week; every other job is the usual check.
  const backfill = isBackfill(job);
  const range = backfill ? backfillRange(job.run_key!) : null;
  const tasks = backfill ? buildBackfillPlan(setup.targets, { from: range?.from ?? 0, to: range?.to ?? 0, keywords: watch.keywords as string[] }) : buildWatchPlan(setup.targets, {
    keywords: watch.keywords as string[], lastSuccessAt: watch.last_success_at ? new Date(watch.last_success_at as string) : null, youtube: Boolean(env().YOUTUBE_API_KEY),
  });
  const country = countryCode(watch.market as string | null);
  const ctx = { job, ws, userId, country, targets: setup.targets, known };

  let found = 0, added = 0;
  let stop: string | null = null;
  const full = new Set<string>();
  // The latest outcome of every search that ran; a retry overwrites its first attempt.
  const results = new Map<string, { ok: boolean; config: boolean; provider: string }>();

  const attempt = async (task: WatchTask) => {
    const step = { name: "" };
    const r = await withWatchdog(runTask(ctx, task, step), env().WATCH_TASK_TIMEOUT_MS, () => {
      // Seen live: a search never settled and held a whole history chunk until the function timed out.
      console.error(`[watch] task ${task.key} of job ${job.id} gave up after ${env().WATCH_TASK_TIMEOUT_MS} ms, stuck at: ${step.name}`);
    });
    if (!r) {
      results.set(task.key, { ok: false, config: false, provider: task.provider });
      return true;
    }
    if (r.budgetStop) { stop = r.budgetStop; return false; }
    if (r.skipped) return true;
    found += r.found;
    added += r.added;
    if (r.full) full.add(task.key);
    results.set(task.key, { ok: r.ok, config: r.config, provider: task.provider });
    return true;
  };

  // Searches wait on the network, so a few run at once. First pages first: a second page only runs when its
  // first page came back full.
  const run = (list: WatchTask[]) => pool(list, SEARCH_CONCURRENCY, async (task) => {
    if (stop) return;
    if (task.afterFull && !full.has(task.afterFull)) return; // page 1 wasn't full: no page 2
    if (Date.now() > deadline) { stop = TIME_LIMIT; return; }
    await attempt(task);
  });
  await run(tasks.filter((t) => !t.afterFull));
  await run(tasks.filter((t) => t.afterFull));
  // One more try for searches that failed for reasons that can pass (timeouts, rate limits, 5xx).
  if (!stop) await run(tasks.filter((t) => { const r = results.get(t.key); return r && !r.ok && !r.config; }));

  // Websites and feeds, then fresh view counts for recent videos. Neither changes whether the searches succeeded.
  if (!backfill && !stop && Date.now() < deadline) {
    const sites = await checkSites({ ws, watchId: job.watch_id, jobId: job.id, known, userId, deadline });
    found += sites.found;
    added += sites.added;
  }
  if (!backfill && !stop && Date.now() < deadline) await refreshVideoStats(ctx);
  // Rules first (listings, name clashes), then Claude labels relevance, topic and importance, then events are
  // regrouped without anything Claude hid.
  const refine = () => refineWatch({ userId, watchId: job.watch_id, context: [watch.client_industry ?? "", ...(watch.keywords as string[])] });
  await refine();
  if (!stop && Date.now() < deadline) {
    const c = await classifyWatch({ userId, ws, watchId: job.watch_id, jobId: job.id, industry: watch.client_industry, deadline });
    if (c.hidden) await refine();
  }

  const ran = results.size;
  const failures = [...results.values()].filter((r) => !r.ok);
  const unconfigured = [...new Set(failures.filter((r) => r.config).map((r) => r.provider))];
  const transient = failures.filter((r) => !r.config).length;
  const budget = Boolean(stop && /budget|spending limit/i.test(stop));
  const status: JobOutcome["status"] = ran === 0 || failures.length === ran ? "failed" : failures.length > 0 || stop ? "partially_completed" : "completed";
  const error = [
    stop,
    unconfigured.length ? `${unconfigured.map((p) => (p === "serper" ? "Serper" : "Exa")).join(" and ")} isn't set up on this server.` : null,
    transient ? `${transient} of ${ran} searches failed, even after a retry; see source health.` : null,
  ].filter(Boolean).join(" ") || null;
  // Retrying later in the day can't fix a used-up budget or a missing key.
  const retryable = !budget && transient > 0;
  return finish(userId, job, watch, { status, found, added, error, retryable });
}

type TaskResult = { ok: boolean; config: boolean; found: number; added: number; full: boolean; budgetStop?: string; skipped?: boolean };

async function runTask(ctx: { job: ClaimedJob; ws: string; userId: string; country: string | null; targets: WatchTarget[]; known: Known }, task: WatchTask, step: { name: string } = { name: "" }): Promise<TaskResult> {
  const { job, ws, userId, country, targets, known } = ctx;
  const e = env();
  step.name = "cache";
  const price = task.provider === "serper" ? e.SERPER_USD_PER_REQUEST : task.provider === "exa" ? e.EXA_USD_PER_REQUEST : 0;
  const cached = await withUser(userId, async (tx) => {
    await tx`update watch_jobs set heartbeat_at = now() where id = ${job.id}`;
    return cacheGet<Hit[]>(tx, ws, task.provider, cacheKeyFor(task, country));
  });
  if (!cached) {
    step.name = "budget";
    const budgetStop = (await withUser(userId, (tx) => overBudget(tx, ws, price))) ?? (await overPlatformCap(price));
    if (budgetStop) return { ok: false, config: false, found: 0, added: 0, full: false, budgetStop };
    // YouTube is free but rationed: skip it (without failing anything) once today's quota share is used.
    if (task.provider === "youtube" && !(await youtubeQuotaLeft(101))) return { ok: true, config: false, found: 0, added: 0, full: false, skipped: true };
  }
  step.name = "search";
  const call = cached ? fromCache(cached, task, country) : await search(task, country);
  step.name = "save";
  const searched = targets.find((t) => t.id === task.targetId)!;
  const n = await withUser(userId, async (tx) => {
    // Searches run in parallel, but saving is one at a time per watch: two saves inserting overlapping
    // stories in different orders would otherwise deadlock on the unique story index.
    await lockWatch(tx, job.watch_id);
    await ledger(tx, job.id, ws, task, call);
    if (!call.ok) return { found: 0, added: 0 };
    if (!cached) await cachePut(tx, ws, task.provider, cacheKeyFor(task, country), call.data, CACHE_HOURS);
    let f = 0, a = 0;
    for (const [i, hit] of call.data.entries()) {
      const target = matchTarget(hit, searched, targets);
      const url = canonicalizeUrl(hit.url);
      if (!target || !url) continue;
      f++;
      const res = await storeItem(tx, { ws, watchId: job.watch_id, jobId: job.id, known }, { ...hit, url, query: task.query }, target.id, task.key, i + 1);
      if (res.added) a++;
      // A new video's public counts are its first engagement reading.
      if (res.added && res.docId && hit.provider === "youtube" && Object.keys(hit.metrics).length) await videoStatsRow(tx, ws, job, res.docId, hit.metrics);
    }
    return { found: f, added: a };
  });
  return { ok: call.ok, config: call.errorKind === "config", ...n, full: call.ok && task.provider === "serper" && call.data.length >= SERPER_PAGE_SIZE };
}

const isBackfill = (job: ClaimedJob) => Boolean(job.run_key?.startsWith("backfill:"));

const paramsFor = (task: WatchTask, country: string | null) => task.provider === "serper"
  ? task.until
    ? { q: task.query, day: task.since.slice(0, 10), country, count: SERPER_PAGE_SIZE, ...(task.page > 1 ? { page: task.page } : {}) }
    : { q: task.query, window: task.window, country, count: SERPER_PAGE_SIZE, ...(task.page > 1 ? { page: task.page } : {}) }
  : task.provider === "youtube" ? { q: task.query, since: task.since.slice(0, 10), country, count: 10 }
  : { q: task.query, since: task.since.slice(0, 10), ...(task.until ? { until: task.until.slice(0, 10) } : {}), category: "news", count: 8 };
const cacheKeyFor = (task: WatchTask, country: string | null) => cacheKey(`watch:${task.provider}`, task.query, paramsFor(task, country));

function fromCache(data: Hit[], task: WatchTask, country: string | null): ProviderCall<Hit[]> {
  const params = Object.fromEntries(Object.entries(paramsFor(task, country)).map(([k, v]) => [k, String(v)]));
  return { ok: true, data, status: data.length ? "ok" : "empty", httpStatus: null, durationMs: 0, error: null, errorKind: null, units: 0, costUsdEstimated: 0, costUsdActual: null, params, raw: null, cached: true };
}

async function search(task: WatchTask, country: string | null): Promise<ProviderCall<Hit[]>> {
  const e = env();
  if (task.provider === "serper") {
    return e.SERPER_API_KEY
      ? serperNews({
        query: task.query, window: task.window, page: task.page, count: SERPER_PAGE_SIZE, country, apiKey: e.SERPER_API_KEY, usdPerCall: e.SERPER_USD_PER_REQUEST,
        ...(task.until ? { range: { from: new Date(task.since), to: new Date(task.until) } } : {}),
      })
      : notConfigured("SERPER_API_KEY");
  }
  if (task.provider === "youtube") {
    return e.YOUTUBE_API_KEY ? youtubeSearch({ query: task.query, count: 10, regionCode: country, publishedAfter: task.since, apiKey: e.YOUTUBE_API_KEY }) : notConfigured("YOUTUBE_API_KEY");
  }
  return e.EXA_API_KEY
    ? exaSearch({ query: task.query, count: 8, apiKey: e.EXA_API_KEY, usdPerCall: e.EXA_USD_PER_REQUEST, startPublishedDate: task.since, endPublishedDate: task.until, category: "news" })
    : notConfigured("EXA_API_KEY");
}

const notConfigured = (k: string): ProviderCall<Hit[]> => ({ ok: false, data: [], status: "error", httpStatus: null, durationMs: 0, error: `${k} is not set on this server`, errorKind: "config", units: 0, costUsdEstimated: 0, costUsdActual: null, params: {}, raw: null, cached: false });

/** Every call, cached or failed, goes into the cost ledger research uses — that is what the spend caps add up. */
async function ledger(tx: Tx, jobId: string, ws: string, task: WatchTask, call: ProviderCall<Hit[]>) {
  await tx`insert into research_sources (watch_job_id, workspace_id, provider, endpoint, params, status, http_status, result_count, duration_ms, error_message,
      raw_response, units, cost_usd_estimated, cost_usd_actual, cached, question_key)
    values (${jobId}, ${ws}, ${task.provider}, ${task.provider === "serper" ? "news" : "search"}, ${tx.json(call.params as never)}, ${call.status}, ${call.httpStatus},
      ${call.data.length}, ${call.durationMs}, ${call.error}, null, ${call.units}, ${call.costUsdEstimated}, ${call.costUsdActual}, ${call.cached}, ${task.key})`;
}

/** The workspace's monthly research budget and the platform-wide ceiling both apply to Watch. */
async function overBudget(tx: Tx, ws: string, price: number): Promise<string | null> {
  const [w] = await tx`select research_budget_usd_monthly as cap, public.research_spend_this_month(${ws}) as spent from workspaces where id = ${ws}`;
  return Number(w.spent) + price > Number(w.cap) ? "Stopped: this workspace's monthly research budget is used up." : null;
}

/**
 * Checked outside any transaction: it needs its own connection, and asking for one while holding a
 * transaction let parallel searches exhaust the pool and wait on each other forever (seen live).
 */
async function overPlatformCap(price: number): Promise<string | null> {
  const platform = await platformHeadroomUsd();
  return platform !== null && platform < price ? "Stopped: this server's monthly spending limit is reached." : null;
}

/** Units used today on the server's YouTube key, across all workspaces (the quota resets at midnight Pacific time). */
async function youtubeQuotaLeft(units: number): Promise<boolean> {
  const [{ used }] = await privilegedSql()`select coalesce(sum(units), 0)::int as used from research_sources
    where provider = 'youtube' and retrieved_at >= (date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')`;
  return used + units <= env().YOUTUBE_DAILY_UNIT_CAP;
}

async function videoStatsRow(tx: Tx, ws: string, job: ClaimedJob, docId: string, m: Record<string, number>) {
  await tx`insert into watch_video_stats (workspace_id, watch_id, document_id, watch_job_id, views, likes, comments)
    values (${ws}, ${job.watch_id}, ${docId}, ${job.id}, ${m.views ?? null}, ${m.likes ?? null}, ${m.comments ?? null})`;
}

/**
 * Engagement history: one videos.list call (1 quota unit per 50 videos) refreshes the public counts of
 * the watch's videos from the last 30 days. Older videos are left alone, and the retention job clears
 * their YouTube data, as YouTube's terms require.
 */
async function refreshVideoStats(ctx: { job: ClaimedJob; ws: string; userId: string }) {
  const key = env().YOUTUBE_API_KEY;
  if (!key) return;
  const { job, ws, userId } = ctx;
  const videos = await withUser(userId, (tx) => tx`select id, external_id from research_documents
    where watch_id = ${job.watch_id} and provider = 'youtube' and external_id is not null and retrieved_at > now() - interval '30 days'
      and watch_job_id is distinct from ${job.id}
    order by retrieved_at desc limit 50`);
  if (!videos.length || !(await youtubeQuotaLeft(1))) return;
  const call = await youtubeVideoStats({ ids: videos.map((v) => v.external_id as string), apiKey: key });
  await withUser(userId, async (tx) => {
    await tx`insert into research_sources (watch_job_id, workspace_id, provider, endpoint, params, status, http_status, result_count, duration_ms, error_message,
        raw_response, units, cost_usd_estimated, cost_usd_actual, cached, question_key)
      values (${job.id}, ${ws}, 'youtube', 'videos', ${tx.json({ part: "statistics", count: String(videos.length) })}, ${call.status}, ${call.httpStatus},
        ${Object.keys(call.data).length}, ${call.durationMs}, ${call.error}, null, ${call.units}, 0, null, false, ${`${job.watch_id}:youtube:stats`})`;
    if (!call.ok) return;
    for (const v of videos) {
      const m = call.data[v.external_id as string];
      if (!m) continue;
      await videoStatsRow(tx, ws, job, v.id as string, m);
      await tx`update research_documents set metrics = ${tx.json(m as never)} where id = ${v.id}`;
    }
  });
}

async function loadWatch(watchId: string): Promise<Watch | null> {
  const [w] = await privilegedSql()`select w.*, c.name as client_name, c.industry as client_industry,
      (select m.role from workspace_members m where m.workspace_id = w.workspace_id and m.user_id = w.created_by) as creator_role
    from watches w join clients c on c.id = w.client_id where w.id = ${watchId}`;
  return (w as Watch | undefined) ?? null;
}

/**
 * Who the watch runs as: the person who set it up while they can still edit in the workspace. If they've
 * left (or become a viewer), the longest-standing owner takes it over and is told, so it never stops silently.
 */
async function runAs(watch: Watch): Promise<string | null> {
  if (watch.created_by && ["owner", "admin", "member"].includes(watch.creator_role as string)) return watch.created_by as string;
  const sql = privilegedSql();
  const [owner] = await sql`select user_id from workspace_members where workspace_id = ${watch.workspace_id as string} and role = 'owner' order by created_at limit 1`;
  if (!owner) return null;
  const [taken] = await sql`update watches set created_by = ${owner.user_id}, updated_at = now()
    where id = ${watch.id} and created_by is not distinct from ${(watch.created_by as string | null) ?? null} returning id`;
  if (taken) {
    await withUser(owner.user_id as string, (tx) => createNotification(tx, {
      workspaceId: watch.workspace_id as string, userId: owner.user_id as string, actorId: null, kind: "watch_assigned",
      title: `You now run the watch on ${watch.client_name}`,
      body: "The person who set it up can no longer run it, so it now runs as you and counts against this workspace's research budget.",
      href: `/workspace/clients/${watch.client_id}/watch`,
    }));
  }
  return owner.user_id as string;
}

/** A failure counts towards "failing in a row" only once nothing will retry it today. */
const willRetry = (job: ClaimedJob, out: JobOutcome) =>
  out.retryable && Boolean(job.run_key?.startsWith("schedule:")) && job.attempts === 1;

async function finish(userId: string, job: ClaimedJob, watch: Watch, out: JobOutcome): Promise<JobOutcome> {
  const counted = out.status === "failed" && !willRetry(job, out);
  await withUser(userId, async (tx) => {
    await tx`update watch_jobs set status = ${out.status}, finished_at = now(), found = ${out.found}, added = ${out.added}, error_message = ${out.error}, retryable = ${out.retryable}
      where id = ${job.id}`;
    if (isBackfill(job)) {
      // A history chunk that ran out of time goes back in the queue and carries on; searches it already
      // made come from the cache, so the next worker picks up where this one stopped.
      if (out.error?.startsWith(TIME_LIMIT)) {
        await tx`update watch_jobs set status = 'queued', attempts = 0, finished_at = null, started_at = null where id = ${job.id}`;
      }
      return; // filling in history doesn't move the daily schedule or count as a check
    }
    const [w] = await tx`update watches set last_attempted_at = now(), next_run_at = ${nextRunAfter(watch.frequency, new Date())},
        last_success_at = case when ${out.status}::text <> 'failed' then now() else last_success_at end,
        consecutive_failures = case when ${counted}::boolean then consecutive_failures + 1 when ${out.status}::text = 'failed' then consecutive_failures else 0 end,
        updated_at = now()
      where id = ${job.watch_id} returning consecutive_failures`;
    // Told once, on the run that makes it three in a row — not every day after.
    if (counted && w?.consecutive_failures === FAILING_AFTER) {
      await createNotification(tx, {
        workspaceId: job.workspace_id, userId, actorId: null, kind: "watch_failing",
        title: `The watch on ${watch.client_name} has failed ${FAILING_AFTER} times in a row`,
        body: out.error ?? "Open the watch to see which sources are failing.",
        href: `/workspace/clients/${watch.client_id}/watch`,
      });
    }
  });
  return out;
}

/** Records why a watch couldn't run at all (no one to run it as). */
async function finishPrivileged(job: ClaimedJob, watch: Watch | undefined, out: JobOutcome): Promise<JobOutcome> {
  const sql = privilegedSql();
  await sql`update watch_jobs set status = ${out.status}, finished_at = now(), error_message = ${out.error}, retryable = ${out.retryable} where id = ${job.id}`;
  if (watch) {
    await sql`update watches set last_attempted_at = now(), next_run_at = ${nextRunAfter(watch.frequency, new Date())},
      consecutive_failures = consecutive_failures + 1 where id = ${job.watch_id}`;
  }
  return out;
}
