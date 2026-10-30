"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { logActivity } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { BOARD_BUCKET, mediaPrefix, signPaths, storageAvailable } from "./data";
import { boardPalette, parseBoardContent } from "./schema";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; conflict?: boolean };

const name = z.string().trim().min(1, "Name the board").max(120);
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function guard() {
  const ctx = await getCtx();
  assertCan(ctx.workspace.role, "board.edit");
  return ctx;
}
function err(e: unknown, fallback = "The change could not be saved."): { ok: false; error: string } {
  if (e instanceof ForbiddenError) return { ok: false, error: e.message };
  console.error("[boards]", e instanceof Error ? e.message : e);
  return { ok: false, error: fallback };
}

export async function createBoardAction(projectId: string, rawName: string): Promise<R<{ id: string }>> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  const n = name.safeParse(rawName);
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  try {
    const ctx = await guard();
    const ws = ctx.workspace.workspaceId;
    const id = await withUser(ctx.user.id, async (tx) => {
      const [b] = await tx`insert into inspiration_boards (project_id, workspace_id, name, created_by, updated_by)
        values (${projectId}, ${ws}, ${n.data}, ${ctx.user.id}, ${ctx.user.id}) returning id`;
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "created", objectType: "board", objectId: b.id, summary: `created inspiration board “${n.data}”` });
      return b.id as string;
    });
    revalidatePath(`/projects/${projectId}/boards`);
    return { ok: true, data: { id } };
  } catch (e) {
    return err(e);
  }
}

export async function renameBoardAction(boardId: string, rawName: string): Promise<R> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  const n = name.safeParse(rawName);
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  try {
    const ctx = await guard();
    const [b] = await withUser(ctx.user.id, (tx) => tx`update inspiration_boards set name = ${n.data}, updated_at = now(), updated_by = ${ctx.user.id} where id = ${boardId} returning project_id`);
    if (!b) return { ok: false, error: "Board not found." };
    revalidatePath(`/projects/${b.project_id}/boards`, "layout");
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

export async function deleteBoardAction(boardId: string): Promise<R> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  try {
    const ctx = await guard();
    const b = await withUser(ctx.user.id, async (tx) => {
      const [row] = await tx`delete from inspiration_boards where id = ${boardId} returning project_id, workspace_id, name`;
      if (row) await logActivity(tx, { workspaceId: row.workspace_id, actorId: ctx.user.id, projectId: row.project_id, verb: "deleted", objectType: "board", objectId: boardId, summary: `deleted inspiration board “${row.name}”` });
      return row;
    });
    if (!b) return { ok: false, error: "Board not found." };
    // The board's media folder goes with it; a failure here only leaves orphaned files in the private bucket.
    if (storageAvailable()) {
      try {
        const { supabaseServer } = await import("@/lib/auth/supabase");
        const client = await supabaseServer();
        const prefix = mediaPrefix(b.workspace_id, b.project_id, boardId);
        const { data } = await client.storage.from(BOARD_BUCKET).list(prefix.slice(0, -1), { limit: 1000 });
        if (data?.length) await client.storage.from(BOARD_BUCKET).remove(data.map((f) => prefix + f.name));
      } catch (e) {
        console.error("[boards] media cleanup failed", e instanceof Error ? e.message : e);
      }
    }
    revalidatePath(`/projects/${b.project_id}/boards`);
    return { ok: true };
  } catch (e) {
    return err(e, "The board could not be deleted.");
  }
}

/** Saves the whole board document. `revision` must match the stored one, so two editors cannot silently overwrite each other. */
export async function saveBoardAction(boardId: string, revision: number, content: unknown): Promise<R<{ revision: number; palette: string[] }>> {
  if (!isUuid(boardId) || !Number.isInteger(revision)) return { ok: false, error: "Invalid board." };
  try {
    const ctx = await guard();
    return await withUser(ctx.user.id, async (tx) => {
      const [b] = await tx`select project_id, workspace_id, revision from inspiration_boards where id = ${boardId}`;
      if (!b) return { ok: false as const, error: "Board not found." };
      if (b.revision !== revision) return { ok: false as const, error: "This board was changed in another tab or by a teammate. Reload to see the latest version.", conflict: true };
      const parsed = parseBoardContent(content, mediaPrefix(b.workspace_id, b.project_id, boardId));
      if (!parsed) return { ok: false as const, error: "The board could not be saved: it contains invalid cards." };
      const palette = boardPalette(parsed.nodes);
      const [u] = await tx`update inspiration_boards set content = ${tx.json(parsed as never)}, palette = ${palette}, revision = revision + 1,
        updated_at = now(), updated_by = ${ctx.user.id} where id = ${boardId} and revision = ${revision} returning revision`;
      if (!u) return { ok: false as const, error: "This board was changed in another tab or by a teammate. Reload to see the latest version.", conflict: true };
      return { ok: true as const, data: { revision: u.revision as number, palette } };
    });
  } catch (e) {
    return err(e, "The board could not be saved. Your latest changes are still on screen.");
  }
}

/** Uploads one image to the board's private media folder and returns its path plus a signed display URL. */
export async function uploadBoardImageAction(boardId: string, form: FormData): Promise<R<{ path: string; url: string }>> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image." };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a JPEG, PNG, WebP, GIF or AVIF image." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be 10 MB or smaller." };
  if (!storageAvailable()) return { ok: false, error: "Image uploads need Supabase Storage, which is not configured on this server." };
  try {
    const ctx = await guard();
    const [b] = await withUser(ctx.user.id, (tx) => tx`select project_id, workspace_id from inspiration_boards where id = ${boardId}`);
    if (!b) return { ok: false, error: "Board not found." };
    const path = `${mediaPrefix(b.workspace_id, b.project_id, boardId)}${crypto.randomUUID()}.${ext}`;
    const { supabaseServer } = await import("@/lib/auth/supabase");
    const client = await supabaseServer();
    const { error } = await client.storage.from(BOARD_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) {
      console.error("[boards] upload failed", error.message);
      return { ok: false, error: "The image could not be uploaded." };
    }
    const url = (await signPaths([path])).get(path);
    if (!url) return { ok: false, error: "The image was uploaded but could not be displayed. Reload the board." };
    return { ok: true, data: { path, url } };
  } catch (e) {
    return err(e, "The image could not be uploaded.");
  }
}
