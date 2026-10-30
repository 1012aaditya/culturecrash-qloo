# CultureCrash — Fix & Sharpen Prompt

> Paste everything below the line into a fresh Claude Code session opened in this repo, on branch
> `feature/new-feature`. It is written from a full review done on 2026-10-30 (code read across research,
> AI/strategy and platform layers; typecheck, lint and 93 unit tests all passing; competitor scan).
> File:line references were accurate on commit `6d6dd02`; re-check them before editing.

---

## Your role

You are the founding engineer of CultureCrash. The product already exists and is broad: brief → Qloo-first
research → evidence → opportunities → three positioning directions → creative brief → experiments →
versioned reports, plus copilot, brand memory, roles, presence and notifications. Typecheck, lint and unit
tests pass. **The problem is not missing features. It is that the core promise — "every claim is connected
to the evidence behind it" — is not actually true yet, the platform has real security holes, and long jobs
can wedge a project.** Your job is to make the promise true, close the holes, and then sharpen the product
into something a 5–50 person agency would pay for instead of using ChatGPT + GWI Spark or Waldo.

Work in the phases below, in order. Each phase is one or more commits on `feature/new-feature`. Do not
start a phase until the previous one passes `npm run typecheck && npm run lint && npm test`. For every bug
you fix, add a test that fails before the fix and passes after (unit in `tests/unit`, RLS in `tests/db`,
flows in `e2e/`). Do not add features outside this prompt. When a fix needs a product decision you cannot
make from this document, stop and ask.

Ground rules that already exist and must survive: zod-validated structured outputs (`src/lib/ai/index.ts`),
`withUser()` + RLS on every query, the six-rung evidence ladder (observed → sourced → interpretation →
hypothesis → experiment result → validated conclusion), demo data always labelled, immutable report
versions, hashed share tokens.

---

## Phase 0 — Security holes (ship first, smallest diffs)

The app talks to Postgres directly, but Supabase's auto REST API (PostgREST) is still live for `public`, and
`authenticated` has full table grants (`supabase/migrations/20261028000200_rls_and_functions.sql:9`). So
anyone with the public anon key + their own login can bypass every `assertCan()` and hit RLS directly.

1. **Invite hijack via profile email (critical).** `profiles_update` (`…0200:78`) has no column limit and
   `invite_member` (`…0200:269`) finds invitees by `profiles.email`. An attacker can `PATCH` their profile
   email to `newhire@agency.com` and be auto-added when that agency invites the real person; the unique
   email index then blocks the real person's signup.
   - New migration: `revoke update (email) on public.profiles from authenticated;` keep `profiles.email`
     synced from `auth.users` by trigger; `invite_member` must look up `auth.users` where
     `email_confirmed_at is not null`.
   - Better: every invite becomes a pending invitation the invitee accepts (token link). Never silently add.
     Return the same neutral message whether or not the email has an account (stops account discovery).
     Rate-limit invites per workspace per day.
2. **Close the side door.** Remove `public` from the Data API's exposed schemas (document the exact
   Supabase dashboard step in README), and in a migration revoke table grants from `authenticated` that the
   browser never needs. Then tighten RLS so it matches `assertCan`: only admins may update `brand_profiles`
   approval fields; nobody may write `research_sources` cost columns, `research_runs.created_at`,
   `activity_events`, `usage_events` directly; `workspaces.plan / is_demo / *_limit / research_budget_*`
   writable only via owner-checked SECURITY DEFINER functions.
3. **Spend cap on our provider keys (critical).** Open signup + `create_workspace` with no cap + $25 default
   budget = anyone can script 500 workspaces and burn Anthropic/Exa/Serper keys. Add: a platform-wide
   monthly spend ceiling (env `PLATFORM_SPEND_CAP_USD`) checked before every live run and LLM call; max 2
   owned workspaces per user; live research requires a confirmed email; reserve spend atomically in the DB
   (insert a reservation row inside the same transaction as the run) instead of reading headroom once
   (`src/lib/research/deep/orchestrator.ts:62`). Enforce published seat/project/client limits
   (`src/lib/data/workspace-admin.ts:17`) — today they are display-only.
4. **Open redirect.** `safeNext` (`src/app/(auth)/actions.ts:11`), `src/app/auth/callback/route.ts:9` and
   `openNotificationAction` (`src/lib/data/notification-actions.ts:31`) accept `/\evil.com`. Replace with one
   `safeInternalPath()` helper: reject backslashes, parse with `new URL(next, origin)`, require same origin.
   Stop members/viewers inserting notifications for other users (`notifications_insert` policy).
