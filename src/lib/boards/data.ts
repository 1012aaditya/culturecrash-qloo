import "server-only";
import { withUser, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import type { Ctx } from "@/lib/data/workspace";
import { mediaPaths, type EntityData, type EvidenceCardData } from "./schema";

export const BOARD_BUCKET = "board-media";
const SIGNED_URL_SECONDS = 60 * 60 * 6;

export type BoardSummary = { id: string; name: string; palette: string[]; cardCount: number; updatedAt: string; previewPaths: string[]; previewUrls: string[] };
export type BoardDoc = { id: string; projectId: string; name: string; revision: number; palette: string[]; directionId: string | null; content: { nodes: Record<string, unknown>[]; viewport: { x: number; y: number; zoom: number } | null } };

export function mediaPrefix(workspaceId: string, projectId: string, boardId: string) {
  return `${workspaceId}/${projectId}/${boardId}/`;
}

export function storageAvailable() {
  const e = env();
  return e.AUTH_MODE === "supabase" && Boolean(e.NEXT_PUBLIC_SUPABASE_URL);
}

/** Signs private board-media paths for display. Missing or unsigned paths map to null. */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length || !storageAvailable()) return out;
  const { supabaseServer } = await import("@/lib/auth/supabase");
  const client = await supabaseServer();
  const { data } = await client.storage.from(BOARD_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

/** Board images as JPEG bytes for the PDF report (react-pdf reads only JPEG and PNG). Missing files are skipped. */
export async function boardImagesAsJpeg(paths: string[]): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  const unique = [...new Set(paths.filter(Boolean))].slice(0, 12);
  if (!unique.length || !storageAvailable()) return out;
  const [{ supabaseServer }, { default: sharp }] = await Promise.all([import("@/lib/auth/supabase"), import("sharp")]);
  const client = await supabaseServer();
  await Promise.all(unique.map(async (path) => {
    const { data } = await client.storage.from(BOARD_BUCKET).download(path);
    if (!data) return;
    try {
      out.set(path, await sharp(Buffer.from(await data.arrayBuffer())).resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer());
    } catch { /* an unreadable file is left out of the PDF rather than failing it */ }
  }));
  return out;
}

const imagePaths = (nodes: Record<string, unknown>[]) =>
  nodes.flatMap((n) => {
    const d = n.data as { path?: unknown; thumbPath?: unknown } | undefined;
    const p = d?.thumbPath ?? d?.path;
    return n.type === "image" && typeof p === "string" ? [p] : [];
  });

/** Adds signed display URLs to every stored file a set of cards uses (`url`, `thumbUrl`, `previewUrl`). */
export async function signNodes(nodes: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const signed = await signPaths(mediaPaths(nodes as { type?: string; data: Record<string, unknown> }[]));
  return nodes.map((n) => {
    const d = n.data as Record<string, unknown>;
    if (n.type === "image") {
      return { ...n, data: { ...d, url: typeof d.path === "string" ? signed.get(d.path) : undefined, thumbUrl: typeof d.thumbPath === "string" ? signed.get(d.thumbPath) : undefined } };
    }
    if (n.type === "link" && typeof d.imagePath === "string") return { ...n, data: { ...d, previewUrl: signed.get(d.imagePath) } };
    return n;
  });
}

export async function listBoards(ctx: Ctx, projectId: string): Promise<BoardSummary[]> {
  const rows = await withUser(ctx.user.id, (tx) => tx`
    select id, name, palette, updated_at, jsonb_array_length(content->'nodes') as card_count, content->'nodes' as nodes
    from inspiration_boards where project_id = ${projectId} order by updated_at desc`);
  const previews = rows.map((r) => [...new Set(imagePaths(r.nodes as Record<string, unknown>[]))].slice(0, 3));
  const signed = await signPaths(previews.flat());
  return rows.map((r, i) => ({
    id: r.id, name: r.name, palette: r.palette ?? [], cardCount: Number(r.card_count), updatedAt: new Date(r.updated_at).toISOString(),
    previewPaths: previews[i], previewUrls: previews[i].map((p) => signed.get(p)).filter((u): u is string => Boolean(u)),
  }));
}

export async function getBoard(ctx: Ctx, projectId: string, boardId: string): Promise<BoardDoc | null> {
  const [row] = await withUser(ctx.user.id, (tx) => tx`select * from inspiration_boards where id = ${boardId} and project_id = ${projectId}`);
  if (!row) return null;
  const withUrls = await signNodes((row.content?.nodes ?? []) as Record<string, unknown>[]);
  return { id: row.id, projectId: row.project_id, name: row.name, revision: row.revision, palette: row.palette ?? [], directionId: row.direction_id ?? null, content: { nodes: withUrls, viewport: row.content?.viewport ?? null } };
}

