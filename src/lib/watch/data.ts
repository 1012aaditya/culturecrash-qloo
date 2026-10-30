import "server-only";
import { withUser } from "@/lib/db";
import type { Ctx } from "@/lib/data/workspace";
import { env } from "@/lib/env";
import { nextCheckAt } from "./plan";

export type WatchTargetView = { id: string; role: "company" | "competitor"; name: string };
export type WatchItem = {
  id: string; title: string; url: string | null; publisher: string | null; provider: string; sourceType: string; excerpt: string | null;
  metrics: { views?: number; likes?: number; comments?: number };
  publishedAt: string | null; publishedPrecision: "exact" | "day" | "approximate" | null; discoveredAt: string;
  target: WatchTargetView | null; alsoReportedBy: number;
};
export type SourceHealth = { provider: string; configured: boolean; lastStatus: "ok" | "empty" | "error" | null; lastAt: string | null; lastError: string | null; failures7d: number; calls7d: number };
export type WatchRun = {
  id: string; status: string; manual: boolean; startedAt: string | null; finishedAt: string | null;
  found: number; added: number; costUsd: number; calls: number; failedCalls: number; error: string | null;
};
export type WatchSource = {
  id: string; url: string; kind: "page" | "feed"; target: string; status: "pending" | "ok" | "blocked" | "robots" | "needs_browser" | "error";
  detail: string | null; lastCheckedAt: string | null; lastChangedAt: string | null; discovered: boolean;
};
export type WatchView = {
  client: { id: string; name: string };
  watch: null | {
    id: string; status: "active" | "paused"; frequency: "daily" | "weekly"; market: string | null; keywords: string[];
    lastAttemptedAt: string | null; lastSuccessAt: string | null; nextRunAt: string; nextCheckAt: string; createdBy: string | null;
    consecutiveFailures: number;
  };
  targets: WatchTargetView[];
  lastJob: null | { status: string; startedAt: string | null; finishedAt: string | null; found: number; added: number; error: string | null; manual: boolean };
  items: WatchItem[];
  runs: WatchRun[];
  sources: WatchSource[];
  health: SourceHealth[];
  totals: { stories: number; thisWeek: number };
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** Everything the Watch page shows, read under the signed-in user's Row Level Security. */
export async function getWatchView(ctx: Ctx, clientId: string): Promise<WatchView | null> {
  const e = env();
  return withUser(ctx.user.id, async (tx) => {
    const [client] = await tx`select id, name from clients where id = ${clientId} and workspace_id = ${ctx.workspace.workspaceId}`;
    if (!client) return null;
    const [w] = await tx`select * from watches where client_id = ${clientId}`;
    const configured = { serper: Boolean(e.SERPER_API_KEY), exa: Boolean(e.EXA_API_KEY), youtube: Boolean(e.YOUTUBE_API_KEY) };
    if (!w) {
      return { client: { id: client.id, name: client.name }, watch: null, targets: [], lastJob: null, items: [], runs: [], sources: [], totals: { stories: 0, thisWeek: 0 },
        health: (["serper", "exa", "youtube"] as const).map((p) => ({ provider: p, configured: configured[p], lastStatus: null, lastAt: null, lastError: null, failures7d: 0, calls7d: 0 })) };
    }
    const targets = (await tx`select id, role, name from watch_targets where watch_id = ${w.id} order by (role = 'company') desc, created_at`) as unknown as WatchTargetView[];
    const [job] = await tx`select status, started_at, finished_at, found, added, error_message, run_key from watch_jobs where watch_id = ${w.id} order by created_at desc limit 1`;
    const rows = await tx`
      select d.id, d.title, d.canonical_url, d.publisher, d.provider, d.source_type, d.metrics, d.excerpt, d.published_at, d.published_precision, d.retrieved_at, d.watch_target_id,
        (select count(*)::int from research_documents x where x.duplicate_of = d.id) as also
      from research_documents d
      where d.watch_id = ${w.id} and d.duplicate_of is null
      order by coalesce(d.published_at, d.retrieved_at) desc limit 100`;
    const [totals] = await tx`select count(*) filter (where duplicate_of is null)::int as stories,
        count(*) filter (where duplicate_of is null and retrieved_at > now() - interval '7 days')::int as week
      from research_documents where watch_id = ${w.id}`;
    // Source health from the cost ledger: the last call per provider, and failures over the past week.
    const health = await tx`
      select s.provider, (array_agg(s.status order by s.retrieved_at desc))[1] as last_status, max(s.retrieved_at) as last_at,
        (array_agg(s.error_message order by s.retrieved_at desc))[1] as last_error,
        count(*) filter (where s.status = 'error' and s.retrieved_at > now() - interval '7 days')::int as failures,
        count(*) filter (where s.retrieved_at > now() - interval '7 days')::int as calls
      from research_sources s join watch_jobs j on j.id = s.watch_job_id
      where j.watch_id = ${w.id} group by s.provider`;
    // The last 14 checks, each with what it cost (cached and failed calls included, as in the ledger).
    const runs = await tx`
      select j.id, j.status, j.run_key, j.started_at, j.finished_at, j.found, j.added, j.error_message,
        coalesce(sum(s.cost_usd_estimated), 0)::float8 as cost, count(s.id)::int as calls, count(s.id) filter (where s.status = 'error')::int as failed_calls
      from watch_jobs j left join research_sources s on s.watch_job_id = j.id
      where j.watch_id = ${w.id} group by j.id order by j.created_at desc limit 14`;
    const sources = await tx`select p.id, p.url, p.kind, t.name as target, p.status, p.status_detail, p.last_checked_at, p.last_changed_at, p.discovered_from
      from watch_pages p join watch_targets t on t.id = p.watch_target_id where p.watch_id = ${w.id} order by t.created_at, p.kind desc, p.created_at`;
    const byId = new Map(targets.map((t) => [t.id, t]));
    return {
      client: { id: client.id, name: client.name },
      watch: {
        id: w.id, status: w.status, frequency: w.frequency, market: w.market, keywords: w.keywords,
        lastAttemptedAt: iso(w.last_attempted_at), lastSuccessAt: iso(w.last_success_at), nextRunAt: iso(w.next_run_at)!, nextCheckAt: nextCheckAt(new Date(w.next_run_at)).toISOString(), createdBy: w.created_by,
        consecutiveFailures: w.consecutive_failures,
      },
      targets,
      lastJob: job ? { status: job.status, startedAt: iso(job.started_at), finishedAt: iso(job.finished_at), found: job.found, added: job.added, error: job.error_message, manual: String(job.run_key).startsWith("manual:") } : null,
      items: rows.map((r) => ({
        id: r.id, title: r.title, url: r.provider === "page" ? String(r.canonical_url).replace(/#change-[0-9a-f]+$/, "") : r.canonical_url,
        publisher: r.publisher, provider: r.provider, sourceType: r.source_type, excerpt: r.excerpt, metrics: r.metrics ?? {},
        publishedAt: iso(r.published_at), publishedPrecision: r.published_precision, discoveredAt: iso(r.retrieved_at)!,
        target: byId.get(r.watch_target_id) ?? null, alsoReportedBy: r.also,
      })),
      sources: sources.map((p) => ({
        id: p.id, url: p.url, kind: p.kind, target: p.target, status: p.status, detail: p.status_detail,
        lastCheckedAt: iso(p.last_checked_at), lastChangedAt: iso(p.last_changed_at), discovered: Boolean(p.discovered_from),
      })),
      runs: runs.map((r) => ({
        id: r.id, status: r.status, manual: String(r.run_key).startsWith("manual:"), startedAt: iso(r.started_at), finishedAt: iso(r.finished_at),
        found: r.found, added: r.added, costUsd: r.cost, calls: r.calls, failedCalls: r.failed_calls, error: r.error_message,
      })),
      health: (["serper", "exa", "youtube"] as const).map((p) => {
        const h = health.find((x) => x.provider === p);
        return { provider: p, configured: configured[p], lastStatus: h?.last_status ?? null, lastAt: iso(h?.last_at), lastError: h?.last_error ?? null, failures7d: h?.failures ?? 0, calls7d: h?.calls ?? 0 };
      }),
      totals: { stories: totals.stories, thisWeek: totals.week },
    };
  });
}
