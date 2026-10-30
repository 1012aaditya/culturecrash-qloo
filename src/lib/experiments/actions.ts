"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { logActivity, trackEvent } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const uuid = z.string().refine(isUuid, "invalid id");
const s = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();

const experimentFields = z.object({
  name: z.string().trim().min(1, "Name the experiment").max(200),
  hypothesis: z.string().trim().min(10, "State the hypothesis in a full sentence").max(2000),
  rationale: s(2000),
  directionId: uuid.nullable().optional(),
  audience: s(1000),
  method: s(1000),
  primaryMetric: z.string().trim().min(2, "Choose a primary metric").max(200),
  secondaryMetrics: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  budgetAssumptions: s(1000),
  timeline: s(300),
  decisionThreshold: s(1000),
  status: z.enum(["draft", "planned", "running", "completed", "cancelled"]).default("draft"),
});

const variantsSchema = z.array(z.object({ label: z.string().trim().min(1).max(120), description: s(1000), isControl: z.boolean().default(false) })).max(8);

async function guard() {
  const ctx = await getCtx();
  assertCan(ctx.workspace.role, "experiment.edit");
  return ctx;
}
function err(e: unknown): { ok: false; error: string } {
  if (e instanceof ForbiddenError) return { ok: false, error: e.message };
  console.error("[experiments]", e instanceof Error ? e.message : e);
  return { ok: false, error: "The change could not be saved." };
}
const issues = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message]));

export async function createExperimentAction(projectId: string, raw: z.input<typeof experimentFields>, variantsRaw: z.input<typeof variantsSchema>): Promise<R<{ id: string }>> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  const f = experimentFields.safeParse(raw);
  if (!f.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: issues(f.error) };
  const v = variantsSchema.safeParse(variantsRaw);
  if (!v.success) return { ok: false, error: "Each variant needs a label." };
  try {
    const ctx = await guard();
    const ws = ctx.workspace.workspaceId;
    const d = f.data;
    const id = await withUser(ctx.user.id, async (tx) => {
      const [x] = await tx`insert into experiments (project_id, workspace_id, direction_id, name, hypothesis, rationale, audience, method, primary_metric, secondary_metrics,
          budget_assumptions, timeline, decision_threshold, status, created_by)
        values (${projectId}, ${ws}, ${d.directionId ?? null}, ${d.name}, ${d.hypothesis}, ${d.rationale ?? null}, ${d.audience ?? null}, ${d.method ?? null}, ${d.primaryMetric},
          ${d.secondaryMetrics}, ${d.budgetAssumptions ?? null}, ${d.timeline ?? null}, ${d.decisionThreshold ?? null}, ${d.status}, ${ctx.user.id}) returning id`;
      for (const variant of v.data) {
        await tx`insert into experiment_variants (experiment_id, workspace_id, label, description, is_control) values (${x.id}, ${ws}, ${variant.label}, ${variant.description ?? null}, ${variant.isControl})`;
      }
      await tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim, source_provider, raw_metadata, review_status, created_by, limitations)
        values (${projectId}, ${ws}, 'hypothesis', ${d.hypothesis}, 'team', ${tx.json({ experiment_id: x.id })}, 'needs_validation', ${ctx.user.id}, 'Untested hypothesis. Not evidence until a result is recorded.')`;
      await trackEvent(tx, { workspaceId: ws, userId: ctx.user.id, event: "experiment_created", projectId });
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "created", objectType: "experiment", objectId: x.id, summary: `planned experiment “${d.name}”` });
      return x.id as string;
    });
    revalidatePath(`/projects/${projectId}/experiments`);
    return { ok: true, data: { id } };
  } catch (e) {
    return err(e);
  }
}

export async function updateExperimentAction(experimentId: string, raw: z.input<typeof experimentFields>): Promise<R> {
  if (!isUuid(experimentId)) return { ok: false, error: "Invalid experiment." };
  const f = experimentFields.safeParse(raw);
  if (!f.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: issues(f.error) };
  try {
    const ctx = await guard();
    const d = f.data;
    const projectId = await withUser(ctx.user.id, async (tx) => {
      const [x] = await tx`update experiments set name = ${d.name}, hypothesis = ${d.hypothesis}, rationale = ${d.rationale ?? null}, direction_id = ${d.directionId ?? null},
        audience = ${d.audience ?? null}, method = ${d.method ?? null}, primary_metric = ${d.primaryMetric}, secondary_metrics = ${d.secondaryMetrics},
        budget_assumptions = ${d.budgetAssumptions ?? null}, timeline = ${d.timeline ?? null}, decision_threshold = ${d.decisionThreshold ?? null}, status = ${d.status}
        where id = ${experimentId} returning project_id`;
      if (x) await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId: x.project_id, verb: "updated", objectType: "experiment", objectId: experimentId, summary: `updated experiment “${d.name}” (${d.status})` });
      return x?.project_id as string | undefined;
    });
    if (!projectId) return { ok: false, error: "Experiment not found." };
    revalidatePath(`/projects/${projectId}/experiments`, "layout");
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

export async function addVariantAction(experimentId: string, label: string, description: string, isControl: boolean): Promise<R> {
  const v = variantsSchema.element.safeParse({ label, description, isControl });
  if (!isUuid(experimentId) || !v.success) return { ok: false, error: "Give the variant a label." };
  try {
    const ctx = await guard();
    const projectId = await withUser(ctx.user.id, async (tx) => {
      const [x] = await tx`select project_id from experiments where id = ${experimentId}`;
      if (!x) return null;
      await tx`insert into experiment_variants (experiment_id, workspace_id, label, description, is_control) values (${experimentId}, ${ctx.workspace.workspaceId}, ${v.data.label}, ${v.data.description ?? null}, ${v.data.isControl})`;
      return x.project_id as string;
    });
    if (!projectId) return { ok: false, error: "Experiment not found." };
    revalidatePath(`/projects/${projectId}/experiments/${experimentId}`);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

const resultSchema = z.object({
  variantId: uuid.nullable(),
  metric: z.string().trim().min(1).max(200),
  value: z.coerce.number().finite(),
  sampleSize: z.coerce.number().int().min(0).max(1e9).nullable(),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  notes: s(2000),
});

export async function recordResultAction(experimentId: string, raw: z.input<typeof resultSchema>): Promise<R> {
  if (!isUuid(experimentId)) return { ok: false, error: "Invalid experiment." };
  const r = resultSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: "Enter a metric and a numeric value.", fieldErrors: issues(r.error) };
  try {
    const ctx = await guard();
    const ws = ctx.workspace.workspaceId;
    const d = r.data;
    const projectId = await withUser(ctx.user.id, async (tx) => {
      const [x] = await tx`select project_id, name from experiments where id = ${experimentId}`;
      if (!x) return null;
      const [variant] = d.variantId ? await tx`select label from experiment_variants where id = ${d.variantId} and experiment_id = ${experimentId}` : [];
      if (d.variantId && !variant) return null;
      await tx`insert into experiment_results (experiment_id, workspace_id, variant_id, metric, value, sample_size, observed_on, notes, recorded_by)
        values (${experimentId}, ${ws}, ${d.variantId}, ${d.metric}, ${d.value}, ${d.sampleSize}, ${d.observedOn}, ${d.notes ?? null}, ${ctx.user.id})`;
      await tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim, source_provider, source_timestamp, retrieved_at, normalized_value, raw_metadata, review_status, created_by, limitations)
        values (${x.project_id}, ${ws}, 'experiment_result',
          ${`Experiment “${x.name}”${variant ? `, variant “${variant.label}”` : ""}: ${d.metric} = ${d.value}${d.sampleSize !== null ? ` (n = ${d.sampleSize})` : ""}.`},
          'manual entry', ${d.observedOn}, now(), ${d.value}, ${tx.json({ experiment_id: experimentId, variant_id: d.variantId })}, 'unreviewed', ${ctx.user.id},
          'Manually recorded result. Causal conclusions depend on the experiment design.')`;
      await tx`update experiments set status = case when status in ('draft','planned') then 'running' else status end where id = ${experimentId}`;
      await trackEvent(tx, { workspaceId: ws, userId: ctx.user.id, event: "experiment_result_recorded", projectId: x.project_id });
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId: x.project_id, verb: "recorded", objectType: "experiment", objectId: experimentId, summary: `recorded a ${d.metric} result for “${x.name}”` });
      return x.project_id as string;
    });
    if (!projectId) return { ok: false, error: "Experiment or variant not found." };
    revalidatePath(`/projects/${projectId}/experiments/${experimentId}`);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

