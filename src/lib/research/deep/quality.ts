import { tokens } from "./dedupe";
import type { ClaimType, SourceType } from "./types";

/**
 * Explainable evidence-quality heuristic. Each component is 0–1 and stored with the claim,
 * so the UI can show *why* something scored as it did. This is a ranking aid, NOT a
 * calibrated probability that a claim is true.
 */
export type QualityComponents = {
  relevance: number;
  credibility: number;
  directness: number;
  recency: number;
  geography: number;
  corroboration: number;
  completeness: number;
};
export type Quality = QualityComponents & { score: number; notes: string[] };

export const QUALITY_WEIGHTS: QualityComponents = {
  relevance: 0.24, credibility: 0.16, directness: 0.16, recency: 0.1, geography: 0.08, corroboration: 0.16, completeness: 0.1,
};

/**
 * Credibility depends on the claim type, not just the outlet: a community post is weak for a
 * market fact but direct evidence of how that community talks. Values are configurable priors.
 */
const CREDIBILITY: Record<SourceType, Partial<Record<ClaimType, number>> & { default: number }> = {
  news: { default: 0.7, source_opinion: 0.6 },
  web_page: { default: 0.5 },
  encyclopedia: { default: 0.65, source_opinion: 0.3 },
  brand_site: { default: 0.45, source_fact: 0.55 },        // authoritative for what the brand says about itself
  community_post: { default: 0.35, source_opinion: 0.7 },  // strong for community language and opinion
  video: { default: 0.4, source_opinion: 0.6, observed_measurement: 0.6 },
  client_document: { default: 0.75 },
  demo_fixture: { default: 0.2 },
  search_suggestions: { default: 0.3, source_opinion: 0.45 },   // phrasing only; never evidence of volume
};

export function scoreClaim(input: {
  claim: string;
  claimType: ClaimType;
  question: string;
  excerpt: string | null;
  documentText: string;
  sourceType: SourceType;
  publishedAt: string | null;
  geography: string | null;
  documentGeography?: string | null;
  independentSources: number;
  hasPublisher: boolean;
  now?: Date;
}): Quality {
  const notes: string[] = [];
  const q = new Set(tokens(input.question));
  const c = tokens(input.claim);
  const overlap = c.filter((t) => q.has(t)).length;
  const relevance = Math.min(1, 0.35 + overlap / Math.max(3, q.size) * 1.3);

  const cred = CREDIBILITY[input.sourceType];
  const credibility = cred[input.claimType] ?? cred.default;

  // Directness: the claim is backed by a verbatim excerpt that really appears in the document.
  let directness = 0.3;
  if (input.excerpt) {
    const inDoc = input.documentText.toLowerCase().includes(input.excerpt.toLowerCase().slice(0, 120));
    directness = inDoc ? 1 : 0.4;
    if (!inDoc) notes.push("Quoted excerpt was not found verbatim in the retrieved text.");
  } else notes.push("No verbatim excerpt supports this claim.");

  let recency = 0.5;
  if (input.publishedAt) {
    const days = ((input.now ?? new Date()).getTime() - new Date(input.publishedAt).getTime()) / 86_400_000;
    recency = days < 0 ? 0.5 : days <= 90 ? 1 : days <= 365 ? 0.8 : days <= 3 * 365 ? 0.55 : 0.3;
  } else notes.push("Publication date unknown.");

  let geography = 0.6;
  if (input.geography) {
    const g = input.geography.toLowerCase();
    const hit = input.documentText.toLowerCase().includes(g) || (input.documentGeography ?? "").toLowerCase().includes(g);
    geography = hit ? 1 : 0.45;
    if (!hit) notes.push(`Source does not mention ${input.geography}.`);
  }

  const corroboration = input.independentSources >= 3 ? 1 : input.independentSources === 2 ? 0.75 : 0.4;
  if (input.independentSources <= 1) notes.push("Supported by a single independent source.");
  const completeness = (input.publishedAt ? 0.4 : 0) + (input.hasPublisher ? 0.3 : 0) + (input.excerpt ? 0.3 : 0);

  const comps: QualityComponents = { relevance, credibility, directness, recency, geography, corroboration, completeness };
  const score = (Object.keys(QUALITY_WEIGHTS) as (keyof QualityComponents)[]).reduce((s, k) => s + comps[k] * QUALITY_WEIGHTS[k], 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    relevance: round(relevance), credibility: round(credibility), directness: round(directness), recency: round(recency),
    geography: round(geography), corroboration: round(corroboration), completeness: round(completeness), score: round(score), notes,
  };
}
