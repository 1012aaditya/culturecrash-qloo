import { isRunning, isWorker, json, uploadKey, UUID } from "@/lib/concepts/worker";

export const dynamic = "force-dynamic";

/** Where the PC PUTs the finished image: this site's own upload endpoint, keyed to the job. */
export async function POST(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/upload-url">) {
  if (!isWorker(req)) return json({ error: "unauthorized" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);
  if (!(await isRunning(id))) return json({ error: "job not running" }, 409);
  const url = new URL(`/api/worker/jobs/${id}/image`, req.url);
  url.searchParams.set("key", uploadKey(id));
  return json({ signed_url: url.toString(), path: `${id}.png` });
}
