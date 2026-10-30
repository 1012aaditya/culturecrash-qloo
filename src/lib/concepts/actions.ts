"use server";

import { z } from "zod";
import { privilegedSql, withUser } from "@/lib/db";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { colourName } from "@/lib/boards/colour";
import { mediaPrefix, signPaths, storageAvailable } from "@/lib/boards/data";
import { processImage } from "@/lib/boards/media";
import { boardPalette } from "@/lib/boards/schema";
import { storeImages } from "@/lib/boards/store";
import { engineStatus } from "./worker";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Unfinished jobs allowed per board, so one click can't fill the PC's queue for everyone. */
const MAX_ACTIVE_PER_BOARD = 8;
const VARIATION_NEGATIVE = "text, watermark, logo, deformed hands, low quality, blurry";

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

export type ConceptSetup = { engine: { online: boolean; ready: boolean; gpu: string | null }; prompt: string };

/**
 * GPU PC status and a starting prompt built from the project: brand and audience from the brief, the
 * board's strategy direction (or the selected one), the strongest Qloo taste tags and the board palette.
 */
export async function conceptSetupAction(boardId: string): Promise<R<ConceptSetup>> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  try {
    const ctx = await guard();
    const facts = await withUser(ctx.user.id, async (tx) => {
      const [b] = await tx`select project_id, direction_id, content->'nodes' as nodes from inspiration_boards where id = ${boardId}`;
      if (!b) return null;
      const [brief] = await tx`select brand, category, audience from campaign_briefs where project_id = ${b.project_id}`;
      const [dir] = await tx`select d.name, d.content->>'coreIdea' as core_idea from strategy_directions d
        where d.id = coalesce(${b.direction_id}::uuid, (select selected_direction_id from projects where id = ${b.project_id}))`;
      const [run] = await tx`select id from research_runs where project_id = ${b.project_id} and status in ('completed', 'partially_completed') order by created_at desc limit 1`;
      const tags = run ? await tx`select name from cultural_entities where run_id = ${run.id} and role = 'tag' order by affinity desc nulls last limit 5` : [];
      return { nodes: (b.nodes ?? []) as { type: string; data: Record<string, unknown> }[], brief, dir, tags: tags.map((t) => t.name as string) };
    });
    if (!facts) return { ok: false, error: "Board not found." };
    const colours = [...new Set(boardPalette(facts.nodes as never).slice(0, 4).map((h) => colourName(h).toLowerCase()))];
    const brand = facts.brief?.brand as string | null;
    const category = facts.brief?.category as string | null;
    const prompt = [
      `Editorial campaign photograph${brand ? ` for ${brand}` : ""}${category ? `, a ${category} brand` : ""}.`,
      facts.dir ? `Concept: ${(facts.dir.core_idea as string | null) || facts.dir.name}.` : "",
      facts.brief?.audience ? `Audience: ${String(facts.brief.audience).slice(0, 200)}.` : "",
      facts.tags.length ? `Cultural cues: ${facts.tags.join(", ")}.` : "",
      colours.length ? `Colour palette: ${colours.join(", ")}.` : "",
      "Natural light, real textures, no text, no logos, no recognisable people.",
    ].filter(Boolean).join(" ").slice(0, 2000);
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
  if (!storageAvailable()) return { ok: false, error: "Generated images need Supabase Storage, which is not configured on this server." };
  try {
    const ctx = await guard();
    const [b] = await withUser(ctx.user.id, (tx) => tx`select project_id, workspace_id from inspiration_boards where id = ${boardId}`);
    if (!b) return { ok: false, error: "Board not found." };
    let image: string | undefined;
    if (kind === "variation") {
      if (!sourcePath || sourcePath.includes("..") || !sourcePath.startsWith(mediaPrefix(b.workspace_id, b.project_id, boardId))) return { ok: false, error: "That image is not on this board." };
      image = (await signPaths([sourcePath])).get(sourcePath);
      if (!image) return { ok: false, error: "The source image could not be read." };
    }
    const ids = await withUser(ctx.user.id, async (tx) => {
      const [{ n }] = await tx`select count(*)::int as n from concept_jobs where board_id = ${boardId} and status in ('queued', 'running')`;
      if (n + count > MAX_ACTIVE_PER_BOARD) return null;
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const seed = Math.floor(Math.random() * 2 ** 32);
        const params = kind === "concept"
          ? { prompt, seed, width: 1024, height: 1024 }
          : { prompt, negative: VARIATION_NEGATIVE, seed, denoise: 0.45, image };
        const [row] = await tx`insert into concept_jobs (workspace_id, project_id, board_id, created_by, workflow, params)
          values (${b.workspace_id}, ${b.project_id}, ${boardId}, ${ctx.user.id}, ${kind === "concept" ? "w1-concept" : "w3-variation"}, ${tx.json(params)}) returning id`;
        out.push(row.id as string);
      }
      return out;
    });
    if (!ids) return { ok: false, error: `This board already has ${MAX_ACTIVE_PER_BOARD} images on the way. Wait for some to finish.` };
    return { ok: true, data: { ids } };
  } catch (e) {
    return err(e, "The images could not be queued.");
  }
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
