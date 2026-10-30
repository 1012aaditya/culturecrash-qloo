import "server-only";
import { withUser } from "@/lib/db";
import type { Ctx } from "@/lib/data/workspace";
import { env } from "@/lib/env";
import { nextCheckAt } from "./plan";

export type WatchTargetView = { id: string; role: "company" | "competitor"; name: string };
export type WatchItem = {
  id: string; title: string; url: string | null; publisher: string | null; provider: string; excerpt: string | null;
  publishedAt: string | null; publishedPrecision: "exact" | "day" | "approximate" | null; discoveredAt: string;
  target: WatchTargetView | null; alsoReportedBy: number;
};
export type SourceHealth = { provider: string; configured: boolean; lastStatus: "ok" | "empty" | "error" | null; lastAt: string | null; lastError: string | null; failures7d: number; calls7d: number };
export type WatchView = {
  client: { id: string; name: string };
  watch: null | {
    id: string; status: "active" | "paused"; frequency: "daily" | "weekly"; market: string | null; keywords: string[];
    lastAttemptedAt: string | null; lastSuccessAt: string | null; nextRunAt: string; nextCheckAt: string; createdBy: string | null;
  };
  targets: WatchTargetView[];
  lastJob: null | { status: string; startedAt: string | null; finishedAt: string | null; found: number; added: number; error: string | null; manual: boolean };
  items: WatchItem[];
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
    const configured = { serper: Boolean(e.SERPER_API_KEY), exa: Boolean(e.EXA_API_KEY) };
    if (!w) {
      return { client: { id: client.id, name: client.name }, watch: null, targets: [], lastJob: null, items: [], totals: { stories: 0, thisWeek: 0 },
        health: (["serper", "exa"] as const).map((p) => ({ provider: p, configured: configured[p], lastStatus: null, lastAt: null, lastError: null, failures7d: 0, calls7d: 0 })) };
    }
    const targets = (await tx`select id, role, name from watch_targets where watch_id = ${w.id} order by (role = 'company') desc, created_at`) as unknown as WatchTargetView[];
    const [job] = await tx`select status, started_at, finished_at, found, added, error_message, run_key from watch_jobs where watch_id = ${w.id} order by created_at desc limit 1`;
    const rows = await tx`
      select d.id, d.title, d.canonical_url, d.publisher, d.provider, d.excerpt, d.published_at, d.published_precision, d.retrieved_at, d.watch_target_id,
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
    const byId = new Map(targets.map((t) => [t.id, t]));
    return {
      client: { id: client.id, name: client.name },
      watch: {
        id: w.id, status: w.status, frequency: w.frequency, market: w.market, keywords: w.keywords,
        lastAttemptedAt: iso(w.last_attempted_at), lastSuccessAt: iso(w.last_success_at), nextRunAt: iso(w.next_run_at)!, nextCheckAt: nextCheckAt(new Date(w.next_run_at)).toISOString(), createdBy: w.created_by,
      },
      targets,
      lastJob: job ? { status: job.status, startedAt: iso(job.started_at), finishedAt: iso(job.finished_at), found: job.found, added: job.added, error: job.error_message, manual: String(job.run_key).startsWith("manual:") } : null,
      items: rows.map((r) => ({
        id: r.id, title: r.title, url: r.canonical_url, publisher: r.publisher, provider: r.provider, excerpt: r.excerpt,
        publishedAt: iso(r.published_at), publishedPrecision: r.published_precision, discoveredAt: iso(r.retrieved_at)!,
        target: byId.get(r.watch_target_id) ?? null, alsoReportedBy: r.also,
      })),
      health: (["serper", "exa"] as const).map((p) => {
        const h = health.find((x) => x.provider === p);
        return { provider: p, configured: configured[p], lastStatus: h?.last_status ?? null, lastAt: iso(h?.last_at), lastError: h?.last_error ?? null, failures7d: h?.failures ?? 0, calls7d: h?.calls ?? 0 };
      }),
      totals: { stories: totals.stories, thisWeek: totals.week },
    };
  });
}
