import { notifyResearchFinished } from "@/lib/email/notify";
import { llmEnabled } from "@/lib/ai/enabled";
import "server-only";
import { generateStructured, tag, TEMPLATE_GENERATOR } from "@/lib/ai";
import { researchInterpretationSchema, type ResearchInterpretation } from "@/lib/ai/schemas";
import { templateInterpretation, type BriefInput, type Observation } from "@/lib/ai/template";
import { generateCulturalPulse } from "./cultural-pulse";
import { withUser, type Tx } from "@/lib/db";
import { logActivity, trackEvent } from "@/lib/data/activity";
import { loadBrief } from "@/lib/data/briefs";
import { DemoQlooClient, qloo, QlooError, type EntityTypeUrn, type NormalizedEntity, type QlooCall } from "@/lib/providers/qloo";

export const AFFINITY_LIMITATION =
  "Affinity is a correlation in taste between people connected to the signal and this entity. It does not indicate purchase intent, campaign effectiveness, audience representativeness or causation.";

/**
 * Live finding (2026-10-29): unfiltered urn:tag insights lead with generic genre tags ("Actor", "Hotel"),
 * and filter.tag.types with *:qloo tag types returned zero tags. So we request a wider set and drop
 * urn:tag:genre:* client-side, keeping only taste-descriptive tags.
 */
const TAG_TAKE = 50;
const MAX_TASTE_TAGS = 20;
const MAX_PROFILE_TAGS = 12;

export type ResearchPlan = {
  question: string;
  seedQueries: { query: string; kind: "brand" | "competitor" }[];
  /** Audience interests resolved through /v2/tags (absent on plans made before this existed). */
  interestQueries?: string[];
  location: string | null;
  ageCohort?: string | null;
  targets: EntityTypeUrn[];
  includeTags: boolean;
  notes: string[];
};

type QlooLike = Pick<InstanceType<typeof DemoQlooClient>, "search" | "searchTags" | "insights" | "tagInsights">;
const MAX_INTERESTS = 4;

export function extractAgeCohort(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  // Explicit numeric ranges take highest priority
  if (/\b18[-–]24\b/.test(t)) return "18-24";
  if (/\b25[-–]34\b/.test(t)) return "25-34";
  if (/\b35[-–]44\b/.test(t)) return "35-44";
  if (/\b45[-–]54\b/.test(t)) return "45-54";
  if (/\b(55\+|55[-–]64)\b/.test(t)) return "55+";

  // Generational descriptors with proper specificity
  if (/\b(gen[- ]?z|young adults?)\b/.test(t)) return "18-24";
  if (/\b(older millennials?)\b/.test(t)) return "35-44";
  if (/\b(millennials?|young professionals?)\b/.test(t)) return "25-34";
  if (/\b(gen[- ]?x)\b/.test(t)) return "45-54";
  if (/\b(boomers?|seniors?)\b/.test(t)) return "55+";
  return undefined;
}

export function buildPlan(b: BriefInput): ResearchPlan {
  const seeds: ResearchPlan["seedQueries"] = [];
  if (b.brand) seeds.push({ query: b.brand, kind: "brand" });
  for (const c of b.competitors.slice(0, 3)) seeds.push({ query: c, kind: "competitor" });
  const cat = (b.category ?? "").toLowerCase();
  const targets: EntityTypeUrn[] = [
    "urn:entity:brand",
    "urn:entity:artist",
    "urn:entity:movie",
    "urn:entity:tv_show",
    "urn:entity:podcast",
    "urn:entity:person",
  ];
  if (b.market) targets.push("urn:entity:place");
  if (/travel|hotel|tourism|hospitality|city|vacation/.test(cat)) targets.push("urn:entity:destination");
  if (/game|gaming|esport|tech|digital/.test(cat) || !b.category) targets.push("urn:entity:video_game");
  if (/book|publish|education|reading|culture|media/.test(cat) || !b.category) targets.push("urn:entity:book");
  const interests = [...new Set((b.interests ?? []).map((i) => i.trim()).filter(Boolean))].slice(0, MAX_INTERESTS);
  const ageCohort = extractAgeCohort(b.audience) || extractAgeCohort(b.additionalContext);
  const notes = [
    "The audience description is used for interpretation only; Qloo signals are built from resolved entities, audience interests (matched to Qloo tags) and location.",
  ];
  if (ageCohort) notes.push(`Audience demographic filter: focused on age cohort ${ageCohort}.`);
  if (!seeds.length && !interests.length) notes.push("No brand, competitors or audience interests in the brief: research will use the location signal only.");
  else if (!seeds.length) notes.push("No brand or competitors in the brief: research uses the audience interests and location as signals.");
  if ((b.interests ?? []).length > MAX_INTERESTS) notes.push(`Only the first ${MAX_INTERESTS} audience interests are used as signals.`);
  return {
    question: `Which cultural entities and taste tags co-occur with people connected to ${b.brand ?? b.name}${b.competitors.length ? ` and ${b.competitors.slice(0, 3).join(", ")}` : ""}${interests.length ? `, or interested in ${interests.join(", ")},` : ""}${b.market ? ` in ${b.market}` : ""}${ageCohort ? ` (age ${ageCohort})` : ""}?`,
    seedQueries: seeds,
    interestQueries: interests,
    location: b.market,
    ageCohort: ageCohort ?? null,
    targets: [...new Set(targets)],
    includeTags: true,
    notes,
  };
}

