import { createHash } from "node:crypto";
import type { Tx } from "@/lib/db";
import { normalizeText } from "./dedupe";

/** Cache key: provider + normalised query + every parameter that changes results (geo, timeframe, count). */
export function cacheKey(provider: string, query: string, params: Record<string, string | number | null | undefined>): string {
  const p = Object.entries(params).filter(([, v]) => v !== null && v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  return createHash("sha256").update(`${provider}|${normalizeText(query)}|${p}`).digest("hex");
}

/** Reads a cached provider response for this workspace only (RLS enforces the same). */
export async function cacheGet<T>(tx: Tx, workspaceId: string, provider: string, key: string): Promise<T | null> {
  const [row] = await tx`select response from provider_cache where workspace_id = ${workspaceId} and provider = ${provider} and cache_key = ${key} and expires_at > now()`;
  return row ? (row.response as T) : null;
}

export async function cachePut(tx: Tx, workspaceId: string, provider: string, key: string, response: unknown, ttlHours: number) {
  if (ttlHours <= 0) return;
  await tx`insert into provider_cache (workspace_id, provider, cache_key, response, expires_at)
    values (${workspaceId}, ${provider}, ${key}, ${tx.json(response as never)}, now() + make_interval(hours => ${ttlHours}))
    on conflict (workspace_id, provider, cache_key) do update set response = excluded.response, created_at = now(), expires_at = excluded.expires_at`;
}
