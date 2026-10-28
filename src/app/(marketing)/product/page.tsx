import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  FileText,
  FlaskConical,
  Lightbulb,
  MessageSquareText,
  Network,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import { ArtPlate } from "@/components/art/plate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STAGES } from "@/lib/stages";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Product",
  description:
    "How CultureCrash turns a campaign brief into cited cultural research, labelled interpretation, strategic alternatives and fair experiments.",
};

const capabilities = [
  {
    icon: NotebookPen,
    title: "Brief intake",
    body: "Structured campaign briefs — objective, audience, markets, competitors, constraints — validated before any research runs, so the questions are clear first.",
    className: "md:col-span-5",
  },
  {
    icon: Network,
    title: "Live cultural research",
    body: "Qloo taste data retrieved per brief and stored with the request, parameters and retrieval time. The network you explore is drawn from those records, not decoration.",
    className: "md:col-span-7 md:row-span-2 bg-charcoal text-white border-transparent",
    dark: true,
    art: "culture" as const,
  },
  {
    icon: BookOpenCheck,
    title: "Evidence ledger",
    body: "Every observation, source and interpretation in one place, each labelled by type, with gaps and contradictions surfaced rather than smoothed over.",
    className: "md:col-span-5",
  },
  {
    icon: Lightbulb,
    title: "Opportunity explorer",
    body: "Territories written as hypotheses, each listing the observations behind it and what is still unknown.",
    className: "md:col-span-4",
  },
  {
    icon: Sparkles,
    title: "Strategy studio",
    body: "Three distinct positioning directions with trade-offs, compared side by side and edited with version history.",
    className: "md:col-span-4",
  },
  {
    icon: FileText,
    title: "Creative brief",
    body: "An editable creative brief generated from the selected direction, with claims linked to their evidence.",
    className: "md:col-span-4",
  },
  {
    icon: FlaskConical,
    title: "Experiment planner",
    body: "Hypotheses, variants, metrics and decision thresholds agreed before results arrive. Results are entered by your team.",
    className: "md:col-span-6",
  },
  {
    icon: MessageSquareText,
    title: "Project copilot",
    body: "An assistant grounded in the project's stored records. It cites what it uses and says when the project doesn't contain an answer.",
    className: "md:col-span-3",
  },
  {
    icon: Building2,
    title: "Client brand memory",
    body: "Approved guidelines and prior work kept per client, isolated from every other client in the workspace.",
    className: "md:col-span-3",
  },
];

const ladder = [
  { label: "Observed data", body: "Values a provider such as Qloo returned for a specific request, stored with parameters and retrieval time.", tone: "bg-ink text-white", width: "md:w-full" },
  { label: "Sourced evidence", body: "Public material with a URL and access date. Quotations are never invented.", tone: "bg-charcoal-2 text-white", width: "md:w-[94%]" },
  { label: "AI interpretation", body: "A model's reading of the stored evidence — always labelled, attributable and editable.", tone: "bg-violet text-white", width: "md:w-[86%]" },
  { label: "Strategic hypothesis", body: "A proposed direction or opportunity. Useful for decisions; unproven until tested.", tone: "bg-lilac text-violet-ink", width: "md:w-[78%]" },
  { label: "Experiment result", body: "What a test actually measured, entered by your team with its method.", tone: "bg-peach/70 text-[#6b2e19]", width: "md:w-[70%]" },
  { label: "Validated conclusion", body: "A finding a person on your team has reviewed and approved, with their name on it.", tone: "bg-paper text-ink border border-line", width: "md:w-[62%]" },
];

const principles = [
  ["No invented data", "If a provider returns nothing, the workspace shows an empty result and says so. Gaps are not filled with plausible-sounding numbers."],
  ["Correlation, not causation", "Affinity scores describe how tastes co-occur. They are not evidence of purchase intent, campaign effectiveness or cause."],
  ["Labels travel with claims", "Whether a statement is observed, sourced, interpreted or hypothesised stays attached to it — into strategies, briefs and exported reports."],
  ["Demonstration data is marked", "Sample projects and fixture records carry a visible demonstration label everywhere they appear, including exports."],
  ["People approve conclusions", "Nothing becomes a validated conclusion automatically. A team member reviews it and the approval is recorded."],
  ["No guarantees", "CultureCrash supports judgement. It does not promise campaign success or remove cultural risk."],
];