5. **SSRF bypass in page fetch.** `src/lib/research/deep/url.ts:53`: `[::ffff:169.254.169.254]` is
   normalised to `[::ffff:a9fe:a9fe]` and passes `isPrivateAddress`. Decode IPv4-mapped hex, block NAT64,
   6to4 and doc ranges, pin the resolved IP for the actual connection (no second DNS lookup), and run the
   robots.txt fetch (`fetch-page.ts:29`) through the same guard. Add unit tests for each bypass form.
6. **Local auth on previews.** `src/lib/auth/local.ts:18` only refuses when `VERCEL_ENV === "production"`.
   Refuse whenever `process.env.VERCEL` is set.
7. **Untrusted file parsing.** `src/lib/data/brief-actions.ts:114`: mammoth/unpdf run with no timeout or
   size guard (zip bomb / 5,000-page PDF kills the function). Check uncompressed size, cap pages, wrap in a
   timeout.

Acceptance: new `tests/db` cases prove a member cannot change their email, cannot write plan/limit columns,
cannot forge activity; unit tests for `safeInternalPath` and the IPv6 SSRF forms.

---

## Phase 1 — Make "every claim is cited" actually true (this is the product)

Today the strategy model **never sees the text of the evidence it cites**. `obsJson`
(`src/lib/strategy/actions.ts:41`) sends only `{id, entity, type, affinity, role}` — the `claim` that
`readObservations` (`src/lib/ai/context.ts:6`) already loaded is dropped. Web evidence arrives as an id with
`entity: null, role: "web"`. The only validation is "does this id exist". So a direction can say "Gen Z are
rejecting clean-girl aesthetics [ev-123]" where ev-123 is about something else, and the product presents
that as grounded. Fix this end to end:

1. **Send the evidence.** `obsJson` includes the clipped `claim` (≤300 chars), source domain/provider and
   evidence type. Same for opportunities, direction revision, creative brief and copilot start context
   (`src/lib/ai/copilot-actions.ts:55`).
2. **Cite per statement, not per object.** Change the schemas in `src/lib/ai/schemas.ts` so directions,
   opportunities and creative-brief sections are lists of `{ statement, evidenceIds[] }`. A statement with
   no ids is rendered and stored as AI interpretation, visibly. The creative brief (`creativeBriefSchema`,
   `schemas.ts:106`) currently has no citations at all — give its "reasons to believe" and insight sections
   citations.
3. **Verify, don't just check existence.** Add a cheap support check: for each `{statement, evidenceIds}`,
   numbers and proper nouns in the statement must appear in at least one cited claim/excerpt; otherwise
   downgrade the statement to interpretation and show a small "weakly supported" marker. In research
   extraction (`src/lib/research/deep/extract.ts:34`, `quality.ts:58`): compare the whole excerpt, not the
   first 120–160 chars; claims with no verifiable excerpt must not count toward coverage; the synthesis
   summary (`synthesize.ts:61`) must cite ids like everything else.
4. **Review status must mean something.** `context.ts:10` and `src/lib/reports/snapshot.ts:19` ignore
   `review_status`: evidence a strategist **rejected** still feeds generation and appears in client reports.
   Exclude rejected rows everywhere. Keep `hypothesis` and `ai_interpretation` rows out of "Key evidence"
   and make them non-citable by the copilot (`src/lib/ai/copilot-tools.ts:77,103,114` — only count an id as
   citable if its claim text was actually returned to the model). Cascade or tombstone experiment-result
   evidence when its experiment is deleted (`src/lib/experiments/actions.ts:181`, currently linked only via
   JSON).
5. **Versioning drift.** `newRevision` (`strategy/actions.ts:192`) copies the old `evidence_ids` column but
   writes new content; `reviseDirectionAction` (:220) validates against the latest run, not the version's
   run. UI, creative brief and report then show different evidence for the same direction. Recompute the
   columns from the new content and validate against `strategy_versions.run_id`.
6. **Honest reports.** `snapshot.ts:49` and `src/lib/ai/template.ts:80` always say "No public-web research
   provider was configured" — false now. Derive limitations from providers actually used in the run.
   Snapshot the creative brief that belongs to the selected direction (not just the latest), take
   "selected strategy" and "alternatives" from the same version, include every cited evidence row (not a
   60-row slice, `report-document.tsx:24`), and show citations on opportunities/directions in the PDF.

**The visible payoff (be creative here):** build an **"Evidence receipt"** interaction. Hovering or tapping
any cited statement anywhere (strategy, creative brief, report, share link) opens a small card with the
exact source sentence highlighted, provider, date, and its ladder rung. Statements without receipts get a
dashed underline. In reports, a one-line "Grounding score" per direction: % of statements with a verified
receipt. This turns the integrity work into the thing a strategist shows a sceptical client.

Acceptance: a unit test where the model cites an id whose claim doesn't contain the statement's number →
statement downgraded; a test that a rejected evidence row never appears in a report snapshot; an e2e step
that opens a receipt from the report.

---

## Phase 2 — Jobs must never wedge a project