/** Qloo results and taste tags from the campaign's latest completed research run, for dragging onto a board. */
export async function boardEntities(ctx: Ctx, projectId: string): Promise<EntityData[]> {
  return withUser(ctx.user.id, async (tx: Tx) => {
    const [run] = await tx`select id from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`;
    if (!run) return [];
    const rows = await tx`
      select e.id, e.name, e.entity_type, e.role, e.affinity, e.properties->>'image_url' as image_url,
        (select ev.id from evidence_items ev where ev.run_id = e.run_id and e.id = any(ev.entity_ids) and ev.evidence_type = 'provider_observation' limit 1) as evidence_id
      from cultural_entities e where e.run_id = ${run.id} and e.role in ('result', 'tag') order by e.affinity desc nulls last limit 150`;
    return rows.map((r) => ({
      entityId: r.id, name: r.name, type: r.role === "tag" ? "tag" : r.entity_type, role: r.role, affinity: r.affinity === null ? null : Number(r.affinity),
      imageUrl: r.image_url && String(r.image_url).startsWith("https://") ? r.image_url : null, evidenceId: r.evidence_id ?? null,
    }));
  });
}

/**
 * Removes every stored file of the given boards from Storage. Each board's folder is listed, so files from
 * before the media register existed are included. Throws when Storage refuses, so a caller can stop before
 * deleting database rows and leave nothing orphaned.
 */
export async function removeBoardFolders(boards: { id: string; workspace_id: string; project_id: string }[]) {
  if (!boards.length || !storageAvailable()) return;
  const { supabaseServer } = await import("@/lib/auth/supabase");
  const bucket = (await supabaseServer()).storage.from(BOARD_BUCKET);
  for (const b of boards) {
    const prefix = mediaPrefix(b.workspace_id, b.project_id, b.id);
    for (;;) {
      const { data, error } = await bucket.list(prefix.slice(0, -1), { limit: 100 });
      if (error) throw new Error(`board media listing failed: ${error.message}`);
      if (!data?.length) break;
      const { error: rmError } = await bucket.remove(data.map((f) => prefix + f.name));
      if (rmError) throw new Error(`board media removal failed: ${rmError.message}`);
      if (data.length < 100) break;
    }
  }
}

/** Cited evidence that can be placed on a board: web claims, approved conclusions and experiment results. */
export async function boardEvidence(ctx: Ctx, projectId: string): Promise<EvidenceCardData[]> {
  const rows = await withUser(ctx.user.id, (tx) => tx`
    select id, claim, evidence_type, source_provider, source_url, quality->>'score' as score
    from evidence_items where project_id = ${projectId} and evidence_type in ('external_source', 'approved_conclusion', 'experiment_result')
      and review_status <> 'rejected'
    order by (evidence_type = 'approved_conclusion') desc, (quality->>'score')::numeric desc nulls last, created_at desc limit 120`);
  return rows.map((r) => ({
    evidenceId: r.id, claim: String(r.claim).slice(0, 1200), evidenceType: r.evidence_type, source: r.source_provider ?? "",
    url: typeof r.source_url === "string" && /^https?:\/\//.test(r.source_url) ? r.source_url : null, score: r.score === null ? null : Number(r.score),
  }));
}

export type DirectionOption = { id: string; name: string; slot: number; selected: boolean };

/** The current strategy version's directions (latest revision of each slot), for linking boards. */
export async function boardDirections(ctx: Ctx, projectId: string): Promise<DirectionOption[]> {
  const rows = await withUser(ctx.user.id, (tx) => tx`
    select distinct on (d.slot) d.id, d.name, d.slot, (p.selected_direction_id is not null and sel.version_id = d.version_id and sel.slot = d.slot) as selected
    from strategy_directions d
    join projects p on p.id = d.project_id
    left join strategy_directions sel on sel.id = p.selected_direction_id
    where d.project_id = ${projectId} and d.version_id = (select id from strategy_versions where project_id = ${projectId} order by version desc limit 1)
    order by d.slot, d.revision desc`);
  return rows.map((r) => ({ id: r.id, name: r.name, slot: r.slot, selected: Boolean(r.selected) }));
}

export type LinkedBoard = { id: string; name: string; palette: string[]; previewUrls: string[]; cardCount: number };

/**
 * Boards linked to a direction. Matching is on the direction's (version, slot), so a board stays linked
 * to every revision of that direction.
 */
export async function boardsForDirections(ctx: Ctx, projectId: string, directionIds: string[]): Promise<Map<string, LinkedBoard[]>> {
  const out = new Map<string, LinkedBoard[]>();
  if (!directionIds.length) return out;
  const rows = await withUser(ctx.user.id, (tx) => tx`
    select want.id as direction_id, b.id, b.name, b.palette, b.content->'nodes' as nodes, jsonb_array_length(b.content->'nodes') as card_count
    from strategy_directions want
    join strategy_directions linked on linked.version_id = want.version_id and linked.slot = want.slot
    join inspiration_boards b on b.direction_id = linked.id and b.project_id = ${projectId}
    where want.id = any(${directionIds}::uuid[])
    order by b.updated_at desc`);
  const previews = rows.map((r) => [...new Set(imagePaths(r.nodes as Record<string, unknown>[]))].slice(0, 6));
  const signed = await signPaths(previews.flat());
  rows.forEach((r, i) => {
    const list = out.get(r.direction_id) ?? [];
    if (!list.some((b) => b.id === r.id)) {
      list.push({ id: r.id, name: r.name, palette: r.palette ?? [], cardCount: Number(r.card_count), previewUrls: previews[i].map((p) => signed.get(p)).filter((u): u is string => Boolean(u)) });
    }
    out.set(r.direction_id, list);
  });
  return out;
}