export default function ProductPage() {
  return (
    <>
      {/* HERO */}
      <section className="cc-atmosphere relative overflow-hidden pt-28 sm:pt-36">
        <div className="relative mx-auto grid max-w-[1320px] gap-12 px-5 pb-20 md:px-10 lg:grid-cols-[1.15fr_1fr] lg:items-end">
          <div>
            <p className="cc-eyebrow text-muted">Product</p>
            <h1 className="cc-display mt-6 text-[52px] sm:text-[72px] xl:text-[88px]">
              A strategy workspace that <em className="text-violet">shows its working.</em>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-muted">
              CultureCrash takes a campaign brief through cultural research, evidence synthesis, positioning, creative
              direction and experiments — keeping every claim connected to the data or source behind it.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Start a campaign <ArrowRight /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/showcase">See the sample campaign</Link>
              </Button>
            </div>
          </div>
          <div className="relative h-[420px] sm:h-[480px]" aria-hidden="true">
            <ArtPlate theme="beauty" seed="product-hero" className="absolute right-0 top-0 h-[78%] w-[64%] rounded-[36px] shadow-[0_40px_80px_-30px_rgba(23,21,30,0.55)]" />
            <ArtPlate theme="music" seed="product-hero-2" className="absolute bottom-0 left-0 h-[52%] w-[42%] rounded-[28px]" />
            <div className="cc-glass absolute bottom-[12%] right-[6%] w-[58%] max-w-[300px] rounded-cc p-4">
              <p className="cc-eyebrow text-[10px] text-muted">Every record carries</p>
              <ul className="mt-3 space-y-2 text-[13px]">
                <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-ink" /> Provider & request parameters</li>
                <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-violet" /> Retrieval time</li>
                <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-coral" /> Evidence type label</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="capabilities-title">
        <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-end">
          <div>
            <p className="cc-eyebrow text-muted">Capabilities</p>
            <h2 id="capabilities-title" className="cc-display mt-4 text-5xl md:text-6xl">One connected chain, brief to outcome.</h2>
          </div>
          <p className="max-w-lg text-[15px] leading-relaxed text-muted md:justify-self-end">
            Each capability reads from and writes to the same project, so research informs opportunities, opportunities
            inform strategy, and strategy informs the tests that check it.
          </p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-12">
          {capabilities.map(({ icon: Icon, title, body, className, dark, art }) => (
            <article
              key={title}
              className={cn("relative flex min-h-[200px] flex-col overflow-hidden rounded-cc-lg border border-line bg-paper p-6", className)}
            >
              {art && <ArtPlate theme={art} seed="capability-network" rounded={false} className="absolute inset-0 opacity-60" />}
              <div className="relative flex h-full flex-col">
                <Icon className={cn("size-5", dark ? "text-lavender" : "text-violet")} />
                <h3 className={cn("mt-6 font-semibold tracking-tight", dark ? "cc-display text-5xl font-normal md:mt-auto" : "text-lg")}>{title}</h3>
                <p className={cn("mt-2 max-w-md text-[14px] leading-relaxed", dark ? "text-white/75" : "text-muted")}>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="relative overflow-hidden bg-charcoal py-24 text-white md:py-32" aria-labelledby="stages-title">
        <div className="pointer-events-none absolute -left-40 top-20 size-[520px] rounded-full bg-violet/25 blur-[140px]" />
        <div className="pointer-events-none absolute -right-20 bottom-0 size-[420px] rounded-full bg-peach/15 blur-[120px]" />
        <div className="relative mx-auto max-w-[1320px] px-5 md:px-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <div>
              <p className="cc-eyebrow text-white/45">The workflow</p>
              <h2 id="stages-title" className="cc-display mt-5 text-5xl md:text-7xl">Five stages. Every campaign.</h2>
            </div>
            <p className="max-w-md text-[15px] leading-relaxed text-white/65 lg:justify-self-end">
              Move between stages freely. CultureCrash tells you what is missing — a thin brief, an untested
              hypothesis — rather than locking you out.
            </p>
          </div>
          <ol className="mt-16 divide-y divide-white/10 border-y border-white/10">
            {STAGES.map((s, i) => (
              <li key={s.key} className="grid gap-4 py-8 md:grid-cols-[90px_1.1fr_1.4fr_auto] md:items-baseline md:gap-8">
                <span className="font-mono text-sm text-white/45">{s.number}</span>
                <h3 className={cn("cc-display text-4xl md:text-5xl", i === 0 && "text-lavender")}>{s.label}</h3>
                <div>
                  <p className="text-[15px] leading-relaxed text-white/85">{s.summary}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/50">{s.detail}</p>
                </div>
                <ul className="flex flex-wrap gap-1.5 md:justify-end">
                  {s.routes.map((r) => (
                    <li key={r}>
                      <Badge tone="glass" className="font-mono text-[10px]">{r}</Badge>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* EVIDENCE LADDER */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="ladder-title">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.4fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="cc-eyebrow text-muted">The evidence ladder</p>
            <h2 id="ladder-title" className="cc-display mt-4 text-5xl md:text-6xl">Six kinds of claim, never blurred.</h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              Everything in a project sits on one rung. Strength of claim narrows as you climb down from what was
              observed to what has been concluded — and moving a claim down a rung takes evidence or a person&rsquo;s
              approval.
            </p>
          </div>
          <ol className="space-y-3">
            {ladder.map((rung, i) => (
              <li key={rung.label} className={cn("flex flex-col gap-2 rounded-cc-lg p-5 sm:flex-row sm:items-center sm:gap-6 md:ml-auto", rung.tone, rung.width)}>
                <span className="font-mono text-xs opacity-60">0{i + 1}</span>
                <h3 className="min-w-[180px] text-[17px] font-semibold tracking-tight">{rung.label}</h3>
                <p className="text-[13px] leading-relaxed opacity-80">{rung.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* GROUNDING */}
      <section className="border-y border-line bg-paper py-24 md:py-32" aria-labelledby="grounding-title">
        <div className="mx-auto max-w-[1320px] px-5 md:px-10">
          <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
            <h2 id="grounding-title" className="cc-display text-5xl md:text-6xl">
              Qloo supplies the signal. The language model reads only what was retrieved.
            </h2>
            <div className="space-y-4 self-end text-[15px] leading-relaxed text-muted">
              <p>
                Cultural affinity data comes from the Qloo Taste AI API: entities, tags and affinity scores for the
                audience and markets in your brief. Each response is stored as an observation before anything
                interprets it.
              </p>
              <p>
                The language model is then given those stored records — not the open internet, not its own memory of
                culture — and asked for structured output that cites record identifiers. Claims without a citation are
                labelled as interpretation.
              </p>
            </div>
          </div>

          <ol className="mt-16 grid gap-4 md:grid-cols-[1fr_1.2fr_1fr_1.3fr]">
            {[
              { n: "A", t: "Brief", b: "Audience, markets, category and competitors become explicit research questions.", c: "bg-ivory" },
              { n: "B", t: "Qloo retrieval", b: "Requests run server-side with your workspace's limits. Responses are stored with parameters and timestamps.", c: "bg-charcoal text-white" },
              { n: "C", t: "Observation store", b: "Entities and affinities become project records. Empty responses stay empty.", c: "bg-ivory" },
              { n: "D", t: "Grounded synthesis", b: "The model reads stored records only, cites them by ID, and its output is labelled as AI interpretation.", c: "bg-lilac/60" },
            ].map((step) => (
              <li key={step.n} className={cn("flex min-h-[220px] flex-col justify-between rounded-cc-lg border border-line p-6", step.c)}>
                <span className="font-mono text-xs opacity-60">{step.n}</span>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">{step.t}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed opacity-75">{step.b}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-muted">
            Retrieved webpages and uploaded documents are treated as content to analyse, never as instructions. They
            cannot change how the assistant behaves or what it is allowed to access.
          </p>
        </div>
      </section>

      {/* PRINCIPLES */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="principles-title">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="cc-eyebrow text-muted">Data honesty</p>
            <h2 id="principles-title" className="cc-display mt-4 text-5xl md:text-6xl">What we will not do with your data.</h2>
            <ArtPlate theme="architecture" seed="principles" className="mt-10 hidden h-[280px] lg:block" />
          </div>
          <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {principles.map(([title, body], i) => (
              <div key={title} className={cn("border-t border-line pt-5", i % 2 === 1 && "sm:mt-10")}>
                <dt className="text-lg font-semibold tracking-tight">{title}</dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden pb-24 md:pb-32">
        <div className="mx-auto max-w-[1320px] px-5 md:px-10">
          <div className="relative grid overflow-hidden rounded-[32px] bg-charcoal text-white md:grid-cols-[1.4fr_1fr]">
            <div className="relative z-10 p-8 md:p-14">
              <h2 className="cc-display text-5xl md:text-7xl">Run it on a live brief.</h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/65">
                Create a workspace and start a campaign, or ask for a guided pilot on a real client project.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="inverse"><Link href="/signup">Start a campaign <ArrowRight /></Link></Button>
                <Button asChild size="lg" variant="ghost-dark"><Link href="/pricing#pilot">Request a pilot</Link></Button>
              </div>
            </div>
            <ArtPlate theme="youth" seed="product-cta" rounded={false} className="h-56 md:h-auto" />
          </div>
        </div>
      </section>
    </>
  );
}
