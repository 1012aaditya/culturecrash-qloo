import { after } from "next/server";
import { z } from "zod";
import { apiCtx, apiError, apiOk, handleForbidden, loadJob } from "@/lib/research/api";
import { executeRun } from "@/lib/research/engine";
import { createResearchJob } from "@/lib/research/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({ question: z.string().trim().min(8).max(1000), depth: z.enum(["quick", "standard", "deep"]).default("quick"), idempotencyKey: z.string().min(8).max(80) });

/** POST /api/research/:jobId/follow-up — targeted follow-up research on the same project, linked to its parent job. */
export async function POST(req: Request, { params }: RouteContext<"/api/research/[jobId]/follow-up">) {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const parent = await loadJob(ctx, (await params).jobId);
  if (!parent) return apiError(404, "not_found", "Research job not found.");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  try {
    const r = await createResearchJob(ctx, { projectId: parent.project_id, mode: parent.mode, depth: parsed.data.depth, question: parsed.data.question, idempotencyKey: parsed.data.idempotencyKey, parentRunId: parent.id, freshness: parent.budget?.freshness ?? "year" });
    if (!r.ok) return apiError(r.status ?? 400, "not_started", r.error);
    if (!r.reused) after(() => executeRun(ctx.user.id, r.runId));
    return apiOk({ jobId: r.runId, reused: r.reused, parentJobId: parent.id }, r.reused ? 200 : 202);
  } catch (e) {
    return handleForbidden(e);
  }
}
