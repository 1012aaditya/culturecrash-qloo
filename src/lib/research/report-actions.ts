"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db";
import { logActivity } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import type { Report } from "./deep/synthesize";

type R = { ok: true; id: string; href: string } | { ok: false; error: string };

async function loadOpportunity(userId: string, projectId: string, runId: string, index: number) {
  const [run] = await withUser(userId, (tx) => tx`select report, mode from research_runs where id = ${runId} and project_id = ${projectId}`);
  const report = run?.report as Report | null;
  const o = report?.opportunities?.[index];
  return o ? { o, report: report!, isDemo: run.mode === "demo" } : null;
}

/** Saves a report opportunity to the Opportunities board, keeping its Qloo and web evidence links. */
export async function saveReportOpportunityAction(projectId: string, runId: string, index: number): Promise<R> {
  if (!isUuid(projectId) || !isUuid(runId) || !Number.isInteger(index) || index < 0) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "strategy.edit");
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  const found = await loadOpportunity(ctx.user.id, projectId, runId, index);
  if (!found) return { ok: false, error: "Opportunity not found in this report." };
  const { o, report, isDemo } = found;
  const ws = ctx.workspace.workspaceId;
  const id = await withUser(ctx.user.id, async (tx) => {
    const evidence = [...o.qlooEvidenceIds, ...o.supportingClaimIds].filter(isUuid);
    const [dup] = await tx`select id from opportunities where project_id = ${projectId} and run_id = ${runId} and title = ${o.title}`;
    if (dup) return dup.id as string;
    const entityIds = evidence.length ? (await tx`select distinct unnest(entity_ids) as id from evidence_items where id = any(${o.qlooEvidenceIds.filter(isUuid)}::uuid[])`).map((r) => r.id as string) : [];
    const [row] = await tx`
      insert into opportunities (project_id, workspace_id, run_id, title, description, why_it_matters, unknowns, strategic_use, validation_step, status, evidence_ids, entity_ids, generator, is_demo)
      values (${projectId}, ${ws}, ${runId}, ${o.title.slice(0, 200)}, ${o.thesis}, ${o.audienceRelevance || null}, ${[...o.evidenceGaps, ...o.assumptions].join("\n") || null},
        ${[o.creativeDirection, o.brandFit ? `Brand fit: ${o.brandFit}` : ""].filter(Boolean).join("\n\n") || null}, ${o.validation || null}, 'saved', ${evidence}, ${entityIds}, ${report.generator}, ${isDemo})
      returning id`;
    await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "saved", objectType: "opportunity", objectId: row.id, summary: `saved “${o.title.slice(0, 80)}” from a research report` });
    return row.id as string;
  });
  revalidatePath(`/projects/${projectId}/opportunities`);
  return { ok: true, id, href: `/projects/${projectId}/opportunities#opp-${id}` };
}

/** Drafts an experiment (hypothesis, variants, metrics) from a report opportunity. Nothing runs until the team plans it. */
export async function createReportExperimentAction(projectId: string, runId: string, index: number): Promise<R> {
  if (!isUuid(projectId) || !isUuid(runId) || !Number.isInteger(index) || index < 0) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "experiment.edit");
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  const found = await loadOpportunity(ctx.user.id, projectId, runId, index);
  if (!found) return { ok: false, error: "Opportunity not found in this report." };
  const { o } = found;
  const ws = ctx.workspace.workspaceId;
  const [primary, ...secondary] = o.successMetrics.length ? o.successMetrics : ["Click-through rate vs control"];
  const id = await withUser(ctx.user.id, async (tx) => {
    const [x] = await tx`insert into experiments (project_id, workspace_id, name, hypothesis, rationale, audience, method, primary_metric, secondary_metrics, timeline, decision_threshold, status, created_by)
      values (${projectId}, ${ws}, ${`Test: ${o.title}`.slice(0, 200)}, ${o.thesis}, ${[o.audienceRelevance, o.creativeDirection].filter(Boolean).join("\n\n") || null}, ${o.audience || null},
        ${o.validation || "A/B test against the current control"}, ${primary.slice(0, 200)}, ${secondary.map((m) => m.slice(0, 200))}, ${"2 weeks (adjust to reach a meaningful sample)"},
        ${"Adopt only if the primary metric beats control by a margin agreed before launch; otherwise record the learning."}, 'draft', ${ctx.user.id}) returning id`;
    await tx`insert into experiment_variants (experiment_id, workspace_id, label, description, is_control) values
      (${x.id}, ${ws}, 'Control', 'Current creative and messaging', true),
      (${x.id}, ${ws}, 'Variant A', ${o.creativeDirection.slice(0, 1000) || o.title}, false)`;
    await tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim_type, claim, source_provider, raw_metadata, review_status, created_by, limitations)
      values (${projectId}, ${ws}, 'hypothesis', 'strategic_hypothesis', ${o.thesis}, 'team', ${tx.json({ experiment_id: x.id, research_run_id: runId, qloo_evidence_ids: o.qlooEvidenceIds })}, 'needs_validation', ${ctx.user.id},
        'Untested hypothesis. Not evidence until a result is recorded.')`;
    await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "created", objectType: "experiment", objectId: x.id, summary: `drafted an experiment from “${o.title.slice(0, 80)}”` });
    return x.id as string;
  });
  revalidatePath(`/projects/${projectId}/experiments`);
  return { ok: true, id, href: `/projects/${projectId}/experiments/${id}` };
}