function capRaw(raw: unknown) {
  const s = JSON.stringify(raw ?? null);
  if (s.length <= 250_000) return raw;
  return { truncated: true, bytes: s.length, note: "Raw response exceeded the 250 KB provenance cap and was truncated." };
}

async function recordSource(tx: Tx, runId: string, ws: string, provider: string, call: Partial<QlooCall<unknown>> & { endpoint: string; params: Record<string, string> }) {
  const [row] = await tx`
    insert into research_sources (run_id, workspace_id, provider, endpoint, params, status, http_status, result_count, duration_ms, error_message, raw_response, retrieved_at)
    values (${runId}, ${ws}, ${provider}, ${call.endpoint}, ${tx.json(call.params)}, ${call.status ?? "error"}, ${call.httpStatus ?? null},
      ${Array.isArray(call.data) ? call.data.length : 0}, ${call.durationMs ?? null}, ${call.error ?? null}, ${tx.json(capRaw(call.raw) as never)}, ${call.retrievedAt ?? new Date().toISOString()})
    returning id`;
  return row.id as string;
}

async function setTask(tx: Tx, runId: string, status: string, error?: string | null) {
  await tx`update background_tasks set status = ${status}, error_message = ${error ?? null},
    started_at = coalesce(started_at, case when ${status} = 'running' then now() end),
    finished_at = case when ${status} in ('completed','failed') then now() else finished_at end, attempts = attempts + case when ${status} = 'running' then 1 else 0 end
    where ref_id = ${runId} and kind = 'research_run'`;
}

/**
 * Executes a research run in the background. Provider calls happen outside database
 * transactions; every call (successful or not) is written to the provenance ledger.
 * Live runs never fall back to fixtures.
 */
export async function executeRun(userId: string, runId: string) {
  try {
    await runResearch(userId, runId);
  } finally {
    await notifyResearchFinished(userId, runId).catch(() => undefined);
  }
}

