"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Pause, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ago, When } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import { TopicBadge } from "@/components/watch/watch-dashboard";
import { checkNowAction, setWatchStatusAction } from "@/lib/watch/actions";
import type { HiddenItem, SourceHealth, WatchItem, WatchRun, WatchView } from "@/lib/watch/data";
import { cn, formatDate, pluralize } from "@/lib/utils";

const PROVIDER: Record<string, string> = { serper: "Google News (Serper)", exa: "Exa", youtube: "YouTube", page: "website check", rss: "newsroom feed" };
const KIND: Record<string, string> = { video: "Video", brand_site: "Company site" };

/** A publication date as precise as the source gave it — never the time we found the story. */
function Published({ item }: { item: WatchItem }) {
  if (!item.publishedAt) return <span className="text-faint">{item.provider === "page" ? "Detected" : "Publication date not given"}{item.provider === "page" && <> <Ago value={item.discoveredAt} /></>}</span>;
  if (item.publishedPrecision === "approximate") return <span title="The source gave a relative date, such as “3 days ago”">around {formatDate(item.publishedAt)}</span>;
  return <span>{formatDate(item.publishedAt)}</span>;
}

export function WatchTimeline({ view }: { view: WatchView }) {
  const [filter, setFilter] = React.useState<string>("all");
  const items = filter === "all" ? view.items : view.items.filter((i) => i.target?.id === filter);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="watch-timeline" className="text-[20px] font-semibold tracking-tight">Timeline</h2>
          <p className="mt-1 text-[13px] text-muted">
            {view.totals.stories ? `${pluralize(view.totals.stories, "story", "stories")} about ${pluralize(view.totals.events, "event")}, ${view.totals.thisWeek} collected in the last 7 days.` : "News stories that name the company or a competitor, newest first."}
          </p>
        </div>
        {view.targets.length > 1 && (
          <div role="group" aria-label="Filter by company" className="flex flex-wrap gap-1.5">
            {[{ id: "all", name: "All" }, ...view.targets].map((t) => (
              <Button key={t.id} type="button" size="sm" variant={filter === t.id ? "primary" : "outline"} aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>
                {t.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      {view.watch && view.watch.consecutiveFailures >= 3 && (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-cc-lg border border-danger/30 bg-danger/5 p-4 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-medium text-danger">The last {view.watch.consecutiveFailures} checks failed</p>
            <p className="mt-0.5 text-ink/80">{view.lastJob?.error ?? "No new stories are being collected."} Source health and the run history on the right show what went wrong.</p>
          </div>
        </div>
      )}

      {!view.watch ? (
        <Empty title="Nothing watched yet" body="Set up the watch on the right. Each day we search news for the company and up to two competitors and list what we find here." />
      ) : !view.items.length ? (
        <Empty
          title={view.lastJob ? "No stories yet" : "Waiting for the first check"}
          body={view.lastJob?.status === "failed" ? "The last check didn’t complete. Source health on the right shows why." : view.lastJob ? "The last check found no new stories that name these companies." : "The first check runs with the next daily run, or use “Check now”."}
        />
      ) : !items.length ? (
        <Empty title="No stories for this company yet" body="Try another company or All." />
      ) : (
        <ol className="mt-5 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-cc-lg border border-line bg-paper p-5">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                {item.target && <Badge tone={item.target.role === "company" ? "violet" : "peach"}>{item.target.name}</Badge>}
                {KIND[item.sourceType] && <Badge tone="outline">{item.provider === "page" ? "Website change" : KIND[item.sourceType]}</Badge>}
                <TopicBadge topic={item.topic} />
                <span>{item.publisher ?? "Unknown publisher"}</span>
                <span aria-hidden>·</span>
                <Published item={item} />
              </div>
              <h3 className="mt-2 text-[15px] font-semibold leading-snug">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-start gap-1.5 hover:text-violet-ink">
                    {item.title} <ExternalLink className="mt-1 size-3.5 shrink-0 text-faint" aria-hidden />
                  </a>
                ) : item.title}
              </h3>
              {item.excerpt && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink/80">{item.excerpt}</p>}
              {item.metrics.views !== undefined && (
                <p className="mt-1.5 text-[12px] text-muted">
                  {item.metrics.views.toLocaleString()} views{item.metrics.likes !== undefined && ` · ${item.metrics.likes.toLocaleString()} likes`}{item.metrics.comments !== undefined && ` · ${item.metrics.comments.toLocaleString()} comments`}
                </p>
              )}
              <p className="mt-3 text-[11px] text-faint">
                Found by {PROVIDER[item.provider] ?? item.provider} <Ago value={item.discoveredAt} />
                {item.alsoReportedBy > 0 && !item.related.length && <> · also reported by {pluralize(item.alsoReportedBy, "other source")}</>}
              </p>
              {item.related.length > 0 && (
                <details className="mt-3 rounded-cc-sm border border-line bg-ivory/50 px-3 py-2 text-[12px]">
                  <summary className="cursor-pointer text-muted">Same story, covered by {pluralize(item.alsoReportedBy, "more outlet")}</summary>
                  <ul className="mt-2 space-y-1.5">
                    {item.related.map((r) => (
                      <li key={r.id}>
                        {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-violet-ink">{r.title}</a> : r.title}
                        {r.publisher && <span className="text-muted"> · {r.publisher}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      <HiddenItems items={view.hidden} />
    </div>
  );
}

/** What relevance filtering left out, with the reason — never silently dropped. */
function HiddenItems({ items }: { items: HiddenItem[] }) {
  if (!items.length) return null;
  return (
    <details className="mt-5 rounded-cc-lg border border-dashed border-line bg-paper/60 px-5 py-3 text-[13px]">
      <summary className="cursor-pointer text-muted">{pluralize(items.length, "item")} hidden as not relevant</summary>
      <ul className="mt-3 space-y-2.5">
        {items.map((h) => (
          <li key={h.id}>
            <p className="font-medium">
              {h.url ? <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-violet-ink">{h.title}</a> : h.title}
            </p>
            <p className="text-[12px] text-muted">
              {h.kind === "listing" ? "Shop listing" : h.kind === "off_topic" ? "Not about the brand" : "Name clash"}{h.target && ` · ${h.target}`}{h.publisher && ` · ${h.publisher}`}{h.reason && ` — ${h.reason}`}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-5 rounded-cc-lg border border-dashed border-line bg-paper/60 px-6 py-12 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">{body}</p>
    </div>
  );
}

const JOB_LABEL: Record<string, string> = {
  queued: "Queued", running: "Running", completed: "Completed", partially_completed: "Partly completed", failed: "Failed",
};

export function WatchHealth({ view, canEdit }: { view: WatchView; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const busy = view.lastJob?.status === "running" || view.lastJob?.status === "queued";
  // While a check runs, refresh every few seconds so the page shows the result when it lands (checks take under a minute).
  React.useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => router.refresh(), 5000);
    const stop = window.setTimeout(() => window.clearInterval(t), 5 * 60_000);
    return () => { window.clearInterval(t); window.clearTimeout(stop); };
  }, [busy, router]);
  const w = view.watch;
  if (!w) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { tone: "success", title: done, description: r.message } : { tone: "error", title: r.error ?? "That didn’t work." });
      router.refresh();
    });

  return (
    <div className="rounded-cc-lg border border-line bg-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="cc-eyebrow text-muted">Status</p>
        {w.status === "active" ? <Badge tone="success"><CheckCircle2 /> Active</Badge> : <Badge tone="outline"><Pause /> Paused</Badge>}
      </div>
      <dl className="mt-4 space-y-2.5 text-[13px]">
        <Row label="Last checked">{w.lastAttemptedAt ? <When value={w.lastAttemptedAt} /> : "Not yet"}</Row>
        {view.lastJob && (
          <Row label="Last result">
            {JOB_LABEL[view.lastJob.status] ?? view.lastJob.status}
            {view.lastJob.finishedAt && <> · {view.lastJob.added} new of {view.lastJob.found} found</>}
            {view.lastJob.error && <span className="block text-[12px] text-muted">{view.lastJob.error}</span>}
          </Row>
        )}
        <Row label="Next check">
          {w.status === "paused" ? "Paused" : <When value={w.nextCheckAt} />}
          <span className="block text-[12px] text-muted">{w.frequency === "daily" ? "Daily" : "Weekly"}. Scheduled checks start at 06:00 UTC and can run up to an hour later.</span>
        </Row>
      </dl>

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-[12px] font-medium">Sources</p>
        <ul className="mt-2 space-y-2">
          {view.health.map((h) => <SourceRow key={h.provider} h={h} />)}
        </ul>
      </div>

      {canEdit && (
        <div className="mt-5 flex flex-wrap gap-2">
          {w.status === "active" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => checkNowAction(view.client.id), "Check started")}>
              <RefreshCw className={cn(pending && "animate-spin")} /> Check now
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={pending}
            onClick={() => run(() => setWatchStatusAction(view.client.id, w.status === "active" ? "paused" : "active"), w.status === "active" ? "Watch paused" : "Watch resumed")}>
            {w.status === "active" ? <><Pause /> Pause</> : <><Play /> Resume</>}
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Honest per-source state from the cost ledger: not set up, never called, last call failed, or working. */
function SourceRow({ h }: { h: SourceHealth }) {
  const name = PROVIDER[h.provider] ?? h.provider;
  if (!h.configured) {
    return <li className="flex items-start gap-2 text-[12px]"><CircleDashed className="mt-0.5 size-3.5 shrink-0 text-faint" /><span><span className="font-medium">{name}</span> — not set up on this server</span></li>;
  }
  if (!h.lastStatus) {
    return <li className="flex items-start gap-2 text-[12px]"><CircleDashed className="mt-0.5 size-3.5 shrink-0 text-faint" /><span><span className="font-medium">{name}</span> — not used yet</span></li>;
  }
  const bad = h.lastStatus === "error";
  return (
    <li className="flex items-start gap-2 text-[12px]">
      {bad ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />}
      <span>
        <span className="font-medium">{name}</span> — {bad ? "last call failed" : "working"}, <Ago value={h.lastAt} />
        {h.failures7d > 0 && <span className="block text-muted">{h.failures7d} of {h.calls7d} calls failed this week{bad && h.lastError ? `: ${h.lastError.slice(0, 120)}` : ""}</span>}
      </span>
    </li>
  );
}

const RUN_TONE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  completed: "success", partially_completed: "warning", failed: "danger", queued: "outline", running: "outline",
};

/** The last 14 checks: what each found, added and cost, so a quiet or failing watch is easy to tell apart. */
export function WatchRunHistory({ runs }: { runs: WatchRun[] }) {
  if (!runs.length) return null;
  return (
    <div className="rounded-cc-lg border border-line bg-paper p-5">
      <p className="cc-eyebrow text-muted">Recent checks</p>
      <ol className="mt-3 divide-y divide-line">
        {runs.map((r) => (
          <li key={r.id} className="py-2.5 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink">{r.startedAt ? <When value={r.startedAt} /> : "Waiting"}{r.manual && <span className="text-muted"> · manual</span>}</span>
              <Badge tone={RUN_TONE[r.status] ?? "outline"}>{JOB_LABEL[r.status] ?? r.status}</Badge>
            </div>
            <p className="mt-0.5 text-muted">
              {r.added} new of {r.found} found · {r.calls} {r.calls === 1 ? "search" : "searches"}{r.failedCalls ? ` (${r.failedCalls} failed)` : ""} · ${r.costUsd.toFixed(3)}
            </p>
            {r.status === "failed" && r.error && <p className="mt-0.5 text-danger">{r.error}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One line above the dashboard and story list: when it last ran, when it runs next, and Check now. */
export function WatchStatusBar({ view, canEdit }: { view: WatchView; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const busy = view.lastJob?.status === "running" || view.lastJob?.status === "queued" || view.history?.status === "running";
  // While a check (or the history load) runs, refresh every few seconds so results appear when they land.
  React.useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => router.refresh(), 5000);
    const stop = window.setTimeout(() => window.clearInterval(t), 5 * 60_000);
    return () => { window.clearInterval(t); window.clearTimeout(stop); };
  }, [busy, router]);
  const w = view.watch;
  if (!w) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {w.status === "active" ? <Badge tone="success"><CheckCircle2 /> Active</Badge> : <Badge tone="outline"><Pause /> Paused</Badge>}
        <span>Last checked {w.lastAttemptedAt ? <Ago value={w.lastAttemptedAt} /> : "not yet"}</span>
        {w.status === "active" && <span>· Next check <When value={w.nextCheckAt} /></span>}
        {busy && <span className="inline-flex items-center gap-1.5 text-violet-ink"><RefreshCw className="size-3.5 animate-spin" /> Checking now…</span>}
      </p>
      {canEdit && w.status === "active" && (
        <Button size="sm" variant="outline" disabled={pending || busy} onClick={() => start(async () => {
          const r = await checkNowAction(view.client.id);
          toast(r.ok ? { tone: "success", title: "Check started", description: r.message } : { tone: "error", title: r.error ?? "That didn’t work." });
          router.refresh();
        })}>
          <RefreshCw className={cn(pending && "animate-spin")} /> Check now
        </Button>
      )}
    </div>
  );
}
