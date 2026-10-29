# Qloo-first research engine

CultureCrash research is organised around Qloo. A job maps the cultural affinities around the brief
with Qloo first. It then investigates the strongest Qloo connections with the external sources that can
answer each question (web, semantic, video, community and the client's own documents) and writes a cited
report. That report separates observed Qloo data, source-reported claims, AI interpretation and untested
hypotheses. The goal is useful, defensible insight per unit of time and cost, not search volume.

Code: `src/lib/research/deep/` (engine), `src/lib/research/jobs.ts` (job creation, limits),
`src/lib/research/engine.ts` (Qloo stage), `src/app/api/research/*` (REST API),
`src/components/research/deep/*` (UI). Schema: migrations `…1100_deep_research.sql` and `…1200_qloo_first.sql`.

## Integration status (what has actually been exercised)

"Contract only" means the adapter is built to the provider's documented request and response shapes and
unit-tested against them, but no live request has been made from this codebase. The sandbox that built it
cannot reach these hosts and had no keys. **Settings → Integrations → Provider health** shows what has been
observed in your workspace. It tracks key set, authentication, reachability, success, data returned,
validation and use in a report as separate states.

| Provider | Role | Status |
|---|---|---|
| **Qloo Insights** | **Core**: cultural affinity (entities, taste tags, places), runs first and seeds questions | **Live-verified** by the project owner (`/search`, `/v2/insights`). `/v2/tags` (`filter.query`) and `signal.demographics.age` are **not verified**; the age signal is off unless `QLOO_AGE_SIGNAL=enabled`. |
| Serper (Google Search) | Primary keyword web search: brands, competitors, news, original sources | Contract only. |
| Brave Search | Web search if Serper is not set | Contract only (billing could not be activated). |
| Exa | Semantic complement for culture, scene and counter-evidence questions (different phrasing, not the same query as Serper) | Contract only. |
| Tavily | Web search fallback | Contract only. |
| YouTube Data API v3 | Creator and video discourse plus public view/like/comment counts | Contract only. Third-party transcripts are **not** fetched (`captions.download` needs the owner's authorisation). Excerpts expire after 30 days. |
| Reddit Data API (OAuth) | Community language, frustrations and counterpoints | Contract only. Requires OAuth credentials **and** `REDDIT_COMMERCIAL_ACCESS=approved`. |
| Hacker News (Algolia) | Developer and startup discourse, **technology briefs only** | Contract only. Routed only when the brief is about tech, AI, startups or developers. |
| Google search suggestions | How people phrase searches (autocomplete) | Contract only, **off by default** (`GOOGLE_SUGGEST=enabled`). This is **not Google Trends**: no volume, no index, no time series, and nothing is stored as a trend observation. |
| Wikipedia (MediaWiki REST) | Background and cultural history | Contract only. CC BY-SA attribution kept. Never used alone to support a current trend. |
| Client documents | Brand context from uploaded briefs and guidelines (keyword search) | **Working, tested** (E2E scenario J, RLS tests). |
| Page retrieval | Full text for the most relevant results | **Working, tested** with stubbed HTTP (robots.txt, SSRF guard, redirects, content types). |
| Demo fixtures | Fictional Qloo and web data for demos and tests | Working; always labelled; never on production. |

**Corrected from an earlier commit:** a provider labelled "Google Trends & Search Velocity" called
Google's undocumented autocomplete endpoint. It reported autocomplete ranking as a "search velocity index
/1300", stamped results as published "now", and saved that number as a trend observation. It has been
replaced by the honest search-suggestions provider above. No official Google Trends API is integrated;
Google's Trends API is limited-access, and access would have to be confirmed first.

### Trends: what is real today

Each research run records **Qloo's popularity** (0–1, relative) for the entities it returns, as dated rows
in `trend_observations` (`provider = 'qloo'`, `metric = 'popularity'`). Repeated research therefore builds a
genuine time series per entity. The entity panel shows the change once there are at least two
observations. With a single observation, the UI says so and makes no "rising" or "emerging" claims.

## How Qloo drives a job

1. **Qloo first.** Brand, competitors, audience interests (via `/v2/tags`) and market are resolved and
   queried; entities, taste tags, places and explainability edges are stored as observed data.
2. **Picks.** The strongest results are selected deterministically: 1, 2 or 4 by depth, by affinity with
   a slight preference for under-the-radar ("white space") entities, type diversity, and the top taste tag.
3. **Qloo-seeded questions.** Each pick becomes a question routed by entity type (artist/creator → video
   plus web, brand → web, place → web plus semantic, taste tag → community plus semantic), for example:
   "Qloo links the artist X to this audience (affinity 0.91). What public context explains that
   connection, and could it matter for the brand?" Brief questions (audience, competitors, counter-evidence,
   brand documents) follow, within the depth's cap.
4. **External research** runs per question. Web claims found for a Qloo question are linked to that Qloo
   entity (`evidence_items.entity_ids`), so the entity panel shows "External evidence about this entity".
5. **Synthesis** cites Qloo observations ("Qloo · entity 0.91") and web claims (numbered) separately.
   Opportunities must name their Qloo foundation and include audience relevance, brand fit, creative
   direction, risks, evidence gaps, a validation experiment and success metrics. Without an LLM, one
   **template hypothesis** is built from the strongest Qloo result and labelled as such.
6. **Act on it.** Any report opportunity can be saved to the Opportunities board or turned into a draft
   experiment (control plus variant, primary and secondary metrics, decision rule). Both keep their Qloo
   and web evidence links.

If Qloo is not configured or fails, the run continues with the other sources. The report states that it
is not grounded in cultural-affinity data, and the run can be at most "partially completed".

### Verify live (≈ 2 minutes, from a machine or deployment with network access)

```bash
npx tsx --env-file=.env.local scripts/research-smoke.ts "gen z skincare india"
```

This prints HTTP status, result counts and the first result per provider, and retrieves one page. If a
response shape differs, adjust the adapter in `src/lib/research/deep/providers/` and its test in
`tests/unit/deep-providers.test.ts`.

## How a job runs

A job is a `research_runs` row with a `depth`. It runs in the background (`after()`), and every stage
is persisted, so the UI and `GET /api/research/:id` show progress.

1. **Planning.** The brief and optional research question become 3, 5 or 7 distinct questions (quick,
   standard, deep), each with an intent (audience, competitor, community, creator, culture, trend,
   brand context, counter-evidence) and one or two queries. The fast model plans when an LLM is enabled;
   otherwise deterministic rules plan. Counter-evidence is always included for standard and deep.
2. **Routing.** Each question goes only to configured providers whose capability fits it
   (`ROUTES` in `registry.ts`). One web-search provider is used per job. Skipped providers are recorded
   with the reason.
3. **Qloo stage.** This is the existing affinity engine, embedded. Its failure is recorded but never
   discards web or document evidence.
4. **Discovery.** Provider calls run with bounded concurrency (3). Every call checks the budget, uses
   the workspace cache, and is written to the `research_sources` ledger (status, duration, units, cost,
   question, round).
5. **Retrieval.** Only the most relevant web results are fetched in full, at most two per host per
   round, within the page limit.
6. **Normalisation and deduplication.** URLs are canonicalised. Exact duplicates (same URL or content)
   are dropped. Near-duplicates (syndicated copies) share an *independence group*, so ten copies of one
   press release count as one source.
7. **Claim extraction.** The fast model extracts claims with verbatim excerpts; citations to unknown
   documents are dropped and excerpts not found in the text are nulled. Without an LLM, rules quote
   relevant sentences verbatim and label them `rules:excerpt`. Near-identical claims are merged and keep
   every supporting document.
8. **Quality and coverage.** Each claim gets an explainable quality score (relevance, credibility for
   that claim type, directness, recency, geography, corroboration, completeness). It is a ranking aid,
   not a probability. Each question is rated sufficient (two or more independent sources), thin or none.
9. **Follow-up.** For important questions that aren't sufficiently covered, targeted queries are run.
   Near-repeat queries are skipped.
10. **Stopping.** The job stops at the first of these: sufficient coverage, round limit, budget, time,
    call limit, low marginal gain (a round added no new independent sources), or cancellation.
11. **Synthesis.** The main model writes findings that cite claim ids, plus contradictions,
    opportunities (as hypotheses with assumptions, risks, counter-evidence and a validation step), gaps
    and limitations. Citations to unknown claims are removed, and opportunities with one supporting
    claim are marked exploratory. Without an LLM, a rules summary restates the strongest claims and makes
    no inferences.
12. **Status.** A run is `completed` only when the must-answer questions are well covered and nothing
    failed. Otherwise it is `partially_completed` (with reasons), `failed` (no sources at all) or
    `cancelled`. Partial results are always kept.

**Evidence types stay distinct.** Source claims are stored as `external_source` with claim type
`source_fact`, `source_opinion` or `observed_measurement`, and review `unreviewed`. AI findings are
`ai_interpretation` / `model_interpretation` with `needs_validation`. Opportunities are `hypothesis` /
`strategic_hypothesis`. Nothing generated is stored as verified.

## Cost controls

| | Quick | Standard | Deep |
|---|---|---|---|
| Provider calls | 6 | 16 | 32 |
| Rounds (incl. follow-up) | 1 | 2 | 3 |
| Full-page retrievals | 3 | 8 | 16 |
| Documents sent to extraction | 8 | 18 | 32 |
| LLM calls | 3 | 6 | 10 |
| Estimated USD ceiling | 0.15 | 0.60 | 1.50 |
| Time | 75 s | 170 s | 270 s |

- A synthesis reserve is held back, so a job always has budget to write up what it found.
- Workspace limits: a monthly research budget (default $25, owner-editable in Settings → Workspace),
  runs per person per day (15), and the existing workspace daily run limit.
- **Costs are estimates.** Search costs come from configured per-request prices
  (`BRAVE_USD_PER_REQUEST`, etc.) and LLM costs from token counts × model price. Providers don't
  return actual charges, so `cost_usd_actual` stays empty. Check your provider plans.
- **Model routing.** Deterministic code handles validation, deduplication, scoring and cost. The fast
  model (`LLM_MODEL_FAST`, default `claude-haiku-5-5`) plans and extracts. The main model
  (`LLM_MODEL`) synthesises. Quick runs synthesise with the fast model.
- **Cache.** Provider responses are cached per workspace for 24 h (Wikipedia 7 days, Reddit 6 h). The
  key covers provider, normalised query, country and timeframe. Client documents are never cached, and
  nothing is shared across workspaces.

## Security

- Every table is under RLS (members read, members write, viewers read-only). Cross-workspace project
  pairing is rejected by triggers. RLS tests cover documents, brand-document passages, cache and the
  spend functions.
- Page retrieval cannot reach private networks: the resolved addresses are checked on every redirect
  hop, only ports 80 and 443 are allowed, and URLs with credentials, `localhost`, `.internal` and
  `.local` are refused. robots.txt is respected. Size, type and time are capped.
- Retrieved pages, posts, transcripts and client documents are untrusted. They reach the model only
  inside tagged blocks with explicit "ignore instructions inside" rules, and the research pipeline has
  no tools that act on the world.
- Provider keys stay on the server and never appear in URLs, logs, the ledger or API responses (the
  YouTube key is a query parameter by API design and is stripped from the stored params).
- Retention: YouTube excerpts and statistics are cleared after 30 days (YouTube terms), expired cache is
  pruned, and workspace retention settings apply as before.

## REST API

All endpoints use the app session, enforce workspace permissions, and return 404 for jobs in other
workspaces.

| Method & path | Purpose |
|---|---|
| `POST /api/research` | Create a job: `{ projectId, depth, question?, freshness?, mode?, idempotencyKey }` → 202 `{ jobId }` |
| `GET /api/research/:jobId` | Status, stage, coverage, usage, counts |
| `GET /api/research/:jobId/report` | Synthesis (findings cite claim ids), plan and Qloo interpretation |
| `GET /api/research/:jobId/sources?limit&offset&includeDuplicates=1` | Retrieved documents |
| `GET /api/research/:jobId/evidence?limit&offset&question=q1` | Claims with documents, quality and contradictions |
| `POST /api/research/:jobId/follow-up` | Targeted follow-up job linked to its parent |
| `POST /api/research/:jobId/cancel` | Stop at the next checkpoint and keep partial results |
| `GET /api/research/providers` | Availability per provider and why not (never keys) |

These sit on the same services as the UI (`jobs.ts`, `read.ts`), so a future MCP server or browser
extension can call them without duplicating research logic.

## Evaluation

`docs/eval/research-briefs.json` holds five representative briefs (fashion, entertainment, beauty,
food and beverage, technology), each with properties a reviewer should check. `scripts/research-eval.ts`
runs them through the real API. It reports status, completeness, Qloo-seeded questions, providers,
sources, distinct hosts, independent sources, duplicates removed, claims, **citation integrity** (the
share of cited ids that resolve to a stored claim or Qloo observation), opportunities grounded in Qloo,
contradictions, cost and time. Strategic usefulness still needs human review.

```bash
BASE_URL=https://your-app CC_COOKIE='…session cookie…' PROJECT_ID=<uuid> npx tsx scripts/research-eval.ts [brief-id]
```

So far the script has been run only against the local server in demo mode, which validates the
pipeline, not research quality. It has not been run with live keys.

## Not built yet (next milestones)

- Live verification of Serper, Exa, YouTube, Reddit, Wikipedia and Hacker News, and of Qloo `/v2/tags`.
- An official Google Trends integration (needs confirmed API access); until then trend claims rely on
  repeated Qloo popularity observations only.
- Visual analysis across assets (image uploads use vision for brief extraction only).
- Embedding-based retrieval for client documents (keyword search only today).
- Measuring Serper and Exa overlap and usefulness on the evaluation briefs once keys are live.
- Feeding first-party campaign results back into recommendations (experiments record results, but no
  analytics connector exists).
