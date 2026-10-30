import { claim, isWorker, json, readJson, WORKER_ID } from "@/lib/concepts/worker";

export const dynamic = "force-dynamic";

/** Gives the PC the oldest queued job: { job: { id, workflow, params } } or { job: null }. */
export async function POST(req: Request) {
  if (!isWorker(req)) return json({ error: "unauthorized" }, 401);
  const workerId = String((await readJson(req)).worker_id ?? "");
  if (!WORKER_ID.test(workerId)) return json({ error: "bad worker_id" }, 400);
  return json({ job: await claim(workerId) });
}
