export const EVIDENCE_LABEL: Record<string, { label: string; tone: "dark" | "violet" | "peach" | "neutral" | "success" | "outline"; explain: string }> = {
  provider_observation: { label: "Provider observation", tone: "dark", explain: "A value returned by a data provider, stored with the request and retrieval time." },
  external_source: { label: "External source", tone: "neutral", explain: "Published material with a URL and access date." },
  ai_interpretation: { label: "AI interpretation", tone: "violet", explain: "A model’s reading of the evidence. Review before relying on it." },
  hypothesis: { label: "Hypothesis", tone: "peach", explain: "A proposed explanation or direction that has not been tested." },
  experiment_result: { label: "Experiment result", tone: "success", explain: "A result your team recorded from a test." },
  approved_conclusion: { label: "Approved conclusion", tone: "outline", explain: "A finding a team member has reviewed and approved." },
};
