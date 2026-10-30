"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { privilegedSql, withUser } from "@/lib/db";
import { llmEnabled, LLM_UNAVAILABLE } from "@/lib/ai/enabled";
import { logActivity } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { colourName } from "@/lib/boards/colour";
import { BOARD_BUCKET, boardEntities, mediaPrefix, signPaths } from "@/lib/boards/data";
import { processImage } from "@/lib/boards/media";
import { boardPalette, parseBoardContent, safeUrl } from "@/lib/boards/schema";
import { storeImages } from "@/lib/boards/store";
import { basePrompt, currentDirections, loadContext, loadDirection, loadEvidence, provenanceFor, type Provenance } from "./context";
import { conceptsEnabled } from "./data";
import { improvePrompt, SIZES, writeShots, type Shot, type ShotPlan } from "./director";
import { pickEntities, storyLayout, type StoryDirection } from "./story";
import { engineStatus } from "./worker";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Unfinished jobs allowed per board, so one click can't fill the PC's queue for everyone. */
const MAX_ACTIVE_PER_BOARD = 8;
const VARIATION_NEGATIVE = "text, watermark, logo, deformed hands, low quality, blurry";
const NOT_SET_UP = "Image generation is not set up on this server.";

async function guard() {
  const ctx = await getCtx();
  assertCan(ctx.workspace.role, "board.edit");
  return ctx;
}
function err(e: unknown, fallback: string): { ok: false; error: string } {
  if (e instanceof ForbiddenError) return { ok: false, error: e.message };
  console.error("[concepts]", e instanceof Error ? e.message : e);
  return { ok: false, error: fallback };
}
const paletteWords = (nodes: unknown[]) => [...new Set(boardPalette(nodes as never).slice(0, 4).map((h) => colourName(h).toLowerCase()))];
const seed = () => Math.floor(Math.random() * 2 ** 32);

export type ConceptSetup = { engine: { online: boolean; ready: boolean; gpu: string | null }; prompt: string };

/**
 * GPU PC status and a starting prompt built from the project: brand and audience from the brief, the
 * board's strategy direction (or the selected one), its cultural connections and the board palette.
 */
export async function conceptSetupAction(boardId: string): Promise<R<ConceptSetup>> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  try {
    const ctx = await guard();
    const prompt = await withUser(ctx.user.id, async (tx) => {
      const [b] = await tx`select project_id, direction_id, content->'nodes' as nodes from inspiration_boards where id = ${boardId}`;
      if (!b) return null;
      const [cc, dir] = await Promise.all([loadContext(tx, b.project_id), loadDirection(tx, b.project_id, b.direction_id)]);
      return basePrompt(cc, dir, paletteWords(b.nodes ?? []));
    });
    if (prompt === null) return { ok: false, error: "Board not found." };
    return { ok: true, data: { engine: await engineStatus(), prompt } };
  } catch (e) {
    return err(e, "Could not reach the image studio.");
  }
}

const queueInput = z.object({
  kind: z.enum(["concept", "variation"]),
  prompt: z.string().trim().min(3, "Describe the image").max(2000),
  count: z.number().int().min(1).max(4),
  sourcePath: z.string().max(400).optional(),
});

/** Queues 1–4 concept (text→image) or variation (image→image) jobs for the GPU PC. Returns the job ids. */
export async function queueConceptsAction(boardId: string, input: z.input<typeof queueInput>): Promise<R<{ ids: string[] }>> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  const parsed = queueInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { kind, prompt, count, sourcePath } = parsed.data;
  if (!conceptsEnabled()) return { ok: false, error: NOT_SET_UP };
  try {
    const ctx = await guard();
    const [b] = await withUser(ctx.user.id, (tx) => tx`select project_id, workspace_id, direction_id from inspiration_boards where id = ${boardId}`);
    if (!b) return { ok: false, error: "Board not found." };
    let image: string | undefined;
    if (kind === "variation") {
      if (!sourcePath || sourcePath.includes("..") || !sourcePath.startsWith(mediaPrefix(b.workspace_id, b.project_id, boardId))) return { ok: false, error: "That image is not on this board." };
      image = (await signPaths([sourcePath])).get(sourcePath);
      if (!image) return { ok: false, error: "The source image could not be read." };
    }
    const ids = await withUser(ctx.user.id, async (tx) => {
      const [cc, dir] = await Promise.all([loadContext(tx, b.project_id), loadDirection(tx, b.project_id, b.direction_id)]);
      const prov = provenanceFor(cc, dir, await loadEvidence(tx, dir?.evidenceIds ?? []), prompt);
      return insertJobs(tx, { workspace_id: b.workspace_id as string, project_id: b.project_id as string, board_id: boardId }, ctx.user.id, Array.from({ length: count }, () => ({
        workflow: kind === "concept" ? "w1-concept" : "w3-variation",
        params: kind === "concept" ? { prompt, seed: seed(), width: 1024, height: 1024 } : { prompt, negative: VARIATION_NEGATIVE, seed: seed(), denoise: 0.45, image },
        directionId: dir?.id ?? null, provenance: prov,
      })));
    });
    if (!ids) return { ok: false, error: `This board already has ${MAX_ACTIVE_PER_BOARD} images on the way. Wait for some to finish.` };
    return { ok: true, data: { ids } };
  } catch (e) {
    return err(e, "The images could not be queued.");
  }
}

