import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runWeeklyDigest } from "@/lib/jobs/digest";
import { runRetention } from "@/lib/jobs/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOBS = { retention: runRetention, "weekly-digest": runWeeklyDigest } as const;

function authorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request, ctx: RouteContext<"/api/cron/[job]">) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await ctx.params;
  const run = JOBS[job as keyof typeof JOBS];
  if (!run) return Response.json({ error: "unknown job" }, { status: 404 });
  try {
    return Response.json({ job, ok: true, result: await run() });
  } catch (e) {
    console.error(`cron ${job} failed`, e instanceof Error ? e.message : e);
    return Response.json({ job, ok: false }, { status: 500 });
  }
}
