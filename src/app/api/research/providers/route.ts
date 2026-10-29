import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { apiCtx, apiOk } from "@/lib/research/api";
import { providerRegistry } from "@/lib/research/deep/registry";

export const dynamic = "force-dynamic";

/** GET /api/research/providers — which sources are available to this workspace and why not. Never returns keys. */
export async function GET() {
  const ctx = await apiCtx();
  if (ctx instanceof Response) return ctx;
  const settings = await withUser(ctx.user.id, (tx) => tx`select provider, enabled from integration_settings where workspace_id = ${ctx.workspace.workspaceId}`);
  const on = (p: string) => settings.find((s) => s.provider === p)?.enabled ?? true;
  const providers = providerRegistry().map(({ key, label, capability, strengths, configured, unavailableReason, costModel, cacheTtlHours, terms, verified }) => {
    const webOff = key !== "brand_docs" && !on("web_research");
    return { key, label, capability, strengths, available: configured && !webOff, unavailableReason: webOff ? "Web research is turned off for this workspace" : unavailableReason, costModel, cacheTtlHours, terms, verified };
  });
  providers.unshift({ key: "qloo" as never, label: "Qloo Insights", capability: "affinity" as never, strengths: "Cultural affinity between entities, tags and audiences", available: Boolean(env().QLOO_API_KEY) && on("qloo"),
    unavailableReason: !env().QLOO_API_KEY ? "QLOO_API_KEY is not set" : !on("qloo") ? "Qloo is turned off for this workspace" : null, costModel: "per your Qloo agreement", cacheTtlHours: 0, terms: "Qloo API terms", verified: "live" });
  return apiOk({ providers });
}
