import "server-only";
import type { Tx } from "@/lib/db";

/**
 * Measured provider health for one workspace, from the provenance ledger (last 30 days).
 * Each state is separate: a configured key is not proof of authentication, a 200 is not proof
 * of usable data, and returned data is not proof it was used in a report.
 */
export type ProviderHealth = {
  provider: string;
  requests: number;
  reachable: boolean;          // at least one HTTP response (any status)
  authVerified: boolean | null; // true: a call succeeded; false: last auth attempt was rejected (401/403); null: no evidence yet
  succeeded: number;           // calls without error
  dataReturned: number;        // calls that returned at least one result
  validationFailures: number;  // responses whose shape did not match the contract
  rateLimited: number;         // HTTP 429
  usedInReports: number;       // retrieved documents from this provider later cited by a claim
  lastSuccessAt: string | null;
  lastError: { at: string; category: string; message: string } | null;
  avgLatencyMs: number | null;
  usdEstimated: number;
};

export function errorCategory(httpStatus: number | null, message: string | null): string {
  if (message?.startsWith("Unexpected response shape") || message?.startsWith("invalid_response")) return "invalid response";
  if (httpStatus === 401 || httpStatus === 403 || /unauthorized|forbidden|token request failed/i.test(message ?? "")) return "authentication";
  if (httpStatus === 429 || /rate/i.test(message ?? "")) return "rate limited";
  if (httpStatus !== null && httpStatus >= 500) return "provider error";
  if (httpStatus !== null && httpStatus >= 400) return "request rejected";
  if (/timed out|timeout/i.test(message ?? "")) return "timeout";
  return "network";
}

export async function providerHealth(tx: Tx, workspaceId: string): Promise<Map<string, ProviderHealth>> {
  const rows = await tx`
    select s.provider,
      count(*)::int as requests,
      count(*) filter (where s.http_status is not null)::int as reached,
      count(*) filter (where s.status <> 'error')::int as succeeded,
      count(*) filter (where s.status = 'ok')::int as data_returned,
      count(*) filter (where s.error_message like 'Unexpected response shape%' or s.error_message like 'invalid_response%')::int as invalid,
      count(*) filter (where s.http_status = 429)::int as rate_limited,
      max(s.retrieved_at) filter (where s.status <> 'error') as last_success,
      avg(s.duration_ms) filter (where s.status <> 'error' and not s.cached) as latency,
      coalesce(sum(coalesce(s.cost_usd_actual, s.cost_usd_estimated, 0)), 0) as usd,
      (array_agg(json_build_object('at', s.retrieved_at, 'http', s.http_status, 'msg', s.error_message) order by s.retrieved_at desc) filter (where s.status = 'error'))[1] as last_error,
      bool_or(s.http_status in (401, 403)) filter (where s.retrieved_at = (select max(s2.retrieved_at) from research_sources s2 where s2.workspace_id = s.workspace_id and s2.provider = s.provider)) as last_auth_failed
    from research_sources s
    where s.workspace_id = ${workspaceId} and s.retrieved_at > now() - interval '30 days'
    group by s.provider, s.workspace_id`;
  const used = await tx`
    select d.provider, count(distinct d.id)::int as n from research_documents d
    where d.workspace_id = ${workspaceId} and d.retrieved_at > now() - interval '30 days'
      and exists (select 1 from evidence_items e where e.run_id = d.run_id and d.id = any(e.document_ids))
    group by d.provider`;
  // Qloo observations are "used" when the run produced provider_observation evidence.
  const [qlooUsed] = await tx`select count(*)::int as n from evidence_items where workspace_id = ${workspaceId} and evidence_type = 'provider_observation' and created_at > now() - interval '30 days' and source_provider = 'qloo'`;
  const usedBy = new Map(used.map((u) => [u.provider as string, u.n as number]));
  usedBy.set("qloo", qlooUsed.n);
  const out = new Map<string, ProviderHealth>();
  for (const r of rows) {
    const le = r.last_error as { at: string; http: number | null; msg: string | null } | null;
    out.set(r.provider, {
      provider: r.provider, requests: r.requests, reachable: r.reached > 0,
      authVerified: r.succeeded > 0 && !r.last_auth_failed ? true : r.last_auth_failed ? false : null,
      succeeded: r.succeeded, dataReturned: r.data_returned, validationFailures: r.invalid, rateLimited: r.rate_limited, usedInReports: usedBy.get(r.provider) ?? 0,
      lastSuccessAt: r.last_success ? new Date(r.last_success).toISOString() : null,
      lastError: le ? { at: new Date(le.at).toISOString(), category: errorCategory(le.http, le.msg), message: (le.msg ?? "").slice(0, 200) } : null,
      avgLatencyMs: r.latency === null ? null : Math.round(Number(r.latency)), usdEstimated: Number(r.usd),
    });
  }
  return out;
}
