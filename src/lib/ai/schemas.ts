import { z } from "zod";

/** Structured outputs. Everything the LLM produces is validated against these before saving. */

export const researchInterpretationSchema = z.object({
  summary: z.string().describe("2-4 sentences describing what the returned provider data shows. No claims beyond the data."),
  findings: z.array(z.object({
    statement: z.string(),
    evidenceIds: z.array(z.string()).describe("ids of provider observations supporting this statement"),
    kind: z.enum(["observation", "interpretation"]),
  })),
  contradictions: z.array(z.string()),
  missingInformation: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  culturalPulse: z.object({
    zeitgeistSummary: z.string(),
    microAesthetics: z.array(z.object({
      name: z.string(),
      platformOrigin: z.string(),
      description: z.string(),
      audienceRelevance: z.string(),
    })),
    culturalTensions: z.array(z.object({
      tension: z.string(),
      implicationForBrand: z.string(),
    })),
    watchouts: z.array(z.object({
      risk: z.string(),
      recommendation: z.string(),
    })),
    liveWebSources: z.array(z.object({
      title: z.string(),
      url: z.string(),
      source: z.string(),
      snippet: z.string(),
      relevance: z.string().optional(),
    })).optional().nullable(),
  }).optional().nullable(),
});
export type ResearchInterpretation = z.infer<typeof researchInterpretationSchema>;

/** One factual statement plus the evidence it rests on. `support` is set by the server's check, never by the model. */
export const groundedClaimSchema = z.object({
  statement: z.string().describe("One factual statement this item depends on, in plain words. One fact per statement."),
  evidenceIds: z.array(z.string()).describe("ids of the evidence items whose text supports this exact statement; empty if it is your interpretation"),
  support: z.enum(["verified", "weak", "uncited"]).optional().describe("Leave unset: the server fills this in after checking the evidence"),
});
export type GroundedClaim = z.infer<typeof groundedClaimSchema>;

export const opportunitiesSchema = z.object({
  opportunities: z.array(z.object({
    title: z.string(),
    description: z.string(),
    whyItMatters: z.string(),
    unknowns: z.string(),
    strategicUse: z.string(),
    validationStep: z.string(),
    evidenceIds: z.array(z.string()),
    entityNames: z.array(z.string()),
    claims: z.array(groundedClaimSchema).default([]).describe("The 2-5 factual statements this opportunity rests on, each with its own evidence ids"),
  })),
});
export type OpportunitiesOutput = z.infer<typeof opportunitiesSchema>;

export const directionSchema = z.object({
  name: z.string(),
  coreIdea: z.string(),
  positioningStatement: z.string(),
  audienceContext: z.string(),
  consumerTension: z.string().describe("Empty string if not supported by evidence"),
  brandRole: z.string().default("").describe("The role the brand plays in people's lives in this direction (e.g. host, guide, ally, provocateur) — different for each direction"),
  culturalConnections: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  strategicRationale: z.string(),
  differentiation: z.string(),
  messagingPillars: z.array(z.string()),
  creativeImplications: z.string(),
  tradeOffs: z.string(),
  uncertainties: z.string(),
  assumptionsToTest: z.array(z.string()),
  suggestedExperiment: z.string(),
  isExploratory: z.boolean(),
  claims: z.array(groundedClaimSchema).default([]).describe("The 3-6 factual statements this direction rests on, each with the evidence ids that support it"),
});
export type DirectionContent = z.infer<typeof directionSchema>;

export const strategySchema = z.object({ directions: z.array(directionSchema) });

export const comparisonSchema = z.object({
  dimensions: z.array(z.object({
    dimension: z.enum(["Audience relevance", "Distinctiveness", "Evidence strength", "Alignment with the brief", "Implementation complexity", "Unresolved assumptions"]),
    assessments: z.array(z.object({ directionName: z.string(), assessment: z.enum(["stronger", "mixed", "weaker", "unclear"]), basis: z.string() })),
  })),
  summary: z.string(),
});
export type ComparisonOutput = z.infer<typeof comparisonSchema>;

