import "server-only";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import type { Ctx } from "@/lib/data/workspace";
import { storageAvailable } from "@/lib/boards/data";

export type PendingConcept = { id: string; kind: "concept" | "variation" };

/** Generation needs a GPU PC token and Storage for the results. */
export function conceptsEnabled() {
  return Boolean(env().CC_WORKER_TOKEN) && storageAvailable();
}

/** This user's images still on their way to the board, so a reload picks them up again. */
export async function pendingConcepts(ctx: Ctx, boardId: string): Promise<PendingConcept[]> {
  if (!conceptsEnabled()) return [];
  const rows = await withUser(ctx.user.id, (tx) => tx`select id, workflow from concept_jobs
    where board_id = ${boardId} and created_by = ${ctx.user.id} and created_at > now() - interval '2 hours'
      and (status in ('queued', 'running') or (status = 'done' and result_path is null))
    order by created_at limit 20`);
  return rows.map((r) => ({ id: r.id as string, kind: r.workflow === "w3-variation" ? "variation" : "concept" }));
}
