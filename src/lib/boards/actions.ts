"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { logActivity } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { BOARD_BUCKET, mediaPrefix, signNodes, signPaths, storageAvailable } from "./data";
import { fetchLinkPreview, processImage, type LinkPreview, type ProcessedImage } from "./media";
import { boardPalette, mediaPaths, parseBoardContent, safeUrl } from "./schema";

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

const CONFLICT = "This board was changed in another tab or by a teammate.";
/** A snapshot is kept at most this often while someone edits, and only this many per board. */
const VERSION_EVERY_MS = 10 * 60 * 1000;
const VERSIONS_KEPT = 30;
/** Files no card or kept version uses are deleted after this grace period (undo and restore can bring them back). */
const MEDIA_GRACE_DAYS = 7;

type LatestBoard = { revision: number; nodes: Record<string, unknown>[] };

/**
 * Saves the whole board document. `revision` must match the stored one; on a mismatch the latest saved
 * board is returned so the editor can merge per card and retry instead of overwriting a teammate.
 */
export async function saveBoardAction(boardId: string, revision: number, content: unknown, opts: { snapshot?: boolean } = {}): Promise<R<{ revision: number; palette: string[] }> & { latest?: LatestBoard }> {
  if (!isUuid(boardId) || !Number.isInteger(revision)) return { ok: false, error: "Invalid board." };
  try {
    const ctx = await guard();
    const result = await withUser(ctx.user.id, async (tx) => {
      const [b] = await tx`select project_id, workspace_id, revision, content from inspiration_boards where id = ${boardId}`;
      if (!b) return { ok: false as const, error: "Board not found." };
      if (b.revision !== revision) return { ok: false as const, error: CONFLICT, conflict: true, latest: { revision: b.revision as number, nodes: (b.content?.nodes ?? []) as Record<string, unknown>[] } };
      const parsed = parseBoardContent(content, mediaPrefix(b.workspace_id, b.project_id, boardId));
      if (!parsed) return { ok: false as const, error: "The board could not be saved: it contains invalid cards." };
      const palette = boardPalette(parsed.nodes);
      const [u] = await tx`update inspiration_boards set content = ${tx.json(parsed as never)}, palette = ${palette}, revision = revision + 1,
        updated_at = now(), updated_by = ${ctx.user.id} where id = ${boardId} and revision = ${revision} returning revision`;
      if (!u) return { ok: false as const, error: CONFLICT, conflict: true };

      // Version history: a snapshot every 10 minutes of editing (or on request, e.g. before a restore), latest 30 kept.
      const [last] = await tx`select created_at from inspiration_board_versions where board_id = ${boardId} order by created_at desc limit 1`;
      if (parsed.nodes.length > 0 && (opts.snapshot || !last || Date.now() - new Date(last.created_at).getTime() > VERSION_EVERY_MS)) {
        await tx`insert into inspiration_board_versions (board_id, project_id, workspace_id, revision, content, card_count, created_by)
          values (${boardId}, ${b.project_id}, ${b.workspace_id}, ${u.revision}, ${tx.json(parsed as never)}, ${parsed.nodes.length}, ${ctx.user.id})`;
        await tx`delete from inspiration_board_versions where board_id = ${boardId} and id not in (
          select id from inspiration_board_versions where board_id = ${boardId} order by created_at desc limit ${VERSIONS_KEPT})`;
      }

      // Media register: files in use are (re)marked in use; files no card uses start their grace period.
      const used = mediaPaths(parsed.nodes);
      for (const path of used) {
        await tx`insert into inspiration_board_media (path, board_id, project_id, workspace_id, kind, created_by)
          values (${path}, ${boardId}, ${b.project_id}, ${b.workspace_id}, ${path.includes(".thumb.") ? "thumb" : path.includes(".preview.") ? "preview" : "image"}, ${ctx.user.id})
          on conflict (path) do update set unused_since = null`;
      }
      await tx`update inspiration_board_media set unused_since = now() where board_id = ${boardId} and unused_since is null and not (path = any(${used}))`;
      const stale = await tx`select m.path from inspiration_board_media m where m.board_id = ${boardId}
        and m.unused_since < now() - make_interval(days => ${MEDIA_GRACE_DAYS})
        and not exists (select 1 from inspiration_board_versions v where v.board_id = m.board_id and strpos(v.content::text, m.path) > 0)
        limit 100`;
      return { ok: true as const, data: { revision: u.revision as number, palette }, stale: stale.map((r) => r.path as string) };
    });
    if (!result.ok) {
      const latest = "latest" in result && result.latest ? { revision: result.latest.revision, nodes: await signNodes(result.latest.nodes) } : undefined;
      return { ok: false, error: result.error, conflict: "conflict" in result ? result.conflict : undefined, latest };
    }
    if (result.stale.length) await purgeMedia(ctx.user.id, boardId, result.stale);
    return { ok: true, data: result.data };
  } catch (e) {
    return err(e, "The board could not be saved. Your latest changes are still on screen.");
  }
}

