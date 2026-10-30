import "server-only";
import { privilegedSql } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * USD of research spend still allowed this calendar month across every workspace, or null when
 * PLATFORM_SPEND_CAP_USD is not set. Uses the privileged connection because the total spans
 * workspaces the caller can't see; only the remaining amount leaves this function.
 */
export async function platformHeadroomUsd(): Promise<number | null> {
  const cap = env().PLATFORM_SPEND_CAP_USD;
  if (cap === undefined) return null;
  const [r] = await privilegedSql()`
    select coalesce(sum(coalesce(cost_usd_actual, cost_usd_estimated, 0)), 0) as spent
    from public.research_sources where retrieved_at >= date_trunc('month', now())`;
  return Math.max(0, cap - Number(r.spent));
}