type NewJob = { workflow: "w1-concept" | "w3-variation"; params: Record<string, unknown>; directionId: string | null; parentId?: string | null; provenance: Provenance };

/** Inserts jobs unless the board would exceed its limit of unfinished images (then null). */
async function insertJobs(tx: Parameters<Parameters<typeof withUser>[1]>[0], b: { workspace_id: string; project_id: string; board_id: string }, userId: string, jobs: NewJob[]) {
  const [{ n }] = await tx`select count(*)::int as n from concept_jobs where board_id = ${b.board_id} and status in ('queued', 'running')`;
  if (n + jobs.length > MAX_ACTIVE_PER_BOARD) return null;
  const ids: string[] = [];
  for (const j of jobs) {
    const [row] = await tx`insert into concept_jobs (workspace_id, project_id, board_id, created_by, workflow, params, direction_id, parent_id, provenance)
      values (${b.workspace_id}, ${b.project_id}, ${b.board_id}, ${userId}, ${j.workflow}, ${tx.json(j.params as never)}, ${j.directionId}, ${j.parentId ?? null}, ${tx.json(j.provenance as never)}) returning id`;
    ids.push(row.id as string);
  }
  return ids;
}

export type ConceptResult = { path: string; thumbPath: string; url: string; thumbUrl: string; width: number | null; height: number | null };
export type ConceptJobState = { id: string; status: "queued" | "running" | "done" | "error"; error: string | null; position: number | null; result: ConceptResult | null };

/**
 * Status of this board's jobs. A finished image is moved from the job into board-media here, under the
 * caller's session; a row lock makes sure two open tabs don't both move it.
 */
export async function conceptJobsAction(boardId: string, ids: string[]): Promise<R<ConceptJobState[]>> {
  if (!isUuid(boardId) || !Array.isArray(ids) || ids.length > 20 || !ids.every(isUuid)) return { ok: false, error: "Invalid request." };
  try {
    const ctx = await guard();
    const [b] = await withUser(ctx.user.id, (tx) => tx`select project_id, workspace_id from inspiration_boards where id = ${boardId}`);
    if (!b) return { ok: false, error: "Board not found." };
    const board = b as { workspace_id: string; project_id: string };
    const out: ConceptJobState[] = [];
    for (const id of ids) {
      const state = await withUser(ctx.user.id, async (tx) => {
        const [j] = await tx`select id, status, error, created_at, result_path, result_thumb_path, image is not null as has_image
          from concept_jobs where id = ${id} and board_id = ${boardId}`;
        if (!j) return null;
        if (j.status === "done" && !j.result_path && j.has_image) {
          const [locked] = await tx`select image from concept_jobs where id = ${id} and result_path is null and image is not null for update skip locked`;
          if (locked) {
            let img;
            try {
              img = await processImage(Buffer.from(locked.image as Uint8Array));
            } catch {
              const error = "The GPU PC sent an image that could not be read.";
              await tx`update concept_jobs set status = 'error', error = ${error}, image = null where id = ${id}`;
              return { j: { ...j, status: "error", error }, path: null, thumbPath: null, size: null };
            }
            const [path, thumbPath] = await storeImages(ctx.user.id, board, boardId, [{ buf: img.full, suffix: "", kind: "image" }, { buf: img.thumb, suffix: ".thumb", kind: "thumb" }]);
            await tx`update concept_jobs set result_path = ${path}, result_thumb_path = ${thumbPath}, image = null where id = ${id}`;
            return { j, path, thumbPath, size: { width: img.width, height: img.height } };
          }
        }
        return { j, path: j.result_path as string | null, thumbPath: j.result_thumb_path as string | null, size: null };
      });
      if (!state) continue;
      const { j } = state;
      let position: number | null = null;
      if (j.status === "queued") {
        const [{ n }] = await privilegedSql()`select count(*)::int as n from concept_jobs where status = 'queued' and created_at < ${j.created_at}`;
        position = n + 1;
      }
      let result: ConceptResult | null = null;
      if (state.path && state.thumbPath) {
        const signed = await signPaths([state.path, state.thumbPath]);
        const url = signed.get(state.path);
        const thumbUrl = signed.get(state.thumbPath);
        if (url && thumbUrl) result = { path: state.path, thumbPath: state.thumbPath, url, thumbUrl, width: state.size?.width ?? null, height: state.size?.height ?? null };
      }
      // "done" is only reported once the image is on the board's storage, so the card can be placed.
      const status = j.status === "done" && !result ? "running" : (j.status as ConceptJobState["status"]);
      out.push({ id, status, error: (j.error as string | null) ?? null, position, result });
    }
    return { ok: true, data: out };
  } catch (e) {
    return err(e, "Could not check on the images.");
  }
}

