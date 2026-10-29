import { withUser } from "@/lib/db";
import { apiCtx, apiError, apiOk, loadJob } from "@/lib/research/api";
import { readDocuments } from "@/lib/research/deep/read";

export const dynamic = "force-dynamic";

/** GET /api/research/:jobId/sources?limit=&offset=&includeDuplicates=1 */
export async function GET(req: Request, { params }: RouteContext<"/api/research/[jobId]/sources">) {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const job = await loadJob(ctx, (await params).jobId);
  if (!job) return apiError(404, "not_found", "Research job not found.");
  const u = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(u.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(u.get("offset")) || 0, 0);
  const documents = await withUser(ctx.user.id, (tx) => readDocuments(tx, job.id, { limit, offset, includeDuplicates: u.get("includeDuplicates") === "1" }));
  return apiOk({ documents, limit, offset });
}
