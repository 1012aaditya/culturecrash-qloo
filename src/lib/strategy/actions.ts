"use server";

import { llmEnabled, LLM_UNAVAILABLE } from "@/lib/ai/enabled";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateStructured, tag, TEMPLATE_GENERATOR, LLMError } from "@/lib/ai";
import { latestCompletedRun, readObservations } from "@/lib/ai/context";
import {
  comparisonSchema, creativeBriefSchema, CREATIVE_SECTIONS, directionSchema, opportunitiesSchema, sectionRevisionSchema, strategySchema,
  type ComparisonOutput, type CreativeBriefContent, type CreativeSectionKey, type DirectionContent,
} from "@/lib/ai/schemas";
import { templateComparison, templateCreativeBrief, templateOpportunities, templateStrategy, type BriefInput, type Observation } from "@/lib/ai/template";
import { withUser, type Tx } from "@/lib/db";
import { logActivity, trackEvent } from "@/lib/data/activity";
import { loadBrief } from "@/lib/data/briefs";
import { isUuid } from "@/lib/data/projects";
import { getCtx, type Ctx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError, type Permission } from "@/lib/permissions";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const uuid = z.string().refine(isUuid, "invalid id");

async function authorize(permission: Permission): Promise<Ctx | Result> {
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, permission);
    return ctx;
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
}
const isCtx = (v: Ctx | Result): v is Ctx => "user" in v;

function llmMessage(e: unknown) {
  return e instanceof LLMError ? e.message : "Generation failed unexpectedly. Nothing was saved.";
}

const briefJson = (b: BriefInput) =>
  JSON.stringify({ name: b.name, brand: b.brand, product: b.product, category: b.category, market: b.market, audience: b.audience, objective: b.objective, existingPositioning: b.existingPositioning, competitors: b.competitors, brandGuidelines: b.brandGuidelines?.slice(0, 1500), timeframe: b.timeframe, budgetRange: b.budgetRange });
const obsJson = (o: Observation[]) => JSON.stringify(o.map((x) => ({ id: x.id, entity: x.entityName, type: x.entityType, affinity: x.affinity, role: x.role })));

async function startTask(tx: Tx, ctx: Ctx, projectId: string, kind: "strategy_generation" | "creative_brief", label: string) {
  const [t] = await tx`insert into background_tasks (workspace_id, project_id, kind, label, status, created_by, started_at, attempts)
    values (${ctx.workspace.workspaceId}, ${projectId}, ${kind}, ${label}, 'running', ${ctx.user.id}, now(), 1) returning id`;
  return t.id as string;
}
async function finishTask(ctx: Ctx, id: string, status: "completed" | "failed", href: string | null, error?: string) {
  await withUser(ctx.user.id, (tx) => tx`update background_tasks set status = ${status}, finished_at = now(), result_href = ${href}, error_message = ${error ?? null} where id = ${id}`);
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------
export async function generateOpportunitiesAction(projectId: string): Promise<Result<{ count: number }>> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  const input = await withUser(ctx.user.id, async (tx) => {
    const run = await latestCompletedRun(tx, projectId);
    if (!run) return null;
    return { run, brief: (await loadBrief(tx, projectId))!, obs: await readObservations(tx, projectId, { runId: run.id }) };
  });
  if (!input) return { ok: false, error: "Run cultural research first — opportunities are built from stored evidence." };
  if (!input.obs.some((o) => o.role !== "seed")) return { ok: false, error: "The latest research run returned no observations, so there is nothing to build opportunities from." };

  let out = templateOpportunities(input.brief, input.obs);
  let generator = input.run.mode === "demo" ? "demo-template" : TEMPLATE_GENERATOR;
  if (input.run.mode === "live" && (await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) {
    try {
      const r = await generateStructured({
        schema: opportunitiesSchema,
        prompt: [
          "Propose 3-5 cultural/strategic opportunities to INVESTIGATE for this campaign. Each is a hypothesis, not a proven market gap. Every opportunity must cite at least one evidence id and say what remains unknown and how to validate it.",
          tag("brief", briefJson(input.brief)),
          tag("evidence", obsJson(input.obs)),
        ].join("\n\n"),
      });
      out = r.data;
      generator = r.generator;
    } catch (e) {
      return { ok: false, error: llmMessage(e) };
    }
  }
  const valid = new Set(input.obs.map((o) => o.id));
  const usable = out.opportunities.map((o) => ({ ...o, evidenceIds: o.evidenceIds.filter((id) => valid.has(id)) })).filter((o) => o.evidenceIds.length > 0);
  if (!usable.length) return { ok: false, error: "No opportunity could be tied to stored evidence, so none were saved." };

  const ws = ctx.workspace.workspaceId;
  await withUser(ctx.user.id, async (tx) => {
    // Replace untouched suggestions from earlier generations; keep anything a person acted on.
    await tx`delete from opportunities where project_id = ${projectId} and status = 'new'`;
    for (const o of usable) {
      const ents = await tx`select ce.id from evidence_items ev join cultural_entities ce on ce.id = any(ev.entity_ids) where ev.id = any(${o.evidenceIds})`;
      await tx`insert into opportunities (project_id, workspace_id, run_id, title, description, why_it_matters, unknowns, strategic_use, validation_step, evidence_ids, entity_ids, generator, is_demo)
        values (${projectId}, ${ws}, ${input.run.id}, ${o.title.slice(0, 200)}, ${o.description}, ${o.whyItMatters}, ${o.unknowns}, ${o.strategicUse}, ${o.validationStep},
          ${o.evidenceIds}, ${ents.map((e) => e.id as string)}, ${generator}, ${input.run.mode === "demo"})`;
    }
    await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "generated", objectType: "opportunity", summary: `generated ${usable.length} opportunity hypotheses` });
  });
  revalidatePath(`/projects/${projectId}/opportunities`);
  return { ok: true, data: { count: usable.length } };
}

