/**
 * Live check for the research providers. Run on a machine/deployment that can reach them:
 *   npx tsx --env-file=.env.local scripts/research-smoke.ts "gen z skincare india"
 * Prints HTTP status, result counts and the first title per provider — never keys.
 */
import { braveSearch } from "../src/lib/research/deep/providers/brave";
import { exaSearch, tavilySearch } from "../src/lib/research/deep/providers/alt-web";
import { googleSuggest } from "../src/lib/research/deep/providers/google-suggest";
import { hackerNewsSearch } from "../src/lib/research/deep/providers/hacker-news";
import { redditSearch } from "../src/lib/research/deep/providers/reddit";
import { serperSearch } from "../src/lib/research/deep/providers/serper";
import { wikipediaSearch } from "../src/lib/research/deep/providers/wikipedia";
import { youtubeSearch } from "../src/lib/research/deep/providers/youtube";
import { fetchPage } from "../src/lib/research/deep/fetch-page";

const q = process.argv[2] ?? "gen z skincare routines india";
const e = process.env;
const show = (name: string, r: { ok: boolean; httpStatus: number | null; data: { title: string; url: string | null }[]; error: string | null; units: number }) =>
  console.log(`${name.padEnd(12)} ${r.ok ? "OK " : "ERR"} http=${r.httpStatus ?? "-"} results=${r.data.length} units=${r.units}${r.error ? ` error="${r.error}"` : ""}${r.data[0] ? `\n             first: ${r.data[0].title} — ${r.data[0].url}` : ""}`);

(async () => {
  console.log(`Query: "${q}"\n`);
  show("wikipedia", await wikipediaSearch({ query: q }));
  show("google_suggest", await googleSuggest({ query: q, country: "in" }));
  show("hacker_news", await hackerNewsSearch({ query: q }));
  if (e.SERPER_API_KEY) {
    const s = await serperSearch({ query: q, country: "in", apiKey: e.SERPER_API_KEY });
    show("serper", s);
    const url = s.data.find((h) => h.url)?.url;
    if (url) { const p = await fetchPage(url); console.log(`page fetch   ${p.status} ${p.error ?? ""} chars=${p.text.length} published=${p.publishedAt ?? "unknown"}`); }
  } else console.log("serper       skipped (SERPER_API_KEY not set)");
  if (e.BRAVE_API_KEY) {
    const b = await braveSearch({ query: q, country: "in", freshness: "year", apiKey: e.BRAVE_API_KEY, usdPerCall: 0.005 });
    show("brave", b);
  } else console.log("brave        skipped (BRAVE_API_KEY not set)");
  if (e.TAVILY_API_KEY) show("tavily", await tavilySearch({ query: q, apiKey: e.TAVILY_API_KEY, usdPerCall: 0 })); else console.log("tavily       skipped");
  if (e.EXA_API_KEY) show("exa", await exaSearch({ query: q, apiKey: e.EXA_API_KEY, usdPerCall: 0 })); else console.log("exa          skipped");
  if (e.YOUTUBE_API_KEY) show("youtube", await youtubeSearch({ query: q, apiKey: e.YOUTUBE_API_KEY })); else console.log("youtube      skipped (YOUTUBE_API_KEY not set)");
  if (e.REDDIT_CLIENT_ID && e.REDDIT_CLIENT_SECRET) show("reddit", await redditSearch({ query: q, clientId: e.REDDIT_CLIENT_ID, clientSecret: e.REDDIT_CLIENT_SECRET })); else console.log("reddit       skipped (REDDIT_CLIENT_ID/SECRET not set)");
})();
