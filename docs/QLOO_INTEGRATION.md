# Qloo integration — status and verification

## Status: implemented, **not yet verified against the live API**

`QLOO_API_KEY` is present in the build environment, but the environment's network policy blocks
`hackathon.api.qloo.com`, `api.qloo.com`, `staging.api.qloo.com` and `docs.qloo.com` (the egress proxy
answers HTTP 403 to `CONNECT`). So:

- No request has reached Qloo from this build. Every live research run attempted here failed with
  `network: Could not reach the Qloo API`, and the app showed that failure; it did not substitute fixtures.
- The request contract was checked against the full text of Qloo's official *Hackathon Developer Guide*
  (docs.qloo.com/reference/qloo-llm-hackathon-developer-guide), which the project owner supplied. The guide
  does not include response examples, so the response field paths still come from public open-source
  clients written against live keys. Treat the response schema as **unverified** until the smoke test
  below passes.

### Confirmed by the official guide
- Hackathon keys work **only** against `https://hackathon.api.qloo.com`; staging and production return 401.
  This is the app's default `QLOO_API_URL`.
- `/v2/insights` is a **GET** with query parameters; the key goes in the `X-Api-Key` header (not Bearer, not
  a query parameter).
- `filter.type` is required. Supported values are `urn:entity:artist`, `book`, `brand`, `destination`,
  `movie`, `person`, `place`, `podcast`, `tv_show` and `video_game`. Unsupported types return 403.
- Flow: `/search` (or `/v2/tags`) to get ids, then `signal.interests.entities` / `signal.interests.tags` /
  `filter.tags` in `/v2/insights`. Free-text tags are invalid and return "at least one valid signal or
  filter is required".
- Invalid parameters for a `filter.type` are **silently ignored**, which can produce 200 responses with an
  empty `entities` array. The research run records which types came back empty and says this in "missing
  information".
- `/recommendations` and `/recs` are legacy and unsupported; the app never calls them.
- Private server-side caching is allowed with no time limit. Never commit Qloo response data to a public
  repository. CultureCrash stores raw responses only in the database (`research_sources`), never in git,
  and the demo fixtures are fictional.

### Error handling mapped from the guide
| Response | Adapter code | App behaviour |
|---|---|---|
| 401 (wrong base URL or key) | `unauthorized` | the run stops immediately with a message naming `QLOO_API_URL` |
| 403 for an entity type | `forbidden_type` | that call is recorded as failed and the run continues with other types |
| 200 with empty `entities` | status `empty` | recorded; the interpretation explains possible parameter mismatch |
| 429 / 5xx / network | `rate_limited` / `http` / `network` | bounded retries, then recorded; the run aborts after 3 consecutive hard failures |

Still to check against the *Entity Type Parameter Guide* (available-parameters-by-entity-type): whether
`signal.location.query`, `filter.location.query` and `filter.exclude.entities` are valid for every type the
app queries.

## What the adapter assumes

| Item | Value | Source |
|---|---|---|
| Base URL | `https://hackathon.api.qloo.com` (hackathon keys only work here), `https://api.qloo.com` (production keys); set `QLOO_API_URL` | Hackathon guide (confirmed) |
| Auth | `X-Api-Key: <key>` header, GET requests | Hackathon guide |
| Entity search | `GET /search?query=…&types=urn:entity:brand&take=n` | Guide + clients |
| Insights | `GET /v2/insights?filter.type=urn:entity:<type>` (required) with `signal.interests.entities`, `signal.location.query`, `filter.location.query`, `filter.exclude.entities`, `feature.explainability=true`, `take` | Hackathon guide |
| Taste tags | `GET /v2/insights?filter.type=urn:tag` | Third-party clients |
| Response | `results.entities[]` with `entity_id`, `name`, `subtype`/`type`, `popularity`, `properties`, `tags[]`, `query.affinity`, `query.explainability` | Third-party clients (unverified) |
| Search "no results" | HTTP 404 → treated as empty | Third-party clients |

Deliberately **not** used, because they could not be verified: `signal.demographics.*` (the age bucket
values are uncertain), heatmaps, trends, `/v2/analysis/compare`, and the legacy `/recommendations`. The
audience text in the brief informs interpretation only.

## Defensive design (`src/lib/providers/qloo/`)

- `client.ts`: host allow-list; 12 s timeout; up to 3 attempts for 429, 5xx and network errors, honouring
  `Retry-After` (capped at 8 s); no retry on 4xx. A response without a `results` field raises
  `invalid_response` instead of being guessed at.
- `normalize.ts`: permissive zod schemas. Entities without an id or name are dropped, and a missing affinity
  stays `null`.
- Every request (including failures) is written to `research_sources` with its parameters, HTTP status,
  result count, duration and the raw response, capped at 250 KB. The API key is never stored or logged.
- A live run never falls back to fixtures. Demo runs are explicit, need `CC_DEMO_MODE=enabled`, are refused
  when `VERCEL_ENV=production`, and are labelled everywhere.

## How to verify (≈2 minutes once the network allows it)

1. In the cloud environment settings, allow outbound access to `hackathon.api.qloo.com` (or
   `api.qloo.com`) and `docs.qloo.com`.
2. Run `npx tsx scripts/qloo-smoke.ts`. It makes 3 requests and prints the HTTP status, the result count
   and the top-level keys of each response — never the key.
3. In the app: open a campaign → Research → **Start research**. Then check Run history → provider
   requests, and Evidence → raw response.
4. If any field path differs, adjust `normalize.ts` and `tests/unit/qloo-normalize.test.ts` together.

Licensing: Qloo data is used under your Qloo agreement. The hackathon guide allows private server-side
caching. Confirm with Qloo whether including values in client reports and shared links is permitted under
your plan, and remember hackathon keys are deactivated after the event closes.