const oppStatus = z.object({ projectId: uuid, opportunityId: uuid, status: z.enum(["new", "saved", "investigating", "dismissed", "linked"]), directionId: uuid.nullable().optional() });
export async function setOpportunityStatusAction(raw: z.input<typeof oppStatus>): Promise<Result> {
  const p = oppStatus.safeParse(raw);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  const d = p.data;
  await withUser(ctx.user.id, (tx) => tx`update opportunities set status = ${d.status},
    linked_direction_id = ${d.status === "linked" ? d.directionId ?? null : tx`linked_direction_id`}
    where id = ${d.opportunityId} and project_id = ${d.projectId}`);
  revalidatePath(`/projects/${d.projectId}/opportunities`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Strategy directions
// ---------------------------------------------------------------------------
export async function generateStrategyAction(projectId: string): Promise<Result<{ version: number }>> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  const input = await withUser(ctx.user.id, async (tx) => {
    const run = await latestCompletedRun(tx, projectId);
    const brief = (await loadBrief(tx, projectId))!;
    const obs = run ? await readObservations(tx, projectId, { runId: run.id }) : [];
    const opps = await tx`select title, description, evidence_ids from opportunities where project_id = ${projectId} and status in ('saved','investigating','linked','new') order by (status = 'saved') desc limit 6`;
    const taskId = await startTask(tx, ctx, projectId, "strategy_generation", `Strategy directions · ${brief.name}`);
    return { run, brief, obs, opps, taskId };
  });
  const demo = input.run?.mode === "demo";
  let directions: DirectionContent[];
  let generator = demo ? "demo-template" : TEMPLATE_GENERATOR;
  if (!demo && (await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) {
    try {
      const r = await generateStructured({
        schema: strategySchema,
        prompt: [
          "Generate exactly THREE positioning directions that differ in their underlying strategic rationale (not just wording). Ground them in the brief and evidence; cite evidence ids. If evidence is thin for a direction, set isExploratory=true and say so in uncertainties. consumerTension must be an empty string unless supported. Do not invent product benefits or sources.",
          tag("brief", briefJson(input.brief)),
          tag("evidence", JSON.stringify({ observations: JSON.parse(obsJson(input.obs)), opportunities: input.opps })),
        ].join("\n\n"),
      });
      directions = r.data.directions.slice(0, 3);
      generator = r.generator;
      if (directions.length !== 3) throw new LLMError("The model did not return three directions", "invalid_output");
    } catch (e) {
      await finishTask(ctx, input.taskId, "failed", null, llmMessage(e));
      return { ok: false, error: llmMessage(e) };
    }
  } else {
    directions = templateStrategy(input.brief, input.obs, input.opps.map((o) => o.title as string)).directions;
  }
  const valid = new Set(input.obs.map((o) => o.id));
  const ws = ctx.workspace.workspaceId;
  const version = await withUser(ctx.user.id, async (tx) => {
    const [{ v }] = await tx`select coalesce(max(version), 0) + 1 as v from strategy_versions where project_id = ${projectId}`;
    const [sv] = await tx`insert into strategy_versions (project_id, workspace_id, version, run_id, generator, is_demo, created_by)
      values (${projectId}, ${ws}, ${v}, ${input.run?.id ?? null}, ${generator}, ${demo}, ${ctx.user.id}) returning id`;
    for (const [i, d] of directions.entries()) {
      const parsed = directionSchema.parse(d);
      const ev = parsed.evidenceIds.filter((id) => valid.has(id));
      const content = { ...parsed, evidenceIds: ev, isExploratory: parsed.isExploratory || ev.length === 0 };
      await tx`insert into strategy_directions (version_id, project_id, workspace_id, slot, name, content, evidence_ids, is_exploratory, created_by)
        values (${sv.id}, ${projectId}, ${ws}, ${i + 1}, ${content.name.slice(0, 200)}, ${tx.json(content as never)}, ${ev}, ${content.isExploratory}, ${ctx.user.id})`;
    }
    await trackEvent(tx, { workspaceId: ws, userId: ctx.user.id, event: "strategy_generated", projectId, metadata: { version: v, generator } });
    await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "generated", objectType: "strategy", objectId: sv.id, summary: `generated strategy version ${v} (three directions)` });
    return v as number;
  });
  await finishTask(ctx, input.taskId, "completed", `/projects/${projectId}/strategy?version=${version}`);
  revalidatePath(`/projects/${projectId}/strategy`);
  return { ok: true, data: { version } };
}

