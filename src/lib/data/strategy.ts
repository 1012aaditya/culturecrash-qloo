import "server-only";
import { withUser, type Tx } from "@/lib/db";
import type { DirectionContent, RedTeamCritique } from "@/lib/ai/schemas";
import type { Receipt } from "@/components/evidence/evidence-receipt";
import type { DirectionView } from "@/components/strategy/strategy-studio";
import type { Ctx } from "./workspace";

export async function getStrategy(ctx: Ctx, projectId: string, version?: number | null) {
  return withUser(ctx.user.id, async (tx) => {
    const versions = await tx`select id, version, generator, is_demo, created_at from strategy_versions where project_id = ${projectId} order by version desc`;
    const current = (version && versions.find((v) => v.version === version)) || versions[0];
    if (!current) return { versions: [], current: null, directions: [] as DirectionView[], critique: null };
    const rows = await tx`select distinct on (slot) d.*, (select count(*) from strategy_directions x where x.version_id = d.version_id and x.slot = d.slot)::int as revision_count
      from strategy_directions d where d.version_id = ${current.id} order by slot, (status = 'selected') desc, revision desc`;
    const evIds = [...new Set(rows.flatMap((r) => r.evidence_ids as string[]))];
    const evMap = await loadReceipts(tx, evIds);
    const [crit] = await tx`select id, critique, generator, created_at from strategy_critiques where version_id = ${current.id} order by created_at desc limit 1`;
    const comments = rows.length ? await tx`select c.id, c.body, c.created_at, c.target_id, coalesce(p.full_name, p.email) as author from comments c left join profiles p on p.id = c.author_id
      where c.target_type = 'direction' and c.target_id = any(${rows.map((r) => r.id as string)}) order by c.created_at` : [];
    return {
      versions: versions.map((v) => ({ id: v.id as string, version: v.version as number, generator: v.generator as string, isDemo: v.is_demo as boolean, createdAt: new Date(v.created_at).toISOString() })),
      current: { id: current.id as string, version: current.version as number, generator: current.generator as string, isDemo: current.is_demo as boolean },
      critique: crit ? { id: crit.id as string, critique: crit.critique as RedTeamCritique, generator: crit.generator as string, createdAt: new Date(crit.created_at).toISOString() } : null,
      directions: rows.map((r): DirectionView => ({
        id: r.id, slot: r.slot, revision: r.revision, name: r.name, content: r.content as DirectionContent, status: r.status, isExploratory: r.is_exploratory,
        revisionNote: r.revision_note, createdAt: new Date(r.created_at).toISOString(), revisionCount: r.revision_count,
        evidence: (r.evidence_ids as string[]).map((id) => evMap.get(id) ?? { id, claim: "Evidence item", type: "unknown", source: null, url: null, retrievedAt: null }),
        comments: comments.filter((c) => c.target_id === r.id).map((c) => ({ id: c.id, body: c.body, author: c.author ?? "Someone", createdAt: new Date(c.created_at).toISOString() })),
      })),
    };
  });
}

/** The exact stored text behind each cited id, for evidence receipts. */
export async function loadReceipts(tx: Tx, ids: string[]): Promise<Map<string, Receipt>> {
  if (!ids.length) return new Map();
  const rows = await tx`select id, claim, evidence_type, source_provider, source_url, retrieved_at from evidence_items where id = any(${ids})`;
  return new Map(rows.map((r) => [r.id as string, {
    id: r.id as string, claim: r.claim as string, type: r.evidence_type as string, source: r.source_provider as string | null,
    url: r.source_url as string | null, retrievedAt: r.retrieved_at ? new Date(r.retrieved_at).toISOString() : null,
  }]));
}
