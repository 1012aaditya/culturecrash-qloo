import "server-only";
import { privilegedSql, withUser, type Tx } from "@/lib/db";
import { createNotification } from "@/lib/data/notifications";
import { env } from "@/lib/env";
import { cacheGet, cacheKey, cachePut } from "@/lib/research/deep/cache";
import { contentHash, normalizeText } from "@/lib/research/deep/dedupe";
import { countryCode } from "@/lib/research/deep/planner";
import { exaSearch } from "@/lib/research/deep/providers/alt-web";
import { serperNews } from "@/lib/research/deep/providers/serper";
import type { Hit, ProviderCall } from "@/lib/research/deep/types";
import { canonicalizeUrl, hostOf } from "@/lib/research/deep/url";
import { platformHeadroomUsd } from "@/lib/research/spend";
import { FAILING_AFTER, SERPER_PAGE_SIZE, buildWatchPlan, clipExcerpt, matchTarget, nextRunAfter, type WatchTarget, type WatchTask } from "./plan";

/** attempts and run_key come from the queue: a scheduled job that fails on its first attempt is retried the same day. */
export type ClaimedJob = { id: string; watch_id: string; workspace_id: string; attempts?: number; run_key?: string };
export type JobOutcome = { status: "completed" | "partially_completed" | "failed"; found: number; added: number; error: string | null; retryable: boolean };

/** Watch results are cached a little under a day: a re-run the same day costs nothing and finds nothing new. */
const CACHE_HOURS = 20;

