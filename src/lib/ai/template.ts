/**
 * Template engine: deterministic drafts used when no LLM provider is configured.
 * It only recombines the brief and stored evidence — it never introduces facts —
 * and every output is labelled "Template draft" in the UI and in reports.
 */
import type {
  BriefExtraction, ComparisonOutput, CopilotAnswer, CreativeBriefContent, DirectionContent, OpportunitiesOutput, ResearchInterpretation,
} from "./schemas";

export type BriefInput = {
  name: string;
  brand: string | null;
  product: string | null;
  category: string | null;
  market: string | null;
  audience: string | null;
  objective: string | null;
  existingPositioning: string | null;
  competitors: string[];
  /** Audience interests, resolved to Qloo tags at research time. */
  interests?: string[];
  brandGuidelines: string | null;
  budgetRange: string | null;
  timeframe: string | null;
  additionalContext: string | null;
};

export type Observation = {
  id: string;
  claim: string;
  entityName: string | null;
  entityType: string | null;
  affinity: number | null;
  role: string | null;
  /** Provider or web domain the evidence came from. */
  source?: string | null;
};

/** Template claims quote the stored evidence verbatim, so they introduce no new facts. */
const quoteClaims = (ev: Observation[]) => ev.map((o) => ({ statement: o.claim, evidenceIds: [o.id] }));
const fmt = (n: number | null) => (n === null ? "no affinity value" : `affinity ${n.toFixed(2)}`);
const brandOf = (b: BriefInput) => b.brand || b.name;
const listNames = (o: Observation[], n = 3) => o.slice(0, n).map((x) => x.entityName).filter(Boolean).join(", ");

function results(obs: Observation[]) {
  return obs.filter((o) => o.role === "result" && o.entityName).sort((a, b) => (b.affinity ?? -1) - (a.affinity ?? -1));
}
function byType(obs: Observation[]) {
  const m = new Map<string, Observation[]>();
  for (const o of results(obs)) {
    const t = o.entityType ?? "entity";
    m.set(t, [...(m.get(t) ?? []), o]);
  }
  return m;
}
function tags(obs: Observation[]) {
  return obs.filter((o) => o.role === "tag" && o.entityName);
}

export function templateInterpretation(brief: BriefInput, obs: Observation[], seeds: string[]): ResearchInterpretation {
  const types = byType(obs);
  const res = results(obs);
  const t = tags(obs);
  const findings: ResearchInterpretation["findings"] = [];
  for (const [type, list] of types) {
    findings.push({
      statement: `For the signal used (${seeds.join(", ") || "location only"}), the highest-affinity ${type} results returned were ${list.slice(0, 3).map((o) => `${o.entityName} (${fmt(o.affinity)})`).join(", ")}.`,
      evidenceIds: list.slice(0, 3).map((o) => o.id),
      kind: "observation",
    });
  }
  if (t.length) {
    findings.push({
      statement: `Taste tags associated with the signal include ${t.slice(0, 5).map((x) => x.entityName).join(", ")}.`,
      evidenceIds: t.slice(0, 5).map((x) => x.id),
      kind: "observation",
    });
  }
  const missing: string[] = [];
  if (!brief.audience) missing.push("The brief does not describe the target audience, so results reflect the brand/competitor signal rather than a defined audience.");
  if (!brief.market) missing.push("No market was specified, so no location signal was applied.");
  if (!seeds.length) missing.push("No brand or competitor could be resolved to a provider entity; research relied on location signal only.");
  if (res.length < 6) missing.push("Few results were returned; treat patterns as weak signals.");
  missing.push("No public-web research provider is configured, so there is no sourced external evidence yet.");
  return {
    summary: res.length
      ? `Qloo returned ${res.length} entities across ${types.size} ${types.size === 1 ? "type" : "types"} for the ${brandOf(brief)} signal${brief.market ? ` in ${brief.market}` : ""}. These are taste correlations for people connected to the signal, not evidence of purchase intent.`
      : `The provider returned no entities for this signal. No findings have been inferred.`,
    findings,
    contradictions: [],
    missingInformation: missing,
    followUpQuestions: [
      ...(res.length ? [`Which of the top associations (${listNames(res)}) are already owned by ${brief.competitors[0] ?? "competitors"}?`] : []),
      "Which observations should be validated with first-party audience research before they inform positioning?",
    ],
  };
}

