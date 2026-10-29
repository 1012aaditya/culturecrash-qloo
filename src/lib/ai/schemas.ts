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
});
export type ResearchInterpretation = z.infer<typeof researchInterpretationSchema>;

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
  })),
});
export type OpportunitiesOutput = z.infer<typeof opportunitiesSchema>;

export const directionSchema = z.object({
  name: z.string(),
  coreIdea: z.string(),
  positioningStatement: z.string(),
  audienceContext: z.string(),
  consumerTension: z.string().describe("Empty string if not supported by evidence"),
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
