import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientHeader } from "@/components/workspace/client-header";
import { WatchDashboard } from "@/components/watch/watch-dashboard";
import { WatchHealth, WatchRunHistory, WatchStatusBar, WatchTimeline } from "@/components/watch/watch-timeline";
import { WatchConfigForm } from "@/components/watch/watch-config-form";
import { WatchSourcesForm } from "@/components/watch/watch-sources-form";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { can } from "@/lib/permissions";
import { getWatchView } from "@/lib/watch/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Watch" };

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "stories", label: "All stories" },
  { key: "setup", label: "Setup" },
] as const;

export default async function WatchPage({ params, searchParams }: PageProps<"/workspace/clients/[clientId]/watch">) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();
  const sp = await searchParams;
  const ctx = await getCtx();
  const view = await getWatchView(ctx, clientId);
  if (!view) notFound();
  const canEdit = can(ctx.workspace.role, "client.edit");
  const company = view.targets.find((t) => t.role === "company")?.name ?? view.client.name;
  const current = view.watch ? (VIEWS.find((v) => v.key === sp.view)?.key ?? "overview") : "setup";
  const competitors = view.targets.filter((t) => t.role === "competitor").map((t) => t.name);

  const config = (
    <WatchConfigForm
      clientId={view.client.id}
      canEdit={canEdit}
      exists={Boolean(view.watch)}
      initial={{ company, competitors, keywords: view.watch?.keywords ?? [], market: view.watch?.market ?? "", frequency: view.watch?.frequency ?? "daily" }}
    />
  );

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      <ClientHeader
        client={view.client}
        eyebrow={view.watch ? `Watch · ${company}${competitors.length ? ` vs ${competitors.join(" and ")}` : ""}` : "Watch · news about this client and its competitors"}
      />

      {view.watch && (
        <nav aria-label="Watch views" className="mt-8 inline-flex rounded-full border border-line bg-paper p-1">
          {VIEWS.map((v) => (
            <Link key={v.key} href={v.key === "overview" ? "?" : `?view=${v.key}`} aria-current={current === v.key ? "page" : undefined} scroll={false}
              className={cn("rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors", current === v.key ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {v.label}{v.key === "stories" ? ` · ${view.totals.events}` : ""}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-6 space-y-6">
        {current !== "setup" && <WatchStatusBar view={view} canEdit={canEdit} />}
        {current === "overview" && <WatchDashboard view={view} canEdit={canEdit} />}
        {current === "stories" && <WatchTimeline view={view} />}
        {current === "setup" && (
          view.watch ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <WatchHealth view={view} canEdit={canEdit} />
                <WatchRunHistory runs={view.runs} />
              </div>
              <div className="space-y-4">
                {config}
                <WatchSourcesForm key={view.sources.map((x) => `${x.id}:${x.status}:${x.target}`).join("|")} clientId={view.client.id} companies={view.targets.map((t) => t.name)} sources={view.sources} canEdit={canEdit} />
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-cc-lg border border-line bg-paper p-8">
                <h2 className="text-[22px] font-semibold tracking-tight">Track {company} against its competitors</h2>
                <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
                  Watch reads the news, company newsrooms and YouTube every day. AI checks each story is really about the brand, labels what it&rsquo;s about and how important it is, and the dashboard shows share of voice, coverage trends and the key developments — starting with the last 30 days.
                </p>
              </div>
              {config}
            </div>
          )
        )}
      </div>
    </div>
  );
}
