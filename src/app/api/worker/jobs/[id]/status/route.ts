import { isWorker, json, readJson, reportStatus, UUID } from "@/lib/concepts/worker";

export const dynamic = "force-dynamic";

/** Progress from the PC: running | error | queued (hands the job back after a transient failure). */
export async function POST(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/status">) {
  if (!isWorker(req)) return json({ error: "unauthorized" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);
  const b = await readJson(req);
  const updated = await reportStatus(id, b.status, b.error);
  return updated === null ? json({ error: "bad status" }, 400) : json({ ok: true, updated });
}
