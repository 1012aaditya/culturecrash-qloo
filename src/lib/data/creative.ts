import "server-only";
import type { Tx } from "@/lib/db";
import type { ReceiptClaim } from "@/components/evidence/evidence-receipt";
import { loadReceipts } from "./strategy";

export async function loadCreativeBrief(tx: Tx, projectId: string) {
  const [cb] = await tx`select cb.*, d.name as direction_name, d.evidence_ids, d.revision as direction_revision, coalesce(p.full_name, p.email) as updated_by_name
    from creative_briefs cb left join strategy_directions d on d.id = cb.direction_id left join profiles p on p.id = cb.updated_by
    where cb.project_id = ${projectId} order by cb.created_at desc limit 1`;
  if (!cb) return null;
  const evidence = (cb.evidence_ids as string[] | null)?.length
    ? await tx`select id, claim, source_provider, retrieved_at, normalized_value from evidence_items where id = any(${cb.evidence_ids})`
    : [];
  const grounding = ((cb.grounding as (ReceiptClaim & { section: string })[] | null) ?? []);
  const receipts = await loadReceipts(tx, [...new Set(grounding.flatMap((g) => g.evidenceIds))]);
  return { cb, evidence, grounding, receipts: Object.fromEntries(receipts) };
}
