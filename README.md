# CultureCrash

*Turn cultural signals into iconic brands.* CultureCrash is a cultural intelligence and campaign strategy
workspace for agencies and brand teams. The workflow runs **Explore → Interpret → Create → Test → Track**:
brief, cultural research (Qloo), evidence, opportunities, three positioning directions, creative brief,
experiments and versioned client reports.

- Product spec: `docs/MASTER_PROMPT.md` · visual reference: `docs/reference/culturecrash-research-canvas.webp`
- Qloo verification status: **`docs/QLOO_INTEGRATION.md`** (key and endpoints verified live by the project owner)
- Design system: `docs/DESIGN_SYSTEM.md`
- Multi-source research engine (web, video, community, client documents, Qloo): **`docs/RESEARCH_ENGINE.md`**

## Stack

Next.js 16 App Router (TypeScript strict, React 19), Tailwind CSS v4 with CSS-variable tokens, Radix
primitives (shadcn-style, restyled), lucide-react, Supabase (Postgres + Auth + Storage + RLS),
`postgres` driver, zod, Anthropic SDK (structured outputs), `@react-pdf/renderer`, Vitest, Playwright.

## Architecture

```
src/
  app/(marketing)/   public site: /, /product, /solutions/*, /showcase, /pricing, /about, /privacy, /terms
  app/(auth)/        /login, /signup, /forgot-password  (+ /auth/callback route)
  app/(app)/         authenticated app; layout = floating command bar (no sidebar)
     dashboard, projects, projects/[id]/{brief,research,research/history,evidence/[id],opportunities,
     strategy,strategy/compare,creative-brief,experiments,experiments/[id],reports,reports/[id]},
     search, tasks, workspace(/clients/[id](/brand), /activity), settings/*, help
  app/reports/shared/[shareId]   public read-only report (token)
  app/api/           search, run status polling, PDF export, creative-brief export, account export
  lib/db             withUser(): every query runs as Postgres role `authenticated` with the verified user
                     id as JWT subject → Row Level Security applies exactly as in Supabase's Data API
  lib/auth           Supabase Auth (production) | local auth (dev/tests only, refused on Vercel prod)
  lib/data           data access + server actions per domain; permissions checked with assertCan()
  lib/providers/qloo adapter: client, normalisation, types, demo fixtures
  lib/research       jobs (limits, idempotency), Qloo stage (engine.ts), deep/ = multi-source research:
                     planner, provider registry + adapters, page retrieval, dedupe, claims, quality,
                     budget, cache, orchestrator, synthesis; REST API under app/api/research
  lib/ai             LLM adapter (Anthropic, schema-validated), prompts, template engine fallback
  lib/strategy       opportunities, directions (versioned), comparison, creative brief
  lib/experiments    experiments, variants, results
  lib/reports        immutable snapshots, versions, PDF, share tokens
supabase/migrations  schema, RLS, functions (apply in order)
db/local             local-only Supabase shim (roles, auth.users, auth.uid()) for plain Postgres
```

**Authorization**: three layers: (1) the proxy redirects optimistically, (2) server actions call
`getCtx()` (verified session + DB-checked membership) and `assertCan(role, permission)`, (3) Postgres RLS on
every table (members read, members+ write, admins delete; viewers are read-only). There are also
cross-workspace integrity triggers, an owner guard and immutable report versions. Anonymous visitors can
reach exactly one SECURITY DEFINER function, `get_shared_report(token_hash)`. The service-role key is not
used at all.

**AI orchestration**: `generateStructured()` calls Claude with zod structured outputs and re-validates
before anything is saved. Evidence ids the model cites are filtered against stored ids, and brief,
document and provider text is wrapped in tags and treated as untrusted. With no `ANTHROPIC_API_KEY`, a
deterministic **template engine** writes drafts only from the brief and stored evidence; they are labelled
"Template draft (no LLM configured)". The copilot (`lib/ai/copilot-agent.ts`) is a multi-step tool-use loop: it
can call up to five rounds of six read-only tools (search evidence, look up an entity, list opportunities, read the
strategy, list experiments, list research runs). Each runs under the user's RLS and is scoped to the
project. It then gives a schema-validated answer, citing only evidence ids a tool returned. The lookups it
made are shown under each answer. Any state-changing action it suggests is returned as a proposal that the
user must click to run.

