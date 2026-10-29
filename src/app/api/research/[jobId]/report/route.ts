import { withUser } from "@/lib/db";
import { apiCtx, apiError, apiOk, jobSummary, loadJob } from "@/lib/research/api";
import { readQlooObservations } from "@/lib/research/deep/read";

export const dynamic = "force-dynamic";

/** GET /api/research/:jobId/report — the synthesis with citation ids (resolve them via /evidence). */
export async function GET(_: Request, { params }: RouteContext<"/api/research/[jobId]/report">) {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const job = await loadJob(ctx, (await params).jobId);
  if (!job) return apiError(404, "not_found", "Research job not found.");
  if (!job.report) return apiError(409, "not_ready", job.status === "queued" || job.status === "running" ? "The report is not ready yet." : "This job has no multi-source report.");
  // Qloo observations are returned so every citation (web claim or Qloo observation) can be resolved.
  const qloo = await withUser(ctx.user.id, (tx) => readQlooObservations(tx, job.id));
  return apiOk({ job: jobSummary(job), plan: job.plan?.deep ?? null, report: job.report, qloo, qlooInterpretation: job.interpretation ?? null });
}