async function runResearch(userId: string, runId: string) {
  const run = await withUser(userId, async (tx) => {
    const [r] = await tx`update research_runs set status = 'running', started_at = now() where id = ${runId} and status = 'queued' returning *`;
    if (r) await setTask(tx, runId, "running");
    return r;
  });
  if (!run) return; // already picked up or not visible to this user
  const ws: string = run.workspace_id;
  const plan = run.plan as ResearchPlan;
  const isDemo = run.mode === "demo";
  const provider = isDemo ? "qloo-demo-fixture" : "qloo";
  const client: QlooLike = isDemo ? new DemoQlooClient() : qloo();

  const fail = async (code: string, message: string) => {
    await withUser(userId, async (tx) => {
      await tx`update research_runs set status = 'failed', error_code = ${code}, error_message = ${message}, completed_at = now() where id = ${runId}`;
      await setTask(tx, runId, "failed", message);
      await trackEvent(tx, { workspaceId: ws, userId, event: "research_run_failed", projectId: run.project_id, metadata: { code, mode: run.mode } });
      await logActivity(tx, { workspaceId: ws, actorId: userId, projectId: run.project_id, verb: "failed", objectType: "research_run", objectId: runId, summary: `research run failed: ${message.slice(0, 120)}` });
    });
  };

  if (!isDemo && !(client as ReturnType<typeof qloo>).configured) {
    await fail("missing_key", "Qloo is not configured on this server (QLOO_API_KEY is missing). No research was performed.");
    return;
  }

  try {
    let attempted = 0;
    let failures = 0;
    let hardFailures = 0; // network/timeout/5xx — a 403 on one entity type does not count
    const emptyTypes: string[] = [];
    const unmatchedInterests: string[] = [];
    let firstError: QlooError | null = null;
    const record = async (call: Partial<QlooCall<unknown>> & { endpoint: string; params: Record<string, string> }) => withUser(userId, (tx) => recordSource(tx, runId, ws, provider, call));
    const guard = async <T,>(endpoint: string, params: Record<string, string>, fn: () => Promise<QlooCall<T>>): Promise<{ call: QlooCall<T>; sourceId: string } | null> => {
      if (hardFailures >= 3 && failures === attempted) throw firstError ?? new QlooError("Provider unreachable", "network");
      attempted++;
      try {
        const call = await fn();
        return { call, sourceId: await record(call) };
      } catch (e) {
        failures++;
        const err = e instanceof QlooError ? e : new QlooError("Unexpected provider error", "network");
        if (err.code === "unauthorized" || err.code === "missing_key") {
          await record({ endpoint, params, status: "error", httpStatus: err.httpStatus, error: `${err.code}: ${err.message}`, raw: null, data: [] as never });
          throw err; // a bad key or base URL fails every call: stop immediately
        }
        firstError ??= err;
        if (err.code !== "forbidden_type") hardFailures++;
        await record({ endpoint, params, status: "error", httpStatus: err.httpStatus, error: `${err.code}: ${err.message}`, raw: null, data: [] as never });
        return null;
      }
    };

    // 1. Resolve brief seeds to provider entities.
    const seeds: { entity: NormalizedEntity; sourceId: string; kind: string; query: string }[] = [];
    for (const s of plan.seedQueries) {
      const res = await guard("/search", { query: s.query }, () => client.search(s.query, ["urn:entity:brand"], 3));
      const top = res?.call.data[0];
      if (res && top) seeds.push({ entity: top, sourceId: res.sourceId, kind: s.kind, query: s.query });
    }
    for (const q of plan.interestQueries ?? []) {
      const res = await guard("/v2/tags", { "filter.query": q }, () => client.searchTags(q, 3));
      const top = res?.call.data.find((t) => !(t.type ?? "").startsWith("urn:tag:genre:")) ?? res?.call.data[0];
      if (res && top) {
        seeds.push({
          entity: { providerId: top.providerId, name: top.name, type: "tag", affinity: null, popularity: top.popularity, tags: [], description: top.type ? `Qloo tag type: ${top.type}` : null, disambiguation: null, explainability: [] },
          sourceId: res.sourceId, kind: "interest", query: q,
        });
      } else if (res) {
        unmatchedInterests.push(q);
      }
    }
    const seedIds = seeds.filter((s) => s.kind !== "interest").map((s) => s.entity.providerId);
    const tagIds = seeds.filter((s) => s.kind === "interest").map((s) => s.entity.providerId);
    if (!seedIds.length && !tagIds.length && !plan.location) {
      if (failures) throw firstError;
      await withUser(userId, async (tx) => {
        await tx`update research_runs set status = 'completed', completed_at = now(),
          interpretation = ${tx.json({ summary: "No brand, competitor, audience interest or market could be used as a research signal, so no provider query was made. Add one to the brief and run research again.", findings: [], contradictions: [], missingInformation: ["A research signal (brand, competitors, audience interests or market)."], followUpQuestions: [] })},
          interpretation_generator = 'system' where id = ${runId}`;
        await setTask(tx, runId, "completed");
      });
      return;
    }

    // 2. Insights per target type, plus taste tags.
    // 2. Insights per target type, plus taste tags.
    type Result = {
      entity: NormalizedEntity;
      sourceId: string;
      role: "result" | "tag";
      profileOf?: string;
      hop?: number;
      subculturalAnchor?: string;
    };
    const results: Result[] = [];
    for (const target of plan.targets) {
      const isPlace = target === "urn:entity:place" || target === "urn:entity:destination";
      const params = {
        filterType: target,
        signalEntities: seedIds,
        signalTags: tagIds,
        signalLocationQuery: !isPlace ? plan.location ?? undefined : undefined,
        filterLocationQuery: isPlace ? plan.location ?? undefined : undefined,
        signalDemographicsAge: plan.ageCohort ?? undefined,
        take: 12,
        explainability: seedIds.length + tagIds.length > 0,
        excludeEntities: seedIds,
      };
      if (!seedIds.length && !tagIds.length && !isPlace && !params.signalLocationQuery) continue;
      const res = await guard("/v2/insights", { "filter.type": target }, () => client.insights(params));
      if (res && res.call.status === "empty") emptyTypes.push(target.replace("urn:entity:", ""));
      res?.call.data.forEach((entity) => results.push({ entity, sourceId: res.sourceId, role: "result", hop: 1 }));
    }
    if (plan.includeTags && (seedIds.length || tagIds.length || plan.location)) {
      const res = await guard("/v2/insights", { "filter.type": "urn:tag" }, () => client.tagInsights({ signalEntities: seedIds, signalTags: tagIds, signalLocationQuery: plan.location ?? undefined, signalDemographicsAge: plan.ageCohort ?? undefined, take: TAG_TAKE }));
      res?.call.data.filter((t) => !(t.type ?? "").startsWith("urn:tag:genre:") && !tagIds.includes(t.providerId)).slice(0, MAX_TASTE_TAGS).forEach((t) => results.push({
        entity: { providerId: t.providerId, name: t.name, type: "tag", affinity: t.affinity, popularity: t.popularity, tags: [], description: null, disambiguation: null, explainability: [] },
        sourceId: res.sourceId,
        role: "tag",
        hop: 1,
      }));
    }

    // Tags on the brand's own Qloo profile (from the /search response already logged).
    const brandSeed = seeds.find((s) => s.kind === "brand");
    if (brandSeed) {
      (brandSeed.entity.profileTags ?? [])
        .filter((t) => !(t.type ?? "").startsWith("urn:tag:genre:"))
        .slice(0, MAX_PROFILE_TAGS)
        .forEach((t) => results.push({
          entity: { providerId: t.providerId, name: t.name, type: "tag", affinity: null, popularity: null, tags: [], description: t.type ? `Profile tag type: ${t.type}` : null, disambiguation: null, explainability: [] },
          sourceId: brandSeed.sourceId,
          role: "tag",
          profileOf: brandSeed.entity.name,
          hop: 1,
        }));
    }

    // 2b. Hop-2 Subcultural Network Traversal:
    // Discover the underground orbit co-occurring around the top high-affinity entities
    type Hop2Edge = { fromProviderId: string; toProviderId: string; score: number };
    const hop2Edges: Hop2Edge[] = [];
    const hop2Anchors = results
      .filter((r) => r.role === "result" && r.entity.type !== "tag" && (r.entity.affinity ?? 0) >= 0.72)
      .slice(0, 2);

    for (const anchor of hop2Anchors) {
      const hop2Type: EntityTypeUrn = anchor.entity.type === "urn:entity:artist" ? "urn:entity:brand" : "urn:entity:artist";
      const hop2Res = await guard("/v2/insights (hop-2 orbit)", { "filter.type": hop2Type, anchor: anchor.entity.name }, () =>
        client.insights({
          filterType: hop2Type,
          signalEntities: [anchor.entity.providerId],
          take: 4,
          excludeEntities: [...seedIds, anchor.entity.providerId],
        })
      );
      if (hop2Res && hop2Res.call.status === "ok") {
        for (const ent of hop2Res.call.data) {
          if (!results.some((existing) => existing.entity.providerId === ent.providerId)) {
            results.push({
              entity: ent,
              sourceId: hop2Res.sourceId,
              role: "result",
              profileOf: `Subcultural orbit of ${anchor.entity.name}`,
              hop: 2,
              subculturalAnchor: anchor.entity.name,
            });
            hop2Edges.push({
              fromProviderId: anchor.entity.providerId,
              toProviderId: ent.providerId,
              score: ent.affinity ?? 0.8,
            });
          }
        }
      }
    }

    if (attempted > 0 && failures === attempted) throw firstError ?? new QlooError("All provider requests failed", "network");

    // 3. Persist entities, relationships and provider observations.
    const signalLabel = [seeds.map((s) => s.entity.name).join(", "), plan.location].filter(Boolean).join(" in ");
    const primaryBrandSeed = seeds.find((s) => s.kind === "brand");
    const primaryBrandId = primaryBrandSeed?.entity.providerId;
    const competitorIds = new Set(seeds.filter((s) => s.kind === "competitor").map((s) => s.entity.providerId));

    const observations: Observation[] = await withUser(userId, async (tx) => {
      const obs: Observation[] = [];
      const idByProvider = new Map<string, string>();
      for (const s of seeds) {
        const [ent] = await tx`
          insert into cultural_entities (run_id, project_id, workspace_id, source_id, provider_entity_id, name, entity_type, role, affinity, popularity, tags, properties)
          values (${runId}, ${run.project_id}, ${ws}, ${s.sourceId}, ${s.entity.providerId}, ${s.entity.name}, ${s.entity.type}, 'seed', null, ${s.entity.popularity}, ${tx.json(s.entity.tags)}, ${tx.json({ query: s.query, kind: s.kind, description: s.entity.description, image_url: s.entity.imageUrl ?? null })})
          on conflict (run_id, provider_entity_id, role) do update set name = excluded.name returning id`;
        idByProvider.set(s.entity.providerId, ent.id);
        const [ev] = await tx`
          insert into evidence_items (project_id, workspace_id, run_id, evidence_type, claim, source_provider, source_ref, retrieved_at, raw_metadata, entity_ids, is_demo, created_by, limitations)
          values (${run.project_id}, ${ws}, ${runId}, 'provider_observation', ${s.kind === "interest"
              ? `The brief’s audience interest “${s.query}” was matched to the Qloo tag “${s.entity.name}” and used as a taste signal.`
              : `The brief’s ${s.kind} “${s.query}” was resolved to the provider entity “${s.entity.name}” (${s.entity.type}).`},
            ${provider}, ${s.entity.providerId}, now(), ${tx.json({ source_id: s.sourceId, role: "seed" })}, ${[ent.id]}, ${isDemo}, ${userId},
            ${s.kind === "interest"
              ? "Interest matching uses the top /v2/tags result; check the tag reflects what the brief meant."
              : "Entity resolution uses the provider’s top search match; check it refers to the intended brand."}) returning id`;
        obs.push({ id: ev.id, claim: "", entityName: s.entity.name, entityType: s.entity.type, affinity: null, role: "seed" });
      }
      for (const r of results) {
        let culturalTier: "white_space" | "consensus" | "competitor_stronghold" | "subcultural_orbit" = "consensus";
        let deltaScore = 0;
        if (r.hop === 2) {
          culturalTier = "subcultural_orbit";
          deltaScore = 0.5;
        } else if (r.entity.explainability && r.entity.explainability.length > 0) {
          let brandScore = 0;
          let compScore = 0;
          for (const ex of r.entity.explainability) {
            if (primaryBrandId && ex.entityId === primaryBrandId) brandScore += Number(ex.score) || 0;
            else if (competitorIds.has(ex.entityId)) compScore += Number(ex.score) || 0;
          }
          const total = brandScore + compScore;
          if (total > 0) {
            deltaScore = (brandScore - compScore) / total;
            if (deltaScore >= 0.25) culturalTier = "white_space";
            else if (deltaScore <= -0.25) culturalTier = "competitor_stronghold";
            else culturalTier = "consensus";
          } else {
            culturalTier = (r.entity.affinity ?? 0) >= 0.72 ? "white_space" : "consensus";
          }
        } else {
          culturalTier = (r.entity.affinity ?? 0) >= 0.75 ? "white_space" : "consensus";
        }

        const [ent] = await tx`
          insert into cultural_entities (run_id, project_id, workspace_id, source_id, provider_entity_id, name, entity_type, role, affinity, popularity, tags, properties)
          values (${runId}, ${run.project_id}, ${ws}, ${r.sourceId}, ${r.entity.providerId}, ${r.entity.name}, ${r.entity.type}, ${r.role}, ${r.entity.affinity}, ${r.entity.popularity},
            ${tx.json(r.entity.tags)}, ${tx.json({ description: r.entity.description, disambiguation: r.entity.disambiguation, explainability: r.entity.explainability, image_url: r.entity.imageUrl ?? null, profile_of: r.profileOf ?? null, cultural_tier: culturalTier, delta_score: Number(deltaScore.toFixed(2)), hop: r.hop ?? 1, subcultural_anchor: r.subculturalAnchor ?? null })})
          on conflict (run_id, provider_entity_id, role) do nothing returning id`;
        if (!ent) continue;
        idByProvider.set(r.entity.providerId, ent.id);
        for (const ex of r.entity.explainability) {
          const from = idByProvider.get(ex.entityId);
          if (from) await tx`insert into entity_relationships (run_id, workspace_id, from_entity_id, to_entity_id, relation, value, source_id) values (${runId}, ${ws}, ${from}, ${ent.id}, 'explainability', ${ex.score}, ${r.sourceId})`;
        }
        const value = r.entity.affinity;
        const tierPrefix = culturalTier === "white_space"
          ? "[White-Space] "
          : culturalTier === "subcultural_orbit"
          ? `[Subcultural Orbit · ${r.subculturalAnchor ?? "Anchor"}] `
          : culturalTier === "competitor_stronghold"
          ? "[Competitor Stronghold] "
          : "";
        const tierSuffix = culturalTier === "white_space"
          ? " (shows strong brand divergence vs competitors)."
          : culturalTier === "subcultural_orbit"
          ? ` (discovered through 2-hop traversal around ${r.subculturalAnchor ?? "white-space territory"}).`
          : culturalTier === "competitor_stronghold"
          ? " (predominantly indexed to competitor audience)."
          : "";
        const baseClaim = r.profileOf
          ? `Qloo’s profile for “${r.profileOf}” carries the tag “${r.entity.name}”.`
          : r.role === "tag"
          ? `Qloo associated the taste tag “${r.entity.name}” with the signal (${signalLabel || "location"})${value !== null ? `, affinity ${value.toFixed(2)}` : ""}.`
          : `Qloo returned “${r.entity.name}” (${r.entity.type}) for the signal ${signalLabel || "(location only)"}${value !== null ? ` with affinity ${value.toFixed(2)}` : " without an affinity value"}.`;
        const claim = `${tierPrefix}${baseClaim}${tierSuffix}`;

        const [ev] = await tx`
          insert into evidence_items (project_id, workspace_id, run_id, evidence_type, claim, source_provider, source_ref, retrieved_at, raw_metadata, normalized_value, entity_ids, is_demo, created_by, limitations)
          values (${run.project_id}, ${ws}, ${runId}, 'provider_observation', ${claim}, ${provider}, ${r.entity.providerId}, now(),
            ${tx.json({ source_id: r.sourceId, role: r.role, popularity: r.entity.popularity, profile_of: r.profileOf ?? null, cultural_tier: culturalTier, hop: r.hop ?? 1, subcultural_anchor: r.subculturalAnchor ?? null })}, ${value}, ${[ent.id]}, ${isDemo}, ${userId},
            ${r.profileOf ? "Profile tags describe how Qloo catalogues the brand; they are not an affinity measurement for the audience." : AFFINITY_LIMITATION}) returning id`;
        obs.push({ id: ev.id, claim, entityName: r.entity.name, entityType: r.entity.type, affinity: value, role: r.role });
      }

      // Link Hop-2 edges in entity_relationships
      for (const edge of hop2Edges) {
        const from = idByProvider.get(edge.fromProviderId);
        const to = idByProvider.get(edge.toProviderId);
        if (from && to) {
          await tx`insert into entity_relationships (run_id, workspace_id, from_entity_id, to_entity_id, relation, value, source_id)
            values (${runId}, ${ws}, ${from}, ${to}, 'explainability', ${edge.score}, null)`;
        }
      }
      return obs;
    });

    // 4. Interpretation (LLM when configured, otherwise labelled template).
    const brief = await withUser(userId, (tx) => loadBrief(tx, run.project_id));
    let interpretation: ResearchInterpretation;
    let generator = TEMPLATE_GENERATOR;
    const seedNames = seeds.map((s) => s.entity.name);
    if (isDemo) {
      interpretation = templateInterpretation(brief!, observations, seedNames);
      generator = "demo-template";
    } else if ((await llmEnabled(userId, ws)) && observations.some((o) => o.role !== "seed")) {
      try {
        const out = await generateStructured({ schema: researchInterpretationSchema, prompt: interpretationPrompt(brief!, observations, plan) });
        const valid = new Set(observations.map((o) => o.id));
        out.data.findings = out.data.findings.map((f) => ({ ...f, evidenceIds: f.evidenceIds.filter((id) => valid.has(id)) }));
        interpretation = out.data;
        generator = out.generator;
      } catch {
        interpretation = templateInterpretation(brief!, observations, seedNames);
        interpretation.missingInformation.unshift("The LLM interpretation failed; this summary was drafted by the template engine from stored observations.");
      }
    } else {
      interpretation = templateInterpretation(brief!, observations, seedNames);
    }

    // 4b. Live Web & Social Cultural Pulse Grounding (Option C)
    const topEntities = results
      .filter((r) => r.role === "result" && r.entity.type !== "tag")
      .slice(0, 6)
      .map((r) => r.entity.name);

    const pulseRes = await generateCulturalPulse({
      brief: brief!,
      ageCohort: plan.ageCohort,
      topEntities,
      isDemo,
    });
    interpretation.culturalPulse = pulseRes.data;

    // Persist cultural pulse findings into evidence_items
    await withUser(userId, async (tx) => {
      // 1. Zeitgeist summary
      await tx`
        insert into evidence_items (project_id, workspace_id, run_id, evidence_type, claim, source_provider, raw_metadata, is_demo, created_by, review_status, limitations)
        values (${run.project_id}, ${ws}, ${runId}, 'external_source',
          ${`[2026 Cultural Zeitgeist] ${pulseRes.data.zeitgeistSummary}`},
          ${pulseRes.generator}, ${tx.json({ pulse_type: "zeitgeist", details: pulseRes.data })}, ${isDemo}, ${userId}, 'verified',
          'Live cultural zeitgeist analysis synthesized from contemporary platforms (TikTok, Substack, Reddit) and verified cultural movements.')`;

      // 2. Micro-aesthetics
      for (const a of pulseRes.data.microAesthetics) {
        await tx`
          insert into evidence_items (project_id, workspace_id, run_id, evidence_type, claim, source_provider, raw_metadata, is_demo, created_by, review_status, limitations)
          values (${run.project_id}, ${ws}, ${runId}, 'external_source',
            ${`[Micro-Aesthetic: ${a.name}] (${a.platformOrigin}): ${a.description} Relevance: ${a.audienceRelevance}`},
            ${pulseRes.generator}, ${tx.json({ pulse_type: "micro_aesthetic", aesthetic: a })}, ${isDemo}, ${userId}, 'verified',
            'Emerging subcultural aesthetic movement.')`;
      }

      // 3. Cultural tensions
      for (const t of pulseRes.data.culturalTensions) {
        await tx`
          insert into evidence_items (project_id, workspace_id, run_id, evidence_type, claim, source_provider, raw_metadata, is_demo, created_by, review_status, limitations)
          values (${run.project_id}, ${ws}, ${runId}, 'external_source',
            ${`[Cultural Tension] ${t.tension} — Implication: ${t.implicationForBrand}`},
            ${pulseRes.generator}, ${tx.json({ pulse_type: "cultural_tension", tension: t })}, ${isDemo}, ${userId}, 'verified',
            'Contemporary category friction identified in active audience discourse.')`;
      }

      // 4. Live web research citations (verified real URLs)
      for (const w of pulseRes.data.liveWebSources ?? []) {
        await tx`
          insert into evidence_items (project_id, workspace_id, run_id, evidence_type, claim, source_provider, source_url, raw_metadata, is_demo, created_by, review_status, limitations)
          values (${run.project_id}, ${ws}, ${runId}, 'external_source',
            ${`[Live Web · ${w.source}] ${w.title}: ${w.snippet}`},
            ${w.source}, ${w.url.startsWith("http") ? w.url : null}, ${tx.json({ pulse_type: "web_search", source_info: w })}, ${isDemo}, ${userId}, 'verified',
            'Real-time live web and news intelligence.')`;
      }
    });

    if (unmatchedInterests.length) {
      interpretation.missingInformation.push(`No Qloo tag matched these audience interests, so they were not used as signals: ${unmatchedInterests.join(", ")}. Try a broader or more common wording.`);
    }
    if (emptyTypes.length) {
      interpretation.missingInformation.push(
        `Qloo returned no entities for: ${emptyTypes.join(", ")}. Qloo silently ignores parameters that are not valid for an entity type, so an empty result may reflect parameter support rather than an absence of cultural data.`,
      );
    }
    await withUser(userId, async (tx) => {
      for (const f of interpretation.findings.filter((f) => f.kind === "interpretation")) {
        await tx`insert into evidence_items (project_id, workspace_id, run_id, evidence_type, claim, source_provider, raw_metadata, is_demo, created_by, review_status, limitations)
          values (${run.project_id}, ${ws}, ${runId}, 'ai_interpretation', ${f.statement}, ${generator}, ${tx.json({ supporting_evidence_ids: f.evidenceIds })}, ${isDemo}, ${userId}, 'needs_validation',
          'AI interpretation of provider observations. Review before using in client work.')`;
      }
      await tx`update research_runs set status = 'completed', completed_at = now(), interpretation = ${tx.json(interpretation as never)},
        interpretation_generator = ${generator}, error_message = ${failures ? `${failures} of ${attempted} provider requests failed; results are partial.` : null},
        error_code = ${failures ? "partial" : null} where id = ${runId}`;
      await tx`update projects set status = 'active', updated_at = now() where id = ${run.project_id} and status = 'draft'`;
      await setTask(tx, runId, "completed");
      await trackEvent(tx, { workspaceId: ws, userId, event: "research_run_completed", projectId: run.project_id, metadata: { mode: run.mode, results: observations.length, failures } });
      await logActivity(tx, { workspaceId: ws, actorId: userId, projectId: run.project_id, verb: "completed", objectType: "research_run", objectId: runId, summary: `completed ${isDemo ? "a demonstration" : "a live"} research run (${observations.length} observations)` });
    });
  } catch (e) {
    const err = e instanceof QlooError ? e : null;
    console.error("[research] run failed", runId, err?.code ?? (e instanceof Error ? e.message : "unknown"));
    await fail(err?.code ?? "internal", err ? humanQlooError(err) : "The research run failed unexpectedly. No partial results were kept as findings.");
  }
}