// ---------------------------------------------------------------- visual futures
/**
 * One click on the strategy page: a story canvas with a row per direction of the current strategy
 * version (who, tension, idea, world, how it shows up), filled from the research: Qloo entities, cited
 * evidence, source links, and the direction's own words. With AI on, an art director gives each direction
 * its own photographic look, two shots (portrait hero, landscape world) and copy lines; two frames per
 * direction are queued for the GPU PC and land in the world chapter.
 */
export async function visualFuturesAction(projectId: string): Promise<R<{ boardId: string; frames: number }>> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  if (!conceptsEnabled()) return { ok: false, error: NOT_SET_UP };
  try {
    const ctx = await guard();
    const ws = ctx.workspace.workspaceId;
    const facts = await withUser(ctx.user.id, async (tx) => {
      const cur = await currentDirections(tx, projectId);
      if (!cur?.directions.length) return null;
      const cc = await loadContext(tx, projectId);
      const evidence = new Map(await Promise.all(cur.directions.map(async (d) => [d.id, await loadEvidence(tx, d.evidenceIds)] as const)));
      const evIds = cur.directions.flatMap((d) => d.evidenceIds);
      const evCards = evIds.length ? await tx`select id, claim, evidence_type, source_provider, source_url, quality->>'score' as score from evidence_items where id = any(${evIds})` : [];
      const [run] = await tx`select id from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`;
      const docs = run ? await tx`select canonical_url, title, provider, publisher, source_type, left(excerpt, 240) as excerpt from research_documents
        where run_id = ${run.id} and canonical_url is not null and source_type in ('community_post', 'news', 'video', 'web_page') and duplicate_of is null
        order by (source_type = 'community_post') desc, (source_type = 'news') desc, published_at desc nulls last limit 30` : [];
      return { ...cur, cc, evidence, evCards, docs };
    });
    if (!facts) return { ok: false, error: "Generate strategy directions first." };
    const entities = await boardEntities(ctx, projectId);

    let plan: ShotPlan = { shots: new Map(), copy: new Map() };
    if (await llmEnabled(ctx.user.id, ws)) {
      try {
        plan = await writeShots(facts.cc, facts.directions, []);
      } catch (e) {
        console.error("[concepts] art director failed; using direction prompts", e instanceof Error ? e.message : e);
      }
    }
    const fallback = (d: (typeof facts.directions)[number]): Shot[] => [
      { title: "A human moment", prompt: `A candid human moment, portrait framing. ${basePrompt(facts.cc, d, [])}`, why: "", ...SIZES.hero },
      { title: "The world around it", prompt: `An object and environment still life, wide framing, no people. ${basePrompt(facts.cc, d, [])}`, why: "", ...SIZES.world },
    ];

    // Research for each row: entities its connections mention, its own evidence, and sources it cites (else fresh ones).
    const usedEntities = new Set<string>();
    const usedLinks = new Set<string>();
    const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
    const story: StoryDirection[] = facts.directions.map((d) => {
      const cards = facts.evCards.filter((r) => d.evidenceIds.includes(r.id as string)).slice(0, 2).map((r) => ({
        evidenceId: r.id as string, claim: String(r.claim).slice(0, 1200), evidenceType: r.evidence_type as string, source: (r.source_provider as string | null) ?? "",
        url: typeof r.source_url === "string" && /^https?:\/\//.test(r.source_url) ? r.source_url : null, score: r.score === null ? null : Number(r.score),
      }));
      const cited = new Set(cards.map((c) => c.url).filter(Boolean));
      const links = [...facts.docs.filter((x) => !cited.has(x.canonical_url as string)), ...facts.docs]
        .filter((x) => !usedLinks.has(x.canonical_url as string) && safeUrl(x.canonical_url))
        .slice(0, 2).map((x) => {
          usedLinks.add(x.canonical_url as string);
          return { url: x.canonical_url as string, title: String(x.title).slice(0, 200), siteName: String(x.publisher ?? x.provider ?? host(x.canonical_url as string)).slice(0, 120), note: x.excerpt ? String(x.excerpt).slice(0, 240) : "" };
        });
      return {
        slot: d.slot, name: d.name, coreIdea: d.coreIdea, positioning: d.positioning, audienceContext: d.audienceContext, tension: d.tension, brandRole: d.brandRole,
        pillars: d.pillars, experiment: d.experiment, entities: pickEntities(entities, d.connections, usedEntities), evidence: cards, links,
        copy: plan.copy.get(d.slot) ?? null, why: (plan.shots.get(d.slot) ?? []).map((sh) => sh.why).filter(Boolean),
      };
    });

    const result = await withUser(ctx.user.id, async (tx) => {
      const [b] = await tx`insert into inspiration_boards (project_id, workspace_id, name, created_by, updated_by)
        values (${projectId}, ${ws}, ${`Visual futures · strategy v${facts.version}`}, ${ctx.user.id}, ${ctx.user.id}) returning id, workspace_id, project_id`;
      const { nodes, world } = storyLayout(facts.version, story);
      const jobs: NewJob[] = facts.directions.flatMap((d) => (plan.shots.get(d.slot) ?? fallback(d)).slice(0, 2).map((shot): NewJob => ({
        workflow: "w1-concept", params: { prompt: shot.prompt, seed: seed(), width: shot.width, height: shot.height }, directionId: d.id,
        provenance: provenanceFor(facts.cc, d, facts.evidence.get(d.id) ?? [], shot.prompt, { title: shot.title, why: shot.why || undefined, placement: { group: world.get(d.slot) } }),
      })));
      const parsed = parseBoardContent({ nodes, viewport: null }, mediaPrefix(b.workspace_id, b.project_id, b.id));
      if (!parsed) throw new Error("visual futures layout failed validation");
      await tx`update inspiration_boards set content = ${tx.json(parsed as never)}, revision = revision + 1 where id = ${b.id}`;
      const ids = await insertJobs(tx, { workspace_id: b.workspace_id, project_id: b.project_id, board_id: b.id }, ctx.user.id, jobs);
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "created", objectType: "board", objectId: b.id, summary: "started visual futures for the strategy directions" });
      return { boardId: b.id as string, frames: ids?.length ?? 0 };
    });
    revalidatePath(`/projects/${projectId}/boards`);
    return { ok: true, data: result };
  } catch (e) {
    return err(e, "The visual futures could not be started.");
  }
}

