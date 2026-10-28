import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDot, Clock, ListTodo, RotateCw, ScanEye } from "lucide-react";
import type { ComponentType } from "react";
import { EmptyState, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutoRefresh } from "@/components/tasks/auto-refresh";
import { getCtx } from "@/lib/data/workspace";
import { listTasks, type TaskRow } from "@/lib/data/workspace-admin";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Tasks" };

const STATUS: Record<TaskRow["status"], { label: string; tone: "violet" | "success" | "danger" | "outline" | "warning"; icon: ComponentType<{ className?: string }>; explain: string }> = {
  queued: { label: "Queued", tone: "outline", icon: Clock, explain: "Waiting to start" },
  running: { label: "Running", tone: "violet", icon: CircleDot, explain: "In progress — duration varies with provider response times" },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2, explain: "Finished" },
  failed: { label: "Failed", tone: "danger", icon: AlertTriangle, explain: "Stopped with an error" },
  awaiting_review: { label: "Awaiting review", tone: "warning", icon: ScanEye, explain: "Needs a person to review the output" },
};
const FILTERS = ["queued", "running", "completed", "failed", "awaiting_review"] as const;

const KIND: Record<string, string> = {
  research_run: "Research run",
  strategy_generation: "Strategy generation",
  creative_brief: "Creative brief",
  report_generation: "Report generation",
};

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = FILTERS.find((f) => f === raw) ?? null;
  const ctx = await getCtx();
  const tasks = await listTasks(ctx, status);
  const anyActive = tasks.some((t) => t.status === "queued" || t.status === "running");

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-8 sm:px-8">
      <PageHeader
        eyebrow={<>Background tasks · {ctx.workspace.name}</>}
        title="Task center"
        description="Research runs and generations that continue after you leave the page. Statuses are reported as they are — no estimated percentages."
      />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {[null, ...FILTERS].map((f) => {
            const on = status === f;
            return (
              <Link
                key={f ?? "all"}
                href={f ? `/tasks?status=${f}` : "/tasks"}
                aria-current={on ? "page" : undefined}
                className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px]", on ? "bg-ink text-white" : "text-muted hover:bg-ink/5 hover:text-ink")}
              >
                {f ? STATUS[f].label : "All"}
              </Link>
            );
          })}
        </nav>
        <AutoRefresh active={anyActive} />
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={ListTodo}
          title={status ? `No ${STATUS[status].label.toLowerCase()} tasks` : "No background tasks yet"}
          body={status ? "Try another status filter." : "Starting a research run from a campaign’s research canvas creates a task here, so you can follow it from anywhere."}
          action={status ? { href: "/tasks", label: "Show all tasks" } : { href: "/projects", label: "Open a campaign" }}
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {tasks.map((t) => {
            const s = STATUS[t.status];
            const retryHref = t.kind === "research_run" && t.status === "failed" && t.projectId ? `/projects/${t.projectId}/research` : null;
            return (
              <li key={t.id} className={cn("rounded-cc-lg border bg-paper p-5 shadow-card", t.status === "failed" ? "border-danger/25" : "border-line")}>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={s.tone}>
                        <s.icon className={cn(t.status === "running" && "cc-animate-pulse")} /> {s.label}
                      </Badge>
                      <span className="text-[12px] text-muted">{KIND[t.kind] ?? t.kind}</span>
                      {t.attempts > 1 && <span className="text-[12px] text-muted">· attempt {t.attempts}</span>}
                    </div>
                    <h2 className="mt-2 truncate text-[16px] font-semibold tracking-tight">{t.label}</h2>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {t.project && t.projectId ? <Link href={`/projects/${t.projectId}`} className="text-ink hover:underline">{t.project}</Link> : "No campaign"}
                      {t.createdBy && <> · started by {t.createdBy}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {retryHref && (
                      <Button asChild size="sm" variant="accent" title="Opens the research canvas, where you can retry the run">
                        <Link href={retryHref}><RotateCw /> Retry</Link>
                      </Button>
                    )}
                    {t.resultHref && t.status !== "failed" && (
                      <Button asChild size="sm" variant={t.status === "completed" ? "primary" : "outline"}>
                        <Link href={t.resultHref}>{t.status === "completed" ? "Open result" : "View progress"} <ArrowUpRight /></Link>
                      </Button>
                    )}
                    {t.resultHref && t.status === "failed" && (
                      <Button asChild size="sm" variant="ghost"><Link href={t.resultHref}>Details</Link></Button>
                    )}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-3 text-[12px] sm:grid-cols-4">
                  <div><dt className="text-faint">Queued</dt><dd>{formatDateTime(t.createdAt)}</dd></div>
                  <div><dt className="text-faint">Started</dt><dd>{t.startedAt ? formatDateTime(t.startedAt) : "Not yet"}</dd></div>
                  <div><dt className="text-faint">Last update</dt><dd title={formatDateTime(t.updatedAt)}>{timeAgo(t.updatedAt)}</dd></div>
                  <div><dt className="text-faint">{t.finishedAt ? "Finished" : "Status"}</dt><dd>{t.finishedAt ? formatDateTime(t.finishedAt) : s.explain}</dd></div>
                </dl>
                {t.error && (
                  <p role="alert" className="mt-3 rounded-cc-sm bg-danger/[0.05] px-3 py-2 text-[12px] text-danger">
                    <AlertTriangle className="mr-1.5 inline size-3.5" />{t.error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {tasks.length >= 100 && <p className="mt-4 text-[12px] text-muted">Showing the 100 most relevant tasks.</p>}
    </div>
  );
}
