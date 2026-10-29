import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { apiCtx, apiOk } from "@/lib/research/api";
import { providerHealth } from "@/lib/research/deep/health";
import { providerRegistry } from "@/lib/research/deep/registry";

export const dynamic = "force-dynamic";

/** GET /api/research/providers — which sources are available to this workspace and why not. Never returns keys. */
export async function GET() {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const settings = await withUser(ctx.user.id, (tx) => tx`select provider, enabled from integration_settings where workspace_id = ${ctx.workspace.workspaceId}`);
  const health = await withUser(ctx.user.id, (tx) => providerHealth(tx, ctx.workspace.workspaceId));
  const on = (p: string) => settings.find((s) => s.provider === p)?.enabled ?? true;
  const providers = providerRegistry().map(({ key, label, capability, strengths, configured, unavailableReason, costModel, cacheTtlHours, terms, verified }) => {
    const webOff = key !== "brand_docs" && !on("web_research");
    // "verified" = built against the documented contract; "health" = what has actually been observed in this workspace.
    return { key, label, capability, strengths, available: configured && !webOff, unavailableReason: webOff ? "Web research is turned off for this workspace" : unavailableReason, costModel, cacheTtlHours, terms, verified, health: health.get(key) ?? null };
  });
  providers.unshift({ key: "qloo" as never, label: "Qloo Insights", capability: "affinity" as never, strengths: "Cultural affinity between entities, tags and audiences", available: Boolean(env().QLOO_API_KEY) && on("qloo"),
    unavailableReason: !env().QLOO_API_KEY ? "QLOO_API_KEY is not set" : !on("qloo") ? "Qloo is turned off for this workspace" : null, costModel: "per your Qloo agreement", cacheTtlHours: 0, terms: "Qloo API terms", verified: "live", health: health.get("qloo") ?? null });
  return apiOk({ providers });
}
