import { withUser } from "@/lib/db";
import { apiCtx, apiError, apiOk, loadJob } from "@/lib/research/api";
import { readClaims } from "@/lib/research/deep/read";

export const dynamic = "force-dynamic";

/** GET /api/research/:jobId/evidence?limit=&offset=&question=q1 — claims with supporting document ids, quality and contradictions. */
export async function GET(req: Request, { params }: RouteContext<"/api/research/[jobId]/evidence">) {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const job = await loadJob(ctx, (await params).jobId);
  if (!job) return apiError(404, "not_found", "Research job not found.");
  const u = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(u.get("limit")) || 100, 1), 300);
  const offset = Math.max(Number(u.get("offset")) || 0, 0);
  const q = u.get("question");
  const claims = await withUser(ctx.user.id, (tx) => readClaims(tx, job.id, { limit, offset, questionKey: q && /^q\d{1,2}$/.test(q) ? q : null }));
  return apiOk({ claims, limit, offset });
}