**Research engine** (details in `docs/RESEARCH_ENGINE.md`): a job plans distinct research questions,
routes each to the configured sources that can answer it (Brave web search, YouTube, Reddit via OAuth,
Wikipedia, the client's own documents, and Qloo), retrieves full text for the most relevant pages,
deduplicates syndicated copies, extracts cited claims, follows up on gaps, and stops on coverage,
budget, time or diminishing returns. It then writes a report whose findings cite claims, with
contradictions, hypotheses and limitations. Every call is in the cost ledger; partial results survive
provider failures. The Qloo stage: brief → plan (brand and up to 3 competitors resolved via `/search`, up to 4 audience
interests resolved to tags via `/v2/tags` and sent as `signal.interests.tags`, market as a location signal,
entity types by category) → `/v2/insights` per type, plus taste tags → every request
logged to `research_sources` → entities, relationships and `provider_observation` evidence →
interpretation. The brand's own Qloo profile tags are saved as labelled observations, and entity photos
(`properties.image.url`, https only) are shown over the generative artwork, which stays as the fallback. Runs are idempotent (a client key plus the active-run check), rate-limited per workspace
per day, execute in the background and are polled by the canvas. When every call fails the run fails, and
it never falls back to fixtures.

**Reports** are immutable snapshots tied to the research run and strategy version. New research means a
new version, never a rewrite. PDF export uses react-pdf with citations and a provider-request appendix.
Share links use a random 256-bit token that is shown once; only its SHA-256 hash is stored, and links can
expire or be revoked.

## Local development

Requires Node 22 and Postgres 15+ (a local Supabase stack works too).

```bash
npm install
cp .env.example .env.local         # set DATABASE_URL; for plain Postgres use AUTH_MODE=local + SESSION_SECRET
createdb culturecrash
DATABASE_URL=postgres://… npm run db:migrate:local    # plain Postgres: applies db/local shim + migrations
npm run dev
```

With `CC_DEMO_MODE=enabled` you can run labelled demonstration research and open a demo workspace from the
dashboard. Without `QLOO_API_KEY`, live research is disabled and the app says so. Without
`ANTHROPIC_API_KEY`, drafts come from the template engine.

## Supabase project (provisioned)

Project `culturecrash` (ref `hmkdnzpiopxmzcbyqfqh`, region ap-south-1) was created through the Supabase
connector. Every migration in `supabase/migrations/` has been applied, including the private
`brief-documents` bucket with workspace-scoped policies. Signup triggers and cross-workspace isolation were
smoke-tested there inside a rolled-back transaction. The security advisor's remaining notices are
intentional: authenticated RPC helpers, the anon-callable `get_shared_report`, and `pilot_requests` having no
policies because only the server writes to it.

- `NEXT_PUBLIC_SUPABASE_URL=https://hmkdnzpiopxmzcbyqfqh.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the project's publishable key (Dashboard → Project Settings → API Keys)
- `DATABASE_URL` = Dashboard → Connect → Transaction pooler (port 6543), with the database password you set or reset
- Auth → URL Configuration: Site URL = your deployed `APP_BASE_URL`; add `APP_BASE_URL/auth/callback` as a redirect URL

## Configure Supabase (production)

1. Create a project. Under **Auth → URL configuration**, set the Site URL to `APP_BASE_URL` and add
   `APP_BASE_URL/auth/callback` as a redirect URL. Keep email confirmation on.
2. Apply the migrations in order: either `supabase db push` with the Supabase CLI, or
   `DATABASE_URL=<direct connection string> npm run db:migrate`. Do **not** pass `--local` — Supabase
   already provides `auth.*` and the roles.
3. Create a **private** Storage bucket named `brief-documents` (or set `SUPABASE_STORAGE_BUCKET`). Add a
   storage policy allowing `insert` for `authenticated` users whose first path segment is a workspace they
   belong to:
   `bucket_id = 'brief-documents' and public.is_workspace_member(((storage.foldername(name))[1])::uuid)`.
   Without the bucket, uploads still work: extracted text is saved and the UI notes that the original file
   was not stored. With the bucket, the browser uploads files straight to Storage through a one-time
   signed URL (Vercel limits a function request to 4.5 MB), and migration `…1710_brief_storage.sql`
   (applied with the others) allows image uploads and lets uploaders delete their own files.
4. Environment: `DATABASE_URL` (the transaction pooler on port 6543 is fine — prepared statements are
   disabled), `AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `APP_BASE_URL`.
5. Turn off the auto-generated REST API. The app talks to Postgres directly and never uses it, but it is
   on by default and would let anyone with the public anon key and a login skip the app's permission
   checks. Migration `…1300_security_hardening.sql` already makes every Data API request fail (a
   `pgrst.db_pre_request` hook); also remove `public` under **Settings → API → Exposed schemas** (or turn
   the Data API off) in the dashboard.

## Configure providers

- **Qloo**: `QLOO_API_KEY` and `QLOO_API_URL` (hackathon keys use `https://hackathon.api.qloo.com`). Then
  run `npx tsx scripts/qloo-smoke.ts` — see `docs/QLOO_INTEGRATION.md`. **Licence:** `QLOO_API_URL` defaults
  to the hackathon host. Hackathon keys are not for commercial use: before charging customers, get a
  commercial Qloo agreement and set `QLOO_API_URL` to the host Qloo gives you.
- **LLM**: `ANTHROPIC_API_KEY`; `LLM_MODEL` defaults to `claude-opus-5-5`.
- **Email** (optional): `RESEND_API_KEY`, `EMAIL_FROM` (a sender on a domain verified in Resend) and
  `PILOT_NOTIFY_EMAIL` (where /pricing pilot requests are forwarded). Sends team invitations, plus "research
  finished", "report shared" and the weekly digest to people who switched those on in Settings → Notifications.
  Without a key nothing is sent and the app says so.
- **Scheduled jobs**: `vercel.json` registers two Vercel Cron jobs, `/api/cron/retention` (daily) and
  `/api/cron/weekly-digest` (Mondays). Set `CRON_SECRET`; Vercel sends it as a Bearer token and the route rejects
  anything else.
- **Research sources**: `BRAVE_API_KEY` (primary web search; `TAVILY_API_KEY` / `EXA_API_KEY` as
  alternates), `YOUTUBE_API_KEY`, `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` +
  `REDDIT_COMMERCIAL_ACCESS=approved` (only once Reddit has approved commercial use). Wikipedia and
  client documents need nothing. Check them with `npx tsx --env-file=.env.local scripts/research-smoke.ts`.
  Workspaces can turn web research off in Settings → Integrations.
- **Spending ceiling**: `PLATFORM_SPEND_CAP_USD` caps estimated research spend across **all** workspaces per
  calendar month. Every workspace uses this server's provider keys, so set it before opening signup; once
  it is reached, live research pauses (demo runs still work). Live research also requires a confirmed email.
- **Billing**: not configured. Plans are pilot-only and no payment flow exists.

## Deploy (Vercel)

Import the repo and set the environment variables above (never `NEXT_PUBLIC_` for secrets). Leave
`CC_DEMO_MODE` unset in production — it is ignored when `VERCEL_ENV=production` anyway. Research and LLM
generation run inside server actions and `after()`, so consider raising the function `maxDuration` for long
runs. `npm run build` must pass; then apply migrations before the first deploy.

## Testing

```bash
npm run typecheck && npm run lint
npm test                                                     # unit: Qloo adapter, normalisation, template engine, permissions, email templates, copilot loop
TEST_DATABASE_ADMIN_URL=postgres://postgres@host:port/postgres npm run test:db   # RLS / isolation (creates & drops a temp DB)
BASE_URL=http://localhost:3000 npm run test:e2e              # Playwright scenarios A–J against a running server (local auth + demo mode)
```

## Status

See the final handoff in the pull request or session notes for full detail. Summary:

- **Implemented and tested end to end**: auth (local mode), workspaces and roles, project library, brief
  editor, demo research and the cultural canvas, evidence, opportunities, strategy studio, creative brief,
  experiments, reports, PDF export, sharing, search, tasks, settings.
- **Implemented, untested against the real service**: Supabase Auth and Storage (no Supabase project was
  reachable from the build environment); the live Qloo API (network blocked — see above); the Anthropic
  LLM path (no key was provided).
- **Implemented, untested against the real service**: Resend email delivery (no key in the build environment).
- **Implemented, not yet exercised live**: the Brave, YouTube, Reddit, Tavily, Exa and Wikipedia adapters
  (no keys or network access in the build environment; see the status table in `docs/RESEARCH_ENGINE.md`).
- **Not implemented**: trend time series, cross-asset visual analysis, embeddings, payments, real-time
  co-editing.

Presence: on any campaign page you see who else is there (avatars next to the breadcrumb), and a field a
teammate is editing gets a coral outline with "<name> is editing". Each open page sends a heartbeat every
5 s (and when you move to another field) to `/api/projects/[id]/presence`, which returns everyone seen in the
last 30 s. The `presence` table is under RLS (members only, own row only). Edits are not merged live; the
brief's revision check still prevents overwrites.

Notifications: the command-bar bell shows in-app notifications (research finished or failed, a report shared
from your campaign, being added to a workspace) with an unread count. It polls every 30 s while the tab is
visible; opening a notification from another workspace switches to it.

Workspace data: owners can set a retention period (30 days to 1 year) for raw provider responses, copilot
conversations, activity history and finished tasks, and can delete a whole workspace (stored brief files are
removed from Storage first). Turning the LLM off for a workspace in Settings → Integrations makes every draft
come from the labelled template engine.
