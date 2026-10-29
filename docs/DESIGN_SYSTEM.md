# CultureCrash design system

Source of truth: `docs/reference/culturecrash-research-canvas.webp`. The implementation lives in
`src/app/globals.css` (tokens) and `src/components/*`.

## Tokens (`:root` → Tailwind `@theme`)

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--cc-ink` | #111116 | `ink` | text, primary buttons |
| `--cc-charcoal` | #17151E | `charcoal` | immersive panels, stage navigator |
| `--cc-ivory` | #F7F5F2 | `ivory` | working canvas background |
| `--cc-paper` | #FFFFFF | `paper` | evidence, cards, report pages |
| `--cc-violet` | #8064F5 | `violet` | actions, AI, graph highlights |
| `--cc-lavender` / `--cc-lilac` | #B8A5FF / #E8DFFF | `lavender` / `lilac` | soft highlights, selection |
| `--cc-peach` / `--cc-coral` | #FFC7B1 / #F29A8B | `peach` / `coral` | warm lighting, hypotheses, demo badges |
| `--cc-text-secondary` | #696774 | `muted` | supporting text |
| `--cc-border` | #E9E5E1 | `line` | hairlines |

Radii are `rounded-cc-sm` (10px) for controls, `rounded-cc` (16px), `rounded-cc-lg` (24px) for surfaces and
28–36px for hero territories. Controls are 40px tall and pill-shaped. Shadows are `shadow-card` and
`shadow-float`.

Type: Geist Sans for UI and body, Geist Mono for stage numbers and ids, Instrument Serif (`cc-display`)
for headlines, campaign titles, territories and report covers only. `cc-eyebrow` is a small tracked
uppercase label.

Surfaces and lighting: `cc-glass` is the floating translucent control surface (command bar, filters,
zoom). `cc-glass-dark` is the stage navigator. `cc-atmosphere` adds lavender and peach radial light behind
canvases — gradients are lighting, never card fills.

Motion: line drawing for network edges, a slow float for hero nodes, fade-up for panels.
`prefers-reduced-motion` disables all of it.

## Navigation (no sidebar)

- `components/nav/command-bar.tsx` — floating top bar: identity, ⌘K search, project switcher,
  collaborators, contextual Share/Export, task notifications, account and workspace menu. On mobile it
  becomes a compact bar with an overlay menu.
- `components/nav/command-palette.tsx` — ⌘K actions (permission-aware) plus live workspace search.
- `components/nav/stage-nav.tsx` — `StageNav`, the horizontal dark 01–05 navigator with state and
  missing-info hints plus contextual tabs; `StageRail`, the vertical immersive treatment used only inside
  the research canvas on wide screens.
- Breadcrumbs, tabs, dialogs and popovers handle everything else.

## Key components

`ArtPlate` (generative, license-free editorial imagery by category; decorative only, never data),
`CulturalNetwork`, `ResearchWorkspace` and its entity panel, `CopilotPanel`, `OpportunityBoard`,
`StrategyStudio` territories, `ComparisonMatrix`, `CreativeBriefEditor`, the experiment forms and results,
`ReportDocument` (one renderer for the viewer, the shared view and the showcase),
`EmptyState`/`ErrorNotice`/`DemoBadge`/`PageHeader`, `Button`/`Field`/`Badge`/`Surface`/`Dialog`/`Menu`/`Toaster`.

Imagery: `EntityImage` (`components/art/entity-image.tsx`) shows the provider's photo for an entity
(Qloo `properties.image.url`, https only) over the matching `ArtPlate`. The plate shows while loading, when
there is no image and on error. Campaign and marketing imagery stays generative.
