import "server-only";
import { withUser, type Tx } from "@/lib/db";
import type { BriefInput } from "@/lib/ai/template";
import type { Ctx } from "./workspace";

export type BriefRecord = BriefInput & {
  projectId: string;
  publicUrls: string[];
  revision: number;
  updatedAt: string;
  clientId: string | null;
  clientName: string | null;
  isDemo: boolean;
};

export async function loadBrief(tx: Tx, projectId: string): Promise<BriefRecord | null> {
  const [r] = await tx`
    select p.id as project_id, p.name, p.client_id, p.is_demo, c.name as client_name, b.*
    from projects p left join campaign_briefs b on b.project_id = p.id left join clients c on c.id = p.client_id
    where p.id = ${projectId}`;
  if (!r) return null;
  return {
    projectId: r.project_id,
    name: r.name,
    brand: r.brand,
    product: r.product,
    category: r.category,
    market: r.market,
    audience: r.audience,
    objective: r.objective,
    existingPositioning: r.existing_positioning,
    competitors: r.competitors ?? [],
    interests: r.interests ?? [],
    brandGuidelines: r.brand_guidelines,
    budgetRange: r.budget_range,
    timeframe: r.timeframe,
    additionalContext: r.additional_context,
    publicUrls: r.public_urls ?? [],
    revision: r.revision ?? 0,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    clientId: r.client_id,
    clientName: r.client_name,
    isDemo: r.is_demo,
  };
}

export async function getBrief(ctx: Ctx, projectId: string) {
  return withUser(ctx.user.id, (tx) => loadBrief(tx, projectId));
}

export type BriefIssue = { field: keyof BriefInput; severity: "important" | "helpful"; why: string };

/** Explains which missing fields materially affect research quality. */
export function validateBrief(b: BriefInput): BriefIssue[] {
  const issues: BriefIssue[] = [];
  if (!b.brand) issues.push({ field: "brand", severity: "important", why: "The brand is resolved to a provider entity and used as the primary research signal." });
  if (!b.market) issues.push({ field: "market", severity: "important", why: "Without a market, no location signal is applied and results reflect a global taste graph." });
  if (!b.audience) issues.push({ field: "audience", severity: "important", why: "The audience frames interpretation and strategy. Without it, findings describe the brand’s signal rather than the people you want to reach." });
  if (!b.objective) issues.push({ field: "objective", severity: "important", why: "Strategies and experiments are assessed against the objective." });
  if (!(b.interests ?? []).length) issues.push({ field: "interests", severity: "helpful", why: "Audience interests are matched to Qloo taste tags and sharpen results, especially when the brand itself isn’t in Qloo." });
  if (!b.competitors.length) issues.push({ field: "competitors", severity: "helpful", why: "Competitors add signal entities and let CultureCrash compare cultural associations." });
  if (!b.category) issues.push({ field: "category", severity: "helpful", why: "The category guides which cultural domains are queried." });
  if (!b.existingPositioning) issues.push({ field: "existingPositioning", severity: "helpful", why: "Existing positioning is the baseline for differentiation and experiments." });
  return issues;
}
