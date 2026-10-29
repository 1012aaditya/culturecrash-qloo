import { apiCtx, apiError, apiOk, jobSummary, loadJob } from "@/lib/research/api";

export const dynamic = "force-dynamic";

/** GET /api/research/:jobId/report — the synthesis with citation ids (resolve them via /evidence). */
export async function GET(_: Request, { params }: RouteContext<"/api/research/[jobId]/report">) {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const job = await loadJob(ctx, (await params).jobId);
  if (!job) return apiError(404, "not_found", "Research job not found.");
  if (!job.report) return apiError(409, "not_ready", job.status === "queued" || job.status === "running" ? "The report is not ready yet." : "This job has no multi-source report.");
  return apiOk({ job: jobSummary(job), plan: job.plan?.deep ?? null, report: job.report, qlooInterpretation: job.interpretation ?? null });
}