/** Deletes unused files from Storage, then from the register. A Storage failure leaves both for the next save. */
async function purgeMedia(userId: string, boardId: string, paths: string[]) {
  if (!storageAvailable()) return;
  try {
    const { supabaseServer } = await import("@/lib/auth/supabase");
    const client = await supabaseServer();
    const { error } = await client.storage.from(BOARD_BUCKET).remove(paths);
    if (error) throw new Error(error.message);
    await withUser(userId, (tx) => tx`delete from inspiration_board_media where board_id = ${boardId} and path = any(${paths})`);
  } catch (e) {
    console.error("[boards] media purge failed", e instanceof Error ? e.message : e);
  }
}

/** Stores processed images for a board and registers them. Returns the stored paths in the same order. */
async function storeImages(userId: string, b: { workspace_id: string; project_id: string }, boardId: string, files: { buf: Buffer; suffix: string; kind: "image" | "thumb" | "preview" }[]) {
  const { supabaseServer } = await import("@/lib/auth/supabase");
  const client = await supabaseServer();
  const base = `${mediaPrefix(b.workspace_id, b.project_id, boardId)}${crypto.randomUUID()}`;
  const paths: string[] = [];
  for (const f of files) {
    const path = `${base}${f.suffix}.webp`;
    const { error } = await client.storage.from(BOARD_BUCKET).upload(path, f.buf, { contentType: "image/webp", upsert: false });
    if (error) throw new Error(`upload failed: ${error.message}`);
    paths.push(path);
  }
  // Registered as unused until a save references them, so abandoned uploads are cleaned up too.
  await withUser(userId, async (tx) => {
    for (const [i, f] of files.entries()) {
      await tx`insert into inspiration_board_media (path, board_id, project_id, workspace_id, kind, bytes, created_by, unused_since)
        values (${paths[i]}, ${boardId}, ${b.project_id}, ${b.workspace_id}, ${f.kind}, ${f.buf.length}, ${userId}, now()) on conflict (path) do nothing`;
    }
  });
  return paths;
}

/**
 * Uploads one image to the board's private media folder. The server re-encodes it to WebP, applying
 * orientation and removing all metadata (including GPS), and stores a card-sized thumbnail beside it.
 */
export async function uploadBoardImageAction(boardId: string, form: FormData): Promise<R<{ path: string; url: string; thumbPath: string; thumbUrl: string; width: number; height: number }>> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image." };
  if (!IMAGE_TYPES[file.type]) return { ok: false, error: "Use a JPEG, PNG, WebP, GIF or AVIF image." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be 10 MB or smaller." };
  if (!storageAvailable()) return { ok: false, error: "Image uploads need Supabase Storage, which is not configured on this server." };
  try {
    const ctx = await guard();
    const [b] = await withUser(ctx.user.id, (tx) => tx`select project_id, workspace_id from inspiration_boards where id = ${boardId}`);
    if (!b) return { ok: false, error: "Board not found." };
    let img: ProcessedImage;
    try {
      img = await processImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      return { ok: false, error: "That file could not be read as an image." };
    }
    const [path, thumbPath] = await storeImages(ctx.user.id, b as { workspace_id: string; project_id: string }, boardId, [{ buf: img.full, suffix: "", kind: "image" }, { buf: img.thumb, suffix: ".thumb", kind: "thumb" }]);
    const signed = await signPaths([path, thumbPath]);
    const url = signed.get(path);
    const thumbUrl = signed.get(thumbPath);
    if (!url || !thumbUrl) return { ok: false, error: "The image was uploaded but could not be displayed. Reload the board." };
    return { ok: true, data: { path, url, thumbPath, thumbUrl, width: img.width, height: img.height } };
  } catch (e) {
    return err(e, "The image could not be uploaded.");
  }
}

