import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { ACTIVITY_PAGE_SIZE, listActivity } from "@/lib/data/workspace-admin";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Workspace activity" };

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export default async function ActivityPage({ searchParams }: PageProps<"/workspace/activity">) {
  const sp = await searchParams;
  const pageRaw = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1;
  const projectRaw = Array.isArray(sp.project) ? sp.project[0] : sp.project;
  const projectId = projectRaw && isUuid(projectRaw) ? projectRaw : null;
  const ctx = await getCtx();
  const { rows, total, projects } = await listActivity(ctx, { page, projectId });
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const selected = projects.find((p) => p.id === projectId);
  const href = (p: number) => `/workspace/activity?${new URLSearchParams({ ...(projectId ? { project: projectId } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  // Group by calendar day for an editorial timeline.
  const groups: { day: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const d = dayKey(r.createdAt);
    const last = groups.at(-1);
    if (last?.day === d) last.items.push(r);
    else groups.push({ day: d, items: [r] });
  }

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      <PageHeader
        eyebrow={<>Audit history · {ctx.workspace.name}</>}
        title="Activity"
        description="Who changed what, and when — campaigns, research runs, approvals, clients and team changes. Records are append-only."
      />
      <div className="mt-8"><WorkspaceTabs /></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {rows.length === 0 ? (
            <EmptyState
              icon={History}
              title={projectId ? "No activity for this campaign" : page > 1 ? "No more activity" : "No activity yet"}
              body={projectId ? "Try another campaign, or clear the filter." : "Creating campaigns, running research and approving brand memory are recorded here."}
              action={projectId || page > 1 ? { href: "/workspace/activity", label: "Show all activity" } : undefined}
            />
          ) : (
            <ol className="space-y-8">
              {groups.map((g) => (
                <li key={g.day}>
                  <h2 className="cc-eyebrow mb-3 text-muted">{formatDate(g.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
                  <ul className="divide-y divide-line rounded-cc-lg border border-line bg-paper">
                    {g.items.map((a) => (
                      <li key={a.id} className="grid gap-1 p-4 text-[13px] sm:grid-cols-[1fr_auto] sm:gap-4">
                        <p className="min-w-0">
                          <b className="font-medium">{a.actor}</b> <span className="text-muted">{a.summary}</span>
                          {a.project && a.projectId && (
                            <>
                              {" "}· <Link href={`/projects/${a.projectId}`} className="text-ink underline-offset-2 hover:underline">{a.project}</Link>
                            </>
                          )}
                        </p>
                        <time dateTime={a.createdAt} className="text-[12px] text-faint">{formatDateTime(a.createdAt)}</time>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}

          {total > 0 && (
            <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-3 text-[13px]">
              {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}><ChevronLeft /> Newer</Link></Button> : <span />}
              <span className="text-muted">Page {Math.min(page, pages)} of {pages} · {total} events</span>
              {page < pages ? <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Older <ChevronRight /></Link></Button> : <span />}
            </nav>
          )}
        </div>

        <aside className="space-y-4">
          <form method="get" action="/workspace/activity" className="rounded-cc-lg border border-line bg-paper p-5">
            <label htmlFor="project-filter" className="text-[13px] font-medium">Filter by campaign</label>
            <Select id="project-filter" name="project" defaultValue={projectId ?? ""} className="mt-2">
              <option value="">All campaigns and workspace events</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <div className="mt-3 flex gap-2">
              <Button type="submit" size="sm">Apply</Button>
              {projectId && <Button asChild size="sm" variant="ghost"><Link href="/workspace/activity">Clear</Link></Button>}
            </div>
            {selected && <p className="mt-3 text-[12px] text-muted">Showing activity for <span className="text-ink">{selected.name}</span>.</p>}
          </form>
          <p className="px-1 text-[12px] leading-relaxed text-muted">Activity summaries describe what happened without copying brief or research content.</p>
        </aside>
      </div>
    </div>
  );
}
