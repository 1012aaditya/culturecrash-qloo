# Qloo integration — status and verification

## Status: implemented, **not yet verified against the live API**

`QLOO_API_KEY` is present in the build environment, but the environment's network policy blocks
`hackathon.api.qloo.com`, `api.qloo.com`, `staging.api.qloo.com` and `docs.qloo.com` (the egress proxy
answers HTTP 403 to `CONNECT`). So:

- No request has reached Qloo from this build. Every live research run attempted here failed with
  `network: Could not reach the Qloo API`, and the app showed that failure; it did not substitute fixtures.
- The official documentation could not be fetched. The request contract was taken from a web search of
  Qloo's official *Hackathon Developer Guide* (docs.qloo.com/reference/qloo-llm-hackathon-developer-guide).
  The response field paths were cross-checked against public open-source clients written by people using
  live Qloo keys. Treat the response schema as **unverified** until the smoke test below passes.

## What the adapter assumes

| Item | Value | Source |
|---|---|---|
| Base URL | `https://hackathon.api.qloo.com` (hackathon keys), `https://api.qloo.com` (production keys); set `QLOO_API_URL` | Hackathon guide |
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

Licensing: Qloo data is used under the customer's Qloo agreement. Confirm with Qloo whether storing raw
responses and including values in client reports is permitted under your plan.
