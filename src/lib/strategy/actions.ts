"use server";

import { llmEnabled, LLM_UNAVAILABLE } from "@/lib/ai/enabled";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateStructured, tag, TEMPLATE_GENERATOR, LLMError } from "@/lib/ai";
import { latestCompletedRun, readObservations } from "@/lib/ai/context";
import { checkStatements, citedIds } from "@/lib/ai/grounding";
import {
  comparisonSchema, creativeBriefOutputSchema, CREATIVE_SECTIONS, directionSchema, opportunitiesSchema, redTeamCritiqueSchema, sectionRevisionSchema, strategySchema,
  type ComparisonOutput, type CreativeBriefContent, type CreativeGrounding, type CreativeSectionKey, type DirectionContent, type RedTeamCritique,
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
// The model gets each item's text, not just its id: it can only cite what it has actually read.
const clip = (t: string, n = 280) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const obsJson = (o: Observation[]) =>
  JSON.stringify(o.map((x) => ({ id: x.id, text: clip(x.claim), entity: x.entityName, type: x.entityType, affinity: x.affinity, role: x.role, source: x.source ?? null })));
/** id → the text a citation is checked against. */
const evidenceText = (o: Observation[]) => new Map(o.map((x) => [x.id, [x.entityName, x.claim].filter(Boolean).join(" — ")]));

const CITE_RULES =
  "List the factual statements you rely on in `claims`, one fact each, and cite in each the ids of the evidence items whose text says it. " +
  "Only cite an id if its text supports that exact statement; a statement with no supporting evidence gets an empty evidenceIds list and is shown as interpretation. " +
  "Never write evidence ids inside other text fields.";

/** Two directions whose cited evidence overlaps by more than half (Jaccard), or that give the brand the same role. */
function overlappingPair(ds: DirectionContent[]): [string, string] | null {
  const ids = ds.map((d) => new Set([...citedIds(d.claims), ...d.evidenceIds]));
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      const inter = [...ids[i]].filter((x) => ids[j].has(x)).length;
      const union = new Set([...ids[i], ...ids[j]]).size;
      const sameRole = ds[i].brandRole && ds[i].brandRole.trim().toLowerCase() === ds[j].brandRole?.trim().toLowerCase();
      if ((union > 0 && inter / union > 0.5) || sameRole) return [ds[i].name, ds[j].name];
    }
  }
  return null;
}