1. **Stuck runs (critical).** A research run killed by the Vercel timeout stays `running` forever. The only
   stale sweep lives in `createResearchJob` (`src/lib/research/jobs.ts:40`), but the UI disables
   "Run again"/"Demo run" while a run is running (`src/components/research/research-workspace.tsx:96,123`),
   so the user can never trigger it, and polling never stops. Fix:
   - Hard deadline per run: one `AbortController` at `maxDuration − 40s`, passed to every provider/LLM call,
     and always reserve time to write `finish()` with partial results.
   - Run the stale sweep in the polling endpoint, on page load, and from a cron (`/api/cron/[job]`).
   - UI: if heartbeat is older than 90s, show "This run stopped responding — results so far are kept" and
     unlock the buttons.
   - Shorten the stale window from 10 min to ~3× the heartbeat interval.
2. **Cancel that cancels.** Cancel is only checked between rounds (`orchestrator.ts:147,153`) and never in
   Qloo-only runs (`engine.ts:161,181`). Check it inside the worker pool, pass the abort signal down, refuse
   to start a queued run whose `cancel_requested_at` is set.
3. **One run per project.** `jobs.ts:43-50` has no lock. Add a partial unique index on
   `research_runs(project_id) where status in ('queued','running')` and make daily-limit check + insert
   atomic. When busy, the API returns **409 busy** instead of silently returning the other run with
   `reused: true` (`follow-up/route.ts:21`).
4. **Strategy/creative tasks.** `startTask` runs before the LLM call; any throw leaves
   `background_tasks` running forever and the button spinning (`src/components/strategy/generate-button.tsx:24`,
   `src/components/copilot/copilot-panel.tsx:44` have no try/finally). Wrap in try/finally, set
   `maxDuration` on strategy and creative-brief pages, sweep stale tasks in the same cron.