// ---------------------------------------------------------------- evidence trail
export type ConceptTrail = { provenance: Provenance; fit: { level: string; rationale: string; tags: string[] } | null; parentFit: { level: string } | null; model: string; createdAt: string };

/** Everything a frame was built from, for the "Why this image" panel. Readable by anyone in the workspace. */
export async function conceptTrailAction(boardId: string, jobId: string): Promise<R<ConceptTrail>> {
  if (!isUuid(boardId) || !isUuid(jobId)) return { ok: false, error: "Invalid request." };
  try {
    const ctx = await getCtx();
    const row = await withUser(ctx.user.id, async (tx) => {
      const [j] = await tx`select j.provenance, j.fit, j.workflow, j.created_at, p.fit as parent_fit
        from concept_jobs j left join concept_jobs p on p.id = j.parent_id where j.id = ${jobId} and j.board_id = ${boardId}`;
      return j;
    });
    if (!row) return { ok: false, error: "This image's trail was not found." };
    const fit = row.fit as ConceptTrail["fit"];
    return { ok: true, data: {
      provenance: row.provenance as Provenance,
      fit: fit ? { level: fit.level, rationale: fit.rationale, tags: fit.tags ?? [] } : null,
      parentFit: row.parent_fit ? { level: (row.parent_fit as { level: string }).level } : null,
      model: row.workflow === "w3-variation" ? "RealVisXL V5 (image to image)" : "Z-Image Turbo",
      createdAt: new Date(row.created_at as string).toISOString(),
    } };
  } catch (e) {
    return err(e, "The trail could not be loaded.");
  }
}

