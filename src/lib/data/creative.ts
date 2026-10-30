import "server-only";
import type { Tx } from "@/lib/db";
import type { ReceiptClaim } from "@/components/evidence/evidence-receipt";
import { loadReceipts } from "./strategy";

/** The latest creative brief, or a specific earlier version, plus the list of versions to pick from. */
export async function loadCreativeBrief(tx: Tx, projectId: string, briefId?: string | null) {
  const [cb] = await tx`select cb.*, d.name as direction_name, d.evidence_ids, d.revision as direction_revision, coalesce(p.full_name, p.email) as updated_by_name
    from creative_briefs cb left join strategy_directions d on d.id = cb.direction_id left join profiles p on p.id = cb.updated_by
    where cb.project_id = ${projectId} ${briefId ? tx`and cb.id = ${briefId}` : tx``} order by cb.created_at desc limit 1`;
  if (!cb) return null;
  const versions = (await tx`select cb.id, cb.created_at, cb.generator, d.name as direction_name from creative_briefs cb left join strategy_directions d on d.id = cb.direction_id
    where cb.project_id = ${projectId} order by cb.created_at desc`).map((v, i, all) => ({
    id: v.id as string, number: all.length - i, createdAt: new Date(v.created_at).toISOString(), generator: v.generator as string, directionName: v.direction_name as string | null,
  }));
  const evidence = (cb.evidence_ids as string[] | null)?.length
    ? await tx`select id, claim, source_provider, retrieved_at, normalized_value from evidence_items where id = any(${cb.evidence_ids})`
    : [];
  const grounding = ((cb.grounding as (ReceiptClaim & { section: string })[] | null) ?? []);
  const receipts = await loadReceipts(tx, [...new Set(grounding.flatMap((g) => g.evidenceIds))]);
  return { cb, evidence, grounding, receipts: Object.fromEntries(receipts), versions };
}
