# CultureCrash

**Turn cultural signals into iconic brands.**

CultureCrash is a cultural-intelligence and campaign-strategy workspace for agencies and brand teams. It
takes a client brief, finds out what the audience *actually* loves (Qloo's taste graph plus the open web),
turns that into evidence-backed opportunities and three positioning directions, stress-tests them with an
AI Devil's Advocate, and then shows each direction as a visual story: concept frames rendered on the
agency's **own GPU**, copy, touchpoint mockups and a pitch-ready report. Every claim and every image keeps
its receipts.

![CultureCrash](docs/images/hero-logo.jpg)

▶ **Watch the 3½-minute product film:** [`docs/media/culturecrash-investor-film.mp4`](docs/media/culturecrash-investor-film.mp4)
(a real end-to-end run, from brief to report).

---

## Contents

- [What it does](#what-it-does)
- [A real run, screen by screen](#a-real-run-screen-by-screen)
- [Tech stack](#tech-stack)
- [External APIs and services](#external-apis-and-services)
- [Run it locally](#run-it-locally)
- [Environment variables](#environment-variables)
- [The local GPU image studio](#the-local-gpu-image-studio)
- [Deploy](#deploy)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)
- [Known issues](#known-issues)
- [More documentation](#more-documentation)

---

## What it does

The workflow follows five stages, the same ones as the app's navigation:

| Stage | What you get |
|---|---|
| **01 · Explore** | A structured brief (audience, objective, competitors, interests, uploaded brand docs and moodboards), then **live research**: Qloo cultural affinities for the brand, competitors and audience interests, followed up on the open web (Google, Exa, Tavily, YouTube, Wikipedia, Reddit, Hacker News). Every claim is cited and every call is in a cost ledger. |
| **02 · Interpret** | An **evidence ledger** that labels everything as observed, interpretation or hypothesis, and **opportunities** written as hypotheses, each with why it may matter, what remains unknown, how to validate it and a grounding score. |
| **03 · Create** | **Three positioning directions** that must differ in rationale, a side-by-side **compare**, a **Devil's Advocate** that attacks each direction like a sceptical CMO, a **creative brief**, and **inspiration boards**: one click turns the directions into a six-chapter story canvas with Qloo people and places, cited evidence, AI concept frames rendered on your own GPU, copy lines and touchpoint mockups. |
| **04 · Test** | **Experiments** with a hypothesis, variants and a decision rule agreed up front; results with real statistics (lift, 95% range, plain-English verdict) flow back into the evidence ledger. |
| **05 · Track** | Versioned **reports** and pitch packs (PDF export, read-only share links) and **Watch**: daily news monitoring of a client against two competitors, with share of voice and key developments. |

Across all of it: a **copilot** that reads the project and asks Qloo live, **⌘K search** over everything,
real-time presence, notifications, comments, roles and permissions, and per-workspace spending limits.

## A real run, screen by screen

Every screenshot and image below comes from one live run on the production app, for **Halftime**, a
*fictional* sparkling yerba mate brand for Gen Z in the US.

### 01 · Explore

| The brief | Live research |
|---|---|
| ![Brief](docs/images/screens/02-brief.jpg) | ![Research running](docs/images/screens/05-research-running.jpg) |
| **The cited report:** 86 sources, 19 claims, $0.25 | **Qloo taste graph** |
| ![Report](docs/images/screens/06-report.jpg) | ![Network](docs/images/screens/07-network.jpg) |

Qloo found that this audience lives in skate, stunt comedy and streetwear: Zumiez, Steve-O, Rob Dyrdek,
Death Wish Coffee, Theo Von, Streetwear.

![Qloo culture](docs/images/qloo-culture.jpg)

### 02 · Interpret

| Opportunities (grounding 4/5 verified) | Evidence ledger and copilot |
|---|---|
| ![Opportunities](docs/images/screens/08-opportunities.jpg) | ![Copilot](docs/images/screens/14-copilot.jpg) |

### 03 · Create

| Three directions | Compare |
|---|---|
| ![Strategy](docs/images/screens/09-strategy.jpg) | ![Compare](docs/images/screens/12-compare.jpg) |
| **Devil's Advocate:** verdict "Vulnerable" | **Creative brief** |
| ![Devil's Advocate](docs/images/screens/10-devils-advocate.jpg) | ![Creative brief](docs/images/screens/11-creative-brief.jpg) |

**"Show me these directions"** builds a story board, one row per direction: who they are → the tension →
the idea → the world → how it shows up → touchpoints.

| The story canvas | Chapter 1 · who they are |
|---|---|
| ![Story board](docs/images/screens/15-story-board.jpg) | ![Who they are](docs/images/screens/18-ch1-who.jpg) |
| **Chapter 4 · the world** (AI frames) | **Chapter 6 · touchpoints** |
| ![The world](docs/images/screens/21-ch4-world.jpg) | ![Touchpoints](docs/images/screens/22-ch6-touchpoints.jpg) |

**Concept frames rendered on an RTX 3050 6 GB laptop**, about 2 minutes each and $0 per image. The AI art
director gave each direction its own photographic look:

| | | |
|---|---|---|
| ![](docs/images/frames/friends-laughing-after-a-fall.jpg) | ![](docs/images/frames/post-lecture-can-on-the-steps.jpg) | ![](docs/images/frames/controller-passed-across-the-couch.jpg) |
| *Friends laughing after a fall* · strong fit | *Post-lecture can on the steps* · strong fit | *Controller passed across the couch* · partial fit |
| ![](docs/images/frames/scuffed-deck-under-flash.jpg) | ![](docs/images/frames/late-light-on-a-skatepark-ledge.jpg) | ![](docs/images/frames/retro-console-and-cans-on-a-rug.jpg) |
| *Scuffed deck under flash* · strong fit | *Late light on a skatepark ledge* · partial fit | *Retro console and cans on a rug* · partial fit |

**Why this image?** Every frame keeps its receipts: Qloo signals → evidence → direction → art direction →
exact prompt → fit check.

![Why this image](docs/images/screens/17-why-this-image.jpg)

### 04 · Test and 05 · Track

| Experiment with a decision rule | Search ⌘K |
|---|---|
| ![Experiment](docs/images/screens/13-experiment.jpg) | ![Search](docs/images/screens/16-search.jpg) |
| **Report: three visual futures** | **Watch** |
| ![Report futures](docs/images/screens/23-report-futures.jpg) | ![Watch](docs/images/screens/25-watch.jpg) |

## Tech stack

| Layer | Technology |
|---|---|
| App framework | **Next.js 16** (App Router, Turbopack, server actions), **React 19**, TypeScript (strict) |
| UI | **Tailwind CSS v4** with CSS-variable design tokens, Radix primitives (shadcn-style), lucide-react, Motion |
| Canvas | **React Flow** (`@xyflow/react`) for inspiration boards and the research network |
| Data | **Supabase**: Postgres with Row Level Security on every table, Auth, private Storage; the `postgres` driver (no ORM) |
| Validation | **zod** for every input, model output and stored document |
| AI | **Anthropic SDK** (Claude Opus 5.5 for synthesis and strategy, Claude Haiku 5.5 for fast tasks) with structured outputs and vision |
| Images | **sharp** (re-encoding, thumbnails, EXIF stripping), **node-vibrant** (palettes) |
| Documents | **@react-pdf/renderer** (report PDFs), **unpdf** and **mammoth** (reading uploaded PDF/DOCX briefs) |
| Auth helpers | `@supabase/ssr`, `jose` and `bcryptjs` (local dev auth only) |
| Image generation | **ComfyUI** on the agency's own GPU (via Pinokio): Z-Image Turbo, RealVisXL V5, Real-ESRGAN |
| Hosting | **Vercel** (Fluid Compute functions, Cron jobs) |
| Testing | **Vitest** (unit and database/RLS tests), **Playwright** (end-to-end scenarios) |

## External APIs and services

| Service | Used for | Environment variable(s) | Needed? |
|---|---|---|---|
| **Qloo Taste AI** (`/search`, `/v2/tags`, `/v2/insights`) | Cultural affinities: brands, artists, people, films, TV, podcasts, places, taste tags | `QLOO_API_KEY`, `QLOO_API_URL` | For live research |
| **Anthropic Claude** | Research planning and synthesis, opportunities, directions, Devil's Advocate, creative brief, copilot, fit checks (vision), art direction | `ANTHROPIC_API_KEY`, `LLM_MODEL`, `LLM_MODEL_FAST` | Optional: without it a labelled template engine writes drafts |
| **Supabase** | Postgres, Auth, Storage | `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (or plain Postgres with local auth for development) |
| **Serper** (Google Search and News) | Web and news search | `SERPER_API_KEY` | Optional |
| **Brave Search** | Web search | `BRAVE_API_KEY` | Optional |
| **Tavily** | Web search with extraction | `TAVILY_API_KEY` | Optional |
| **Exa** | Semantic search for niche essays and independent publications | `EXA_API_KEY` | Optional |
| **YouTube Data API** | Creator perspectives, video metadata | `YOUTUBE_API_KEY` | Optional |
| **Reddit** (OAuth) | Community discussion | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_COMMERCIAL_ACCESS` | Optional |
| **Wikipedia** | Background on entities and scenes | none | Built in |
| **Hacker News** (Algolia API) | Tech and community discussion | none | Built in |
| **Google Suggest** | Autocomplete phrasing (not Google Trends) | `GOOGLE_SUGGEST=enabled` | Optional, off by default |
| **Resend** | Invitations, "research finished", "report shared", weekly digest | `RESEND_API_KEY`, `EMAIL_FROM`, `PILOT_NOTIFY_EMAIL` | Optional |
| **Vercel Cron** | Daily retention, weekly digest, daily Watch | `CRON_SECRET` | For scheduled jobs |
| **ComfyUI worker** (your own GPU) | Concept frames, variations, upscales | `CC_WORKER_TOKEN` | Optional: the image buttons stay hidden without it |

> **Qloo licence:** `QLOO_API_URL` defaults to the hackathon host. Hackathon keys are not for commercial
> use; before charging customers, get a commercial Qloo agreement and set the URL Qloo gives you.

## Run it locally

### Prerequisites

- **Node.js 22+** (tested on Node 24) and npm
- **Postgres 15+**, either plain Postgres or a local Supabase stack
- Optional: API keys from the table above. **None are needed to try the app in demo mode.**

### 1 · Quick start (demo mode, no API keys)

```bash
git clone https://github.com/1012aaditya/culturecrash-qloo.git culturecrash
cd culturecrash
npm install

createdb culturecrash
DATABASE_URL=postgres://localhost:5432/culturecrash npm run db:migrate:local   # local Supabase shim + all migrations

cp .env.example .env.local
```

In `.env.local`, set at least:

```bash
DATABASE_URL=postgres://localhost:5432/culturecrash
AUTH_MODE=local                       # email + password stored in your Postgres (development only)
SESSION_SECRET=<32+ random characters> # e.g. the output of: openssl rand -hex 32
CC_DEMO_MODE=enabled                  # labelled demonstration research, no Qloo key needed
APP_BASE_URL=http://localhost:3000
```

Then:

```bash
npm run dev
```

Open <http://localhost:3000>, sign up, create a campaign and use **Demo run** on the research page.
Demo data is always labelled as such.

### 2 · Full setup (live research and AI)

Add the keys you have to `.env.local`: at least `QLOO_API_KEY` and `ANTHROPIC_API_KEY`, plus any web
sources. Check them with:

```bash
npx tsx scripts/qloo-smoke.ts
npx tsx --env-file=.env.local scripts/research-smoke.ts
```

### 3 · With Supabase (production-like)

1. Create a Supabase project. In **Auth → URL configuration**, set the Site URL to your `APP_BASE_URL` and
   add `APP_BASE_URL/auth/callback` as a redirect URL.
2. Apply the migrations: `supabase db push`, or
   `DATABASE_URL=<direct connection string> npm run db:migrate` (without `--local`).
3. Set `AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and a
   `DATABASE_URL` (the transaction pooler on port 6543 is fine).
4. Remove `public` under **Settings → API → Exposed schemas**: the app talks to Postgres directly and never
   uses the auto-generated REST API.

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#supabase-configuration-production).

## Environment variables

The source of truth is `src/lib/env.ts` (validated with zod at startup). **Never prefix a secret with
`NEXT_PUBLIC_`.**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_MODE` | `supabase` (default) or `local` (development and tests only; refused on Vercel production) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL and publishable key |
| `SUPABASE_STORAGE_BUCKET` | Bucket for uploaded briefs (default `brief-documents`) |
| `SESSION_SECRET` | 32+ characters, required for `AUTH_MODE=local` |
| `APP_BASE_URL` | Public URL of the app (links in emails, auth redirects) |
| `QLOO_API_KEY`, `QLOO_API_URL`, `QLOO_AGE_SIGNAL` | Qloo access; `QLOO_AGE_SIGNAL=enabled` sends the audience age cohort |
| `ANTHROPIC_API_KEY`, `LLM_MODEL`, `LLM_MODEL_FAST` | Claude access and model choices (defaults `claude-opus-5-5`, `claude-haiku-5-5`) |
| `SERPER_API_KEY`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, `YOUTUBE_API_KEY` | Web, news and video sources |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_COMMERCIAL_ACCESS` | Reddit (set the last to `approved` only once Reddit approves commercial use) |
| `GOOGLE_SUGGEST` | `enabled` to use Google autocomplete phrasing |
| `*_USD_PER_REQUEST` | Per-call cost estimates for the cost ledger (Brave, Serper, Tavily, Exa) |
| `PLATFORM_SPEND_CAP_USD` | Monthly ceiling on estimated research spend across all workspaces |
| `CC_DEMO_MODE` | `enabled` for labelled demo research (ignored on Vercel production) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `PILOT_NOTIFY_EMAIL` | Email delivery |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/*` |
| `CC_WORKER_TOKEN` | Shared secret of the GPU worker (24+ characters) |

## The local GPU image studio

Concept frames are rendered by **ComfyUI on a GPU the agency owns**; we use an RTX 3050 6 GB laptop. A
small worker on that PC **polls** the website for jobs, renders them and uploads the result, so the PC needs
no open port or tunnel, there is no per-image API fee, and no image leaves the studio.

1. Install ComfyUI (we use Pinokio) with **Z-Image Turbo**, **RealVisXL V5** and **Real-ESRGAN**, all
   commercially usable.
2. Run the worker on the PC with your site URL and a `CC_WORKER_TOKEN`.
3. Set the same `CC_WORKER_TOKEN` on the website and redeploy.

The worker protocol, models, sizes and ComfyUI workflow contract are in
[`docs/IMAGE_STUDIO.md`](docs/IMAGE_STUDIO.md).

## Deploy

1. Import the repository into **Vercel**.
2. Set the environment variables above for Production. Leave `CC_DEMO_MODE` unset (it is ignored in
   production anyway).
3. Apply the migrations to your Supabase project **before** the first deploy.
4. `vercel.json` registers three cron jobs: `/api/cron/retention` (daily), `/api/cron/weekly-digest`
   (Mondays) and `/api/cron/watch` (daily, 06:00 UTC). Set `CRON_SECRET`.
5. `npm run build` must pass.

## Testing

```bash
npm run typecheck && npm run lint
npm test                                                     # unit tests (Vitest)
TEST_DATABASE_ADMIN_URL=postgres://postgres@host:port/postgres npm run test:db   # RLS and isolation (temporary database)
BASE_URL=http://localhost:3000 npm run test:e2e              # Playwright scenarios against a running server
```

To run the end-to-end suite next to your normal dev server, start a local-auth server with its own build
folder:

```bash
NEXT_DIST_DIR=.next-e2e AUTH_MODE=local DATABASE_URL=postgres://… SESSION_SECRET=… CC_DEMO_MODE=enabled npx next dev -p 3300
BASE_URL=http://localhost:3300 npm run test:e2e
```

## Project structure

```
src/app/            routes: marketing site, auth, the app, API (research, reports, cron, worker, …)
src/components/     UI: boards (canvas, cards, story, trail), research, strategy, reports, ui primitives
src/lib/            domain logic: db (RLS), auth, ai, research, strategy, boards, concepts, reports, watch, …
supabase/migrations schema, Row Level Security, functions and storage buckets (apply in order)
db/local            Supabase shim for plain Postgres (local development)
tests/              Vitest unit and database tests
e2e/                Playwright scenarios
scripts/            migrations, smoke tests and evaluation scripts
docs/               architecture, research engine, image studio, design system, images, product film
```

The full map and design decisions are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Roadmap

Today CultureCrash is a research → strategy → pitch engine. The goal is **the operating system for
culture-led marketing**:

| # | Stage | Status |
|---|---|---|
| 1 | **Brand intelligence + Watch**: Qloo-first research, cited evidence, brand memory, daily Watch | Live |
| 2 | **Opportunity and strategy engine**: grounded opportunities, three directions, Devil's Advocate, compare, pitch pack | Live |
| 3 | **Creative studio**: concept frames on your own GPU, copy, mockups, fit checks; next: on-brand checks and approvals | Early |
| 4 | **Campaign operations**: launch plans, content calendar, Meta / Google / TikTok, Figma, Slack, Drive | Next |
| 5 | **Performance and optimisation**: experiments with real statistics today; next: live feeds and "what to change next" | Early |
| 6 | **Persistent learning and controlled autonomy**: every campaign making the next one smarter, within limits you set | Vision |

![Roadmap](docs/images/roadmap.jpg)

## Known issues

- **Copilot:** a free-form question can use all its lookups and return no answer, and answers can show
  raw evidence ids.
- **Story boards:** auto-picked source links can be irrelevant; they need a relevance filter.
- **Billing** is not implemented: plans are pilot-only.

## More documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system diagram, code map, authorization, AI, research, boards, reports, Watch
- [`docs/IMAGE_STUDIO.md`](docs/IMAGE_STUDIO.md): the local GPU studio, worker protocol and models
- [`docs/RESEARCH_ENGINE.md`](docs/RESEARCH_ENGINE.md): the multi-source research engine
- [`docs/QLOO_INTEGRATION.md`](docs/QLOO_INTEGRATION.md): Qloo endpoints and verification
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md): design tokens and components
- [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md): the original product specification

---

Halftime is a fictional brand used for the demo. All AI images are concepts for discussion, not final
artwork. No open-source licence has been chosen yet, so all rights are reserved by the author.