// ---------------------------------------------------------------- art-director loop
const improveInput = z.object({
  cardId: z.string().min(1).max(80),
  thumbPath: z.string().max(400),
  jobId: z.string().uuid().nullable(),
  title: z.string().max(200),
  fit: z.object({ level: z.enum(["partial", "off"]), rationale: z.string().max(400), descriptors: z.array(z.string().max(60)).max(8) }),
});

/**
 * "Make it fit better": the art director looks at a weak frame and its fit result, names what to change,
 * and queues a rewritten frame (same seed, so it stays recognisably the same shot) beside the original.
 */
export async function improveConceptAction(boardId: string, input: z.input<typeof improveInput>): Promise<R<{ id: string; changes: string[]; diagnosis: string }>> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  const parsed = improveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Only frames with a partial or off fit can be improved." };
  const { cardId, thumbPath, jobId, title, fit } = parsed.data;
  if (!conceptsEnabled()) return { ok: false, error: NOT_SET_UP };
  try {
    const ctx = await guard();
    if (!(await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) return { ok: false, error: LLM_UNAVAILABLE };
    const facts = await withUser(ctx.user.id, async (tx) => {
      const [b] = await tx`select project_id, workspace_id, direction_id from inspiration_boards where id = ${boardId}`;
      if (!b) return null;
      const [parent] = jobId ? await tx`select id, params, provenance, direction_id from concept_jobs where id = ${jobId} and board_id = ${boardId}` : [];
      const [cc, dir] = await Promise.all([loadContext(tx, b.project_id), loadDirection(tx, b.project_id, (parent?.direction_id as string | null) ?? b.direction_id)]);
      return { b, parent, cc, dir, evidence: await loadEvidence(tx, dir?.evidenceIds ?? []) };
    });
    if (!facts) return { ok: false, error: "Board not found." };
    if (!thumbPath.startsWith(mediaPrefix(facts.b.workspace_id, facts.b.project_id, boardId)) || thumbPath.includes("..")) return { ok: false, error: "That image is not on this board." };
    const { supabaseServer } = await import("@/lib/auth/supabase");
    const { data: file, error } = await (await supabaseServer()).storage.from(BOARD_BUCKET).download(thumbPath);
    if (error || !file) return { ok: false, error: "The image could not be read." };

    const parentProv = facts.parent?.provenance as Provenance | undefined;
    const parentParams = (facts.parent?.params ?? {}) as { prompt?: string; seed?: number };
    const before = parentProv?.prompt || parentParams.prompt || basePrompt(facts.cc, facts.dir, []);
    const better = await improvePrompt(Buffer.from(await file.arrayBuffer()), facts.cc, facts.dir, { prompt: before, level: fit.level, rationale: fit.rationale, descriptors: fit.descriptors });

    const ids = await withUser(ctx.user.id, (tx) => insertJobs(tx, { workspace_id: facts.b.workspace_id, project_id: facts.b.project_id, board_id: boardId }, ctx.user.id, [{
      workflow: "w1-concept",
      params: { prompt: better.prompt, seed: typeof parentParams.seed === "number" ? parentParams.seed : seed(), width: 1024, height: 1024 },
      directionId: facts.dir?.id ?? null, parentId: facts.parent?.id as string | undefined ?? null,
      provenance: provenanceFor(facts.cc, facts.dir, facts.evidence, better.prompt, {
        title: `Improved · ${(parentProv?.title ?? title) || "concept"}`.slice(0, 80), why: parentProv?.why,
        placement: { anchor: cardId },
        improvement: { fromLevel: fit.level, fromRationale: fit.rationale, diagnosis: better.diagnosis, changes: better.changes },
      }),
    }]));
    if (!ids) return { ok: false, error: `This board already has ${MAX_ACTIVE_PER_BOARD} images on the way. Wait for some to finish.` };
    return { ok: true, data: { id: ids[0], changes: better.changes, diagnosis: better.diagnosis } };
  } catch (e) {
    return err(e, "The frame could not be improved. Try again shortly.");
  }
}