export function templateOpportunities(brief: BriefInput, obs: Observation[]): OpportunitiesOutput {
  const types = [...byType(obs).entries()].filter(([, l]) => l.length > 0);
  const t = tags(obs);
  const out: OpportunitiesOutput["opportunities"] = types.slice(0, 3).map(([type, list]) => {
    const top = list.slice(0, 3);
    return {
      title: `${capital(type)} adjacency: ${top[0].entityName}`,
      description: `${top.map((o) => o.entityName).join(", ")} returned with relatively high affinity for the ${brandOf(brief)} signal. This could indicate a ${type} territory the audience already cares about.`,
      whyItMatters: `A credible connection to ${type} culture could give ${brandOf(brief)} a reason to show up beyond category conventions.`,
      unknowns: "Affinity shows co-occurring taste, not that the audience would welcome the brand in this space or that it would change behaviour.",
      strategicUse: `Explore as a content, partnership or creative territory for ${brief.objective ? `the objective “${brief.objective}”` : "the campaign"}.`,
      validationStep: `Test a ${type}-led creative concept against the current positioning with the target audience before committing budget.`,
      evidenceIds: top.map((o) => o.id),
      entityNames: top.map((o) => o.entityName!).filter(Boolean),
      claims: quoteClaims(top),
    };
  });
  if (t.length >= 2) {
    out.push({
      title: `Taste territory: ${t[0].entityName} × ${t[1].entityName}`,
      description: `Tags associated with the signal include ${t.slice(0, 4).map((x) => x.entityName).join(", ")}. Together they may describe a sensibility rather than a single interest.`,
      whyItMatters: "A sensibility can guide tone and art direction across touchpoints.",
      unknowns: "Tag associations are descriptive and may reflect catalogue metadata as much as audience behaviour.",
      strategicUse: "Use as input to tone of voice and creative territories.",
      validationStep: "Run qualitative concept reads using mood boards built from these tags.",
      evidenceIds: t.slice(0, 4).map((x) => x.id),
      entityNames: t.slice(0, 4).map((x) => x.entityName!),
      claims: quoteClaims(t.slice(0, 4)),
    });
  }
  return { opportunities: out };
}

