"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { demoModeAllowed, env } from "@/lib/env";
import { logActivity, trackEvent } from "@/lib/data/activity";
import { loadBrief } from "@/lib/data/briefs";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { buildPlan, executeRun } from "./engine";

const input = z.object({ projectId: z.string().refine(isUuid), mode: z.enum(["live", "demo"]), idempotencyKey: z.string().min(8).max(80) });

export type StartResult = { ok: true; runId: string; reused: boolean } | { ok: false; error: string };

export async function startResearchAction(raw: z.input<typeof input>): Promise<StartResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { projectId, mode, idempotencyKey } = parsed.data;
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "research.run");
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  if (mode === "demo" && !demoModeAllowed()) return { ok: false, error: "Demonstration mode is disabled on this deployment." };
  if (mode === "live" && !env().QLOO_API_KEY) return { ok: false, error: "Qloo is not configured on this server. An admin can see what is missing in Settings → Integrations." };

  const ws = ctx.workspace.workspaceId;
  const result = await withUser(ctx.user.id, async (tx) => {
    const brief = await loadBrief(tx, projectId);
    if (!brief) return { ok: false as const, error: "Project not found." };
    // Idempotency: double-clicks and retries of the same request reuse the run.
    const [same] = await tx`select id from research_runs where project_id = ${projectId} and idempotency_key = ${idempotencyKey}`;
    if (same) return { ok: true as const, runId: same.id as string, reused: true };
    const [active] = await tx`select id from research_runs where project_id = ${projectId} and status in ('queued','running') and created_at > now() - interval '15 minutes' limit 1`;
    if (active) return { ok: true as const, runId: active.id as string, reused: true };
    const [{ research_runs_today: today }] = await tx`select research_runs_today(${ws})`;
    const [{ research_runs_daily_limit: limit }] = await tx`select research_runs_daily_limit from workspaces where id = ${ws}`;
    if (today >= limit) return { ok: false as const, error: `This workspace has reached its limit of ${limit} research runs in 24 hours.` };
    const plan = buildPlan(brief);
    const [run] = await tx`
      insert into research_runs (project_id, workspace_id, mode, provider, question, plan, brief_revision, idempotency_key, started_by)
      values (${projectId}, ${ws}, ${mode}, ${mode === "demo" ? "qloo-demo-fixture" : "qloo"}, ${plan.question}, ${tx.json(plan as never)}, ${brief.revision}, ${idempotencyKey}, ${ctx.user.id})
      on conflict (project_id, idempotency_key) do nothing returning id`;
    if (!run) {
      const [again] = await tx`select id from research_runs where project_id = ${projectId} and idempotency_key = ${idempotencyKey}`;
      return { ok: true as const, runId: again.id as string, reused: true };
    }
    await tx`insert into background_tasks (workspace_id, project_id, kind, label, status, ref_id, result_href, created_by)
      values (${ws}, ${projectId}, 'research_run', ${`${mode === "demo" ? "Demo research" : "Cultural research"} · ${brief.name}`}, 'queued', ${run.id}, ${`/projects/${projectId}/research?run=${run.id}`}, ${ctx.user.id})`;
    await trackEvent(tx, { workspaceId: ws, userId: ctx.user.id, event: "research_run_started", projectId, metadata: { mode } });
    await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "started", objectType: "research_run", objectId: run.id, summary: `started ${mode === "demo" ? "a demonstration" : "a live"} research run` });
    return { ok: true as const, runId: run.id as string, reused: false };
  });
  if (result.ok && !result.reused) {
    const userId = ctx.user.id;
    after(() => executeRun(userId, result.runId));
  }
  revalidatePath(`/projects/${projectId}/research`);
  return result;
}
