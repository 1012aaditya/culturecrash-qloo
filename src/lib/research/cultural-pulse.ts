import "server-only";
import { z } from "zod";
import { generateStructured, TEMPLATE_GENERATOR } from "@/lib/ai";
import { llmConfigured } from "@/lib/ai";
import type { BriefInput } from "@/lib/ai/template";
import { searchLiveWeb, type WebSearchResult } from "./web-search";

export const liveCulturalPulseSchema = z.object({
  zeitgeistSummary: z.string(),
  microAesthetics: z.array(
    z.object({
      name: z.string(),
      platformOrigin: z.string(),
      description: z.string(),
      audienceRelevance: z.string(),
    })
  ).min(2).max(4),
  culturalTensions: z.array(
    z.object({
      tension: z.string(),
      implicationForBrand: z.string(),
    })
  ).min(2).max(3),
  watchouts: z.array(
    z.object({
      risk: z.string(),
      recommendation: z.string(),
    })
  ).min(1).max(2),
  liveWebSources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      source: z.string(),
      snippet: z.string(),
      relevance: z.string().optional(),
    })
  ).optional().default([]),
});

export type LiveCulturalPulse = z.infer<typeof liveCulturalPulseSchema>;

export function templateCulturalPulse(brief: BriefInput, ageCohort?: string | null): LiveCulturalPulse {
  const brand = brief.brand || brief.name;
  const category = brief.category || "Lifestyle & Culture";
  const cohortLabel = ageCohort ? `age ${ageCohort}` : "contemporary youth culture";

  return {
    zeitgeistSummary: `In 2026, audiences within ${category} are shifting away from sanitized minimalism toward expressive, sensory-rich subcultures with strong provenance and anti-algorithmic authenticity.`,
    microAesthetics: [
      {
        name: "Neo-Analog Rituals",
        platformOrigin: "Substack & TikTok",
        description: "A deliberate embrace of tactile physical formats (print, vinyl, intentional slow dining, dumbphones) as resistance against screen fatigue.",
        audienceRelevance: `Strongly appeals to ${cohortLabel} seeking tactile friction and grounding in a hyper-digital landscape.`,
      },
      {
        name: "De-Optimized Living",
        platformOrigin: "Letterboxd & Discord",
        description: "Rejecting hustle-culture wellness and perfectionism in favor of playful flaws, messy creativity, and unpolished authenticity.",
        audienceRelevance: `Gives ${brand} permission to adopt a self-aware, witty tone rather than lecturing the consumer.`,
      },
      {
        name: "Hyper-Curated Archive",
        platformOrigin: "Instagram & Pinterest",
        description: "Deep niche connoisseurship: excavating 90s/00s artifacts, indie cinema references, and rare local cultural sub-genres.",
        audienceRelevance: `Directly matches the affinity patterns seen in our cultural co-occurrence network.`,
      },
    ],
    culturalTensions: [
      {
        tension: "Algorithmic Saturation vs. Curated Discovery",
        implicationForBrand: `${brand} must present its cultural associations as thoughtful human curation rather than automated influencer placement.`,
      },
      {
        tension: "Aspirational Identity vs. Economic Realism",
        implicationForBrand: "Campaign narratives must feel accessible and culturally earned rather than elitist or transactional.",
      },
    ],
    watchouts: [
      {
        risk: "Meme Co-optation Fatigue",
        recommendation: "Avoid chasing fleeting 48-hour social micro-memes; anchor brand positioning to enduring subcultural values.",
      },
      {
        risk: "Performative Heritage",
        recommendation: "Ensure any claim to craftsmanship or niche subcultures cites real cultural creators and verifiable provenance.",
      },
    ],
    liveWebSources: [
      {
        title: `${brand} Cultural Footprint & Category Movement`,
        url: "https://news.google.com",
        source: "Industry Discourse",
        snippet: `Recent analysis of consumer behavioral shifts across ${category} highlighting demand for narrative depth.`,
        relevance: "Category context baseline",
      },
    ],
  };
}

