import { THEMES } from "./layout";
import { boardPalette } from "./schema";

/**
 * The board read as a creative-direction document: the same cards the canvas holds, sorted into the
 * sections a client reads (idea, visual language, cultural world, message and tone, proof). Pure, so the
 * Board view, the slides and the health checklist all agree on what is where.
 */

export type SectionNode = { id: string; type?: string; position: { x: number; y: number }; data: Record<string, unknown> };

/** What the board shows of its linked strategy direction. Written by the strategy step, never invented here. */
export type DirectionBrief = {
  id: string; name: string; slot: number;
  coreIdea: string; positioning: string; audience: string; brandRole: string;
  culturalConnections: string[]; messagingPillars: string[]; creativeImplications: string; evidenceIds: string[];
};

export type NoteRole = "note" | "do" | "dont";
export const noteRole = (n: SectionNode): NoteRole => (n.data.role === "do" || n.data.role === "dont" ? n.data.role : "note");

export type BoardSections = {
  images: SectionNode[];
  palette: string[];
  culture: { label: string; nodes: SectionNode[] }[];
  dos: SectionNode[];
  donts: SectionNode[];
  proof: SectionNode[];
  links: SectionNode[];
  notes: SectionNode[];
};

/** Reading order on the canvas: top to bottom, then left to right. */
const byPosition = (a: SectionNode, b: SectionNode) => a.position.y - b.position.y || a.position.x - b.position.x;

export function boardSections(nodes: SectionNode[]): BoardSections {
  const cards = nodes.filter((n) => n.type !== "group").sort(byPosition);
  const of = (type: string) => cards.filter((n) => n.type === type);
  const entities = of("entity").sort((a, b) => Number(b.data.affinity ?? -1) - Number(a.data.affinity ?? -1));
  const themed = new Set<string>();
  const culture = THEMES.map((t) => {
    const list = entities.filter((e) => t.types.includes(String(e.data.type)));
    list.forEach((e) => themed.add(e.id));
    return { label: t.label, nodes: list };
  });
  const other = entities.filter((e) => !themed.has(e.id));
  if (other.length) culture.push({ label: "Other", nodes: other });
  const notes = of("note");
  return {
    images: of("image"),
    palette: boardPalette(nodes),
    culture: culture.filter((c) => c.nodes.length),
    dos: notes.filter((n) => noteRole(n) === "do"),
    donts: notes.filter((n) => noteRole(n) === "dont"),
    proof: of("evidence"),
    links: of("link"),
    notes: notes.filter((n) => noteRole(n) === "note"),
  };
}

export type HealthCheck = { key: string; ok: boolean; label: string; hint?: string; ids?: string[] };

/**
 * What a board needs before it goes in front of a client, as a checklist. Each failed check says
 * what to do; `ids` points at the cards concerned, so the editor can show them.
 */
export function boardHealth(nodes: SectionNode[], direction: DirectionBrief | null): HealthCheck[] {
  const s = boardSections(nodes);
  const imgs = s.images;
  const unsourced = imgs.filter((n) => !n.data.sourceUrl && n.data.rights !== "own");
  const unlicensed = imgs.filter((n) => (n.data.rights ?? "reference") === "reference");
  const off = imgs.filter((n) => (n.data.fit as { level?: string } | undefined)?.level === "off");
  const entityCount = s.culture.reduce((n, c) => n + c.nodes.length, 0);
  // A guardrail counts once it says something.
  const said = (list: SectionNode[]) => list.filter((n) => String(n.data.text ?? "").trim()).length;
  const dos = said(s.dos);
  const donts = said(s.donts);
  const checks: HealthCheck[] = [
    { key: "direction", ok: Boolean(direction), label: direction ? `Linked to “${direction.name}”` : "Not linked to a strategy direction", hint: "Link it so the board shows the idea it is meant to express." },
    { key: "images", ok: imgs.length >= 6, label: imgs.length >= 6 ? `${imgs.length} images` : `${imgs.length} of 6 images`, hint: "A visual world needs at least six images. Drop, paste or upload them." },
    { key: "palette", ok: s.palette.length >= 3, label: s.palette.length >= 3 ? `Palette of ${s.palette.length} colours` : "No palette yet", hint: "The palette comes from your images; add a few more." },
    { key: "culture", ok: entityCount >= 3, label: entityCount >= 3 ? `${entityCount} cultural references` : "Fewer than 3 cultural references", hint: "Add Qloo matches from research." },
    { key: "proof", ok: s.proof.length >= 2, label: s.proof.length >= 2 ? `${s.proof.length} pieces of proof` : "Fewer than 2 pieces of proof", hint: "Add cited evidence so the client can see why." },
    { key: "guardrails", ok: dos > 0 && donts > 0, label: dos && donts ? "Do’s and don’ts set" : !dos && !donts ? "No do’s or don’ts yet" : dos ? "No don’ts yet" : "No do’s yet", hint: "Say what the work should and should not look or sound like." },
  ];
  // Source, rights and fit are about images, so they wait until there are some.
  if (!imgs.length) return checks;
  return [
    ...checks,
    { key: "sources", ok: unsourced.length === 0, label: unsourced.length ? `${unsourced.length} ${unsourced.length === 1 ? "image has" : "images have"} no source` : "Every image has a source", hint: "Add where each image came from.", ids: unsourced.map((n) => n.id) },
    { key: "rights", ok: unlicensed.length === 0, label: unlicensed.length ? `${unlicensed.length} ${unlicensed.length === 1 ? "image is a found reference" : "images are found references"}` : "Usage rights recorded", hint: "Found references can be shown, not used in the final work. Mark licensed or own images.", ids: unlicensed.map((n) => n.id) },
    { key: "fit", ok: off.length === 0, label: off.length ? `${off.length} ${off.length === 1 ? "image looks" : "images look"} off-audience` : "No off-audience images", hint: "The AI fit check flagged these; replace them or keep them on purpose.", ids: off.map((n) => n.id) },
  ];
}

export function healthScore(checks: HealthCheck[]) {
  return { passed: checks.filter((c) => c.ok).length, total: checks.length };
}
