import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { withUser } from "@/lib/db";
import { getProjectContext } from "@/lib/data/project-context";
import { listRuns } from "@/lib/data/research";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Research history" };

export default async function HistoryPage({ params }: PageProps<"/projects/[projectId]/research/history">) {
  const { projectId } = await params;
  const { ctx } = await getProjectContext(projectId);
  const runs = await listRuns(ctx, projectId);
  const calls = await withUser(ctx.user.id, (tx) => tx`select s.run_id, s.endpoint, s.params, s.status, s.http_status, s.result_count, s.duration_ms, s.error_message, s.retrieved_at
    from research_sources s join research_runs r on r.id = s.run_id where r.project_id = ${projectId} order by s.retrieved_at`);
  return (
    <div>
      <p className="cc-eyebrow text-muted">01 · Explore · Run history</p>
      <h1 className="cc-display mt-3 text-5xl">Every research run, with its provenance.</h1>
      <p className="mt-3 max-w-2xl text-[14px] text-muted">Each run keeps the plan, every provider request (including failures), and the brief revision it was based on. Runs are never rewritten after completion.</p>
      {runs.length === 0 ? (
        <EmptyState className="mt-8" title="No research runs yet" action={{ href: `/projects/${projectId}/research`, label: "Open research canvas" }} />
      ) : (
        <ol className="mt-8 space-y-4">
          {runs.map((r) => (
            <li key={r.id} className="rounded-cc-lg border border-line bg-paper p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("size-2.5 rounded-full", r.status === "completed" ? "bg-success" : r.status === "failed" ? "bg-danger" : "bg-violet cc-animate-pulse")} />
                <span className="font-medium">{formatDateTime(r.createdAt)}</span>
                <Badge tone={r.status === "failed" ? "danger" : r.status === "completed" ? "success" : "violet"}>{r.status}</Badge>
                {r.mode === "demo" ? <DemoBadge /> : <Badge tone="outline">Live · Qloo</Badge>}
                {r.errorCode === "partial" && <Badge tone="warning">partial</Badge>}
                <span className="text-[12px] text-muted">by {r.startedBy ?? "unknown"} · brief revision {r.briefRevision ?? "—"} · {r.entityCount} entities · {r.callCount} requests</span>
                <Link href={`/projects/${projectId}/research?run=${r.id}`} className="ml-auto text-[13px] text-violet hover:underline">Open on canvas →</Link>
              </div>
              <p className="mt-2 text-[13px] text-muted">{r.question}</p>
              {r.errorMessage && <p className="mt-2 text-[13px] text-danger">{r.errorMessage}</p>}
              <details className="mt-3">
                <summary className="cursor-pointer text-[12px] font-medium">Provider requests</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-[12px]">
                    <thead className="text-left text-muted"><tr><th className="py-1 font-medium">Endpoint</th><th className="font-medium">Parameters</th><th className="font-medium">Status</th><th className="font-medium">Results</th><th className="font-medium">ms</th></tr></thead>
                    <tbody>
                      {calls.filter((c) => c.run_id === r.id).map((c, i) => (
                        <tr key={i} className="border-t border-line align-top">
                          <td className="py-1.5 font-mono">{c.endpoint}</td>
                          <td className="max-w-[380px] truncate font-mono text-muted" title={JSON.stringify(c.params)}>{Object.entries(c.params as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(" ")}</td>
                          <td className={c.status === "error" ? "text-danger" : ""}>{c.status}{c.http_status ? ` (${c.http_status})` : ""}{c.error_message ? ` — ${c.error_message}` : ""}</td>
                          <td>{c.result_count}</td>
                          <td className="text-muted">{c.duration_ms ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
