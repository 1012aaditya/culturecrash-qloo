import { complete, isWorker, json, UUID } from "@/lib/concepts/worker";

export const dynamic = "force-dynamic";

/** Marks the job done once its image has been uploaded. Idempotent. */
export async function POST(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/complete">) {
  if (!isWorker(req)) return json({ error: "unauthorized" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);
  const r = await complete(id);
  if (r === "unknown") return json({ error: "unknown job" }, 404);
  if (r === "missing") return json({ error: "image not uploaded" }, 409);
  return json({ ok: true, ...(r === "duplicate" ? { duplicate: true } : {}) });
}