export function templateStrategy(brief: BriefInput, obs: Observation[], opportunityTitles: string[]): { directions: DirectionContent[] } {
  const res = results(obs);
  const types = [...byType(obs).entries()];
  const t = tags(obs);
  const exploratory = res.length < 8;
  const brand = brandOf(brief);
  const audience = brief.audience || "the target audience (not yet defined in the brief)";
  const nonCategory = types.find(([type]) => type !== "brand") ?? types[0];
  const brandList = types.find(([type]) => type === "brand")?.[1] ?? [];
  const common = (ev: Observation[]): Pick<DirectionContent, "evidenceIds" | "isExploratory" | "consumerTension" | "claims"> => ({
    evidenceIds: ev.map((o) => o.id),
    claims: quoteClaims(ev),
    isExploratory: exploratory || ev.length === 0,
    consumerTension: "",
  });

  const adj = nonCategory?.[1].slice(0, 3) ?? [];
  const d1: DirectionContent = {
    name: adj.length ? `Cultural adjacency — ${capital(nonCategory![0])}` : "Cultural adjacency",
    coreIdea: adj.length ? `Position ${brand} inside the ${nonCategory![0]} culture its audience already gravitates to (${adj.map((o) => o.entityName).join(", ")}).` : `Position ${brand} through a cultural interest outside the category.`,
    positioningStatement: `For ${audience}, ${brand} is the ${brief.category ?? "brand"} that belongs in the culture they already love${adj[0] ? `, from ${adj[0].entityName} onwards` : ""}.`,
    audienceContext: `Built from the observed ${nonCategory?.[0] ?? "entity"} affinities for the brief signal${brief.market ? ` in ${brief.market}` : ""}.`,
    culturalConnections: adj.map((o) => `${o.entityName} (${fmt(o.affinity)})`),
    strategicRationale: "Borrowed relevance: meet the audience in a space where attention already exists rather than competing on category claims.",
    differentiation: `Competitors${brief.competitors.length ? ` such as ${brief.competitors.slice(0, 2).join(", ")}` : ""} are assumed to compete on category language; this direction competes on cultural context. This assumption has not been verified.`,
    messagingPillars: ["Belonging in the culture", "Shared taste, not product claims", `${brand} as a participant, not a sponsor`],
    creativeImplications: "Art direction and talent drawn from the adjacent culture; product appears in context rather than as the hero.",
    tradeOffs: "Risk of feeling opportunistic if the connection is shallow; depends on credible partners.",
    uncertainties: "Whether the audience welcomes the brand in this space is unknown. Affinity does not imply permission.",
    assumptionsToTest: [`The audience responds more to ${nonCategory?.[0] ?? "cultural"}-led creative than to category-led creative.`],
    suggestedExperiment: `A/B test a ${nonCategory?.[0] ?? "culture"}-led concept against current positioning on attention and brand-fit measures.`,
    ...common(adj),
  };

  const brandsEv = brandList.slice(0, 3);
  const d2: DirectionContent = {
    name: "Category reframe",
    coreIdea: `Redefine what ${brief.category ?? "the category"} means for this audience, using the brands they already pair it with${brandsEv.length ? ` (${brandsEv.map((o) => o.entityName).join(", ")})` : ""} as reference points.`,
    positioningStatement: `${brand} gives ${audience} a ${brief.category ?? "category"} experience defined by ${brief.existingPositioning ? "a sharper version of its existing promise" : "a point of view the category has not claimed"}.`,
    audienceContext: brandsEv.length ? "Observed brand affinities suggest the reference set the audience uses when judging the category." : "No brand affinities were returned; reference set is inferred from the brief only.",
    culturalConnections: brandsEv.map((o) => `${o.entityName} (${fmt(o.affinity)})`),
    strategicRationale: "Distinctiveness through reframing: change the criteria by which the category is judged instead of out-claiming competitors.",
    differentiation: brief.existingPositioning ? `Builds on the existing positioning (“${brief.existingPositioning.slice(0, 120)}”) and pushes it to an ownable extreme.` : "Requires a clear existing positioning to sharpen — currently missing from the brief.",
    messagingPillars: ["A new standard for the category", "Proof over promise (only provided product facts)", "Designed for this audience"],
    creativeImplications: "Bold, single-minded claim structure; design system borrowed from the reference brands’ visual codes rather than category clichés.",
    tradeOffs: "Requires substantiated product truths; without them the reframe is empty.",
    uncertainties: "Product benefits have not been supplied or validated; reasons to believe are open.",
    assumptionsToTest: ["The audience perceives the current category conventions as interchangeable."],
    suggestedExperiment: "Message test: reframed category promise versus current positioning, measuring distinctiveness and purchase consideration (stated, not causal).",
    ...common(brandsEv),
  };

  const tagEv = t.slice(0, 4);
  const d3: DirectionContent = {
    name: "Participation & community",
    coreIdea: `Build ${brand} around a shared sensibility${tagEv.length ? ` (${tagEv.map((o) => o.entityName).join(", ")})` : ""} that the audience can take part in.`,
    positioningStatement: `${brand} is where ${audience} come together around ${tagEv[0]?.entityName?.toLowerCase() ?? "a shared taste"}.`,
    audienceContext: tagEv.length ? "Built from taste tags associated with the signal." : "No tag data was returned; this direction is driven by the brief objective.",
    culturalConnections: tagEv.map((o) => o.entityName!),
    strategicRationale: "Community-led growth: value created by participation and creator content rather than broadcast messaging.",
    differentiation: "Shifts the brand role from seller to host. Competitive presence in this space has not been researched.",
    messagingPillars: ["Made with the community", "Rituals, not features", "Room for self-expression"],
    creativeImplications: "Creator collaborations, user-generated formats, recurring rituals and events.",
    tradeOffs: "Slower to build; harder to measure in short campaign windows.",
    uncertainties: `Whether ${opportunityTitles[0] ? `the opportunity “${opportunityTitles[0]}”` : "this sensibility"} translates into participation is untested.`,
    assumptionsToTest: ["The audience will create or share content around the brand ritual."],
    suggestedExperiment: "Pilot a creator-led participation format in one channel and track participation rate against a broadcast control.",
    ...common(tagEv),
  };
  return { directions: [d1, d2, d3] };
}

