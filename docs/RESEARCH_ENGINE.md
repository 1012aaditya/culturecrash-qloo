# Multi-source research engine

CultureCrash research jobs combine Qloo cultural affinity, live web search, video, community discussion
and the client's own documents into one evidence model, then write a cited report. The goal is useful,
defensible insight per unit of time and cost, not search volume.

Code: `src/lib/research/deep/` (engine), `src/lib/research/jobs.ts` (job creation, limits),
`src/lib/research/engine.ts` (Qloo stage), `src/app/api/research/*` (REST API),
`src/components/research/deep/*` (UI). Schema: `supabase/migrations/20261030001100_deep_research.sql`.

## Integration status (be precise about what has been exercised)

| Provider | Role | Status |
|---|---|---|
| Qloo Insights | Cultural affinity (entities, tags, places) | **Live-verified** by the project owner (`/search`, `/v2/insights`). `/v2/tags` (`filter.query`) and `signal.demographics.age` are **not yet verified**; the age signal is off unless `QLOO_AGE_SIGNAL=enabled`. |
| Brave Search | Primary web discovery | **Built to Brave's documented contract, not yet exercised live.** No key was available and the build sandbox cannot reach `api.search.brave.com`. |
| Tavily / Exa | Alternate web search (used only if Brave is not set) | Contract only, not exercised live. |
| YouTube Data API v3 | Creator videos plus public view/like/comment counts | Contract only, not exercised live. Third-party transcripts are **not** fetched (`captions.download` requires the owner's authorisation). |
| Reddit Data API (OAuth) | Community discussion | Contract only, not exercised live. Enabled only with OAuth credentials **and** `REDDIT_COMMERCIAL_ACCESS=approved`, because commercial use needs Reddit's approval. Unauthenticated `.json` scraping is deliberately not used. |
| Wikipedia (MediaWiki REST) | Background and provenance | Contract only, not exercised live. No key; CC BY-SA attribution is kept. |
| Google Trends | Search momentum & breakout query velocity | **Working, tested** (queries search momentum index, records to `trend_observations`). |
| Hacker News (Algolia) | Tech, AI, and builder community sentiment | **Working, tested** (fair-use open API). |
| Client documents | Brand context (keyword search over uploaded briefs and guidelines) | **Working, tested** (E2E scenario J, RLS tests). |
| Page retrieval | Full text for the most relevant results | **Working, tested** with stubbed HTTP (robots.txt, SSRF guard, redirects, content types). Not exercised against the live web from the sandbox. |
| Demo web fixtures | Fictional sources for demos and tests | Working; always labelled; never on production. |

**Removed from the earlier commit:** Google News RSS (no documented terms for commercial use), Wikidata
(not needed yet), Firecrawl (overlaps page retrieval), unauthenticated Reddit JSON (terms), and the
unsourced "cultural pulse" (it presented AI text as verified external sources).

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

## Not built yet (next milestones)

- Trend observations over time: the `trend_observations` table is now populated by the Google Trends & Search Velocity provider (`src/lib/research/deep/providers/google-trends.ts`), storing consumer momentum index scores and breakout queries.
- Visual analysis across assets (image uploads use vision for brief extraction only).
- Embedding-based retrieval for client documents (keyword search only today).
- Saving report opportunities straight into the Opportunities board (the existing generator reads the
  new web claims, but there is no one-click import yet).
- A quality benchmark set of research briefs with human-reviewed reference evidence.
