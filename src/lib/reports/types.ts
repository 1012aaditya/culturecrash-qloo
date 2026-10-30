import type { CreativeBriefContent, DirectionContent, GroundedClaim } from "@/lib/ai/schemas";

export const REPORT_SECTIONS = [
  ["cover", "Cover"],
  ["executive", "Executive summary"],
  ["brief", "Campaign brief"],
  ["methodology", "Research scope & methodology"],
  ["landscape", "Cultural landscape"],
  ["evidence", "Key evidence"],
  ["opportunities", "Opportunities"],
  ["directions", "Positioning alternatives"],
  ["selected", "Selected strategy"],
  ["objections", "Client objections & answers"],
  ["creative", "Creative brief"],
  ["visual", "Visual world"],
  ["experiments", "Experiment plan"],
  ["limitations", "Limitations & open questions"],
  ["sources", "Sources & appendix"],
] as const;
export type ReportSectionKey = (typeof REPORT_SECTIONS)[number][0];

/** A pitch-ready report: the recommendation, the taste map behind it, and the hardest objections already answered. */
export const PITCH_PACK_SECTIONS: ReportSectionKey[] = ["cover", "executive", "landscape", "selected", "objections", "directions", "evidence", "limitations", "sources"];

export type VisualWorld = {
  boardName: string;
  palette: { hex: string; name: string }[];
  images: { path: string; thumbPath: string | null; title: string; alt: string; sourceUrl: string | null; rights: "reference" | "licensed" | "own" | "ai" }[];
  notes: string[];
  cardCount: number;
  coverage: { sourceable: number; sourced: number };
};

export type ReportSnapshot = {
  title: string;
  projectName: string;
  clientName: string | null;
  generatedAt: string;
  containsDemoData: boolean;
  sections: ReportSectionKey[];
  available: ReportSectionKey[];
  executiveSummary: { research: string | null; selectedDirection: string | null; opportunities: string[]; experiments: string[] };
  brief: Record<string, unknown> & { competitors: string[] };
  methodology: null | { question: string; mode: "live" | "demo"; provider: string; runAt: string; briefRevision: number | null; signals: string[]; location: string | null; requests: number; failedRequests: number; interpretationBy: string; notes: string[] };
  landscape: { type: string; items: { name: string; affinity: number | null }[] }[];
  // Fields marked optional were added later; snapshots taken before then don't have them.
  findings: { statement: string; kind: string; evidenceIds?: string[] }[];
  evidence: { id: string; type: string; claim: string; source: string | null; ref: string | null; url: string | null; retrievedAt: string | null; value: number | null; review: string }[];
  opportunities: { title: string; description: string; whyItMatters: string | null; unknowns: string | null; validation: string | null; status: string; generatedBy: string; evidenceIds: string[]; claims?: GroundedClaim[] }[];
  directions: { name: string; selected: boolean; exploratory: boolean; revision: number; content: DirectionContent }[];
  strategyGeneratedBy: string | null;
  selected: { name: string; content: DirectionContent; revision: number } | null;
  /** The inspiration board linked to the selected direction. Images are stored as private paths and signed when shown. */
  visualWorld?: VisualWorld | null;
  creativeBrief: { content: CreativeBriefContent; generatedBy: string; revision: number; grounding?: (GroundedClaim & { section: string })[] } | null;
  objections?: { verdict: string; summary: string; generatedBy: string; items: { direction: string; objection: string; weakestEvidence: string; competitor: string; question: string; answer: string }[] } | null;
  experiments: { name: string; hypothesis: string; method: string | null; primaryMetric: string; threshold: string | null; status: string; interpretation: string | null; nextAction: string | null; results: { variant: string | null; metric: string; value: number; n: number | null }[] }[];
  limitations: string[];
  openQuestions: string[];
  sources: { endpoint: string; params: Record<string, string>; status: string; httpStatus: number | null; results: number; retrievedAt: string }[];
  refs: { runId: string | null; strategyVersionId: string | null };
};