export function templateRevision(d: DirectionContent, instruction: string): DirectionContent {
  return {
    ...d,
    uncertainties: `${d.uncertainties}\n\nRevision requested: “${instruction.slice(0, 300)}”. Without an LLM configured, CultureCrash cannot rewrite this direction automatically — edit the fields directly.`,
  };
}

export function templateComparison(dirs: { name: string; content: DirectionContent; evidenceCount: number }[], brief: BriefInput): ComparisonOutput {
  const maxEv = Math.max(...dirs.map((d) => d.evidenceCount), 0);
  return {
    dimensions: [
      {
        dimension: "Evidence strength",
        assessments: dirs.map((d) => ({
          directionName: d.name,
          assessment: d.evidenceCount === 0 ? "weaker" : d.evidenceCount === maxEv ? "stronger" : "mixed",
          basis: `${d.evidenceCount} linked provider observation${d.evidenceCount === 1 ? "" : "s"}${d.content.isExploratory ? "; marked exploratory" : ""}.`,
        })),
      },
      {
        dimension: "Alignment with the brief",
        assessments: dirs.map((d) => ({
          directionName: d.name,
          assessment: brief.objective ? "unclear" : "unclear",
          basis: brief.objective ? `Requires judgement against the objective “${brief.objective.slice(0, 100)}”.` : "The brief has no stated objective to assess against.",
        })),
      },
      {
        dimension: "Unresolved assumptions",
        assessments: dirs.map((d) => ({
          directionName: d.name,
          assessment: d.content.assumptionsToTest.length > 1 ? "weaker" : "mixed",
          basis: `${d.content.assumptionsToTest.length} assumption(s) listed to test: ${d.content.assumptionsToTest.join("; ").slice(0, 160)}`,
        })),
      },
      {
        dimension: "Implementation complexity",
        assessments: dirs.map((d) => ({ directionName: d.name, assessment: "unclear", basis: `Stated trade-offs: ${d.content.tradeOffs.slice(0, 160)}` })),
      },
    ],
    summary: "Template comparison based only on counts of linked evidence and the directions’ own stated assumptions and trade-offs. Qualitative judgements on relevance and distinctiveness need a strategist or a configured LLM.",
  };
}

export function templateCreativeBrief(brief: BriefInput, d: DirectionContent): CreativeBriefContent {
  const brand = brandOf(brief);
  return {
    background: [brief.name, brief.product && `Product/service: ${brief.product}.`, brief.category && `Category: ${brief.category}.`, brief.market && `Market: ${brief.market}.`, brief.additionalContext].filter(Boolean).join(" "),
    businessObjective: brief.objective ?? "Not provided in the brief — to confirm with the client.",
    audience: brief.audience ?? "Not defined in the brief — to confirm.",
    audienceContext: d.audienceContext,
    communicationObjective: `Make ${brand} feel ${d.messagingPillars[0]?.toLowerCase() ?? "distinct"} to ${brief.audience ?? "the audience"} through the “${d.name}” direction.`,
    coreMessage: d.positioningStatement,
    positioning: d.coreIdea,
    reasonsToBelieve: "No substantiated product benefits have been provided. Add verified product facts here before production.",
    toneOfVoice: brief.brandGuidelines ? `Follow the brand guidelines: ${brief.brandGuidelines.slice(0, 300)}` : "To be defined — no brand guidelines supplied.",
    messagingPillars: d.messagingPillars.map((p) => `• ${p}`).join("\n"),
    creativeTerritories: [d.creativeImplications, ...d.culturalConnections.map((c) => `• ${c}`)].join("\n"),
    deliverables: "To confirm with the client (channels, formats, quantities).",
    constraints: [brief.budgetRange && `Budget: ${brief.budgetRange}`, brief.timeframe && `Timeframe: ${brief.timeframe}`, "Do not make product claims that have not been substantiated."].filter(Boolean).join("\n"),
    successMetrics: `Primary measure for the suggested experiment: ${d.suggestedExperiment}`,
    openQuestions: [...d.assumptionsToTest.map((a) => `• Validate: ${a}`), `• ${d.uncertainties}`].join("\n"),
  };
}

