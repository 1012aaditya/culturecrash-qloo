"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser, type Tx } from "@/lib/db";
import { logActivity, trackEvent } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { importResults } from "./csv";

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
    const locked = await withUser(ctx.user.id, async (tx) => {
      const [cur] = await tx`select design_locked_at, hypothesis, method, primary_metric, decision_threshold from experiments where id = ${experimentId}`;
      if (!cur?.design_locked_at) return false;
      // Once results exist, changing what was being tested would let the result rewrite the question.
      return cur.hypothesis !== d.hypothesis || (cur.method ?? null) !== (d.method ?? null) || cur.primary_metric !== d.primaryMetric || (cur.decision_threshold ?? null) !== (d.decisionThreshold ?? null);
    });
    if (locked) return { ok: false, error: "The hypothesis, method, primary metric and decision threshold are locked because results have been recorded. Create a new experiment to test something different." };
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
  /** For rate metrics: how many of sampleSize converted. The value is then the rate. */
  successes: z.coerce.number().int().min(0).max(1e9).nullable().default(null),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  notes: s(2000),
});

type ResultInput = z.output<typeof resultSchema>;

/** Stores one observed result, its evidence row, and locks the experiment's design. Returns false if the variant isn't in this experiment. */
async function insertResult(tx: Tx, ctx: Awaited<ReturnType<typeof guard>>, x: { id: string; project_id: string; name: string }, d: ResultInput, source = "manual entry") {
  const ws = ctx.workspace.workspaceId;
  const [variant] = d.variantId ? await tx`select label from experiment_variants where id = ${d.variantId} and experiment_id = ${x.id}` : [];
  if (d.variantId && !variant) return false;
  const value = d.successes !== null && d.sampleSize ? d.successes / d.sampleSize : d.value;
  await tx`insert into experiment_results (experiment_id, workspace_id, variant_id, metric, value, sample_size, successes, observed_on, notes, recorded_by)
    values (${x.id}, ${ws}, ${d.variantId}, ${d.metric}, ${value}, ${d.sampleSize}, ${d.successes}, ${d.observedOn}, ${d.notes ?? null}, ${ctx.user.id})`;
  const measured = d.successes !== null && d.sampleSize ? `${d.successes} of ${d.sampleSize} (${((d.successes / d.sampleSize) * 100).toFixed(2)}%)` : `${value}${d.sampleSize !== null ? ` (n = ${d.sampleSize})` : ""}`;
  // normalized_value stays null: a raw count or rate isn't on the 0–1 evidence scale and must not outrank observations.
  await tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim, source_provider, source_timestamp, retrieved_at, normalized_value, raw_metadata, review_status, created_by, limitations)
    values (${x.project_id}, ${ws}, 'experiment_result', ${`Experiment “${x.name}”${variant ? `, variant “${variant.label}”` : ""}: ${d.metric} = ${measured}.`},
      ${source}, ${d.observedOn}, now(), null, ${tx.json({ experiment_id: x.id, variant_id: d.variantId, value, successes: d.successes, exposures: d.sampleSize })}, 'unreviewed', ${ctx.user.id},
      'Recorded result. Causal conclusions depend on the experiment design.')`;
  await tx`update experiments set status = case when status in ('draft','planned') then 'running' else status end, design_locked_at = coalesce(design_locked_at, now()) where id = ${x.id}`;
  return true;
}

export async function recordResultAction(experimentId: string, raw: z.input<typeof resultSchema>): Promise<R> {
  if (!isUuid(experimentId)) return { ok: false, error: "Invalid experiment." };
  const r = resultSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: "Enter a metric and a numeric value.", fieldErrors: issues(r.error) };
  const d = r.data;
  if (d.successes !== null && (d.sampleSize === null || d.successes > d.sampleSize)) return { ok: false, error: "Successes need an exposure count, and can't be more than it." };
  try {
    const ctx = await guard();
    const ws = ctx.workspace.workspaceId;
    const projectId = await withUser(ctx.user.id, async (tx) => {
      const [x] = await tx`select id, project_id, name from experiments where id = ${experimentId}`;
      if (!x || !(await insertResult(tx, ctx, x as never, d))) return null;
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

/** Imports successes and exposures per variant from an ad-platform CSV export (Meta, Google, TikTok or similar). */
export async function importResultsCsvAction(experimentId: string, csv: string): Promise<R<{ imported: number; unmatched: string[] }>> {
  if (!isUuid(experimentId) || !csv.trim() || csv.length > 2_000_000) return { ok: false, error: "Choose a CSV file under 2 MB." };
  try {
    const ctx = await guard();
    const ws = ctx.workspace.workspaceId;
    const out = await withUser(ctx.user.id, async (tx) => {
      const [x] = await tx`select id, project_id, name, primary_metric from experiments where id = ${experimentId}`;
      if (!x) return { error: "Experiment not found." };
      const variants = (await tx`select id, label from experiment_variants where experiment_id = ${experimentId}`).map((v) => ({ id: v.id as string, label: v.label as string }));
      const parsed = importResults(csv, variants);
      if ("error" in parsed) return parsed;
      if (!parsed.rows.length) return { error: `No row matched a variant name (${variants.map((v) => v.label).join(", ")}). Rename the variants to match the export, or the ad sets to match the variants.` };
      const today = new Date().toISOString().slice(0, 10);
      for (const row of parsed.rows) {
        await insertResult(tx, ctx, x as never, {
          variantId: row.variant, metric: x.primary_metric, value: row.successes / Math.max(1, row.exposures), sampleSize: row.exposures, successes: row.successes,
          observedOn: today, notes: `Imported from CSV: “${parsed.columns.successes}” out of “${parsed.columns.exposures}”.`,
        }, "csv import");
      }
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId: x.project_id, verb: "recorded", objectType: "experiment", objectId: experimentId, summary: `imported ${parsed.rows.length} result(s) for “${x.name}” from a CSV export` });
      return { projectId: x.project_id as string, imported: parsed.rows.length, unmatched: parsed.unmatched };
    });
    if ("error" in out) return { ok: false, error: out.error as string };
    revalidatePath(`/projects/${out.projectId}/experiments/${experimentId}`);
    return { ok: true, data: { imported: out.imported, unmatched: out.unmatched } };
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
