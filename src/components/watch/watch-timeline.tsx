"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Pause, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ago, When } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import { checkNowAction, setWatchStatusAction } from "@/lib/watch/actions";
import type { SourceHealth, WatchItem, WatchView } from "@/lib/watch/data";
import { cn, formatDate, pluralize } from "@/lib/utils";

const PROVIDER: Record<string, string> = { serper: "Google News (Serper)", exa: "Exa" };

/** A publication date as precise as the source gave it — never the time we found the story. */
function Published({ item }: { item: WatchItem }) {
  if (!item.publishedAt) return <span className="text-faint">Publication date not given</span>;
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
            {view.totals.stories ? `${pluralize(view.totals.stories, "story", "stories")} collected, ${view.totals.thisWeek} in the last 7 days.` : "News stories that name the company or a competitor, newest first."}
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
              <p className="mt-3 text-[11px] text-faint">
                Found by {PROVIDER[item.provider] ?? item.provider} <Ago value={item.discoveredAt} />
                {item.alsoReportedBy > 0 && <> · also reported by {pluralize(item.alsoReportedBy, "other source")}</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
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
