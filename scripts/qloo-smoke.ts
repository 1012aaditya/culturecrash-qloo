/**
 * Live Qloo smoke test. Prints status codes and response shapes only (never the key).
 *   QLOO_API_KEY=… [QLOO_API_URL=https://hackathon.api.qloo.com] npx tsx scripts/qloo-smoke.ts
 */
import { QlooClient } from "../src/lib/providers/qloo/client";

const key = process.env.QLOO_API_KEY;
const base = process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com";
if (!key) {
  console.error("QLOO_API_KEY is not set");
  process.exit(1);
}
const client = new QlooClient(key, base);

async function main() {
  const search = await client.search("Sephora", ["urn:entity:brand"], 3);
  console.log("search", search.httpStatus, search.data.length, Object.keys((search.raw as object) ?? {}));
  const seed = search.data[0];
  if (!seed) return console.log("No seed entity resolved; stopping.");
  console.log("seed", seed.name, seed.type, seed.providerId);
  const ins = await client.insights({ filterType: "urn:entity:artist", signalEntities: [seed.providerId], take: 5, explainability: true });
  console.log("insights", ins.httpStatus, ins.data.map((e) => `${e.name} (${e.affinity})`));
  const tags = await client.tagInsights({ signalEntities: [seed.providerId], take: 5 });
  console.log("tags", tags.httpStatus, tags.data.map((t) => `${t.name} (${t.affinity})`));
}

main().catch((e) => {
  console.error("FAILED:", e?.code ?? "", e?.message ?? e);
  process.exit(1);
});
