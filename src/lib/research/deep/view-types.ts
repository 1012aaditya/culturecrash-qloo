import type { Report, Coverage } from "./synthesize";
import type { ResearchPlanV2 } from "./types";
import type { Usage } from "./budget";

/** Client-safe shapes for the research report UI and the REST API. */
export type DocumentRow = {
  id: string; provider: string; sourceType: string; url: string | null; title: string; publisher: string | null; publishedAt: string | null; retrievedAt: string;
  excerpt: string | null; extraction: string; group: string | null; duplicateOf: string | null; questionKeys: string[]; metrics: Record<string, number>;
  restrictions: string | null; isDemo: boolean; claimCount: number;
};
export type ClaimRow = {
  id: string; evidenceType: string; claimType: string; text: string; excerpt: string | null; questionKey: string | null; method: string | null;
  quality: (Record<string, number> & { score: number; notes?: string[] }) | null; independent: number | null; contradicts: string[]; documentIds: string[];
  review: string; limitations: string | null; url: string | null; provider: string | null; supporting: string[]; isDemo: boolean;
};
export type DeepView = {
  depth: "quick" | "standard" | "deep"; stage: string | null; question: string | null; plan: (ResearchPlanV2 & { byQuestion?: Record<string, string[]> }) | null;
  report: Report | null; coverage: Coverage[]; usage: (Usage & { documents?: number; claims?: number; duplicatesRemoved?: number; independentSources?: number; elapsedSeconds?: number }) | null;
  stopReason: string | null; cancelRequested: boolean; documents: DocumentRow[]; claims: ClaimRow[]; duplicatesRemoved: number;
};
export type ProviderStatus = { key: string; label: string; capability: string; strengths: string; configured: boolean; unavailableReason: string | null; costModel: string; verified: "live" | "contract_only" };
