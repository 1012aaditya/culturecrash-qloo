import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { isUuid } from "@/lib/data/projects";
import { getCtx, type Ctx } from "@/lib/data/workspace";
import { ForbiddenError } from "@/lib/permissions";
import { sweepStaleRuns } from "./lifecycle";

/** Structured, non-sensitive API errors. */
export const apiError = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
export const apiOk = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Authenticated workspace context for API routes (same session and membership checks as the app). */
export async function apiCtx(): Promise<Ctx | NextResponse> {
  if (!(await getSessionUser())) return apiError(401, "unauthorized", "Sign in to use the research API.");
  try {
    return await getCtx();
  } catch {
    return apiError(403, "forbidden", "No workspace access.");
  }
}

/** Loads a job the caller can see (RLS); 404 for anything else, including other workspaces' jobs. */
export async function loadJob(ctx: Ctx, jobId: string) {
  if (!isUuid(jobId)) return null;
  const [row] = await withUser(ctx.user.id, async (tx) => {
    const [r] = await tx`select project_id from research_runs where id = ${jobId}`;
    if (r) await sweepStaleRuns(tx, r.project_id as string);
    return tx`select * from research_runs where id = ${jobId}`;
  });
  return row ?? null;
}

export function handleForbidden(e: unknown) {
  if (e instanceof ForbiddenError) return apiError(403, "forbidden", e.message);
  throw e;
}

export function jobSummary(r: Record<string, unknown>, counts?: { documents: number; claims: number }) {
  return {
    id: r.id, projectId: r.project_id, status: r.status, stage: r.stage, depth: r.depth, mode: r.mode, question: r.research_question ?? r.question,
    createdAt: r.created_at, completedAt: r.completed_at, stopReason: r.stop_reason, error: r.error_message ? { code: r.error_code, message: r.error_message } : null,
    cancelRequested: r.cancel_requested_at != null, usage: r.usage, coverage: r.coverage, ...counts,
  };
}
