/**
 * Relevance and story grouping for Watch. Pure, deterministic rules (no AI), unit-tested and tuned on real
 * collected stories. Nothing is deleted: irrelevant items are hidden from the timeline and from counts,
 * with the reason shown when someone asks to see them.
 */

export type Relevance = "relevant" | "listing" | "name_clash";
export type Classifiable = { title: string; excerpt: string | null; provider: string; sourceType: string };

/** Resale and marketplace listings: a single item for sale, not news about the company. */
const LISTING = new RegExp([
  String.raw`\b(?:pre-?owned|nwt|nwot|nib|new with(?:out)? tags?)\b`,
  String.raw`\bin (?:good|great|excellent|fair|very good) (?:used )?condition\b`,
  String.raw`\bused condition\b`,
  String.raw`\b(?:men'?s|women'?s|womens|mens|kids'?|youth|boys'?|girls'?) size\b`,
  String.raw`\bsize (?:xxs|xs|s|m|l|xl|xxl|small|medium|large|x-large|\d{1,2}(?:\.5)?)\b.*\b(?:shipping|returns|condition|sold)\b`,
  String.raw`\bfree (?:holiday )?returns\b`,
  String.raw`\b(?:lot of \d+|for sale by owner|buy it now|best offer)\b`,
].join("|"), "i");

/** Words that show a story is about a company and what it does: business, products, marketing, sport. */
const BRAND_CONTEXT = [
  "brand", "brands", "company", "inc", "corp", "ag", "se", "ceo", "executive", "shares", "stock", "investors", "earnings", "revenue", "sales", "profit",
  "quarter", "q1", "q2", "q3", "q4", "guidance", "forecast", "results", "retail", "retailer", "store", "stores", "ecommerce", "acquisition", "layoffs",
  "launch", "launches", "release", "releases", "drop", "collection", "collab", "collaboration", "partnership", "partners", "edition", "limited",
  "product", "products", "unveils", "debuts", "colorway", "colourway", "restock", "available", "price", "sale", "sneaker", "sneakers", "shoe",
  "shoes", "boot", "boots", "kicks", "trainers", "footwear", "apparel", "clothing", "sportswear", "streetwear", "fashion", "kit", "jersey", "tee",
  "hoodie", "running", "review", "campaign", "ad", "ads", "advert", "commercial", "marketing", "sponsor", "sponsorship", "ambassador", "athlete",
  "signature", "endorsement", "football", "soccer", "basketball", "nba", "nfl", "olympics", "footballer", "player", "wearables", "outfit",
];

/**
 * Words that point at another meaning of a brand name: a racehorse, a car, a singer, a game, an animal or a
 * goddess. An item is hidden as a name clash only when such words are present and outnumber the brand
 * words (a tie keeps it visible) — absence of evidence is not enough, so stories in other languages aren't hidden by mistake.
 * Words with an everyday brand meaning too ("trainer" is a shoe, "mountain" a bike, "hybrid" a sneaker-boot)
 * are left out.
 */
const OTHER_MEANING = [
  // horses and racing
  "horse", "horses", "jockey", "jockeys", "thoroughbred", "filly", "colt", "stallion", "racecourse", "breeders", "derby", "furlong",
  // cars
  "car", "cars", "suv", "hatchback", "crossover", "rally", "rally1", "ford", "engine", "horsepower", "dealership", "mpg", "vehicle",
  // music and entertainment
  "song", "songs", "singer", "album", "concert", "lyrics", "karaoke", "music", "musica", "cantante", "lagu", "cancion", "tour",
  // games and military
  "tank", "tanks", "warthunder", "gameplay", "armored", "armoured", "missile", "helicopter",
  // animals and myth
  "cougar", "cougars", "wildlife", "zoo", "cub", "cubs", "predator", "sighting", "goddess", "mythology", "greek",
];

const STOP = new Set(("a an and are as at be but by for from has have he her his how i in is it its of on or our she so that the their them they this to " +
  "was we were what when where which who why will with you your new now just more most over after into than up out about can not no all one two " +
  "first latest says said here how's it's what's year years day days week weeks month 2024 2025 2026 2027").split(" "));