const editable = directionSchema.pick({
  name: true, coreIdea: true, positioningStatement: true, audienceContext: true, consumerTension: true, strategicRationale: true, differentiation: true,
  messagingPillars: true, creativeImplications: true, tradeOffs: true, uncertainties: true, assumptionsToTest: true, suggestedExperiment: true,
}).extend({ messagingPillars: z.array(z.string().trim().min(1).max(300)).max(8), assumptionsToTest: z.array(z.string().trim().min(1).max(400)).max(10), name: z.string().trim().min(1).max(200) });

async function newRevision(tx: Tx, ctx: Ctx, directionId: string, patch: Partial<DirectionContent>, note: string) {
  const [d] = await tx`select * from strategy_directions where id = ${directionId}`;
  if (!d) return null;
  // Always branch from the latest revision of this slot so history stays linear.
  const [latest] = await tx`select * from strategy_directions where version_id = ${d.version_id} and slot = ${d.slot} order by revision desc limit 1`;
  const content = directionSchema.parse({ ...latest.content, ...patch });
  const [row] = await tx`insert into strategy_directions (version_id, project_id, workspace_id, slot, revision, parent_id, name, content, evidence_ids, is_exploratory, status, revision_note, created_by)
    values (${latest.version_id}, ${latest.project_id}, ${latest.workspace_id}, ${latest.slot}, ${latest.revision + 1}, ${latest.id}, ${content.name}, ${tx.json(content as never)},
      ${latest.evidence_ids}, ${latest.is_exploratory}, 'draft', ${note.slice(0, 500)}, ${ctx.user.id}) returning id, project_id`;
  // A selected direction is never overwritten: it stays selected until someone selects the new revision.
  if (latest.status === "draft") await tx`update strategy_directions set status = 'superseded' where id = ${latest.id}`;
  await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId: row.project_id, verb: "edited", objectType: "direction", objectId: row.id, summary: `saved revision ${latest.revision + 1} of “${content.name}”` });
  return row as { id: string; project_id: string };
}

export async function editDirectionAction(directionId: string, patch: z.input<typeof editable>, note: string): Promise<Result<{ id: string }>> {
  if (!isUuid(directionId)) return { ok: false, error: "Invalid direction." };
  const p = editable.safeParse(patch);
  if (!p.success) return { ok: false, error: `Check the fields: ${p.error.issues.map((i) => i.path.join(".")).join(", ")}` };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  const row = await withUser(ctx.user.id, (tx) => newRevision(tx, ctx, directionId, p.data, note || "Manual edit"));
  if (!row) return { ok: false, error: "Direction not found." };
  revalidatePath(`/projects/${row.project_id}/strategy`);
  return { ok: true, data: { id: row.id } };
}

