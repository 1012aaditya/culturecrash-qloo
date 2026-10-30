import "server-only";
import { z } from "zod";
import { generateStructured, tag } from "@/lib/ai";

const point = z.object({ cards: z.array(z.string()).describe("Card refs like c3 that this point is about"), point: z.string() });
export const critiqueSchema = z.object({
  summary: z.string().describe("Two or three sentences on how well the board expresses the direction"),
  supports: z.array(point).describe("What on the board expresses the direction and audience well"),
  offBrief: z.array(point).describe("Cards that work against the direction, the audience or the brief"),
  missing: z.array(z.string()).describe("What the direction needs that the board does not show yet"),
  nextSteps: z.array(z.string()).describe("Concrete additions or changes, at most four"),
});

export type BoardCritique = {
  summary: string; supports: { cardIds: string[]; point: string }[]; offBrief: { cardIds: string[]; point: string }[];
  missing: string[]; nextSteps: string[]; generator: string; at: string;
};

type Card = { id: string; type?: string; data: Record<string, unknown> };

/** A compact, model-readable digest of the cards; card ids become short refs (c1, c2…) mapped back afterwards. */
export function digestCards(cards: Card[]) {
  const refs = new Map<string, string>();
  const lines = cards.filter((c) => c.type !== "group").slice(0, 120).map((c, i) => {
    const ref = `c${i + 1}`;
    refs.set(ref, c.id);
    const d = c.data;
    switch (c.type) {
      case "image": {
        const fit = d.fit as { level?: string; tags?: string[]; descriptors?: string[] } | undefined;
        return { ref, type: "image", caption: d.title, source: d.rights === "ai" ? "generated" : d.sourceUrl ? "yes" : "none", rights: d.rights ?? "reference", looks: fit?.descriptors, audienceFit: fit ? `${fit.level}${fit.tags?.length ? ` (${fit.tags.join(", ")})` : ""}` : "not checked", colours: d.palette };
      }
      case "note": return { ref, type: "note", text: String(d.text ?? "").slice(0, 300) };
      case "link": return { ref, type: "link", title: d.title, site: d.siteName, note: String(d.note ?? "").slice(0, 200) };
      case "entity": return { ref, type: "qloo_entity", name: d.name, entityType: d.type, affinity: d.affinity };
      case "evidence": return { ref, type: "evidence", claim: String(d.claim ?? "").slice(0, 300), kind: d.evidenceType };
      default: return { ref, type: c.type };
    }
  });
  return { lines, refs };
}

export async function critiqueBoard(cards: Card[], context: { brief: Record<string, unknown>; direction: Record<string, unknown> | null; palette: string[] }): Promise<BoardCritique> {
  const { lines, refs } = digestCards(cards);
  const r = await generateStructured({
    schema: critiqueSchema,
    effort: "medium",
    maxTokens: 6000,
    prompt: [
      "Critique this inspiration board as a senior art director would: does it give the strategy direction a coherent, ownable visual world for this audience?",
      context.direction ? "Judge it against the direction below." : "No strategy direction is linked to this board; judge it against the brief and say that linking a direction would sharpen the critique.",
      "Refer to cards only by their refs (c1, c2…). Audience fit labels come from an AI check against Qloo taste tags: treat them as hypotheses, not evidence. Flag images with no source or rights still 'reference' if the board looks client-facing. Be specific and brief; do not invent cards, sources or data.",
      "This text is shown to the team: put card refs only in the cards arrays, never in the summary or points.",
      tag("brief", JSON.stringify(context.brief)),
      tag("evidence", JSON.stringify({ direction: context.direction, palette: context.palette, cards: lines })),
    ].join("\n\n"),
  });
  const back = (refsIn: string[]) => [...new Set(refsIn.map((x) => refs.get(x.trim().toLowerCase())).filter((x): x is string => Boolean(x)))];
  const clean = (s: string) => s.replace(/\(?\bc\d{1,3}\b\)?/g, "").replace(/ {2,}/g, " ").replace(/ ([.,;:])/g, "$1").trim();
  return {
    summary: clean(r.data.summary),
    supports: r.data.supports.slice(0, 6).map((p) => ({ cardIds: back(p.cards), point: clean(p.point) })),
    offBrief: r.data.offBrief.slice(0, 6).map((p) => ({ cardIds: back(p.cards), point: clean(p.point) })),
    missing: r.data.missing.slice(0, 5).map(clean),
    nextSteps: r.data.nextSteps.slice(0, 4).map(clean),
    generator: r.generator,
    at: new Date().toISOString(),
  };
}
