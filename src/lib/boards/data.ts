import "server-only";
import { withUser, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import type { Ctx } from "@/lib/data/workspace";
import type { EntityData } from "./schema";

export const BOARD_BUCKET = "board-media";
const SIGNED_URL_SECONDS = 60 * 60 * 6;

export type BoardSummary = { id: string; name: string; palette: string[]; cardCount: number; updatedAt: string; previewPaths: string[]; previewUrls: string[] };
export type BoardDoc = { id: string; projectId: string; name: string; revision: number; palette: string[]; content: { nodes: Record<string, unknown>[]; viewport: { x: number; y: number; zoom: number } | null } };

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

const imagePaths = (nodes: Record<string, unknown>[]) =>
  nodes.flatMap((n) => (n.type === "image" && typeof (n.data as { path?: unknown })?.path === "string" ? [(n.data as { path: string }).path] : []));

export async function listBoards(ctx: Ctx, projectId: string): Promise<BoardSummary[]> {
  const rows = await withUser(ctx.user.id, (tx) => tx`
    select id, name, palette, updated_at, jsonb_array_length(content->'nodes') as card_count, content->'nodes' as nodes
    from inspiration_boards where project_id = ${projectId} order by updated_at desc`);
  const previews = rows.map((r) => imagePaths(r.nodes as Record<string, unknown>[]).slice(0, 3));
  const signed = await signPaths(previews.flat());
  return rows.map((r, i) => ({
    id: r.id, name: r.name, palette: r.palette ?? [], cardCount: Number(r.card_count), updatedAt: new Date(r.updated_at).toISOString(),
    previewPaths: previews[i], previewUrls: previews[i].map((p) => signed.get(p)).filter((u): u is string => Boolean(u)),
  }));
}

export async function getBoard(ctx: Ctx, projectId: string, boardId: string): Promise<BoardDoc | null> {
  const [row] = await withUser(ctx.user.id, (tx) => tx`select * from inspiration_boards where id = ${boardId} and project_id = ${projectId}`);
  if (!row) return null;
  const nodes = ((row.content?.nodes ?? []) as Record<string, unknown>[]);
  const signed = await signPaths(imagePaths(nodes));
  const withUrls = nodes.map((n) => {
    const d = n.data as { path?: string };
    return n.type === "image" && d?.path ? { ...n, data: { ...d, url: signed.get(d.path) } } : n;
  });
  return { id: row.id, projectId: row.project_id, name: row.name, revision: row.revision, palette: row.palette ?? [], content: { nodes: withUrls, viewport: row.content?.viewport ?? null } };
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