export function templateCopilot(question: string, ctx: { brief: BriefInput; observations: Observation[]; directionNames: string[] }): CopilotAnswer {
  const q = question.toLowerCase();
  const res = results(ctx.observations);
  if (/assumption|test|experiment/.test(q)) {
    return { answer: `Without an LLM configured I can only point to what is stored. ${ctx.directionNames.length ? `Each direction (${ctx.directionNames.join(", ")}) lists its own assumptions to test in the strategy studio.` : "Generate strategy directions first; each one lists assumptions to test."}`, citedEvidenceIds: [], proposedAction: { type: "create_experiment", label: "Plan an experiment" } };
  }
  if (/evidence|why|source|support/.test(q) && res.length) {
    const top = res.slice(0, 5);
    return { answer: `The strongest stored provider observations are: ${top.map((o) => `${o.entityName} (${o.entityType}, ${fmt(o.affinity)})`).join("; ")}. Each links to its source request and retrieval time.`, citedEvidenceIds: top.map((o) => o.id), proposedAction: { type: "none", label: "" } };
  }
  if (/summar/.test(q)) {
    const interp = templateInterpretation(ctx.brief, ctx.observations, []);
    return { answer: interp.summary, citedEvidenceIds: interp.findings.flatMap((f) => f.evidenceIds).slice(0, 6), proposedAction: { type: "generate_report", label: "Generate a report" } };
  }
  if (/opportunit|adjacent/.test(q)) {
    return { answer: res.length ? `Adjacent territories suggested by the data: ${[...byType(ctx.observations).keys()].join(", ")}. Generate opportunities to turn them into hypotheses with validation steps.` : "There is no research evidence yet. Run research first.", citedEvidenceIds: [], proposedAction: { type: "generate_opportunities", label: "Generate opportunities" } };
  }
  return {
    answer: "No LLM provider is configured, so I can answer only from stored records: try “summarise the research”, “explain the evidence”, “find adjacent opportunities” or “what assumptions should we test?”.",
    citedEvidenceIds: [],
    proposedAction: { type: "none", label: "" },
  };
}

/** Label-based extraction, e.g. "Brand: Lumen". Missing fields stay empty for the user to fill. */
export function templateBriefExtraction(text: string): BriefExtraction {
  const grab = (...labels: string[]) => {
    for (const l of labels) {
      const m = text.match(new RegExp(`^\\s*(?:[-*•]\\s*)?${l}\\s*[:\\-–]\\s*(.+)$`, "im"));
      if (m) return m[1].trim().slice(0, 600);
    }
    return "";
  };
  const competitors = grab("competitors?", "competition", "competitive set");
  const interests = grab("interests?", "audience interests", "passions", "cultural interests");
  return {
    brand: grab("brand", "client brand"),
    product: grab("product", "product or service", "service", "offering"),
    category: grab("category", "product category", "sector"),
    market: grab("market", "markets?", "geography", "region", "country"),
    audience: grab("target audience", "audience", "target", "consumer"),
    objective: grab("objective", "campaign objective", "goal", "business objective"),
    existingPositioning: grab("positioning", "existing positioning", "brand positioning"),
    competitors: competitors ? competitors.split(/[,;]| and /).map((s) => s.trim()).filter(Boolean).slice(0, 10) : [],
    interests: interests ? interests.split(/[,;]| and /).map((s) => s.trim()).filter(Boolean).slice(0, 10) : [],
    timeframe: grab("timeframe", "timing", "timeline", "launch"),
    budgetRange: grab("budget", "budget range"),
  };
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
