import "server-only";
import { withUser } from "@/lib/db";
import type { DirectionContent } from "@/lib/ai/schemas";
import type { DirectionView } from "@/components/strategy/strategy-studio";
import type { Ctx } from "./workspace";

export async function getStrategy(ctx: Ctx, projectId: string, version?: number | null) {
  return withUser(ctx.user.id, async (tx) => {
    const versions = await tx`select id, version, generator, is_demo, created_at from strategy_versions where project_id = ${projectId} order by version desc`;
    const current = (version && versions.find((v) => v.version === version)) || versions[0];
    if (!current) return { versions: [], current: null, directions: [] as DirectionView[] };
    const rows = await tx`select distinct on (slot) d.*, (select count(*) from strategy_directions x where x.version_id = d.version_id and x.slot = d.slot)::int as revision_count
      from strategy_directions d where d.version_id = ${current.id} order by slot, (status = 'selected') desc, revision desc`;
    const evIds = [...new Set(rows.flatMap((r) => r.evidence_ids as string[]))];
    const claims = evIds.length ? await tx`select id, claim from evidence_items where id = any(${evIds})` : [];
    const claimMap = new Map(claims.map((c) => [c.id as string, c.claim as string]));
    const comments = rows.length ? await tx`select c.id, c.body, c.created_at, c.target_id, coalesce(p.full_name, p.email) as author from comments c left join profiles p on p.id = c.author_id
      where c.target_type = 'direction' and c.target_id = any(${rows.map((r) => r.id as string)}) order by c.created_at` : [];
    return {
      versions: versions.map((v) => ({ id: v.id as string, version: v.version as number, generator: v.generator as string, isDemo: v.is_demo as boolean, createdAt: new Date(v.created_at).toISOString() })),
      current: { id: current.id as string, version: current.version as number, generator: current.generator as string, isDemo: current.is_demo as boolean },
      directions: rows.map((r): DirectionView => ({
        id: r.id, slot: r.slot, revision: r.revision, name: r.name, content: r.content as DirectionContent, status: r.status, isExploratory: r.is_exploratory,
        revisionNote: r.revision_note, createdAt: new Date(r.created_at).toISOString(), revisionCount: r.revision_count,
        evidence: (r.evidence_ids as string[]).map((id) => ({ id, claim: claimMap.get(id) ?? "Evidence item" })),
        comments: comments.filter((c) => c.target_id === r.id).map((c) => ({ id: c.id, body: c.body, author: c.author ?? "Someone", createdAt: new Date(c.created_at).toISOString() })),
      })),
    };
  });
}
