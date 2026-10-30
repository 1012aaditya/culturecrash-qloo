import "server-only";
import type { Tx } from "@/lib/db";
import { contentHash, normalizeText } from "@/lib/research/deep/dedupe";
import type { SourceType } from "@/lib/research/deep/types";
import { hostOf } from "@/lib/research/deep/url";
import { clipExcerpt } from "./plan";

/** What a watch already holds, for duplicate checks across sources and runs. */
export type Known = { byUrl: Map<string, string>; byHash: Map<string, string>; byTitle: Map<string, string> };
export type StoreCtx = { ws: string; watchId: string; jobId: string; known: Known };

export type Item = {
  provider: string;
  sourceType: SourceType;
  /** Already canonical. */
  url: string;
  externalId: string | null;
  title: string;
  snippet: string;
  publisher: string | null;
  publishedAt: string | null;
  publishedPrecision?: "exact" | "day" | "approximate";
  usageRestrictions: string | null;
  metrics?: Record<string, number>;
  query: string | null;
};

export async function loadKnown(tx: Tx, watchId: string): Promise<Known> {
  const rows = await tx`select id, canonical_url, content_hash, title from research_documents where watch_id = ${watchId} and retrieved_at > now() - interval '30 days'`;
  return {
    byUrl: new Map(rows.filter((k) => k.canonical_url).map((k) => [k.canonical_url as string, k.id as string])),
    byHash: new Map(rows.filter((k) => k.content_hash).map((k) => [k.content_hash as string, k.id as string])),
    byTitle: new Map(rows.map((k) => [normalizeText(k.title as string), k.id as string])),
  };
}

/**
 * Stores an item once per watch (research_documents) and records this sighting (watch_observations).
 * Copies of the same story elsewhere (same headline) are kept but linked through duplicate_of.
 */
export async function storeItem(tx: Tx, ctx: StoreCtx, item: Item, targetId: string, taskKey: string, rank: number): Promise<{ docId: string | null; added: boolean }> {
  const { known } = ctx;
  const hash = contentHash(`${item.title}\n${item.snippet}`);
  let docId = known.byUrl.get(item.url) ?? known.byHash.get(hash) ?? null;
  let added = false;
  if (!docId) {
    const title = normalizeText(item.title);
    const duplicateOf = title.length > 24 ? known.byTitle.get(title) ?? null : null;
    const [row] = await tx`
      insert into research_documents (workspace_id, watch_id, watch_target_id, watch_job_id, provider, source_type, canonical_url, external_id, title, publisher,
        published_at, published_precision, retrieved_at, excerpt, content_hash, extraction_status, duplicate_of, discovery_query, usage_restrictions, metrics, is_demo)
      values (${ctx.ws}, ${ctx.watchId}, ${targetId}, ${ctx.jobId}, ${item.provider}, ${item.sourceType}, ${item.url}, ${item.externalId}, ${item.title.slice(0, 500)},
        ${item.publisher ?? hostOf(item.url)}, ${item.publishedAt}, ${item.publishedAt ? item.publishedPrecision ?? "exact" : null}, now(),
        ${clipExcerpt(item.snippet)}, ${hash}, 'snippet', ${duplicateOf}, ${item.query}, ${item.usageRestrictions}, ${tx.json((item.metrics ?? {}) as never)}, false)
      on conflict (watch_id, canonical_url) where watch_id is not null and canonical_url is not null do nothing
      returning id`;
    // A concurrent insert of the same URL loses the race quietly; look the winner up so the sighting still counts.
    docId = (row?.id as string | undefined) ?? ((await tx`select id from research_documents where watch_id = ${ctx.watchId} and canonical_url = ${item.url}`)[0]?.id as string | undefined) ?? null;
    if (row) {
      added = true;
      if (!duplicateOf && title.length > 24) known.byTitle.set(title, row.id as string);
    }
  }
  if (!docId) return { docId: null, added };
  known.byUrl.set(item.url, docId);
  known.byHash.set(hash, docId);
  await tx`insert into watch_observations (workspace_id, watch_id, watch_job_id, watch_target_id, document_id, provider, task_key, rank)
    values (${ctx.ws}, ${ctx.watchId}, ${ctx.jobId}, ${targetId}, ${docId}, ${item.provider}, ${taskKey}, ${rank})
    on conflict (watch_job_id, document_id, task_key) do nothing`;
  return { docId, added };
}