export const CREATIVE_SECTIONS = [
  ["background", "Background"],
  ["businessObjective", "Business objective"],
  ["audience", "Audience"],
  ["audienceContext", "Audience context"],
  ["communicationObjective", "Communication objective"],
  ["coreMessage", "Core message"],
  ["positioning", "Positioning"],
  ["reasonsToBelieve", "Reasons to believe"],
  ["toneOfVoice", "Tone of voice"],
  ["messagingPillars", "Messaging pillars"],
  ["creativeTerritories", "Creative territories"],
  ["deliverables", "Required deliverables"],
  ["constraints", "Constraints"],
  ["successMetrics", "Success metrics"],
  ["openQuestions", "Open questions"],
] as const;
export type CreativeSectionKey = (typeof CREATIVE_SECTIONS)[number][0];

export const creativeBriefSchema = z.object(
  Object.fromEntries(CREATIVE_SECTIONS.map(([k]) => [k, z.string()])) as Record<CreativeSectionKey, z.ZodString>,
);
export type CreativeBriefContent = Record<CreativeSectionKey, string>;

export const creativeGroundingSchema = z.array(groundedClaimSchema.extend({
  section: z.enum(CREATIVE_SECTIONS.map(([k]) => k) as [CreativeSectionKey, ...CreativeSectionKey[]]),
}));
export type CreativeGrounding = z.infer<typeof creativeGroundingSchema>;

/** What the model returns: client-facing prose (no ids) plus the citations for it, kept apart. */
export const creativeBriefOutputSchema = creativeBriefSchema.extend({
  grounding: creativeGroundingSchema.describe("The factual statements the brief relies on (especially audience context and reasons to believe), each tagged with its section and evidence ids"),
});

export const sectionRevisionSchema = z.object({ text: z.string() });

export const copilotAnswerSchema = z.object({
  answer: z.string(),
  citedEvidenceIds: z.array(z.string()),
  proposedAction: z.object({
    type: z.enum(["none", "create_experiment", "generate_report", "generate_opportunities"]),
    label: z.string(),
  }),
});
export type CopilotAnswer = z.infer<typeof copilotAnswerSchema>;

export const briefExtractionSchema = z.object({
  brand: z.string(), product: z.string(), category: z.string(), market: z.string(), audience: z.string(),
  objective: z.string(), existingPositioning: z.string(), competitors: z.array(z.string()), interests: z.array(z.string()), timeframe: z.string(), budgetRange: z.string(),
});
export type BriefExtraction = z.infer<typeof briefExtractionSchema>;

export const redTeamCritiqueSchema = z.object({
  overallVerdict: z.enum(["bulletproof", "promising_with_caveats", "vulnerable", "high_risk"]),
  executiveSummary: z.string().describe("Ruthless 2-3 sentence agency partner critique."),
  critiques: z.array(z.object({
    directionSlot: z.number().int().min(1).max(3),
    directionName: z.string(),
    fatalFlaw: z.string().describe("The single biggest point of failure or strategic vulnerability."),
    weakestEvidence: z.string().default("").describe("The statement this direction rests on that is least supported (quote it), and why a client would doubt it. Prefer statements marked weak or uncited."),
    nearestCompetitor: z.string().default("").describe("The competitor (from the brief or evidence) that already owns or could most easily claim this position, and how. Say 'none identified in the evidence' if so."),
    culturalRisk: z.string().describe("Risk of being perceived as tone-deaf, cliché, performative, or inauthentic."),
    competitorCounter: z.string().describe("How a rival brand could easily counter, ridicule, or neutralize this position."),
    toughestClientQuestion: z.string().describe("The hardest, most skeptical question a client CMO will ask in the pitch meeting."),
    suggestedDefense: z.string().describe("Actionable advice to fortify and defend this direction."),
    directionId: z.string().optional().describe("Leave unset: filled in by the server"),
  })),
});
export type RedTeamCritique = z.infer<typeof redTeamCritiqueSchema>;