type Known = { byUrl: Map<string, string>; byHash: Map<string, string>; byTitle: Map<string, string> };
type Watch = Record<string, unknown> & { id: string; client_id: string; client_name: string; frequency: "daily" | "weekly" };

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
    known: await tx`select id, canonical_url, content_hash, title from research_documents where watch_id = ${job.watch_id} and retrieved_at > now() - interval '30 days'`,
  }));
  if (!setup.targets.length) return finish(userId, job, watch, { status: "failed", found: 0, added: 0, error: "No company is set on this watch.", retryable: false });

  const known: Known = {
    byUrl: new Map(setup.known.filter((k) => k.canonical_url).map((k) => [k.canonical_url as string, k.id as string])),
    byHash: new Map(setup.known.filter((k) => k.content_hash).map((k) => [k.content_hash as string, k.id as string])),
    byTitle: new Map(setup.known.map((k) => [normalizeText(k.title as string), k.id as string])),
  };
  const tasks = buildWatchPlan(setup.targets, { keywords: watch.keywords as string[], lastSuccessAt: watch.last_success_at ? new Date(watch.last_success_at as string) : null });
  const country = countryCode(watch.market as string | null);
  const ctx = { job, ws, userId, country, targets: setup.targets, known };

  let found = 0, added = 0;
  let stop: string | null = null;
  const full = new Set<string>();
  // The latest outcome of every search that ran; a retry overwrites its first attempt.
  const results = new Map<string, { ok: boolean; config: boolean; provider: string }>();

  const attempt = async (task: WatchTask) => {
    const r = await runTask(ctx, task);
    if (r.budgetStop) { stop = r.budgetStop; return false; }
    found += r.found;
    added += r.added;
    if (r.full) full.add(task.key);
    results.set(task.key, { ok: r.ok, config: r.config, provider: task.provider });
    return true;
  };

  for (const task of tasks) {
    if (task.afterFull && !full.has(task.afterFull)) continue; // page 1 wasn't full: no page 2
    if (Date.now() > deadline) { stop = "Stopped at the time limit; the rest runs next time."; break; }
    if (!(await attempt(task))) break;
  }
  // One more try for searches that failed for reasons that can pass (timeouts, rate limits, 5xx).
  const retry = tasks.filter((t) => { const r = results.get(t.key); return r && !r.ok && !r.config; });
  for (const task of stop ? [] : retry) {
    if (Date.now() > deadline || !(await attempt(task))) break;
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

type TaskResult = { ok: boolean; config: boolean; found: number; added: number; full: boolean; budgetStop?: string };

async function runTask(ctx: { job: ClaimedJob; ws: string; userId: string; country: string | null; targets: WatchTarget[]; known: Known }, task: WatchTask): Promise<TaskResult> {
  const { job, ws, userId, country, targets, known } = ctx;
  const e = env();
  const price = task.provider === "serper" ? e.SERPER_USD_PER_REQUEST : e.EXA_USD_PER_REQUEST;
  const cached = await withUser(userId, async (tx) => {
    await tx`update watch_jobs set heartbeat_at = now() where id = ${job.id}`;
    return cacheGet<Hit[]>(tx, ws, task.provider, cacheKeyFor(task, country));
  });
  if (!cached) {
    const budgetStop = await withUser(userId, (tx) => overBudget(tx, ws, price));
    if (budgetStop) return { ok: false, config: false, found: 0, added: 0, full: false, budgetStop };
  }
  const call = cached ? fromCache(cached, task, country) : await search(task, country);
  const searched = targets.find((t) => t.id === task.targetId)!;
  const n = await withUser(userId, async (tx) => {
    await ledger(tx, job.id, ws, task, call);
    if (!call.ok) return { found: 0, added: 0 };
    if (!cached) await cachePut(tx, ws, task.provider, cacheKeyFor(task, country), call.data, CACHE_HOURS);
    let f = 0, a = 0;
    for (const [i, hit] of call.data.entries()) {
      const target = matchTarget(hit, searched, targets);
      const url = canonicalizeUrl(hit.url);
      if (!target || !url) continue;
      f++;
      const hash = contentHash(`${hit.title}\n${hit.snippet}`);
      let docId = known.byUrl.get(url) ?? known.byHash.get(hash) ?? null;
      if (!docId) {
        // The same story on another site (same headline) is kept but linked, so it shows once with "also reported by".
        const title = normalizeText(hit.title);
        const duplicateOf = title.length > 24 ? known.byTitle.get(title) ?? null : null;
        const [row] = await tx`
          insert into research_documents (workspace_id, watch_id, watch_target_id, watch_job_id, provider, source_type, canonical_url, external_id, title, publisher,
            published_at, published_precision, retrieved_at, excerpt, content_hash, extraction_status, duplicate_of, discovery_query, usage_restrictions, is_demo)
          values (${ws}, ${job.watch_id}, ${target.id}, ${job.id}, ${hit.provider}, 'news', ${url}, ${hit.externalId}, ${hit.title.slice(0, 500)},
            ${hit.publisher ?? hostOf(url)}, ${hit.publishedAt}, ${hit.publishedAt ? hit.publishedPrecision ?? "exact" : null}, now(),
            ${clipExcerpt(hit.snippet)}, ${hash}, 'snippet', ${duplicateOf}, ${task.query}, ${hit.usageRestrictions}, false)
          on conflict (watch_id, canonical_url) where watch_id is not null and canonical_url is not null do nothing
          returning id`;
        // A concurrent insert of the same URL loses the race quietly; look the winner up so the sighting still counts.
        docId = (row?.id as string | undefined) ?? ((await tx`select id from research_documents where watch_id = ${job.watch_id} and canonical_url = ${url}`)[0]?.id as string | undefined) ?? null;
        if (row) {
          a++;
          if (!duplicateOf && title.length > 24) known.byTitle.set(title, row.id as string);
        }
      }
      if (!docId) continue;
      known.byUrl.set(url, docId);
      known.byHash.set(hash, docId);
      await tx`insert into watch_observations (workspace_id, watch_id, watch_job_id, watch_target_id, document_id, provider, task_key, rank)
        values (${ws}, ${job.watch_id}, ${job.id}, ${target.id}, ${docId}, ${task.provider}, ${task.key}, ${i + 1})
        on conflict (watch_job_id, document_id, task_key) do nothing`;
    }
    return { found: f, added: a };
  });
  return { ok: call.ok, config: call.errorKind === "config", ...n, full: call.ok && call.data.length >= SERPER_PAGE_SIZE };
}

const paramsFor = (task: WatchTask, country: string | null) => task.provider === "serper"
  ? { q: task.query, window: task.window, country, count: SERPER_PAGE_SIZE, ...(task.page > 1 ? { page: task.page } : {}) }
  : { q: task.query, since: task.since.slice(0, 10), category: "news", count: 8 };
const cacheKeyFor = (task: WatchTask, country: string | null) => cacheKey(`watch:${task.provider}`, task.query, paramsFor(task, country));

function fromCache(data: Hit[], task: WatchTask, country: string | null): ProviderCall<Hit[]> {
  const params = Object.fromEntries(Object.entries(paramsFor(task, country)).map(([k, v]) => [k, String(v)]));
  return { ok: true, data, status: data.length ? "ok" : "empty", httpStatus: null, durationMs: 0, error: null, errorKind: null, units: 0, costUsdEstimated: 0, costUsdActual: null, params, raw: null, cached: true };
}

async function search(task: WatchTask, country: string | null): Promise<ProviderCall<Hit[]>> {
  const e = env();
  if (task.provider === "serper") {
    return e.SERPER_API_KEY
      ? serperNews({ query: task.query, window: task.window, page: task.page, count: SERPER_PAGE_SIZE, country, apiKey: e.SERPER_API_KEY, usdPerCall: e.SERPER_USD_PER_REQUEST })
      : notConfigured("SERPER_API_KEY");
  }
  return e.EXA_API_KEY ? exaSearch({ query: task.query, count: 8, apiKey: e.EXA_API_KEY, usdPerCall: e.EXA_USD_PER_REQUEST, startPublishedDate: task.since, category: "news" }) : notConfigured("EXA_API_KEY");
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
  if (Number(w.spent) + price > Number(w.cap)) return "Stopped: this workspace's monthly research budget is used up.";
  const platform = await platformHeadroomUsd();
  if (platform !== null && platform < price) return "Stopped: this server's monthly spending limit is reached.";
  return null;
}

async function loadWatch(watchId: string): Promise<Watch | null> {
  const [w] = await privilegedSql()`select w.*, c.name as client_name,
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