export async function reviseDirectionAction(directionId: string, instruction: string): Promise<Result<{ id: string }>> {
  const text = instruction.trim();
  if (!isUuid(directionId) || text.length < 4 || text.length > 1000) return { ok: false, error: "Describe the revision in 4–1000 characters." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  if (!(await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) return { ok: false, error: `${LLM_UNAVAILABLE} You can still edit every field directly and a new version will be saved.` };
  const ctxData = await withUser(ctx.user.id, async (tx) => {
    const [d] = await tx`select * from strategy_directions where id = ${directionId}`;
    if (!d) return null;
    return { d, brief: (await loadBrief(tx, d.project_id))!, obs: await readObservations(tx, d.project_id, { limit: 60 }) };
  });
  if (!ctxData) return { ok: false, error: "Direction not found." };
  let revised: DirectionContent;
  try {
    const r = await generateStructured({
      schema: directionSchema,
      prompt: ["Revise this positioning direction according to the user's request. Keep everything not affected by the request unchanged. Keep evidence ids only if still relevant; never add unsupported claims.", tag("brief", briefJson(ctxData.brief)), tag("evidence", JSON.stringify({ direction: ctxData.d.content, observations: JSON.parse(obsJson(ctxData.obs)) })), tag("user_request", text)].join("\n\n"),
    });
    revised = r.data;
  } catch (e) {
    return { ok: false, error: llmMessage(e) };
  }
  const valid = new Set(ctxData.obs.map((o) => o.id));
  revised.evidenceIds = revised.evidenceIds.filter((id) => valid.has(id));
  const row = await withUser(ctx.user.id, (tx) => newRevision(tx, ctx, directionId, revised, `AI revision: ${text}`));
  revalidatePath(`/projects/${row!.project_id}/strategy`);
  return { ok: true, data: { id: row!.id } };
}

export async function selectDirectionAction(directionId: string): Promise<Result> {
  if (!isUuid(directionId)) return { ok: false, error: "Invalid direction." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  const projectId = await withUser(ctx.user.id, async (tx) => {
    const [d] = await tx`select id, project_id, name from strategy_directions where id = ${directionId}`;
    if (!d) return null;
    await tx`update strategy_directions set status = 'draft' where project_id = ${d.project_id} and status = 'selected'`;
    await tx`update strategy_directions set status = 'selected' where id = ${directionId}`;
    await tx`update projects set selected_direction_id = ${directionId}, updated_at = now() where id = ${d.project_id}`;
    await trackEvent(tx, { workspaceId: ctx.workspace.workspaceId, userId: ctx.user.id, event: "strategy_selected", projectId: d.project_id });
    await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId: d.project_id, verb: "selected", objectType: "direction", objectId: directionId, summary: `selected “${d.name}” as the preferred direction` });
    return d.project_id as string;
  });
  if (!projectId) return { ok: false, error: "Direction not found." };
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: true };
}

