import { env } from "@/lib/env";
import type { Capability, Intent, ProviderKey } from "./types";

export type ProviderInfo = {
  key: ProviderKey;
  label: string;
  capability: Capability;
  /** What it is good for — shown in the UI and used for routing. */
  strengths: string;
  configured: boolean;
  /** Why it can't be used right now (missing key, terms not approved…). */
  unavailableReason: string | null;
  costModel: string;
  cacheTtlHours: number;          // 0 = never cache
  terms: string;
  verified: "live" | "contract_only";   // contract_only = built to the documented API, not yet exercised live from this codebase
};

/**
 * Single source of truth for research providers. Only one web-search provider is used per job
 * (Brave first, then Tavily or Exa as alternates) — more providers are not added for their own sake.
 */
export function providerRegistry(opts: { demo?: boolean } = {}): ProviderInfo[] {
  const e = env();
  const redditReady = Boolean(e.REDDIT_CLIENT_ID && e.REDDIT_CLIENT_SECRET);
  const list: ProviderInfo[] = [
    {
      key: "brave", label: "Brave Search", capability: "web_search", strengths: "Broad web, news, brand sites, niche publications",
      configured: Boolean(e.BRAVE_API_KEY), unavailableReason: e.BRAVE_API_KEY ? null : "BRAVE_API_KEY is not set",
      costModel: `per request, estimated $${e.BRAVE_USD_PER_REQUEST}`, cacheTtlHours: 24, terms: "Brave Search API terms; results cached privately per workspace.", verified: "contract_only",
    },
    {
      key: "tavily", label: "Tavily", capability: "web_search", strengths: "Alternate web search when Brave is not configured",
      configured: Boolean(e.TAVILY_API_KEY), unavailableReason: e.TAVILY_API_KEY ? null : "TAVILY_API_KEY is not set",
      costModel: `per request, estimated $${e.TAVILY_USD_PER_REQUEST}`, cacheTtlHours: 24, terms: "Tavily terms.", verified: "contract_only",
    },
    {
      key: "exa", label: "Exa", capability: "web_search", strengths: "Alternate web search, long-tail essays and blogs",
      configured: Boolean(e.EXA_API_KEY), unavailableReason: e.EXA_API_KEY ? null : "EXA_API_KEY is not set",
      costModel: `per request, estimated $${e.EXA_USD_PER_REQUEST}`, cacheTtlHours: 24, terms: "Exa terms.", verified: "contract_only",
    },
    {
      key: "youtube", label: "YouTube Data API", capability: "video", strengths: "Creator perspectives, video metadata, public view/like counts",
      configured: Boolean(e.YOUTUBE_API_KEY), unavailableReason: e.YOUTUBE_API_KEY ? null : "YOUTUBE_API_KEY is not set",
      costModel: "free quota: 100 units per search + 1 per statistics call (10,000 units/day default)", cacheTtlHours: 24,
      terms: "YouTube API Services terms: stored data refreshed or deleted within 30 days; no third-party transcripts.", verified: "contract_only",
    },
    {
      key: "reddit", label: "Reddit (OAuth)", capability: "community", strengths: "Community discussions, frustrations, audience language",
      configured: redditReady && e.REDDIT_COMMERCIAL_ACCESS === "approved",
      unavailableReason: !redditReady ? "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are not set" : e.REDDIT_COMMERCIAL_ACCESS !== "approved" ? "Commercial use of Reddit's Data API needs Reddit's approval — set REDDIT_COMMERCIAL_ACCESS=approved once granted" : null,
      costModel: "free tier within Reddit's rate limits (subject to agreement)", cacheTtlHours: 6,
      terms: "Reddit Data API terms: OAuth only, honour deletions, no profiling of individuals.", verified: "contract_only",
    },
    {
      key: "wikipedia", label: "Wikipedia", capability: "encyclopedia", strengths: "Background and provenance of scenes, movements, brands",
      configured: true, unavailableReason: null, costModel: "free (fair-use rate limits)", cacheTtlHours: 168,
      terms: "CC BY-SA 4.0 — attribution kept with excerpts.", verified: "contract_only",
    },
    {
      key: "google_trends", label: "Google Trends & Search Velocity", capability: "trend_velocity", strengths: "Consumer search momentum, rising interest velocity, and breakout search queries",
      configured: true, unavailableReason: null, costModel: "free (public search momentum signal)", cacheTtlHours: 12,
      terms: "Public Google search momentum data; fair use.", verified: "live",
    },
    {
      key: "hacker_news", label: "Hacker News (Algolia)", capability: "community", strengths: "Developer, AI, builder, and tech founder discussions and critical reception",
      configured: true, unavailableReason: null, costModel: "free forever (open Algolia API)", cacheTtlHours: 6,
      terms: "Hacker News Algolia Search API terms.", verified: "live",
    },
    {
      key: "brand_docs", label: "Client documents", capability: "brand_context", strengths: "Brief, brand guidelines and research uploaded to this campaign",
      configured: true, unavailableReason: null, costModel: "internal (no external cost)", cacheTtlHours: 0,
      terms: "Confidential; retrieval is restricted to this workspace and project.", verified: "live",
    },
  ];
  if (opts.demo) {
    list.push({
      key: "demo_web", label: "Demonstration web fixtures", capability: "web_search", strengths: "Fictional sources for demos and tests",
      configured: true, unavailableReason: null, costModel: "none", cacheTtlHours: 0, terms: "Fictional content, always labelled.", verified: "live",
    });
  }
  return list;
}

/** Default routing: which capabilities answer which kind of question (first = primary). */
export const ROUTES: Record<Intent, Capability[]> = {
  competitor: ["web_search", "video"],
  community: ["community", "web_search"],
  creator: ["video", "web_search"],
  culture: ["web_search", "encyclopedia"],
  trend: ["trend_velocity", "web_search", "community"],
  brand_context: ["brand_context"],
  audience: ["web_search", "community", "brand_context"],
  counterevidence: ["web_search", "community"],
};

/** The one web-search provider for a job: Brave, else Tavily, else Exa (or demo fixtures in demo runs). */
export function pickWebSearch(providers: ProviderInfo[], demo: boolean): ProviderKey | null {
  if (demo) return "demo_web";
  return (["brave", "tavily", "exa"] as const).find((k) => providers.find((p) => p.key === k)?.configured) ?? null;
}
