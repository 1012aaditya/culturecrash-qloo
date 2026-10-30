import "server-only";
import { withUser } from "@/lib/db";
import type { Ctx } from "@/lib/data/workspace";
import { env } from "@/lib/env";
import { buildDashboard, type Dashboard } from "./insights";
import { nextCheckAt } from "./plan";

export type WatchTargetView = { id: string; role: "company" | "competitor"; name: string };
export type WatchItem = {
  id: string; title: string; url: string | null; publisher: string | null; provider: string; sourceType: string; excerpt: string | null;
  metrics: { views?: number; likes?: number; comments?: number };
  topic: string | null; importance: number | null;
  publishedAt: string | null; publishedPrecision: "exact" | "day" | "approximate" | null; discoveredAt: string;
  target: WatchTargetView | null; alsoReportedBy: number;
  /** Other headlines about the same event, newest first. */
  related: { id: string; title: string; url: string | null; publisher: string | null }[];
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
export type HiddenItem = { id: string; title: string; url: string | null; publisher: string | null; target: string | null; reason: string | null; kind: "listing" | "name_clash" | "off_topic" };
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
  hidden: HiddenItem[];
  runs: WatchRun[];
  sources: WatchSource[];
  dashboard: Dashboard | null;
  /** The one-off 30-day history load: null if never started. */
  history: null | { status: string; added: number; finishedAt: string | null };
  health: SourceHealth[];
  totals: { stories: number; thisWeek: number; events: number };
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
      return { client: { id: client.id, name: client.name }, watch: null, targets: [], lastJob: null, items: [], hidden: [], runs: [], sources: [], dashboard: null, history: null, totals: { stories: 0, thisWeek: 0, events: 0 },
        health: (["serper", "exa", "youtube"] as const).map((p) => ({ provider: p, configured: configured[p], lastStatus: null, lastAt: null, lastError: null, failures7d: 0, calls7d: 0 })) };
    }
    const targets = (await tx`select id, role, name from watch_targets where watch_id = ${w.id} order by (role = 'company') desc, created_at`) as unknown as WatchTargetView[];
    const [job] = await tx`select status, started_at, finished_at, found, added, error_message, run_key from watch_jobs where watch_id = ${w.id} order by created_at desc limit 1`;
    const rows = await tx`
      select d.id, d.title, d.canonical_url, d.publisher, d.provider, d.source_type, d.metrics, d.excerpt, d.watch_topic, d.watch_importance, d.published_at, d.published_precision, d.retrieved_at, d.watch_target_id,
        -- Copies of this headline, plus every story in its event and their copies.
        (select count(*)::int from research_documents x where x.duplicate_of = d.id
            or x.watch_event_lead = d.id or x.duplicate_of in (select y.id from research_documents y where y.watch_event_lead = d.id)) as also,
        (select coalesce(json_agg(json_build_object('id', e.id, 'title', e.title, 'url', e.canonical_url, 'publisher', e.publisher)
            order by coalesce(e.published_at, e.retrieved_at) desc), '[]'::json)
          from (select * from research_documents e where e.watch_event_lead = d.id order by coalesce(e.published_at, e.retrieved_at) desc limit 6) e) as related
      from research_documents d
      where d.watch_id = ${w.id} and d.duplicate_of is null and d.watch_event_lead is null and coalesce(d.watch_relevance, 'relevant') = 'relevant'
      order by coalesce(d.published_at, d.retrieved_at) desc limit 100`;
    // Hidden as not relevant: kept, with the reason, for anyone who wants to check.
    const hidden = await tx`select d.id, d.title, d.canonical_url, d.publisher, d.watch_relevance, d.watch_relevance_reason, t.name as target
      from research_documents d left join watch_targets t on t.id = d.watch_target_id
      where d.watch_id = ${w.id} and d.watch_relevance in ('listing', 'name_clash', 'off_topic')
      order by d.retrieved_at desc limit 100`;
    const [totals] = await tx`select count(*) filter (where duplicate_of is null)::int as stories,
        count(*) filter (where duplicate_of is null and retrieved_at > now() - interval '7 days')::int as week,
        count(*) filter (where duplicate_of is null and watch_event_lead is null)::int as events
      from research_documents where watch_id = ${w.id} and coalesce(watch_relevance, 'relevant') = 'relevant'`;
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
    // Dashboard: the last 30 days of relevant, distinct news stories (copies counted, not listed). News only —
    // videos and company pages are collected differently, so mixing them in would skew comparisons.
    const recent = await tx`
      select d.id, d.watch_target_id, d.title, d.canonical_url, d.publisher, d.provider, d.watch_topic, d.watch_importance, d.watch_event_lead,
        coalesce(d.published_at, d.retrieved_at) as at,
        (select count(*)::int from research_documents x where x.duplicate_of = d.id) as copies
      from research_documents d
      where d.watch_id = ${w.id} and d.duplicate_of is null and coalesce(d.watch_relevance, 'relevant') = 'relevant'
        and d.provider in ('serper', 'exa') and coalesce(d.published_at, d.retrieved_at) > now() - interval '31 days'`;
    // History is loaded in chunks; together they're "running" until every chunk has finished.
    const [backfill] = await tx`select count(*)::int as chunks, count(*) filter (where status in ('queued', 'running'))::int as pending,
        count(*) filter (where status = 'running' and heartbeat_at > now() - interval '5 minutes')::int as active,
        count(*) filter (where status = 'failed')::int as failed, coalesce(sum(added), 0)::int as added, max(finished_at) as finished_at
      from watch_jobs where watch_id = ${w.id} and run_key like 'backfill:d%'`;
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
        topic: r.watch_topic, importance: r.watch_importance,
        publishedAt: iso(r.published_at), publishedPrecision: r.published_precision, discoveredAt: iso(r.retrieved_at)!,
        target: byId.get(r.watch_target_id) ?? null, alsoReportedBy: r.also, related: r.related,
      })),
      dashboard: buildDashboard(recent.map((r) => ({
        id: r.id, targetId: r.watch_target_id, title: r.title, url: r.canonical_url, publisher: r.publisher, provider: r.provider,
        topic: r.watch_topic, importance: r.watch_importance, eventLead: r.watch_event_lead, copies: r.copies, at: new Date(r.at).getTime(),
      })).filter((r) => r.targetId), targets.map((t) => ({ id: t.id, name: t.name, role: t.role }))),
      history: backfill?.chunks ? {
        // "stalled": chunks are left but no worker has checked in for five minutes, so it can be resumed.
        status: backfill.pending ? (backfill.active ? "running" : "stalled") : backfill.failed === backfill.chunks ? "failed" : backfill.failed ? "partially_completed" : "completed",
        added: backfill.added, finishedAt: iso(backfill.finished_at),
      } : null,
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
      hidden: hidden.map((h) => ({ id: h.id, title: h.title, url: h.canonical_url, publisher: h.publisher, target: h.target, reason: h.watch_relevance_reason, kind: h.watch_relevance })),
      totals: { stories: totals.stories, thisWeek: totals.week, events: totals.events },
    };
  });
}
