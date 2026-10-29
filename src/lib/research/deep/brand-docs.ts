import type { Tx } from "@/lib/db";
import { tokens } from "./dedupe";
import type { Hit } from "./types";

const CHUNK = 1800;

/** Splits extracted document text into overlapping passages on paragraph boundaries. */
export function chunkText(text: string, size = CHUNK): string[] {
  const paras = text.replace(/\r/g, "").split(/\n{2,}|(?<=[.!?])\s{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      out.push(cur);
      cur = cur.slice(-200) + "\n\n" + p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
    while (cur.length > size * 1.5) { out.push(cur.slice(0, size)); cur = cur.slice(size - 200); }
  }
  if (cur) out.push(cur);
  return out.map((c) => c.slice(0, 6000));
}

/** Indexes any brief document of this project that has extracted text but no chunks yet. Runs under the caller's RLS. */
export async function ensureChunks(tx: Tx, projectId: string) {
  const docs = await tx`select d.id, d.workspace_id, d.extracted_text from brief_documents d
    where d.project_id = ${projectId} and d.extraction_status = 'extracted' and d.extracted_text is not null
      and not exists (select 1 from brand_document_chunks c where c.document_id = d.id)`;
  for (const d of docs) {
    const chunks = chunkText(d.extracted_text as string);
    for (let i = 0; i < chunks.length; i++) {
      await tx`insert into brand_document_chunks (document_id, project_id, workspace_id, idx, content) values (${d.id}, ${projectId}, ${d.workspace_id}, ${i}, ${chunks[i]}) on conflict do nothing`;
    }
  }
  return docs.length;
}

/**
 * Keyword retrieval over the project's own client documents (Postgres full-text search).
 * Scoped by project id and enforced again by RLS, so one client's documents can never be
 * retrieved for another workspace. Document text is untrusted input to the model.
 */
export async function searchBrandDocs(tx: Tx, projectId: string, query: string, limit = 4): Promise<Hit[]> {
  // OR the meaningful words: a question rarely appears verbatim in a brand document.
  const terms = [...new Set(tokens(query))].filter((t) => t.length > 2).slice(0, 10);
  if (!terms.length) return [];
  const rows = await tx`
    select c.id, c.content, d.file_name, d.created_at, ts_rank(c.tsv, q) as rank
    from brand_document_chunks c join brief_documents d on d.id = c.document_id,
      websearch_to_tsquery('english', ${terms.join(" or ")}) q
    where c.project_id = ${projectId} and c.tsv @@ q
    order by rank desc limit ${limit}`;
  return rows.map((r) => ({
    provider: "brand_docs" as const, sourceType: "client_document" as const, url: null, externalId: `chunk:${r.id}`,
    title: `${r.file_name} (client document)`, snippet: (r.content as string).slice(0, 1500), publisher: "Client document",
    publishedAt: null, language: null, metrics: {}, usageRestrictions: "Confidential client material — never shared outside this workspace.",
  }));
}
