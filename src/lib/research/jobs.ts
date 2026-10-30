import "server-only";
import { withUser } from "@/lib/db";
import { demoModeAllowed, env } from "@/lib/env";
import { logActivity, trackEvent } from "@/lib/data/activity";
import { loadBrief } from "@/lib/data/briefs";
import type { Ctx } from "@/lib/data/workspace";
import { assertCan } from "@/lib/permissions";
import { DEPTH_PROFILES } from "./deep/budget";
import type { Depth } from "./deep/types";
import { buildPlan } from "./engine";
import { closeRun, sweepStaleRuns } from "./lifecycle";
import { platformHeadroomUsd } from "./spend";

export type JobOptions = {
  projectId: string;
  mode: "live" | "demo";
  idempotencyKey: string;
  /** null = legacy Qloo-only run; otherwise multi-source research at this depth. */
  depth: Depth | null;
  question?: string | null;
  freshness?: "month" | "year" | "any";
  parentRunId?: string | null;
};
export type JobResult = { ok: true; runId: string; reused: boolean } | { ok: false; error: string; status?: number; activeRunId?: string };

/**
 * Creates (or reuses) a research job. Shared by the server action and the REST API so both
 * enforce the same permission, idempotency, rate-limit and budget rules.
 */
export async function createResearchJob(ctx: Ctx, o: JobOptions): Promise<JobResult> {
  assertCan(ctx.workspace.role, "research.run");
  if (o.mode === "demo" && !demoModeAllowed()) return { ok: false, error: "Demonstration mode is disabled on this deployment.", status: 403 };
  if (o.mode === "live" && !o.depth && !env().QLOO_API_KEY) return { ok: false, error: "Qloo is not configured on this server. Choose a research depth to use web and document sources instead.", status: 409 };
  const ws = ctx.workspace.workspaceId;
  // Live runs spend the server's provider keys: refuse once the platform-wide monthly ceiling is reached.
  if (o.mode === "live") {
    const platform = await platformHeadroomUsd();
    if (platform !== null && platform < (o.depth ? DEPTH_PROFILES[o.depth].synthesisReserveUsd : 0.01)) {
      return { ok: false, error: "Live research is paused: this server has reached its monthly research spending limit. Demo runs still work.", status: 402 };
    }
  }
  return withUser(ctx.user.id, async (tx) => {
    // One job creation at a time per workspace, so the active-run, daily-limit and budget checks
    // below can't be raced by two tabs or API calls.
    await tx`select pg_advisory_xact_lock(hashtext(${`research-job:${ws}`}))`;
    const brief = await loadBrief(tx, o.projectId);
    if (!brief) return { ok: false as const, error: "Project not found.", status: 404 };
    // Idempotency: double-clicks and retries of the same request reuse the job.
    const [same] = await tx`select id from research_runs where project_id = ${o.projectId} and idempotency_key = ${o.idempotencyKey}`;
    if (same) return { ok: true as const, runId: same.id as string, reused: true };
    // Close runs whose worker is gone first, so a dead run can't block new work.
    await sweepStaleRuns(tx, o.projectId);
    const [active] = await tx`select id from research_runs where project_id = ${o.projectId} and status in ('queued', 'running') limit 1`;
    // A different request while a run is active is refused, not silently merged into that run.
    if (active) return { ok: false as const, error: "A research run is already in progress for this campaign. Wait for it to finish or cancel it first.", status: 409, activeRunId: active.id as string };

    if (o.mode === "live") {
      const [{ my_email_confirmed: confirmed }] = await tx`select public.my_email_confirmed()`;
      if (!confirmed) return { ok: false as const, error: "Confirm your email address before running live research. Demo runs work without it.", status: 403 };
    }
    const [{ research_runs_today: today }] = await tx`select research_runs_today(${ws})`;
    const [w] = await tx`select research_runs_daily_limit, research_runs_per_user_daily, research_budget_usd_monthly from workspaces where id = ${ws}`;
    if (today >= w.research_runs_daily_limit) return { ok: false as const, error: `This workspace has reached its limit of ${w.research_runs_daily_limit} research runs in 24 hours.`, status: 429 };
    const [{ research_runs_today_by_user: mine }] = await tx`select research_runs_today_by_user(${ws}, ${ctx.user.id})`;
    if (mine >= w.research_runs_per_user_daily) return { ok: false as const, error: `You have reached your limit of ${w.research_runs_per_user_daily} research runs in 24 hours.`, status: 429 };
    if (o.depth && o.mode === "live") {
      const [{ research_spend_this_month: spent }] = await tx`select research_spend_this_month(${ws})`;
      const remaining = Number(w.research_budget_usd_monthly) - Number(spent);
      if (remaining < DEPTH_PROFILES[o.depth].synthesisReserveUsd) {
        return { ok: false as const, error: `This workspace's monthly research budget ($${Number(w.research_budget_usd_monthly).toFixed(2)}) is used up. An owner can raise it.`, status: 402 };
      }
    }

    const [qs] = await tx`select enabled, config from integration_settings where workspace_id = ${ws} and provider = 'qloo'`;
    const qlooOff = Boolean(qs && !qs.enabled);
    if (o.mode === "live" && !o.depth && qlooOff) return { ok: false as const, error: "Qloo research is disabled for this workspace in Settings → Integrations.", status: 409 };
    const defaultLocation = typeof qs?.config?.defaultLocation === "string" ? (qs.config.defaultLocation as string) : null;
    const plan = buildPlan(brief.market || !defaultLocation ? brief : { ...brief, market: defaultLocation });
    if (!brief.market && defaultLocation) plan.notes.push(`No market in the brief: used the workspace default location “${defaultLocation}”.`);
    const fullPlan = { ...plan, skipQloo: qlooOff || (o.mode === "live" && !env().QLOO_API_KEY) };
    const question = o.question?.trim() || null;
    const [run] = await tx`
      insert into research_runs (project_id, workspace_id, mode, provider, question, plan, brief_revision, idempotency_key, started_by, depth, research_question, budget, stage, parent_run_id)
      values (${o.projectId}, ${ws}, ${o.mode}, ${o.mode === "demo" ? "qloo-demo-fixture" : o.depth ? "multi-source" : "qloo"}, ${question ?? plan.question}, ${tx.json(fullPlan as never)},
        ${brief.revision}, ${o.idempotencyKey}, ${ctx.user.id}, ${o.depth}, ${question}, ${tx.json({ freshness: o.freshness ?? "year" } as never)}, 'queued', ${o.parentRunId ?? null})
      on conflict (project_id, idempotency_key) do nothing returning id`;
    if (!run) {
      const [again] = await tx`select id from research_runs where project_id = ${o.projectId} and idempotency_key = ${o.idempotencyKey}`;
      return { ok: true as const, runId: again.id as string, reused: true };
    }
    const label = o.depth ? `${o.depth[0].toUpperCase()}${o.depth.slice(1)} research` : o.mode === "demo" ? "Demo research" : "Cultural research";
    await tx`insert into background_tasks (workspace_id, project_id, kind, label, status, ref_id, result_href, created_by)
      values (${ws}, ${o.projectId}, 'research_run', ${`${label}${o.mode === "demo" ? " (demo)" : ""} · ${brief.name}`}, 'queued', ${run.id}, ${`/projects/${o.projectId}/research?run=${run.id}`}, ${ctx.user.id})`;
    await trackEvent(tx, { workspaceId: ws, userId: ctx.user.id, event: "research_run_started", projectId: o.projectId, metadata: { mode: o.mode, depth: o.depth ?? "affinity" } });
    await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId: o.projectId, verb: "started", objectType: "research_run", objectId: run.id,
      summary: `started ${o.mode === "demo" ? "a demonstration" : "a live"} ${o.depth ? `${o.depth} multi-source` : ""} research run`.replace(/\s+/g, " ") });
    return { ok: true as const, runId: run.id as string, reused: false };
  });
}

/** Requests cancellation; the orchestrator stops at its next checkpoint and keeps partial results. */
export async function cancelResearchJob(ctx: Ctx, runId: string): Promise<{ ok: boolean; error?: string }> {
  assertCan(ctx.workspace.role, "research.run");
  return withUser(ctx.user.id, async (tx) => {
    const [r] = await tx`update research_runs set cancel_requested_at = now() where id = ${runId} and status in ('queued', 'running') and cancel_requested_at is null returning status`;
    if (!r) return { ok: false, error: "This research job is not running." };
    // A run that hasn't started yet is closed straight away; a running one stops at its next checkpoint.
    if (r.status === "queued") await closeRun(tx, runId, "cancelled");
    return { ok: true };
  });
}
