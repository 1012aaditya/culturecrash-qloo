import { isWorker, json, MAX_RESULT_BYTES, storeResult, UUID, validUploadKey } from "@/lib/concepts/worker";

export const dynamic = "force-dynamic";

/** Accepts the finished image as a raw body or as the first file of a multipart form. */
async function handle(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/image">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);
  if (!isWorker(req) && !validUploadKey(id, new URL(req.url).searchParams.get("key"))) return json({ error: "unauthorized" }, 401);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_RESULT_BYTES + 64 * 1024) return json({ error: "image too large (max 4 MB)" }, 413);
  let buf: Buffer;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const file = [...(await req.formData()).values()].find((v): v is File => v instanceof File);
    if (!file) return json({ error: "no file in form" }, 400);
    buf = Buffer.from(await file.arrayBuffer());
  } else {
    buf = Buffer.from(await req.arrayBuffer());
  }
  const error = await storeResult(id, buf);
  return error ? json({ error }, error === "Job is not running." ? 409 : 400) : json({ ok: true });
}

export const PUT = handle;
export const POST = handle;