5. **Longer term (note it, don't build yet unless trivial):** move research to a durable queue/workflow
   so runs survive function limits.

Acceptance: test that a run with an expired heartbeat is closed by the polling endpoint; test that a second
concurrent create returns 409.

---

## Phase 3 — Research that produces insight, not volume

1. **Budget starvation.** Round-1 tasks are queued question by question with Qloo questions first; at
   standard depth the first 3 questions eat 14–16 of 16 provider calls, so competitor and counter-evidence
   questions often get **zero** searches and round 2 never happens (`orchestrator.ts:155-165,318`). Spread
   calls round-robin with a per-question cap, reserve ~25% of calls for follow-up rounds, and rank documents
   by relevance before slicing for extraction (today it's insertion order).
2. **Counter-evidence is dropped.** `mergeQuestions` (`planner.ts:182`) removes the counter-evidence
   question whenever the user asked a question or uploaded documents — the opposite of
   `docs/RESEARCH_ENGINE.md`. Always keep counter-evidence and the user's own question.
3. **Qloo claims overstate.**
   - Hop-2 "Subcultural orbit" entities (`engine.ts:343-372, 458`) store affinity relative to an anchor
     entity in the same `affinity` column as audience affinity, with a made-up `0.8` fallback, then get
     picked as "Qloo links Y to this audience (0.9x)". Store hop-2 affinity separately, exclude hop-2 from
     picks, write accurate claim text, sort anchors by affinity.
   - "White space" (`engine.ts:412-430`) is assigned with no competitor data at all. Only assign a tier
     when brand and ≥1 competitor resolved and explainability covers both; otherwise "unclassified".
   - Scores from different `filter.type` queries are sorted together (`planner.ts:149`) though they aren't
     comparable — normalise within type or pick per type.
   - Verify the age buckets sent to Qloo against Qloo's accepted values.
4. **Cost.** Inside multi-source jobs the Qloo stage still makes its own unbudgeted 16k-token
   interpretation LLM call (`engine.ts:506`) of which only the summary is used — remove it. Cache Qloo
   responses and run them in parallel (≈15–21 sequential uncached calls today). Fix the cache key to
   include result count (`orchestrator.ts:204`) and don't count cache hits against `maxProviderCalls`.
   Correct the synthesis cost estimate.
5. **Demo data.** `demoSearch` (`providers/demo.ts:16`) returns the same 5 fixtures for every query. Make
   demo results query-dependent so demos look like real behaviour. Never mix demo web results with a real
   client's uploaded documents in one report.

---

## Phase 4 — Sharpen the product (creative, but grounded)

Competitive reality (Oct 2026): listening suites (Brandwatch, Talkwalker, Meltwater, Pulsar, Quid) are
$20k+/yr evidence engines with no strategy workflow. **Waldo** is the closest rival (sourced agency
research, Strategize/Pitch/Monitor, from $49/100 credits). **Springboards** owns the strategist workspace
at big agencies but has no data layer. **GWI Spark** inside ChatGPT/Claude is the cheap DIY alternative.
Nobody turns **taste/affinity data into positioning** — that is CultureCrash's wedge. Build toward it:

1. **Red team with teeth.** Today it critiques superseded revisions (`strategy/actions.ts:370`, no
   `distinct on (slot)`; duplicate React keys in `red-team-dialog.tsx:100`), gets no evidence, likely
   truncates at `maxTokens: 4000`, isn't saved, and the no-LLM fallback invents a fixed verdict with
   nonsense copy. Fix all of that, then make it the signature feature: a **"Client Devil's Advocate"**
   that attacks each direction the way a sceptical CMO would — weakest evidence, nearest competitor who
   already owns this, cultural-risk check — saved per version, includable in the report, with a one-click
   "revise to answer this objection". Disable it (with an explanation) when no LLM is configured.
2. **Directions that genuinely differ.** The prompt (:142) only asks for different rationales. Require
   each direction to name a distinct consumer tension, a distinct evidence subset, and a distinct brand
   role; reject/regenerate when overlap of cited ids > 50%. Stop `readObservations` (80 rows, Qloo first)
   from crowding out web evidence — balance the mix. The template fallback must label itself a
   **scaffold** ("fill these in"), never present three fake named directions with broken copy
   (`template.ts:163`).
3. **Experiments a team can actually run.** Today it's one hand-typed number per variant, no denominator,
   design editable after results. Capture successes + exposures per variant; compute a two-proportion test
   (or Bayesian probability-to-beat) with a minimum-sample warning; lock hypothesis/metric/threshold once
   the first result is in; add **CSV import** from Meta/Google/TikTok ad exports as the realistic first
   integration. Stop raw values like impressions=45000 sorting above affinity scores (`normalized_value`,
   `experiments/actions.ts:141`).
4. **Creative brief you can trust.** Confirm before "Regenerate" (it currently hides the hand-edited
   brief), add a version picker, give section revision the brief + evidence.
5. **Pitch mode (the commercial hook).** Agencies pay for winning pitches. Add a "Pitch pack" export from an
   existing project: the strongest direction, its evidence receipts, the Devil's Advocate objections
   answered, and a Qloo "taste map" visual — as PDF and as a share link. This is the first thing a
   prospect sees, and it directly answers Waldo's Pitch product with the one thing Waldo lacks (taste data).
6. **Onboarding to first value.** New users land on "No campaigns yet" with no sample and `?welcome=1` is
   never read. Invited users get a phantom personal workspace that `getCtx` (`src/lib/data/workspace.ts:32`)
   may pick arbitrarily. Fix workspace selection (prefer the invited workspace; remember last used), and
   add a read-only sample campaign every new workspace can open, clearly labelled.

---

## Phase 5 — Ready to charge

- **Polling cost.** Presence every 5s does a Supabase Auth HTTP call + DB upsert per beat
  (`src/app/api/projects/[projectId]/presence/route.ts:31`); ~100 users ≈ 23 req/s. Move presence to
  Supabase Realtime Presence (no DB writes), notifications to Realtime or 60–120s backoff, research
  polling (1.8s, 5 count subqueries) to backoff. Exclude `/api/*` from the proxy.
- **Static marketing.** `(marketing)/layout.tsx:6` calls `getSessionUser()`, making every marketing page
  dynamic. Detect sign-in client-side or via a lightweight cookie so pages can be served from the CDN.
- **Uploads on Vercel.** `next.config.ts:24` allows 12 MB but Vercel caps bodies at 4.5 MB; images are not
  in the bucket's allowed types; deleting a document never removes the stored file and silently fails for
  members. Switch to signed direct uploads, align types, delete the object, fix the permission.
- **Compliance gaps.** Account deletion is refused in Supabase mode (contradicts the privacy page);
  retention never purges brief files; weekly digest sends sequentially in `maxDuration=60` and will time out
  and re-send on retry — batch it and make it idempotent.
- **PDF.** `wrap={false}` clips tall cards (`src/lib/reports/pdf.tsx:114,126,151`); Helvetica garbles
  non-Latin Qloo entity names — register Noto Sans.
- **Pricing.** Publish at least a price anchor, merge the two funnels ("Request a pilot" vs open "Start a
  campaign"), and rename "client workspaces" on the pricing page to "clients" to match the app. Do not build
  Stripe until the user confirms prices.
- **Qloo licence.** `QLOO_API_URL` defaults to the hackathon host (`src/lib/env.ts`). Flag in README that
  commercial use needs a commercial Qloo key; do not change the default without asking.
- Small: remove the 11 unused-import lint warnings.

---

## How to report back

After each phase: what changed (files), tests added, anything you could not verify live (no keys or
network), and any decision you need from the founder. Keep a running checklist in
`docs/FIX_PROGRESS.md`. Do not push or open a PR unless asked.
