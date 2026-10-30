import "server-only";
import { privilegedSql, withUser, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { cacheGet, cacheKey, cachePut } from "@/lib/research/deep/cache";
import { contentHash, normalizeText } from "@/lib/research/deep/dedupe";
import { countryCode } from "@/lib/research/deep/planner";
import { exaSearch } from "@/lib/research/deep/providers/alt-web";
import { serperNews } from "@/lib/research/deep/providers/serper";
import type { Hit, ProviderCall } from "@/lib/research/deep/types";
import { canonicalizeUrl, hostOf } from "@/lib/research/deep/url";
import { platformHeadroomUsd } from "@/lib/research/spend";
import { buildWatchPlan, clipExcerpt, matchTarget, nextRunAfter, type WatchTarget, type WatchTask } from "./plan";

export type ClaimedJob = { id: string; watch_id: string; workspace_id: string };
export type JobOutcome = { status: "completed" | "partially_completed" | "failed"; found: number; added: number; error: string | null };

/** Watch results are cached a little under a day: a re-run the same day costs nothing and finds nothing new. */
const CACHE_HOURS = 20;

/**
 * Runs one claimed Watch job as the person who set the watch up, so Row Level Security, the workspace
 * research budget and the platform spend cap apply exactly as they do for research. Each search is its
 * own short transaction (never held open across a network call), and one provider failing never stops
 * the others. Results go into research_documents — one row per story per watch — and every call into the
 * research_sources cost ledger.
 */
export async function processWatchJob(job: ClaimedJob, opts: { deadline?: number } = {}): Promise<JobOutcome> {
  const deadline = opts.deadline ?? Date.now() + 240_000;
  const e = env();
  const [watch] = await privilegedSql()`select w.*, (select m.role from workspace_members m where m.workspace_id = w.workspace_id and m.user_id = w.created_by) as creator_role
    from watches w where w.id = ${job.watch_id}`;
  // The watch runs with its creator's permissions; if they've left the workspace or can only view, it stops.
  if (!watch?.created_by || !["owner", "admin", "member"].includes(watch.creator_role)) {
    return finishPrivileged(job, watch, { status: "failed", found: 0, added: 0, error: "The person who set up this watch can no longer run it. Re-save the watch to take it over." });
  }
  const userId = watch.created_by as string;
  const ws = job.workspace_id;

  const setup = await withUser(userId, async (tx) => ({
    targets: (await tx`select id, role, name, aliases from watch_targets where watch_id = ${job.watch_id} order by role, created_at`) as unknown as WatchTarget[],
    // What the watch already holds, for duplicate checks across runs (exact URLs are also blocked by a unique index).
    known: await tx`select id, canonical_url, content_hash, title from research_documents where watch_id = ${job.watch_id} and retrieved_at > now() - interval '30 days'`,
  }));
  if (!setup.targets.length) return finish(userId, job, watch, { status: "failed", found: 0, added: 0, error: "No company is set on this watch." });

  const tasks = buildWatchPlan(setup.targets, { keywords: watch.keywords as string[], lastSuccessAt: watch.last_success_at ? new Date(watch.last_success_at) : null });
  const country = countryCode(watch.market as string | null);
  const byUrl = new Set(setup.known.map((k) => k.canonical_url as string).filter(Boolean));
  const byHash = new Set(setup.known.map((k) => k.content_hash as string).filter(Boolean));
  const byTitle = new Map(setup.known.map((k) => [normalizeText(k.title as string), k.id as string]));

  let found = 0, added = 0, failed = 0, ran = 0;
  let stop: string | null = null;
  for (const task of tasks) {
    if (Date.now() > deadline) { stop = "Stopped at the time limit; the rest runs next time."; break; }
    const price = task.provider === "serper" ? e.SERPER_USD_PER_REQUEST : e.EXA_USD_PER_REQUEST;
    const cached = await withUser(userId, async (tx) => {
      await tx`update watch_jobs set heartbeat_at = now() where id = ${job.id}`;
      return cacheGet<Hit[]>(tx, ws, task.provider, cacheKeyFor(task, country));
    });
    if (!cached) {
      const budgetStop = await withUser(userId, (tx) => overBudget(tx, ws, price));
      if (budgetStop) { stop = budgetStop; break; }
    }
    const call = cached ? fromCache(cached, task, country) : await search(task, country);
    ran++;
    const searched = setup.targets.find((t) => t.id === task.targetId)!;
    const n = await withUser(userId, async (tx) => {
      await ledger(tx, job.id, ws, task, call);
      if (!call.ok) return { found: 0, added: 0 };
      if (!cached) await cachePut(tx, ws, task.provider, cacheKeyFor(task, country), call.data, CACHE_HOURS);
      let f = 0, a = 0;
      for (const hit of call.data) {
        const target = matchTarget(hit, searched, setup.targets);
        const url = canonicalizeUrl(hit.url);
        if (!target || !url) continue;
        f++;
        const hash = contentHash(`${hit.title}\n${hit.snippet}`);
        if (byUrl.has(url) || byHash.has(hash)) continue;
        // The same story on another site (same headline) is kept but linked, so it shows once with "also reported by".
        const title = normalizeText(hit.title);
        const duplicateOf = title.length > 24 ? byTitle.get(title) ?? null : null;
        const [row] = await tx`
          insert into research_documents (workspace_id, watch_id, watch_target_id, watch_job_id, provider, source_type, canonical_url, external_id, title, publisher,
            published_at, published_precision, retrieved_at, excerpt, content_hash, extraction_status, duplicate_of, discovery_query, usage_restrictions, is_demo)
          values (${ws}, ${job.watch_id}, ${target.id}, ${job.id}, ${hit.provider}, 'news', ${url}, ${hit.externalId}, ${hit.title.slice(0, 500)},
            ${hit.publisher ?? hostOf(url)}, ${hit.publishedAt}, ${hit.publishedAt ? hit.publishedPrecision ?? "exact" : null}, now(),
            ${clipExcerpt(hit.snippet)}, ${hash}, 'snippet', ${duplicateOf}, ${task.query}, ${hit.usageRestrictions}, false)
          on conflict (watch_id, canonical_url) where watch_id is not null and canonical_url is not null do nothing
          returning id`;
        byUrl.add(url);
        byHash.add(hash);
        if (row) {
          a++;
          if (!duplicateOf && title.length > 24) byTitle.set(title, row.id as string);
        }
      }
      return { found: f, added: a };
    });
    found += n.found;
    added += n.added;
    if (!call.ok) failed++;
  }
  const status = ran === 0 || failed === ran ? "failed" : failed > 0 || stop ? "partially_completed" : "completed";
  const error = [stop, failed ? `${failed} of ${ran} searches failed; see source health.` : null].filter(Boolean).join(" ") || null;
  return finish(userId, job, watch, { status, found, added, error });
}

const paramsFor = (task: WatchTask, country: string | null) => task.provider === "serper"
  ? { q: task.query, window: task.window, country, count: 10 }
  : { q: task.query, since: task.since.slice(0, 10), category: "news", count: 8 };
const cacheKeyFor = (task: WatchTask, country: string | null) => cacheKey(`watch:${task.provider}`, task.query, paramsFor(task, country));

function fromCache(data: Hit[], task: WatchTask, country: string | null): ProviderCall<Hit[]> {
  const params = Object.fromEntries(Object.entries(paramsFor(task, country)).map(([k, v]) => [k, String(v)]));
  return { ok: true, data, status: data.length ? "ok" : "empty", httpStatus: null, durationMs: 0, error: null, errorKind: null, units: 0, costUsdEstimated: 0, costUsdActual: null, params, raw: null, cached: true };
}

async function search(task: WatchTask, country: string | null): Promise<ProviderCall<Hit[]>> {
  const e = env();
  if (task.provider === "serper") {
    return e.SERPER_API_KEY ? serperNews({ query: task.query, window: task.window, country, apiKey: e.SERPER_API_KEY, usdPerCall: e.SERPER_USD_PER_REQUEST }) : notConfigured("SERPER_API_KEY");
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

async function finish(userId: string, job: ClaimedJob, watch: Record<string, unknown>, out: JobOutcome): Promise<JobOutcome> {
  await withUser(userId, async (tx) => {
    await tx`update watch_jobs set status = ${out.status}, finished_at = now(), found = ${out.found}, added = ${out.added}, error_message = ${out.error} where id = ${job.id}`;
    await tx`update watches set last_attempted_at = now(), next_run_at = ${nextRunAfter(watch.frequency as "daily" | "weekly", new Date())},
      last_success_at = case when ${out.status}::text <> 'failed' then now() else last_success_at end, updated_at = now() where id = ${job.watch_id}`;
  });
  return out;
}

/** Records why a watch couldn't run at all (no user to run it as). */
async function finishPrivileged(job: ClaimedJob, watch: Record<string, unknown> | undefined, out: JobOutcome): Promise<JobOutcome> {
  const sql = privilegedSql();
  await sql`update watch_jobs set status = ${out.status}, finished_at = now(), error_message = ${out.error} where id = ${job.id}`;
  if (watch) await sql`update watches set last_attempted_at = now(), next_run_at = ${nextRunAfter(watch.frequency as "daily" | "weekly", new Date())} where id = ${job.watch_id}`;
  return out;
}