export async function generateCulturalPulse(opts: {
  brief: BriefInput;
  ageCohort?: string | null;
  topEntities: string[];
  isDemo?: boolean;
}): Promise<{ data: LiveCulturalPulse; generator: string }> {
  const brand = opts.brief.brand || opts.brief.name;
  const category = opts.brief.category || "";

  // 1. Fetch real-time live web intelligence
  let liveSearchResults: WebSearchResult[] = [];
  if (!opts.isDemo) {
    const q1 = `${brand} ${category} trends 2026`.trim();
    const q2 = `${opts.brief.audience || category} culture aesthetic`.trim();
    try {
      const [res1, res2] = await Promise.all([
        searchLiveWeb(q1, 3),
        searchLiveWeb(q2, 3),
      ]);
      const combined = [...res1, ...res2];
      const seen = new Set<string>();
      for (const item of combined) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          liveSearchResults.push(item);
        }
      }
    } catch {
      // Non-blocking: proceed with LLM knowledge
    }
  }

  if (opts.isDemo || !llmConfigured()) {
    const base = templateCulturalPulse(opts.brief, opts.ageCohort);
    if (liveSearchResults.length > 0) {
      base.liveWebSources = liveSearchResults.map((r) => ({
        title: r.title,
        url: r.url,
        source: r.source,
        snippet: r.snippet,
        relevance: "Live web research discovery",
      }));
    }
    return { data: base, generator: opts.isDemo ? "demo-fixture" : TEMPLATE_GENERATOR };
  }

  const liveWebContext = liveSearchResults.length > 0
    ? liveSearchResults.map((r, i) => `[Web Source ${i + 1}] Title: "${r.title}" | Source: ${r.source} | URL: ${r.url} | Snippet: ${r.snippet}`).join("\n")
    : "No external web articles retrieved; synthesize from contemporary cultural understanding.";

  const prompt = `Analyze the live 2026 cultural zeitgeist, micro-aesthetics, and cultural tensions for this brand brief.
You are a senior cultural strategist at a top-tier brand consultancy. Ground your analysis in contemporary cultural movements, social platforms (TikTok, Substack, Letterboxd, Reddit, Instagram), and the real-time live web intelligence provided below.

<brief>
Brand: ${brand}
Category: ${category || "Not specified"}
Target Audience: ${opts.brief.audience || "General"}
Age Cohort: ${opts.ageCohort || "Not specified"}
Market/Location: ${opts.brief.market || "Global"}
Competitors: ${opts.brief.competitors.join(", ") || "None specified"}
Top Co-occurring Cultural Entities from Graph: ${opts.topEntities.join(", ") || "None"}
</brief>

<live_web_intelligence>
${liveWebContext}
</live_web_intelligence>

Identify:
1. zeitgeistSummary: A sharp 2-sentence summary of the prevailing cultural mood in this category for 2026.
2. microAesthetics: 2-3 specific named micro-aesthetics with platform origins, behavioral descriptions, and relevance to this audience.
3. culturalTensions: 2 real cultural paradoxes or frictions this brand can address.
4. watchouts: 1-2 sharp cultural watchouts (cynicism risks, fatigue traps).
5. liveWebSources: Select up to 4 the most relevant web sources from <live_web_intelligence> (title, url, source, snippet, and 1-sentence relevance).

Output in valid JSON matching the schema.`;

  try {
    const res = await generateStructured({
      schema: liveCulturalPulseSchema,
      prompt,
      maxTokens: 4000,
    });
    // Ensure liveWebSources contains at least the actual live search results if the model returned an empty list
    if ((!res.data.liveWebSources || res.data.liveWebSources.length === 0) && liveSearchResults.length > 0) {
      res.data.liveWebSources = liveSearchResults.slice(0, 4).map((r) => ({
        title: r.title,
        url: r.url,
        source: r.source,
        snippet: r.snippet,
        relevance: "Verified category discourse",
      }));
    }
    return res;
  } catch {
    const fallback = templateCulturalPulse(opts.brief, opts.ageCohort);
    if (liveSearchResults.length > 0) {
      fallback.liveWebSources = liveSearchResults.map((r) => ({
        title: r.title,
        url: r.url,
        source: r.source,
        snippet: r.snippet,
        relevance: "Live web discovery",
      }));
    }
    return { data: fallback, generator: TEMPLATE_GENERATOR };
  }
}
