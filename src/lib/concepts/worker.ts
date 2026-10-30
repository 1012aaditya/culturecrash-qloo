import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { privilegedSql } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Website side of the GPU worker protocol. The PC polls these endpoints with `Authorization: Bearer
 * CC_WORKER_TOKEN`; everything here uses the privileged connection, so every query is scoped by job id
 * and never by anything else the worker sends.
 */

/** Vercel rejects request bodies over 4.5 MB; a 1024² PNG is usually 1–2 MB. */
export const MAX_RESULT_BYTES = 4 * 1024 * 1024;
/** A running job whose PC went quiet this long is handed out again (3 attempts in all). */
const STALE_MINUTES = 10;
/** Queued jobs nobody picked up in this long fail, so the board stops waiting for a PC that is off. */
const QUEUE_TIMEOUT_MINUTES = 60;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function token() {
  return env().CC_WORKER_TOKEN ?? "";
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isWorker(req: Request): boolean {
  const t = token();
  return Boolean(t) && same((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), t);
}

/** Per-job upload key, so the result URL works without the worker adding its token to the upload. */
export function uploadKey(jobId: string) {
  return createHmac("sha256", token()).update(`concept-upload:${jobId}`).digest("hex");
}
export function validUploadKey(jobId: string, key: string | null) {
  return Boolean(token()) && Boolean(key) && same(key!, uploadKey(jobId));
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const WORKER_ID = /^[A-Za-z0-9._-]{1,64}$/;

export async function heartbeat(b: Record<string, unknown>) {
  const id = String(b.worker_id ?? "");
  if (!WORKER_ID.test(id)) return false;
  const currentJob = typeof b.current_job === "string" && UUID.test(b.current_job) ? b.current_job : null;
  const g = b.gpu && typeof b.gpu === "object" ? (b.gpu as Record<string, unknown>) : null;
  // Only the two fields the status line shows; the PC can send more.
  const gpu = g ? { name: typeof g.name === "string" ? g.name.slice(0, 80) : null, vram_total_mb: Number(g.vram_total_mb) || null } : null;
  const sql = privilegedSql();
  await sql`insert into creative_workers (id, state, current_job, comfyui, gpu, last_seen)
    values (${id}, ${String(b.state ?? "idle").slice(0, 20)}, ${currentJob}, ${Boolean(b.comfyui)}, ${gpu ? sql.json(gpu) : null}, now())
    on conflict (id) do update set state = excluded.state, current_job = excluded.current_job, comfyui = excluded.comfyui, gpu = excluded.gpu, last_seen = now()`;
  return true;
}

/** Hands the oldest queued job to a worker, after requeueing abandoned ones and failing unclaimed ones. */
export async function claim(workerId: string) {
  return privilegedSql().begin(async (tx) => {
    await tx`update concept_jobs set
        status = case when attempts >= 3 then 'error' else 'queued' end,
        error = case when attempts >= 3 then 'The GPU PC stopped responding three times.' else error end,
        completed_at = case when attempts >= 3 then now() else null end,
        worker_id = null
      where status = 'running' and claimed_at < now() - make_interval(mins => ${STALE_MINUTES})`;
    await tx`update concept_jobs set status = 'error', error = 'The GPU PC did not pick this up within an hour.', completed_at = now()
      where status = 'queued' and created_at < now() - make_interval(mins => ${QUEUE_TIMEOUT_MINUTES})`;
    const [job] = await tx`update concept_jobs j set status = 'running', worker_id = ${workerId}, claimed_at = now(), attempts = j.attempts + 1
      where j.id = (select id from concept_jobs where status = 'queued' order by created_at for update skip locked limit 1)
      returning j.id, j.workflow, j.params`;
    return job ? { id: job.id as string, workflow: job.workflow as string, params: job.params as Record<string, unknown> } : null;
  });
}

/** running (progress), error (give up), or queued (hand back after a transient failure). Only while running. */
export async function reportStatus(jobId: string, status: unknown, error: unknown) {
  const msg = typeof error === "string" ? error.slice(0, 500) : null;
  const sql = privilegedSql();
  const rows =
    status === "running" ? await sql`update concept_jobs set claimed_at = now() where id = ${jobId} and status = 'running' returning id` :
    status === "error" ? await sql`update concept_jobs set status = 'error', error = ${msg ?? "Generation failed on the GPU PC."}, completed_at = now() where id = ${jobId} and status = 'running' returning id` :
    status === "queued" ? await sql`update concept_jobs set status = 'queued', worker_id = null, error = ${msg} where id = ${jobId} and status = 'running' returning id` :
    null;
  return rows === null ? null : rows.length;
}

export async function isRunning(jobId: string) {
  const [j] = await privilegedSql()`select 1 from concept_jobs where id = ${jobId} and status = 'running'`;
  return Boolean(j);
}

/** Stores the finished image on the job after checking it really is a reasonably sized image. */
export async function storeResult(jobId: string, buf: Buffer): Promise<string | null> {
  if (!buf.length || buf.length > MAX_RESULT_BYTES) return "Image must be between 1 byte and 4 MB.";
  try {
    const meta = await sharp(buf, { limitInputPixels: 16_000_000 }).metadata();
    if (!meta.width || !meta.height) return "Not a readable image.";
  } catch {
    return "Not a readable image.";
  }
  const rows = await privilegedSql()`update concept_jobs set image = ${buf} where id = ${jobId} and status = 'running' returning id`;
  return rows.length ? null : "Job is not running.";
}

/** Marks the job done once its image has arrived. Idempotent. */
export async function complete(jobId: string): Promise<"ok" | "duplicate" | "missing" | "unknown"> {
  const [j] = await privilegedSql()`select status, image is not null as has_image from concept_jobs where id = ${jobId}`;
  if (!j) return "unknown";
  if (j.status === "done") return "duplicate";
  if (!j.has_image) return "missing";
  await privilegedSql()`update concept_jobs set status = 'done', error = null, completed_at = now() where id = ${jobId} and status = 'running'`;
  return "ok";
}

/** Online = a heartbeat in the last 45 s. Exposes only state, never the PC's id. */
export async function engineStatus() {
  const [w] = await privilegedSql()`select state, comfyui, gpu, last_seen, last_seen > now() - interval '45 seconds' as online
    from creative_workers order by last_seen desc limit 1`;
  const gpu = w?.gpu as { name?: unknown } | null | undefined;
  return {
    online: Boolean(w?.online),
    ready: Boolean(w?.online && w.comfyui),
    gpu: typeof gpu?.name === "string" ? gpu.name.slice(0, 80) : null,
  };
}
