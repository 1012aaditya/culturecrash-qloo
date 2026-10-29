/**
 * Shared types for adaptive multi-source research. Everything a provider returns is
 * normalised into a Hit; retrieved hits become Documents; claims cite Documents.
 */
export type Depth = "quick" | "standard" | "deep";

export type SourceType =
  | "web_page" | "news" | "encyclopedia" | "community_post" | "video" | "brand_site" | "client_document" | "demo_fixture";

export type ClaimType =
  | "observed_measurement" | "source_fact" | "source_opinion" | "model_interpretation"
  | "strategic_hypothesis" | "experiment_result" | "validated_conclusion";

/** What a research question needs; drives provider routing. */
export type Intent = "competitor" | "community" | "creator" | "culture" | "trend" | "brand_context" | "audience" | "counterevidence";

export type ProviderKey =
  | "brave" | "tavily" | "exa" | "youtube" | "reddit" | "wikipedia" | "brand_docs" | "demo_web"
  | "google_trends" | "hacker_news";

export type Capability = "web_search" | "video" | "community" | "encyclopedia" | "brand_context" | "trend_velocity";

export type ResearchQuestion = {
  key: string;            // q1, q2…
  text: string;
  intent: Intent;
  queries: string[];      // initial search queries
  priority: 1 | 2 | 3;    // 1 = must answer
};

export type ResearchPlanV2 = {
  objective: string;
  depth: Depth;
  questions: ResearchQuestion[];
  geography: string | null;
  timeframe: { freshness: "month" | "year" | "any"; label: string };
  providers: ProviderKey[];   // selected for this job
  skipped: { provider: ProviderKey; reason: string }[];
  notes: string[];
  planner: "llm" | "rules";
};

/** A normalised search result from any provider. Never contains invented fields. */
export type Hit = {
  provider: ProviderKey;
  sourceType: SourceType;
  url: string | null;
  externalId: string | null;
  title: string;
  snippet: string;
  publisher: string | null;
  publishedAt: string | null;   // ISO, only when the provider supplied one
  language: string | null;
  metrics: Record<string, number>;   // e.g. views, upvotes — only what the provider returned
  usageRestrictions: string | null;
};

export type ProviderCall<T> = {
  ok: boolean;
  data: T;
  status: "ok" | "empty" | "error";
  httpStatus: number | null;
  durationMs: number;
  error: string | null;
  errorKind: "retryable" | "permanent" | "config" | null;
  units: number;              // provider-specific units (requests, quota units, credits)
  costUsdEstimated: number;   // from configured price per unit; actual cost is usually not returned
  costUsdActual: number | null;
  params: Record<string, string>;
  raw: unknown;
  cached: boolean;
};

export type ClaimDraft = {
  text: string;
  claimType: ClaimType;
  documentIndexes: number[];   // indexes into the document batch given to the extractor
  excerpt: string | null;      // verbatim support from a document when available
  questionKey: string | null;
  scope: { geography?: string | null; audience?: string | null; period?: string | null };
};
