import { apiCtx, apiError, apiOk, handleForbidden, loadJob } from "@/lib/research/api";
import { cancelResearchJob } from "@/lib/research/jobs";

export const dynamic = "force-dynamic";

/** POST /api/research/:jobId/cancel — stops at the next checkpoint; partial results are kept. */
export async function POST(_: Request, { params }: RouteContext<"/api/research/[jobId]/cancel">) {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const job = await loadJob(ctx, (await params).jobId);
  if (!job) return apiError(404, "not_found", "Research job not found.");
  try {
    const r = await cancelResearchJob(ctx, job.id);
    return r.ok ? apiOk({ cancelRequested: true }, 202) : apiError(409, "not_running", r.error ?? "Not running.");
  } catch (e) {
    return handleForbidden(e);
  }
}
