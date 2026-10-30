import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Compass, ShieldCheck } from "lucide-react";
import { ArtPlate } from "@/components/art/plate";
import { FeedbackForm } from "@/components/help/feedback-form";
import { DemoBadge } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { SectionTitle, Surface } from "@/components/ui/surface";
import { getCtx } from "@/lib/data/workspace";
import { EVIDENCE_LABEL } from "@/lib/evidence-labels";
import { safeInternalPath } from "@/lib/safe-path";
import { STAGES } from "@/lib/stages";

export const metadata: Metadata = { title: "Help & feedback" };

const SHORTCUTS: [string[], string][] = [
  [["⌘", "K"], "Open the command palette (Ctrl K on Windows and Linux)"],
  [["↑", "↓"], "Move through palette results"],
  [["↵"], "Open the highlighted result"],
  [["Esc"], "Close the palette, dialogs and menus"],
  [["Tab"], "Move between controls — every action is keyboard reachable"],
];

const FAQ: [string, ReactNode][] = [
  [
    "Where does the cultural data come from?",
    <>Live research calls the Qloo Insights API from the server. Every request is stored with its parameters and retrieval time, so each provider observation can be traced back to the call that produced it. If Qloo isn’t configured, live research is unavailable — it never silently falls back to sample data.</>,
  ],
  [
    "What is demonstration data?",
    <>When an administrator enables demonstration mode, campaigns can run against fixture data so you can explore the workflow. Anything derived from it carries a <DemoBadge className="mx-0.5 align-middle" /> label everywhere it appears, including reports. Demonstration mode is always off in production.</>,
  ],
  [
    "Is the AI making things up?",
    <>AI output is always labelled as AI interpretation and linked to the evidence it was given. Treat it as a reading of the evidence, not as evidence. Without an LLM key, CultureCrash uses a clearly labelled template engine instead of a model.</>,
  ],
  [
    "Who can see my campaigns?",
    <>Only members of the workspace they belong to. Workspaces are isolated by Postgres Row Level Security, and client brand memory never crosses between clients. Shared report links are read-only snapshots that can be revoked.</>,
  ],
  [
    "Why can’t I edit something?",
    <>Your role decides what you can change: viewers are read-only, members create and edit work, admins manage the team, integrations and approvals. See <Link href="/settings/team" className="underline underline-offset-2">Team settings</Link>.</>,
  ],
  [
    "A research run failed. What now?",
    <>Open the <Link href="/tasks" className="underline underline-offset-2">task center</Link>. Failed runs show the provider’s error and a Retry button that takes you to the campaign’s research canvas. Partial results are never presented as complete.</>,
  ],
  [
    "How do I get billed?",
    <>You don’t, yet. CultureCrash is offered as a free pilot and payments are not configured. See <Link href="/pricing#pilot" className="underline underline-offset-2">pilot terms</Link>.</>,
  ],
];

export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const sp = await searchParams;
  const fromRaw = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const from = fromRaw ? safeInternalPath(fromRaw.slice(0, 300), "") || null : null;
  await getCtx();

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 sm:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-stretch">
        <div className="flex flex-col justify-end py-4">
          <p className="cc-eyebrow text-muted">Help &amp; feedback</p>
          <h1 className="cc-display mt-4 text-6xl md:text-7xl">How CultureCrash<br />knows what it knows.</h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            Every claim in CultureCrash carries a label that says where it came from. Learn to read them, find your way around, and tell us what to improve.
          </p>
        </div>
        <div className="relative min-h-[280px] overflow-hidden rounded-[36px] bg-charcoal p-7 text-white">
          <ArtPlate theme="culture" seed="help" rounded={false} className="absolute inset-0 opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/60 to-transparent" />
          <ol className="relative grid h-full content-end gap-2 sm:grid-cols-5">
            {STAGES.map((s) => (
              <li key={s.key} className="rounded-cc border border-white/15 bg-white/5 p-3 backdrop-blur">
                <p className="font-mono text-[10px] text-white/50">{s.number}</p>
                <p className="mt-0.5 text-[13px] font-medium">{s.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-white/60">{s.summary}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-12 grid gap-5 lg:grid-cols-12" aria-labelledby="evidence-title">
        <div className="lg:col-span-4">
          <p className="cc-eyebrow text-muted">Data honesty</p>
          <h2 id="evidence-title" className="cc-display mt-3 text-4xl">Six kinds of evidence</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            CultureCrash never blends these together. Strategy and reports cite each item with its label, so a reader can tell an observation from an interpretation.
          </p>
          <p className="mt-4 flex items-start gap-2 text-[13px] text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet" /> Counts and statuses shown anywhere in the app come from saved records only — no estimates dressed up as data.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-8">
          {Object.entries(EVIDENCE_LABEL).map(([key, e]) => (
            <li key={key} className="rounded-cc-lg border border-line bg-paper p-5">
              <Badge tone={e.tone}>{e.label}</Badge>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{e.explain}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 grid gap-5 lg:grid-cols-12">
        <Surface className="p-6 lg:col-span-5">
          <SectionTitle eyebrow="Keyboard" title="Shortcuts" />
          <ul className="mt-4 divide-y divide-line">
            {SHORTCUTS.map(([keys, label]) => (
              <li key={label} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
                <span className="text-muted">{label}</span>
                <span className="flex shrink-0 gap-1">
                  {keys.map((k) => <kbd key={k} className="min-w-6 rounded-md border border-line bg-ivory px-1.5 py-0.5 text-center font-mono text-[11px]">{k}</kbd>)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-[12px] text-muted"><Compass className="mt-0.5 size-3.5 shrink-0" /> Navigation lives in the floating command bar: search, project switcher, tasks and your account menu.</p>
        </Surface>

        <Surface className="p-6 lg:col-span-7">
          <SectionTitle eyebrow="FAQ" title="Common questions" />
          <div className="mt-3 divide-y divide-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 text-[13px] leading-relaxed text-muted">{a}</div>
              </details>
            ))}
          </div>
        </Surface>
      </section>

      <section id="feedback" className="mt-12 grid scroll-mt-24 gap-5 lg:grid-cols-12" aria-labelledby="feedback-title">
        <div className="lg:col-span-4">
          <p className="cc-eyebrow text-muted">Feedback</p>
          <h2 id="feedback-title" className="cc-display mt-3 text-4xl">Tell us what to fix.</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            Feedback is stored with your account and workspace so we can follow up. Only you and the product team can read it.
          </p>
        </div>
        <Surface className="p-6 lg:col-span-8">
          <FeedbackForm fromPage={from} />
        </Surface>
      </section>
    </div>
  );
}