/** Checks a direction's claims against the evidence text and derives its citations and exploratory flag from them. */
function groundDirection(d: DirectionContent, evidence: Map<string, string>) {
  const claims = checkStatements(d.claims, evidence);
  const evidenceIds = [...new Set([...citedIds(claims), ...d.evidenceIds.filter((id) => evidence.has(id))])];
  const isExploratory = d.isExploratory || !claims.some((c) => c.support === "verified");
  return { ...d, claims, evidenceIds, isExploratory };
}

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
          `Propose 3-5 cultural/strategic opportunities to INVESTIGATE for this campaign. Each is a hypothesis, not a proven market gap. Every opportunity must rest on at least one cited statement and say what remains unknown and how to validate it. ${CITE_RULES}`,
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
  const evidence = evidenceText(input.obs);
  const usable = out.opportunities.map((o) => {
    const claims = checkStatements(o.claims, evidence);
    return { ...o, claims, evidenceIds: [...new Set([...citedIds(claims), ...o.evidenceIds.filter((id) => evidence.has(id))])] };
  }).filter((o) => o.evidenceIds.length > 0);
  if (!usable.length) return { ok: false, error: "No opportunity could be tied to stored evidence, so none were saved." };

  const ws = ctx.workspace.workspaceId;
  await withUser(ctx.user.id, async (tx) => {
    // Replace untouched suggestions from earlier generations; keep anything a person acted on.
    await tx`delete from opportunities where project_id = ${projectId} and status = 'new'`;
    for (const o of usable) {
      const ents = await tx`select ce.id from evidence_items ev join cultural_entities ce on ce.id = any(ev.entity_ids) where ev.id = any(${o.evidenceIds})`;
      await tx`insert into opportunities (project_id, workspace_id, run_id, title, description, why_it_matters, unknowns, strategic_use, validation_step, evidence_ids, entity_ids, claims, generator, is_demo)
        values (${projectId}, ${ws}, ${input.run.id}, ${o.title.slice(0, 200)}, ${o.description}, ${o.whyItMatters}, ${o.unknowns}, ${o.strategicUse}, ${o.validationStep},
          ${o.evidenceIds}, ${ents.map((e) => e.id as string)}, ${tx.json(o.claims as never)}, ${generator}, ${input.run.mode === "demo"})`;
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
  // Any failure after the task row exists must close it, or it shows as running forever.
  try {
    const demo = input.run?.mode === "demo";
    let directions: DirectionContent[];
    let generator = demo ? "demo-template" : TEMPLATE_GENERATOR;
    if (!demo && (await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) {
      try {
        // Directions must differ in substance, not wording. If two of them lean on mostly the same
        // evidence (or the model returns fewer than three), it gets one retry with that feedback.
        let feedback: string | null = null;
        for (let attempt = 1; ; attempt++) {
          const r = await generateStructured({
            schema: strategySchema,
            prompt: [
              `Generate exactly THREE positioning directions that are strategically different. Each must name a different consumer tension (or an empty string if none is supported), give the brand a different role (brandRole), and rest mostly on a different subset of the evidence. Ground them in the brief and evidence. If evidence is thin for a direction, still include it: set isExploratory=true and say so in uncertainties. Do not invent product benefits or sources. ${CITE_RULES}`,
              ...(feedback ? [feedback] : []),
              tag("brief", briefJson(input.brief)),
              tag("evidence", JSON.stringify({ observations: JSON.parse(obsJson(input.obs)), opportunities: input.opps })),
            ].join("\n\n"),
          });
          directions = r.data.directions.slice(0, 3);
          generator = r.generator;
          const clash = directions.length === 3 ? overlappingPair(directions) : null;
          if (directions.length === 3 && !clash) break;
          if (attempt === 2) {
            if (directions.length !== 3) throw new LLMError("The model did not return three directions", "invalid_output");
            break; // a second near-duplicate is kept rather than failing; the comparison view shows the overlap
          }
          feedback = directions.length !== 3
            ? `Your previous answer contained ${directions.length} direction(s). Return exactly three; mark weakly supported ones exploratory rather than leaving them out.`
            : `Your previous directions “${clash![0]}” and “${clash![1]}” rested on mostly the same evidence. Rework one so it starts from a different tension, a different brand role and different evidence.`;
        }
      } catch (e) {
        await finishTask(ctx, input.taskId, "failed", null, llmMessage(e));
        return { ok: false, error: llmMessage(e) };
      }
    } else {
      directions = templateStrategy(input.brief, input.obs, input.opps.map((o) => o.title as string)).directions;
    }
    const evidence = evidenceText(input.obs);
    const ws = ctx.workspace.workspaceId;
    const version = await withUser(ctx.user.id, async (tx) => {
      const [{ v }] = await tx`select coalesce(max(version), 0) + 1 as v from strategy_versions where project_id = ${projectId}`;
      const [sv] = await tx`insert into strategy_versions (project_id, workspace_id, version, run_id, generator, is_demo, created_by)
        values (${projectId}, ${ws}, ${v}, ${input.run?.id ?? null}, ${generator}, ${demo}, ${ctx.user.id}) returning id`;
      for (const [i, d] of directions.entries()) {
        const content = groundDirection(directionSchema.parse(d), evidence);
        await tx`insert into strategy_directions (version_id, project_id, workspace_id, slot, name, content, evidence_ids, is_exploratory, created_by)
          values (${sv.id}, ${projectId}, ${ws}, ${i + 1}, ${content.name.slice(0, 200)}, ${tx.json(content as never)}, ${content.evidenceIds}, ${content.isExploratory}, ${ctx.user.id})`;
      }
      await trackEvent(tx, { workspaceId: ws, userId: ctx.user.id, event: "strategy_generated", projectId, metadata: { version: v, generator } });
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "generated", objectType: "strategy", objectId: sv.id, summary: `generated strategy version ${v} (three directions)` });
      return v as number;
    });
    await finishTask(ctx, input.taskId, "completed", `/projects/${projectId}/strategy?version=${version}`);
    revalidatePath(`/projects/${projectId}/strategy`);
    return { ok: true, data: { version } };
  } catch (e) {
    await finishTask(ctx, input.taskId, "failed", null, llmMessage(e)).catch(() => undefined);
    return { ok: false, error: llmMessage(e) };
  }
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
  // The evidence columns are derived from the content being saved, never copied from the previous
  // revision, so the evidence trail, creative brief and reports all agree on what this revision cites.
  const evidenceIds = [...new Set([...citedIds(content.claims), ...content.evidenceIds])];
  const isExploratory = content.claims.length ? !content.claims.some((c) => c.support === "verified") : content.isExploratory || evidenceIds.length === 0;
  const [row] = await tx`insert into strategy_directions (version_id, project_id, workspace_id, slot, revision, parent_id, name, content, evidence_ids, is_exploratory, status, revision_note, created_by)
    values (${latest.version_id}, ${latest.project_id}, ${latest.workspace_id}, ${latest.slot}, ${latest.revision + 1}, ${latest.id}, ${content.name}, ${tx.json({ ...content, evidenceIds, isExploratory } as never)},
      ${evidenceIds}, ${isExploratory}, 'draft', ${note.slice(0, 500)}, ${ctx.user.id}) returning id, project_id`;
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
    const [d] = await tx`select d.*, v.run_id from strategy_directions d join strategy_versions v on v.id = d.version_id where d.id = ${directionId}`;
    if (!d) return null;
    // Citations are checked against the research run this strategy version was built from, not whatever ran last.
    return { d, brief: (await loadBrief(tx, d.project_id))!, obs: d.run_id ? await readObservations(tx, d.project_id, { runId: d.run_id, limit: 60 }) : [] };
  });
  if (!ctxData) return { ok: false, error: "Direction not found." };
  let revised: DirectionContent;
  try {
    const r = await generateStructured({
      schema: directionSchema,
      prompt: [`Revise this positioning direction according to the user's request. Keep everything not affected by the request unchanged. Keep a claim's evidence ids only if still relevant; never add unsupported claims. ${CITE_RULES}`, tag("brief", briefJson(ctxData.brief)), tag("evidence", JSON.stringify({ direction: ctxData.d.content, observations: JSON.parse(obsJson(ctxData.obs)) })), tag("user_request", text)].join("\n\n"),
    });
    revised = r.data;
  } catch (e) {
    return { ok: false, error: llmMessage(e) };
  }
  revised = groundDirection(revised, evidenceText(ctxData.obs));
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
    const [d] = await tx`select d.*, v.is_demo, v.run_id from strategy_directions d join strategy_versions v on v.id = d.version_id where d.id = ${p.selected_direction_id}`;
    const brief = (await loadBrief(tx, projectId))!;
    const taskId = await startTask(tx, ctx, projectId, "creative_brief", `Creative brief · ${brief.name}`);
    return { d, brief, obs: d.run_id ? await readObservations(tx, projectId, { runId: d.run_id, limit: 40 }) : [], taskId };
  });
  if (!input) return { ok: false, error: "Select a strategy direction first." };
  // Any failure after the task row exists must close it, or it shows as running forever.
  try {
    const direction = input.d.content as DirectionContent;
    let content: CreativeBriefContent = templateCreativeBrief(input.brief, direction);
    // Template briefs carry over the direction's verified statements as their audience-context grounding.
    let grounding: CreativeGrounding = (direction.claims ?? []).filter((c) => c.support === "verified").map((c) => ({ ...c, section: "audienceContext" as const }));
    let generator = input.d.is_demo ? "demo-template" : TEMPLATE_GENERATOR;
    if (!input.d.is_demo && (await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) {
      try {
        const r = await generateStructured({
          schema: creativeBriefOutputSchema,
          prompt: [`Write an actionable creative brief from the selected direction. Reasons to believe may only use facts provided in the brief; otherwise say they are to be confirmed. Do not invent deliverables, budgets or metrics not implied by the brief — mark them 'to confirm'. The section texts are client-facing: never write evidence ids in them. In \`grounding\`, list the factual statements the brief relies on, each with its section and the ids of the evidence items whose text supports it.`, tag("brief", briefJson(input.brief)), tag("evidence", JSON.stringify({ direction, observations: JSON.parse(obsJson(input.obs)).slice(0, 25) }))].join("\n\n"),
        });
        const { grounding: g, ...prose } = r.data;
        content = prose;
        const evidence = evidenceText(input.obs);
        grounding = g.map((c) => ({ ...checkStatements([c], evidence)[0], section: c.section }));
        generator = r.generator;
      } catch (e) {
        await finishTask(ctx, input.taskId, "failed", null, llmMessage(e));
        return { ok: false, error: llmMessage(e) };
      }
    }
    const id = await withUser(ctx.user.id, async (tx) => {
      const [cb] = await tx`insert into creative_briefs (project_id, workspace_id, direction_id, content, grounding, generator, is_demo, created_by, updated_by)
        values (${projectId}, ${ctx.workspace.workspaceId}, ${input.d.id}, ${tx.json(content as never)}, ${tx.json(grounding as never)}, ${generator}, ${input.d.is_demo}, ${ctx.user.id}, ${ctx.user.id}) returning id`;
      await trackEvent(tx, { workspaceId: ctx.workspace.workspaceId, userId: ctx.user.id, event: "creative_brief_generated", projectId });
      await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId, verb: "generated", objectType: "creative_brief", objectId: cb.id, summary: `generated a creative brief from “${input.d.name}”` });
      return cb.id as string;
    });
    await finishTask(ctx, input.taskId, "completed", `/projects/${projectId}/creative-brief`);
    revalidatePath(`/projects/${projectId}`, "layout");
    return { ok: true, data: { id } };
  } catch (e) {
    await finishTask(ctx, input.taskId, "failed", null, llmMessage(e)).catch(() => undefined);
    return { ok: false, error: llmMessage(e) };
  }
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
  const cb = await withUser(ctx.user.id, async (tx) => {
    const [row] = await tx`select content, grounding, project_id from creative_briefs where id = ${briefId}`;
    if (!row) return null;
    // The rewrite sees the campaign brief and the evidence this brief cites, so it can't drift from the facts.
    const ids = citedIds(row.grounding as { evidenceIds: string[] }[]);
    const evidence = ids.length ? await tx`select id, claim from evidence_items where id = any(${ids}) and review_status <> 'rejected'` : [];
    return { content: row.content, brief: await loadBrief(tx, row.project_id), evidence: evidence.map((e) => ({ id: e.id, text: clip(e.claim as string) })) };
  });
  if (!cb) return { ok: false, error: "Creative brief not found." };
  try {
    const r = await generateStructured({
      schema: sectionRevisionSchema,
      maxTokens: 4000,
      prompt: [`Rewrite only the "${key}" section of this creative brief per the request. Do not add unsupported claims. Return just the new section text.`, tag("brief", cb.brief ? briefJson(cb.brief) : "{}"), tag("creative_brief", JSON.stringify(cb.content)), tag("evidence", JSON.stringify(cb.evidence)), tag("user_request", instruction.trim().slice(0, 1000))].join("\n\n"),
    });
    return { ok: true, data: { text: r.data.text } };
  } catch (e) {
    return { ok: false, error: llmMessage(e) };
  }
}

