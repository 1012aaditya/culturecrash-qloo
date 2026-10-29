"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { ForbiddenError } from "@/lib/permissions";
import { executeRun } from "./engine";
import { cancelResearchJob, createResearchJob, type JobResult } from "./jobs";

const input = z.object({
  projectId: z.string().refine(isUuid),
  mode: z.enum(["live", "demo"]),
  idempotencyKey: z.string().min(8).max(80),
  depth: z.enum(["quick", "standard", "deep"]).nullable().default(null),
  question: z.string().trim().max(1000).nullable().default(null),
  freshness: z.enum(["month", "year", "any"]).default("year"),
});

export type StartResult = { ok: true; runId: string; reused: boolean } | { ok: false; error: string };

export async function startResearchAction(raw: z.input<typeof input>): Promise<StartResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  let result: JobResult;
  try {
    result = await createResearchJob(ctx, parsed.data);
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
  if (result.ok && !result.reused) {
    const userId = ctx.user.id;
    const runId = result.runId;
    after(() => executeRun(userId, runId));
  }
  revalidatePath(`/projects/${parsed.data.projectId}/research`);
  return result.ok ? result : { ok: false, error: result.error };
}

export async function cancelResearchAction(projectId: string, runId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(projectId) || !isUuid(runId)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    const r = await cancelResearchJob(ctx, runId);
    revalidatePath(`/projects/${projectId}/research`);
    return r;
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