export async function saveInterpretationAction(experimentId: string, interpretation: string, nextAction: string, complete: boolean): Promise<R> {
  if (!isUuid(experimentId) || interpretation.length > 4000 || nextAction.length > 2000) return { ok: false, error: "Invalid input." };
  try {
    const ctx = await guard();
    const projectId = await withUser(ctx.user.id, async (tx) => {
      const [x] = await tx`update experiments set interpretation = ${interpretation.trim() || null}, next_action = ${nextAction.trim() || null},
        status = case when ${complete} then 'completed'::experiment_status else status end where id = ${experimentId} returning project_id`;
      return x?.project_id as string | undefined;
    });
    if (!projectId) return { ok: false, error: "Experiment not found." };
    revalidatePath(`/projects/${projectId}/experiments/${experimentId}`);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

export async function deleteExperimentAction(experimentId: string): Promise<R> {
  if (!isUuid(experimentId)) return { ok: false, error: "Invalid experiment." };
  try {
    const ctx = await getCtx();
    assertCan(ctx.workspace.role, "data.delete");
    const projectId = await withUser(ctx.user.id, async (tx) => {
      const [x] = await tx`delete from experiments where id = ${experimentId} returning project_id`;
      // Its hypothesis and recorded results were evidence about a test that no longer exists: remove them
      // too, so they can't keep appearing in reports or be cited (they link back only through raw_metadata).
      if (x) await tx`delete from evidence_items where project_id = ${x.project_id} and raw_metadata->>'experiment_id' = ${experimentId}
        and evidence_type in ('hypothesis', 'experiment_result')`;
      return x?.project_id as string | undefined;
    });
    if (!projectId) return { ok: false, error: "Experiment not found or you lack permission." };
    revalidatePath(`/projects/${projectId}/experiments`);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}
