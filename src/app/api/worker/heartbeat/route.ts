import { heartbeat, isWorker, json, readJson } from "@/lib/concepts/worker";

export const dynamic = "force-dynamic";

/** The GPU PC reports it is alive (every few seconds), and whether ComfyUI is up. */
export async function POST(req: Request) {
  if (!isWorker(req)) return json({ error: "unauthorized" }, 401);
  return (await heartbeat(await readJson(req))) ? json({ ok: true }) : json({ error: "bad worker_id" }, 400);
}
