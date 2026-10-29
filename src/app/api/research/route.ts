import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { isUuid } from "@/lib/data/projects";
import { apiCtx, apiError, apiOk, handleForbidden } from "@/lib/research/api";
import { executeRun } from "@/lib/research/engine";
import { createResearchJob } from "@/lib/research/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  projectId: z.string().refine(isUuid, "Invalid projectId"),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  question: z.string().trim().max(1000).nullable().optional(),
  freshness: z.enum(["month", "year", "any"]).default("year"),
  mode: z.enum(["live", "demo"]).default("live"),
  idempotencyKey: z.string().min(8).max(80),
});

/** POST /api/research — create a research job (idempotent per idempotencyKey). */
export async function POST(req: NextRequest) {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  try {
    const r = await createResearchJob(ctx, parsed.data);
    if (!r.ok) return apiError(r.status ?? 400, "not_started", r.error);
    if (!r.reused) after(() => executeRun(ctx.user.id, r.runId));
    return apiOk({ jobId: r.runId, reused: r.reused, statusUrl: `/api/research/${r.runId}` }, r.reused ? 200 : 202);
  } catch (e) {
    return handleForbidden(e);
  }
}