export type SavedCritique = { id: string; critique: RedTeamCritique; generator: string; createdAt: string };

/**
 * Client Devil's Advocate: attacks the current revision of each direction the way a sceptical CMO
 * would — weakest evidence, the competitor who already owns the position, cultural risk — using the
 * directions' own checked claims and the evidence text. Saved per strategy version.
 */
export async function redTeamStrategyAction(projectId: string, versionId?: string): Promise<Result<SavedCritique>> {
  if (!isUuid(projectId) || (versionId && !isUuid(versionId))) return { ok: false, error: "Invalid project." };
  const ctx = await authorize("strategy.edit");
  if (!isCtx(ctx)) return ctx;
  // A critique needs judgement: without a model there is nothing honest to show, so none is invented.
  if (!(await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) return { ok: false, error: `${LLM_UNAVAILABLE} The Devil's Advocate needs an AI model to critique directions.` };

  const data = await withUser(ctx.user.id, async (tx) => {
    const brief = await loadBrief(tx, projectId);
    const [sv] = versionId
      ? await tx`select id, version, run_id from strategy_versions where id = ${versionId} and project_id = ${projectId}`
      : await tx`select id, version, run_id from strategy_versions where project_id = ${projectId} order by version desc limit 1`;
    if (!sv || !brief) return null;
    // The revision people see: the selected one if any, otherwise the latest of each slot.
    const directions = await tx`select distinct on (slot) id, slot, name, content from strategy_directions where version_id = ${sv.id}
      order by slot, (status = 'selected') desc, revision desc`;
    const ids = [...new Set(directions.flatMap((d) => citedIds((d.content as DirectionContent).claims)))];
    const evidence = ids.length ? await tx`select id, claim from evidence_items where id = any(${ids})` : [];
    return { brief, sv, directions, evidence: new Map(evidence.map((e) => [e.id as string, clip(e.claim as string, 240)])) };
  });
  if (!data || data.directions.length === 0) return { ok: false, error: "No strategy directions found to stress-test. Generate directions first." };

  const dirs = data.directions.map((d) => {
    const c = d.content as DirectionContent;
    return {
      slot: d.slot as number, name: d.name as string, coreIdea: c.coreIdea, positioningStatement: c.positioningStatement, consumerTension: c.consumerTension,
      brandRole: c.brandRole ?? "", differentiation: c.differentiation, assumptions: c.assumptionsToTest, tradeOffs: c.tradeOffs,
      // Each statement with how well it held up against its sources, and the source text itself.
      claims: (c.claims ?? []).map((cl) => ({ statement: cl.statement, support: cl.support ?? "uncited", sources: cl.evidenceIds.map((id) => data.evidence.get(id)).filter(Boolean) })),
    };
  });
  try {
    const out = await generateStructured({
      schema: redTeamCritiqueSchema,
      maxTokens: 12000,
      prompt: [
        "You are the client's most sceptical CMO, reviewing these positioning directions before the agency pitch. Your job is to find what would make you say no.",
        "For each direction: name the weakest piece of evidence it rests on (prefer statements marked 'weak' or 'uncited', and quote them); the competitor that already owns or could most easily claim this position (use the brief's competitors and the evidence; say if none is identified); the cultural risk of seeming inauthentic, clichéd or opportunistic; the hardest question you'd ask in the room; and what the agency must do to answer it. Be specific to this brief — no generic advice. Judge only from the material given.",
        tag("brief", briefJson(data.brief)),
        tag("directions", JSON.stringify(dirs)),
      ].join("\n\n"),
    });
    const bySlot = new Map(data.directions.map((d) => [d.slot as number, d.id as string]));
    const critique: RedTeamCritique = {
      ...out.data,
      critiques: out.data.critiques.filter((c) => bySlot.has(c.directionSlot)).map((c) => ({ ...c, directionId: bySlot.get(c.directionSlot) })),
    };
    const saved = await withUser(ctx.user.id, async (tx) => {
      const [row] = await tx`insert into strategy_critiques (workspace_id, project_id, version_id, critique, generator, created_by)
        values (${ctx.workspace.workspaceId}, ${projectId}, ${data.sv.id}, ${tx.json(critique as never)}, ${out.generator}, ${ctx.user.id}) returning id, created_at`;
      await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId, verb: "reviewed", objectType: "strategy", objectId: data.sv.id, summary: `ran the Devil's Advocate on strategy version ${data.sv.version}` });
      return row;
    });
    revalidatePath(`/projects/${projectId}/strategy`);
    return { ok: true, data: { id: saved.id as string, critique, generator: out.generator, createdAt: new Date(saved.created_at).toISOString() } };
  } catch (e) {
    return { ok: false, error: llmMessage(e) };
  }
}