/** Title, site name and a stored preview image for a pasted or added link. Failure still allows a plain link card. */
export async function linkPreviewAction(boardId: string, rawUrl: string): Promise<R<{ url: string; title: string | null; siteName: string | null; description: string | null; imagePath: string | null; previewUrl: string | null }>> {
  const url = safeUrl(rawUrl);
  if (!isUuid(boardId) || !url) return { ok: false, error: "Enter a web address starting with http:// or https://" };
  try {
    const ctx = await guard();
    const [b] = await withUser(ctx.user.id, (tx) => tx`select project_id, workspace_id from inspiration_boards where id = ${boardId}`);
    if (!b) return { ok: false, error: "Board not found." };
    let p: LinkPreview;
    try {
      p = await fetchLinkPreview(url);
    } catch {
      return { ok: true, data: { url, title: null, siteName: null, description: null, imagePath: null, previewUrl: null } };
    }
    let imagePath: string | null = null;
    let previewUrl: string | null = null;
    if (p.image && storageAvailable()) {
      [imagePath] = await storeImages(ctx.user.id, b as { workspace_id: string; project_id: string }, boardId, [{ buf: p.image.thumb, suffix: ".preview", kind: "preview" }]);
      previewUrl = (await signPaths([imagePath])).get(imagePath) ?? null;
    }
    return { ok: true, data: { url, title: p.title, siteName: p.siteName, description: p.description, imagePath, previewUrl } };
  } catch (e) {
    return err(e, "The link preview could not be loaded.");
  }
}

/** Fresh signed URLs for a board's files (signed URLs expire; the canvas refreshes them before they do). */
export async function refreshMediaUrlsAction(boardId: string, paths: string[]): Promise<R<Record<string, string>>> {
  if (!isUuid(boardId) || !Array.isArray(paths)) return { ok: false, error: "Invalid board." };
  try {
    const ctx = await getCtx();
    const [b] = await withUser(ctx.user.id, (tx) => tx`select project_id, workspace_id from inspiration_boards where id = ${boardId}`);
    if (!b) return { ok: false, error: "Board not found." };
    const prefix = mediaPrefix(b.workspace_id, b.project_id, boardId);
    const own = paths.filter((p) => typeof p === "string" && p.startsWith(prefix)).slice(0, 1000);
    return { ok: true, data: Object.fromEntries(await signPaths(own)) };
  } catch (e) {
    return err(e, "Images could not be refreshed.");
  }
}

export type BoardVersionRow = { id: string; revision: number; cardCount: number; createdAt: string; author: string | null };

export async function listBoardVersionsAction(boardId: string): Promise<R<BoardVersionRow[]>> {
  if (!isUuid(boardId)) return { ok: false, error: "Invalid board." };
  try {
    const ctx = await getCtx();
    const rows = await withUser(ctx.user.id, (tx) => tx`select v.id, v.revision, v.card_count, v.created_at, p.full_name, p.email
      from inspiration_board_versions v left join profiles p on p.id = v.created_by where v.board_id = ${boardId} order by v.created_at desc`);
    return { ok: true, data: rows.map((r) => ({ id: r.id, revision: r.revision, cardCount: r.card_count, createdAt: new Date(r.created_at).toISOString(), author: r.full_name || r.email || null })) };
  } catch (e) {
    return err(e, "Version history could not be loaded.");
  }
}

/** A version's cards with signed URLs, for restoring into the editor (which then saves it as a new revision). */
export async function getBoardVersionAction(versionId: string): Promise<R<{ nodes: Record<string, unknown>[] }>> {
  if (!isUuid(versionId)) return { ok: false, error: "Invalid version." };
  try {
    const ctx = await guard();
    const [v] = await withUser(ctx.user.id, (tx) => tx`select content from inspiration_board_versions where id = ${versionId}`);
    if (!v) return { ok: false, error: "Version not found." };
    return { ok: true, data: { nodes: await signNodes((v.content?.nodes ?? []) as Record<string, unknown>[]) } };
  } catch (e) {
    return err(e, "That version could not be loaded.");
  }
}
