import { describe, expect, it } from "vitest";
import { classify, groupStories, type Story } from "@/lib/watch/relevance";

// Cases are real headlines collected by Watch for Nike, Adidas and Puma (30 Oct 2026).
const ctx = { targetNames: ["Nike", "Adidas", "Puma"], context: ["Sportswear"] };
const news = (title: string, excerpt = "", sourceType = "news", provider = "serper") => classify({ title, excerpt, provider, sourceType }, ctx).relevance;
const video = (title: string, excerpt = "") => news(title, excerpt, "video", "youtube");

describe("relevance: hidden only with evidence", () => {
  it("hides resale listings", () => {
    expect(news("Mens gray adidas T shirt", "Mens gray adidas Tshirt with blue print on the front and sleeve. In good used condition.")).toBe("listing");
    expect(news("Atlanta Hawks Basketball NBA x Adidas Climalite Ultimate Tee Men’s Size Medium", "Free Holiday returns until Jan 31.")).toBe("listing");
  });
  it("hides things that share a brand's name", () => {
    expect(news("The Puma horse, trainer, jockey for 2026 Breeders' Cup Classic", "Meet Breeders' Cup Classic contender The Puma.")).toBe("name_clash");
    expect(video("Ford Puma Rally1 Magyarországon – Bútor Robi első tesztje")).toBe("name_clash");
    expect(video("¡Un gigante de la música! El Puma Rodríguez emocionó con “Dueño de nada”")).toBe("name_clash");
    expect(video("Locust vs Puma (Tanks) #warthunder #gaming")).toBe("name_clash");
    expect(video("Nike Ardila The Best Lagu Lawas Nostalgia Pop 90an")).toBe("name_clash");
  });
  it("keeps real brand stories, including ones in other languages and ones that sound like other things", () => {
    for (const title of [
      "Nike Air Force 1 ’07 Patent “Joker” Is Now Available for $125",
      "The PUMA x NAHMIAS Suede Crochet Goes From Earthy to Electric",
      "アディダス オリジナルスとTTTMSWが初のコラボレーション",
      "Is the slimmed-down Adidas Hyperboost Run our new favorite trainer?",
      "LAST DAY - Got the Best Line of 2026? Enter the adidas Line of the Year",
      "Top 10 vibrant PUMA kicks on sale from $12 right now (Up to 66% off)",
      "Nike Kobe 3 Low Protro 'Mamba Eterno' Release Date",
      "Puma sponsors the Ferrari racing team for another season",
      // Live, 30 Oct: "hybrid" here is a sneaker-boot, not a car.
      "Nike’s Fan-favorite Air Max Boot Got a New Futuristic Foamposite Update",
    ]) expect(news(title), title).toBe("relevant");
    expect(video("Who’s the Greatest Adidas Footballer of All Time?")).toBe("relevant");
    expect(news("Nike’s Fan-favorite Air Max Boot Got a New Futuristic Foamposite Update", "Nike is introducing its latest sneaker boot hybrid, the Goadome Low Foam SP")).toBe("relevant");
    // A listing pattern never hides a video; two watched companies in one story always count.
    expect(video("Mens size 10 Nike haul, free returns")).toBe("relevant");
    expect(news("Nike vs Adidas: which horse-racing sponsor wins?", "Jockeys, horses")).toBe("relevant");
  });
  it("never hides the company's own pages or feeds", () => {
    expect(classify({ title: "The Puma horse", excerpt: "jockey", provider: "rss", sourceType: "brand_site" }, ctx).relevance).toBe("relevant");
  });
  it("explains why an item is hidden", () => {
    expect(classify({ title: "Mens gray adidas T shirt", excerpt: "In good used condition", provider: "serper", sourceType: "news" }, ctx).reason).toMatch(/for sale/);
  });
});

describe("story grouping", () => {
  const day = 86_400_000;
  const T0 = Date.parse("2026-10-30T08:00:00Z");
  const s = (id: string, targetId: string, title: string, at = T0, excerpt = ""): Story => ({ id, targetId, title, excerpt, at });
  const corpus = [
    s("q1", "puma", "Puma sales fall in third quarter as losses persist", T0),
    s("q2", "puma", "Puma shares up 7% as Q3 sales beat forecasts, 2026 loss range narrows", T0 + 3_600_000),
    s("q3", "puma", "Puma Sales Fall 5% as Demand Weakens, Posts 55 Million Loss in Third Quarter", T0 + 7_200_000),
    s("v1", "nike", "Nike To Launch Vegam Run, Its First Running Shoe Designed For India", T0 - day),
    s("v2", "nike", "Nike launches ₹3,795 Vegam Run shoe designed for Indian runners", T0),
    s("k1", "puma", "PUMA and Sundowns unveil the third kit for 2026/27 season", T0),
    s("o1", "nike", "Nike’s former chief innovation officer to speak at Montana State", T0),
    s("o2", "adidas", "Wales Bonner x Adidas Originals Fall 2026 Release Date", T0),
    s("o3", "adidas", "Costco Is Practically Giving Away These Classic-Looking Adidas Sneakers", T0),
  ];
  it("groups different headlines about one event, under its first story", () => {
    const g = groupStories(corpus, ["Nike", "Adidas", "Puma"]);
    expect([g.get("q1"), g.get("q2"), g.get("q3")]).toEqual(["q1", "q1", "q1"]);
    expect([g.get("v1"), g.get("v2")]).toEqual(["v1", "v1"]);
  });
  it("keeps unrelated stories apart", () => {
    const g = groupStories(corpus, ["Nike", "Adidas", "Puma"]);
    for (const id of ["k1", "o1", "o2", "o3"]) expect(g.get(id)).toBe(id);
  });
  it("never groups across companies or far-apart days", () => {
    const g = groupStories([
      s("a", "nike", "Nike launches Vegam Run shoe designed for India"),
      s("b", "adidas", "Adidas launches Vegam Run shoe designed for India"),
      s("c", "nike", "Nike launches Vegam Run shoe designed for India again", T0 + 10 * day),
      s("x", "puma", "Puma reports quarterly results"),
    ], ["Nike", "Adidas", "Puma"]);
    expect([g.get("a"), g.get("b"), g.get("c")]).toEqual(["a", "b", "c"]);
  });
  it("never chains similar stories into one month-long event", () => {
    const daily = Array.from({ length: 10 }, (_, i) => s(`d${i}`, "puma", "Puma reports quarterly results and narrows its loss guidance", T0 + i * day));
    const g = groupStories(daily, ["Puma"]);
    expect(new Set(g.values()).size).toBeGreaterThanOrEqual(2);
    for (const [id, lead] of g) expect(daily.find((x) => x.id === id)!.at - daily.find((x) => x.id === lead)!.at).toBeLessThanOrEqual(4 * day);
  });
  it("gives the same answer whatever order stories arrive in", () => {
    const a = groupStories(corpus, ["Nike", "Adidas", "Puma"]);
    const b = groupStories([...corpus].reverse(), ["Nike", "Adidas", "Puma"]);
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
  });
});
