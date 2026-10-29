import { withUser } from "@/lib/db";
import { apiCtx, apiError, apiOk, jobSummary, loadJob } from "@/lib/research/api";

export const dynamic = "force-dynamic";

/** GET /api/research/:jobId — status, stage, coverage and usage. */
export async function GET(_: Request, { params }: RouteContext<"/api/research/[jobId]">) {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const job = await loadJob(ctx, (await params).jobId);
  if (!job) return apiError(404, "not_found", "Research job not found.");
  const [c] = await withUser(ctx.user.id, (tx) => tx`select
    (select count(*)::int from research_documents where run_id = ${job.id} and duplicate_of is null) as documents,
    (select count(*)::int from evidence_items where run_id = ${job.id} and claim_type in ('source_fact','source_opinion','observed_measurement')) as claims`);
  return apiOk({ job: jobSummary(job, { documents: c.documents, claims: c.claims }) });
}