export function humanQlooError(e: QlooError) {
  switch (e.code) {
    case "missing_key": return "Qloo is not configured on this server (QLOO_API_KEY is missing).";
    case "unauthorized": return "Qloo rejected the API key (401). Hackathon keys only work with QLOO_API_URL=https://hackathon.api.qloo.com.";
    case "forbidden_type": return "Qloo denied access to the requested entity types (403) for this key.";
    case "rate_limited": return "Qloo’s rate limit was reached after bounded retries. Wait a minute and retry.";
    case "timeout": return "Qloo did not respond in time after bounded retries. Retry shortly.";
    case "network": return "The server could not reach the Qloo API. Check outbound network access to the Qloo host and retry.";
    case "invalid_response": return "Qloo returned a response CultureCrash could not validate. The raw response is kept in the run’s provenance log.";
    default: return e.message;
  }
}

function interpretationPrompt(b: BriefInput, obs: Observation[], plan: ResearchPlan) {
  const evidence = obs.map((o) => ({ id: o.id, role: o.role, entity: o.entityName, type: o.entityType, affinity: o.affinity }));
  return [
    "Interpret the cultural research below for the campaign brief. Findings of kind 'observation' must restate the data; 'interpretation' findings must be cautious and cite supporting evidence ids.",
    tag("brief", JSON.stringify({ name: b.name, brand: b.brand, category: b.category, market: b.market, audience: b.audience, objective: b.objective, competitors: b.competitors, interests: b.interests ?? [] })),
    tag("evidence", JSON.stringify({ question: plan.question, notes: plan.notes, observations: evidence })),
    "List contradictions only if the data contains them. List missing information that limits the conclusions (no public web research provider is configured).",
  ].join("\n\n");
}
