/**
 * Runs the evaluation briefs through the real research API and prints measurable properties.
 * Needs a running deployment with live keys and a session cookie for a test workspace:
 *   BASE_URL=https://your-app CC_COOKIE='sb-…=…' PROJECT_ID=<uuid> npx tsx scripts/research-eval.ts
 * (The project's brief is used as-is; set it to each brief before running, or run one at a time.)
 * Measures: status, completeness, Qloo grounding, providers used, source diversity, independent
 * sources, duplicates, claims, citation integrity, cost and latency. Usefulness needs a human.
 */
import { readFileSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const cookie = process.env.CC_COOKIE ?? "";
const projectId = process.env.PROJECT_ID;
const only = process.argv[2];
const H = { "Content-Type": "application/json", Cookie: cookie };
const get = async (p: string) => (await fetch(base + p, { headers: H })).json();

(async () => {
  if (!projectId) throw new Error("Set PROJECT_ID");
  const { briefs } = JSON.parse(readFileSync("docs/eval/research-briefs.json", "utf8"));
  for (const b of briefs.filter((x: { id: string }) => !only || x.id === only)) {
    const started = Date.now();
    const res = await fetch(`${base}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ projectId, depth: b.depth, question: b.question, mode: process.env.MODE ?? "live", idempotencyKey: `eval-${b.id}-${started}` }) });
    const { jobId, error } = await res.json();
    if (!jobId) { console.log(b.id, "NOT STARTED", error); continue; }
    let job;
    do { await new Promise((r) => setTimeout(r, 3000)); job = (await get(`/api/research/${jobId}`)).job; } while (["queued", "running"].includes(job.status));
    const { report, plan, qloo } = await get(`/api/research/${jobId}/report`);
    const { documents } = await get(`/api/research/${jobId}/sources?limit=200`);
    const { claims } = await get(`/api/research/${jobId}/evidence?limit=300`);
    const hosts = new Set(documents.map((d: { url: string | null }) => { try { return new URL(d.url!).hostname; } catch { return null; } }).filter(Boolean));
    // Every citation must resolve to a stored web claim or a stored Qloo observation.
    const claimIds = new Set([...claims.map((c: { id: string }) => c.id), ...(qloo ?? []).map((q: { evidenceId: string }) => q.evidenceId)]);
    const cited = (report?.findings ?? []).flatMap((f: { claimIds: string[] }) => f.claimIds);
    const qlooCited = (report?.opportunities ?? []).filter((o: { qlooEvidenceIds?: string[] }) => o.qlooEvidenceIds?.length).length;
    console.log(JSON.stringify({
      id: b.id, status: job.status, completeness: report?.completeness, stop: job.stopReason, seconds: Math.round((Date.now() - started) / 1000),
      usd: job.usage?.usdEstimated, providers: plan?.providers, qlooSeededQuestions: (plan?.questions ?? []).filter((q: { origin?: string }) => q.origin === "qloo").length,
      sources: documents.length, hosts: hosts.size, independent: job.usage?.independentSources, duplicatesRemoved: job.usage?.duplicatesRemoved, claims: claims.length,
      citationIntegrity: cited.length ? cited.filter((id: string) => claimIds.has(id)).length / cited.length : null,
      qlooObservations: (qloo ?? []).length,
      opportunities: report?.opportunities?.length ?? 0, opportunitiesWithQlooFoundation: qlooCited, contradictions: report?.contradictions?.length ?? 0,
      expect: b.expect,
    }, null, 0));
  }
})();