export async function compareDirectionsAction(projectId: string, versionId: string): Promise<Result<ComparisonOutput & { generator: string }>> {
  if (!isUuid(projectId) || !isUuid(versionId)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  const data = await withUser(ctx.user.id, async (tx) => ({
    brief: (await loadBrief(tx, projectId))!,
    dirs: await tx`select distinct on (slot) name, content, evidence_ids from strategy_directions where version_id = ${versionId} and project_id = ${projectId} order by slot, revision desc`,
  }));
  const dirs = data.dirs.map((d) => ({ name: d.name as string, content: d.content as DirectionContent, evidenceCount: (d.evidence_ids as string[]).length }));
  if (!dirs.length) return { ok: false, error: "No directions in this version." };
  if (!(await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) return { ok: true, data: { ...templateComparison(dirs, data.brief), generator: TEMPLATE_GENERATOR } };
  try {
    const r = await generateStructured({
      schema: comparisonSchema,
      prompt: ["Compare these positioning directions qualitatively across the listed dimensions. Use stronger/mixed/weaker/unclear only, and give the specific basis for each assessment. Do not produce numeric scores.", tag("brief", briefJson(data.brief)), tag("evidence", JSON.stringify(dirs))].join("\n\n"),
    });
    return { ok: true, data: { ...r.data, generator: r.generator } };
  } catch (e) {
    return { ok: false, error: llmMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Creative brief
// ---------------------------------------------------------------------------
export async function generateCreativeBriefAction(projectId: string): Promise<Result<{ id: string }>> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  const input = await withUser(ctx.user.id, async (tx) => {
    const [p] = await tx`select selected_direction_id from projects where id = ${projectId}`;
    if (!p?.selected_direction_id) return null;
    const [d] = await tx`select d.*, v.is_demo from strategy_directions d join strategy_versions v on v.id = d.version_id where d.id = ${p.selected_direction_id}`;
    const brief = (await loadBrief(tx, projectId))!;
    const taskId = await startTask(tx, ctx, projectId, "creative_brief", `Creative brief · ${brief.name}`);
    return { d, brief, obs: await readObservations(tx, projectId, { limit: 40 }), taskId };
  });
  if (!input) return { ok: false, error: "Select a strategy direction first." };
  const direction = input.d.content as DirectionContent;
  let content: CreativeBriefContent = templateCreativeBrief(input.brief, direction);
  let generator = input.d.is_demo ? "demo-template" : TEMPLATE_GENERATOR;
  if (!input.d.is_demo && (await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) {
    try {
      const r = await generateStructured({
        schema: creativeBriefSchema,
        prompt: ["Write an actionable creative brief from the selected direction. Reasons to believe may only use facts provided in the brief; otherwise say they are to be confirmed. Do not invent deliverables, budgets or metrics not implied by the brief — mark them 'to confirm'.", tag("brief", briefJson(input.brief)), tag("evidence", JSON.stringify({ direction, observations: JSON.parse(obsJson(input.obs)).slice(0, 25) }))].join("\n\n"),
      });
      content = r.data;
      generator = r.generator;
    } catch (e) {
      await finishTask(ctx, input.taskId, "failed", null, llmMessage(e));
      return { ok: false, error: llmMessage(e) };
    }
  }
  const id = await withUser(ctx.user.id, async (tx) => {
    const [cb] = await tx`insert into creative_briefs (project_id, workspace_id, direction_id, content, generator, is_demo, created_by, updated_by)
      values (${projectId}, ${ctx.workspace.workspaceId}, ${input.d.id}, ${tx.json(content as never)}, ${generator}, ${input.d.is_demo}, ${ctx.user.id}, ${ctx.user.id}) returning id`;
    await trackEvent(tx, { workspaceId: ctx.workspace.workspaceId, userId: ctx.user.id, event: "creative_brief_generated", projectId });
    await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId, verb: "generated", objectType: "creative_brief", objectId: cb.id, summary: `generated a creative brief from “${input.d.name}”` });
    return cb.id as string;
  });
  await finishTask(ctx, input.taskId, "completed", `/projects/${projectId}/creative-brief`);
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: true, data: { id } };
}

const sectionKey = z.enum(CREATIVE_SECTIONS.map(([k]) => k) as [CreativeSectionKey, ...CreativeSectionKey[]]);

export async function updateCreativeSectionAction(briefId: string, key: CreativeSectionKey, text: string, baseRevision: number): Promise<Result<{ revision: number }>> {
  if (!isUuid(briefId) || !sectionKey.safeParse(key).success || text.length > 8000) return { ok: false, error: "Invalid request." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  return withUser(ctx.user.id, async (tx) => {
    const [cb] = await tx`select revision, project_id from creative_briefs where id = ${briefId} for update`;
    if (!cb) return { ok: false as const, error: "Creative brief not found." };
    if (cb.revision !== baseRevision) return { ok: false as const, error: "This brief changed since you opened it. Reload to continue." };
    const [r] = await tx`update creative_briefs set content = jsonb_set(content, ${[key]}, ${tx.json(text)}), revision = revision + 1, updated_by = ${ctx.user.id}
      where id = ${briefId} returning revision`;
    return { ok: true as const, data: { revision: r.revision as number } };
  });
}

export async function reviseCreativeSectionAction(briefId: string, key: CreativeSectionKey, instruction: string): Promise<Result<{ text: string }>> {
  if (!isUuid(briefId) || !sectionKey.safeParse(key).success || instruction.trim().length < 4) return { ok: false, error: "Describe the change you want." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  if (!(await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) return { ok: false, error: `${LLM_UNAVAILABLE} Edit the section directly instead.` };
  const cb = await withUser(ctx.user.id, async (tx) => (await tx`select content, project_id from creative_briefs where id = ${briefId}`)[0]);
  if (!cb) return { ok: false, error: "Creative brief not found." };
  try {
    const r = await generateStructured({
      schema: sectionRevisionSchema,
      maxTokens: 4000,
      prompt: [`Rewrite only the "${key}" section of this creative brief per the request. Do not add unsupported claims. Return just the new section text.`, tag("evidence", JSON.stringify(cb.content)), tag("user_request", instruction.trim().slice(0, 1000))].join("\n\n"),
    });
    return { ok: true, data: { text: r.data.text } };
  } catch (e) {
    return { ok: false, error: llmMessage(e) };
  }
}