export function tokens(text: string): string[] {
  return (text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [])
    .map((t) => t.replace(/['’]s$/, ""));
}

/**
 * Why an item is hidden, or "relevant". Company websites and feeds are always relevant (they're the
 * company's own pages); YouTube and news go through both checks.
 */
export function classify(item: Classifiable, ctx: { targetNames: string[]; context: string[] }): { relevance: Relevance; reason: string | null } {
  if (item.provider === "page" || item.provider === "rss") return { relevance: "relevant", reason: null };
  const text = `${item.title}\n${item.excerpt ?? ""}`;
  if (item.sourceType !== "video" && LISTING.test(text)) return { relevance: "listing", reason: "Looks like a single item for sale, not news." };
  const words = new Set(tokens(text));
  // Two watched companies in one story is strong evidence it's about them.
  const namesFound = ctx.targetNames.map(tokens).filter((n) => n.length && n.every((w) => words.has(w))).length;
  if (namesFound >= 2) return { relevance: "relevant", reason: null };
  const brand = new Set([...BRAND_CONTEXT, ...ctx.context.flatMap(tokens)]);
  const brandHits = [...words].filter((w) => brand.has(w)).length;
  const otherHits = [...words].filter((w) => OTHER.has(w)).length;
  if (otherHits > brandHits) {
    return { relevance: "name_clash", reason: "Seems to be about something else with the same name (for example a person, a car or a horse)." };
  }
  return { relevance: "relevant", reason: null };
}

const OTHER = new Set(OTHER_MEANING);

// ---- Story grouping -------------------------------------------------------------------------------

/** "Third quarter" and "Q3" are the same thing in business news. */
const quarters = (text: string) => text.replace(/\b(first|second|third|fourth)[- ]quarter\b/gi, (_, n: string) => `q${["first", "second", "third", "fourth"].indexOf(n.toLowerCase()) + 1}`);

/** Light English plural folding, so "losses"/"loss" and "sales"/"sale" match. Deliberately minimal. */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(?:x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
  return w;
}

export type Story = { id: string; targetId: string | null; title: string; excerpt: string | null; at: number };
/** Stories about the same event are rarely more than this far apart. */
export const EVENT_WINDOW_DAYS = 4;
/** Share of the smaller story's distinctive weight that must be shared. Tuned on real stories. */
export const EVENT_THRESHOLD = 0.34;

/**
 * Groups stories about the same event: same company, published within EVENT_WINDOW_DAYS, and sharing
 * distinctive words (weighted by rarity across the watch, so "Q3" or "Vegam" count far more than
 * "launch"). Returns a map from story id to the id of the event's first story. Deterministic: stories
 * are processed oldest first and join the best-matching earlier event.
 */
export function groupStories(stories: Story[], targetNames: string[]): Map<string, string> {
  const names = new Set(targetNames.flatMap(tokens));
  const bag = (s: Story) => new Set(tokens(quarters(`${s.title} ${(s.excerpt ?? "").split(/\s+/).slice(0, 30).join(" ")}`))
    .filter((w) => w.length > 2 && !STOP.has(w) && !names.has(w) && !/^\d+$/.test(w)).map(stem));
  const bags = new Map(stories.map((s) => [s.id, bag(s)]));
  const df = new Map<string, number>();
  for (const b of bags.values()) for (const w of b) df.set(w, (df.get(w) ?? 0) + 1);
  const n = Math.max(stories.length, 2);
  const idf = (w: string) => Math.log(n / (df.get(w) ?? 1));
  const weight = (b: Set<string>) => [...b].reduce((t, w) => t + idf(w), 0);

  const sorted = [...stories].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const eventOf = new Map<string, string>();
  const members = new Map<string, Story[]>();
  for (const s of sorted) {
    const mine = bags.get(s.id)!;
    let best: { event: string; score: number } | null = null;
    for (const [event, list] of members) {
      if (list[0].targetId !== s.targetId) continue;
      for (const m of list) {
        if (Math.abs(s.at - m.at) > EVENT_WINDOW_DAYS * 86_400_000) continue;
        const theirs = bags.get(m.id)!;
        const shared = [...mine].filter((w) => theirs.has(w) && df.get(w)! < n);
        if (shared.length < 2) continue;
        const score = shared.reduce((t, w) => t + idf(w), 0) / Math.max(Math.min(weight(mine), weight(theirs)), 1e-9);
        if (score >= EVENT_THRESHOLD && (!best || score > best.score)) best = { event, score };
      }
    }
    const event = best?.event ?? s.id;
    eventOf.set(s.id, event);
    members.set(event, [...(members.get(event) ?? []), s]);
  }
  return eventOf;
}
