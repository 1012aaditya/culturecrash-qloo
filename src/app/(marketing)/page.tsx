import Link from "next/link";
import { ArrowRight, ArrowUpRight, Compass, FlaskConical, Layers, Lightbulb, Scale, Users } from "lucide-react";
import { ArtPlate } from "@/components/art/plate";
import { HeroComposition } from "@/components/marketing/hero-composition";
import { Button } from "@/components/ui/button";
import { STAGES } from "@/lib/stages";
import { cn } from "@/lib/utils";

const useCases = [
  { icon: Compass, title: "Brand positioning", body: "Pressure-test where a brand can credibly stand, using the cultural adjacencies of the people it wants to reach.", span: "md:col-span-7", theme: "fashion" as const },
  { icon: Users, title: "Audience research", body: "Map the brands, music, places and interests that co-occur with an audience — with provider and retrieval time on every point.", span: "md:col-span-5" },
  { icon: Lightbulb, title: "Cultural opportunity discovery", body: "Surface territories worth investigating, each written as a hypothesis with the evidence and unknowns attached.", span: "md:col-span-4" },
  { icon: Scale, title: "Competitive differentiation", body: "See which cultural associations competitors already own, and where the brief could build something distinct.", span: "md:col-span-4" },
  { icon: Layers, title: "Creative brief development", body: "Turn a selected direction into an editable brief whose claims trace back to sources.", span: "md:col-span-4" },
  { icon: FlaskConical, title: "Campaign experimentation", body: "Design fair tests with decision thresholds set in advance, then record what actually happened.", span: "md:col-span-12", theme: "music" as const },
];

const ladder = [
  ["Observed data", "Values returned by a provider such as Qloo, stored with the request, parameters and retrieval time."],
  ["Sourced evidence", "Public material with a URL and access date. Quotations are never invented."],
  ["AI interpretation", "A model's reading of the evidence — labelled, attributable and editable."],
  ["Strategic hypothesis", "A proposed direction or opportunity. Useful, but unproven."],
  ["Experiment result", "What a test actually measured, entered by your team."],
  ["Validated conclusion", "A finding a person on your team has reviewed and approved."],
];

export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section className="cc-atmosphere relative overflow-hidden pt-28 sm:pt-32">
        <div className="pointer-events-none absolute -left-40 top-40 size-[420px] rounded-full bg-lavender/30 blur-[120px]" />
        <div className="relative mx-auto grid max-w-[1320px] items-center gap-6 px-5 pb-16 md:px-10 lg:grid-cols-[0.95fr_1.25fr]">
          <div className="relative z-10 max-w-xl">
            <p className="cc-eyebrow text-muted">Cultural intelligence · Campaign strategy</p>
            <h1 className="cc-display mt-6 text-[56px] text-ink sm:text-[76px] xl:text-[92px]">
              Turn cultural signals into <em className="text-violet">iconic</em> brands.
            </h1>
            <p className="mt-7 max-w-md text-[17px] leading-relaxed text-muted">
              CultureCrash helps brand and creative teams understand people through culture, discover meaningful
              opportunities, and turn evidence into strategy, creative direction and measurable experiments.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Start a campaign <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/product">Explore the product</Link>
              </Button>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-line pt-6 text-[12px]">
              <div><dt className="text-faint">Input</dt><dd className="mt-1 font-medium">A campaign brief</dd></div>
              <div><dt className="text-faint">Engine</dt><dd className="mt-1 font-medium">Qloo taste data + AI</dd></div>
              <div><dt className="text-faint">Output</dt><dd className="mt-1 font-medium">Cited strategy & tests</dd></div>
            </dl>
          </div>
          <HeroComposition />
        </div>
      </section>

      {/* PRODUCT INTRODUCTION */}
      <section className="relative overflow-hidden bg-charcoal py-24 text-white md:py-32">
        <div className="pointer-events-none absolute right-0 top-0 size-[600px] rounded-full bg-violet/20 blur-[140px]" />
        <div className="relative mx-auto grid max-w-[1320px] gap-14 px-5 md:px-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="cc-eyebrow text-white/45">The problem</p>
            <h2 className="cc-display mt-5 text-5xl md:text-7xl">
              Cultural research lives in tabs, decks and memory.
            </h2>
          </div>
          <div className="space-y-6 self-end text-[16px] leading-relaxed text-white/70">
            <p>
              A brief arrives. Strategists open research tools, spreadsheets, social feeds and chat windows. Findings get
              pasted into slides, and by the time a recommendation reaches the client, nobody can say which claim came
              from data and which came from a hunch.
            </p>
            <p className="text-white">
              CultureCrash keeps the whole chain in one workspace — from the brief, to the provider data, to the
              interpretation, to the decision — so every recommendation can show its working.
            </p>
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="workflow-title">
        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr] md:items-end">
          <div>
            <p className="cc-eyebrow text-muted">One workflow</p>
            <h2 id="workflow-title" className="cc-display mt-4 text-5xl md:text-6xl">Explore → Interpret → Create → Test → Track</h2>
          </div>
          <p className="max-w-lg text-[16px] leading-relaxed text-muted md:justify-self-end">
            The same five stages structure every campaign. Move freely between them — CultureCrash tells you what is
            missing rather than locking you out.
          </p>
        </div>
        <ol className="mt-14 grid gap-4 md:grid-cols-12">
          {STAGES.map((s, i) => (
            <li
              key={s.key}
              className={cn(
                "group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-cc-lg border border-line p-6",
                i === 0 && "bg-charcoal text-white md:col-span-5 md:row-span-2 md:min-h-[540px]",
                i === 1 && "bg-paper md:col-span-4",
                i === 2 && "bg-lilac/60 md:col-span-3",
                i === 3 && "bg-paper md:col-span-3",
                i === 4 && "bg-peach/35 md:col-span-4",
              )}
            >
              {i === 0 && <ArtPlate theme="culture" seed="explore" rounded={false} className="absolute inset-0 opacity-70" />}
              <div className="relative flex items-center justify-between">
                <span className={cn("font-mono text-xs", i === 0 ? "text-white/60" : "text-muted")}>{s.number}</span>
                <ArrowUpRight className={cn("size-4 opacity-40", i === 0 && "text-white")} />
              </div>
              <div className="relative">
                <h3 className={cn("cc-display", i === 0 ? "text-6xl" : "text-4xl")}>{s.label}</h3>
                <p className={cn("mt-3 text-[14px] leading-relaxed", i === 0 ? "text-white/75" : "text-muted")}>{s.summary}</p>
                {i === 0 && <p className="mt-3 text-[13px] leading-relaxed text-white/55">{s.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* PRODUCT PREVIEW */}
      <section className="bg-ivory-2/60 py-24 md:py-32" aria-labelledby="preview-title">
        <div className="mx-auto max-w-[1320px] px-5 md:px-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-xl">
              <p className="cc-eyebrow text-muted">Inside the workspace</p>
              <h2 id="preview-title" className="cc-display mt-4 text-5xl md:text-6xl">See the bigger cultural picture.</h2>
            </div>
            <Button asChild variant="outline">
              <Link href="/showcase">Open the interactive showcase <ArrowRight /></Link>
            </Button>
          </div>
          <Link href="/showcase" className="group mt-12 block overflow-hidden rounded-[32px] border border-line bg-paper shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3 text-[12px] text-muted">
              <span className="rounded-full bg-peach/50 px-2 py-0.5 text-[11px] font-medium text-[#8a3d22]">Demonstration data</span>
              Sample campaign “Skincare Launch” — fixture records, not live research.
            </div>
            <div className="grid md:grid-cols-[1.6fr_1fr]">
              <div className="relative h-[380px] overflow-hidden md:h-[460px]">
                <ArtPlate theme="culture" seed="preview" rounded={false} className="absolute inset-0 opacity-25" />
                <svg viewBox="0 0 800 460" className="absolute inset-0 size-full" aria-hidden="true">
                  {[[400, 230, 170, 110], [400, 230, 620, 90], [400, 230, 160, 360], [400, 230, 640, 350], [400, 230, 420, 70], [400, 230, 330, 400]].map(([x1, y1, x2, y2], i) => (
                    <path key={i} d={`M${x1} ${y1} Q ${(x1 + x2) / 2 + 30} ${(y1 + y2) / 2 - 30} ${x2} ${y2}`} stroke="#8064F5" strokeOpacity="0.45" fill="none" />
                  ))}
                  <circle cx="400" cy="230" r="70" fill="#B8A5FF" opacity="0.65" />
                  <circle cx="400" cy="230" r="44" fill="#8064F5" opacity="0.8" />
                  {[[170, 110], [620, 90], [160, 360], [640, 350], [420, 70], [330, 400]].map(([x, y], i) => (
                    <g key={i}>
                      <circle cx={x} cy={y} r="22" fill="#fff" stroke="#E9E5E1" />
                      <circle cx={x} cy={y} r="6" fill={i % 2 ? "#F29A8B" : "#8064F5"} />
                    </g>
                  ))}
                  <text x="400" y="234" textAnchor="middle" fill="#fff" fontSize="13" fontFamily="sans-serif">Audience</text>
                </svg>
              </div>
              <div className="border-t border-line p-6 md:border-l md:border-t-0">
                <p className="cc-eyebrow text-[10px] text-muted">Opportunity · hypothesis</p>
                <p className="cc-display mt-2 text-3xl">Routine-led self-expression</p>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
                  Every opportunity lists the observations it rests on, what remains unknown, and the experiment that
                  would validate it.
                </p>
                <div className="mt-6 space-y-2">
                  {["Provider observation", "AI interpretation", "Hypothesis to test"].map((t, i) => (
                    <div key={t} className="flex items-center justify-between rounded-cc-sm border border-line px-3 py-2.5 text-[12px]">
                      <span>{t}</span>
                      <span className={cn("size-2 rounded-full", i === 0 ? "bg-ink" : i === 1 ? "bg-violet" : "bg-coral")} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* USE CASES */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="usecases-title">
        <p className="cc-eyebrow text-muted">Use cases</p>
        <h2 id="usecases-title" className="cc-display mt-4 max-w-3xl text-5xl md:text-6xl">Built for the questions agencies are paid to answer.</h2>
        <div className="mt-14 grid gap-4 md:grid-cols-12">
          {useCases.map(({ icon: Icon, title, body, span, theme }) => (
            <article key={title} className={cn("relative overflow-hidden rounded-cc-lg border border-line bg-paper p-6", span, theme && "min-h-[260px] md:grid md:grid-cols-[1fr_1fr] md:gap-6")}>
              <div className="relative z-10 flex flex-col">
                <Icon className="size-5 text-violet" />
                <h3 className="mt-6 text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">{body}</p>
              </div>
              {theme && <ArtPlate theme={theme} seed={title} className="mt-6 h-48 md:mt-0 md:h-full" />}
            </article>
          ))}
        </div>
      </section>

      {/* EVIDENCE & TRUST */}
      <section className="border-y border-line bg-paper py-24 md:py-32" aria-labelledby="trust-title">
        <div className="mx-auto grid max-w-[1320px] gap-14 px-5 md:px-10 lg:grid-cols-[1fr_1.3fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="cc-eyebrow text-muted">Evidence & trust</p>
            <h2 id="trust-title" className="cc-display mt-4 text-5xl md:text-6xl">Every claim knows where it came from.</h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              Affinity data describes correlations in taste. It is not proof of purchase intent, campaign effectiveness
              or causation — and CultureCrash never presents it that way. When a provider returns nothing, we say so
              instead of filling the gap.
            </p>
          </div>
          <ol className="relative border-l border-line">
            {ladder.map(([title, body], i) => (
              <li key={title} className="relative pb-10 pl-10 last:pb-0">
                <span className="absolute -left-[13px] top-0 flex size-[26px] items-center justify-center rounded-full border border-line bg-ivory font-mono text-[10px] text-muted">
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 max-w-lg text-[14px] leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="pointer-events-none absolute inset-0 cc-atmosphere" />
        <div className="relative mx-auto grid max-w-[1320px] items-center gap-10 px-5 md:px-10 lg:grid-cols-[1.4fr_1fr]">
          <h2 className="cc-display text-6xl md:text-8xl">Bring your next brief.</h2>
          <div>
            <p className="text-[16px] leading-relaxed text-muted">
              Start a campaign in a few minutes, or talk to us about a pilot for your agency and a live client project.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/signup">Start a campaign <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/pricing#pilot">Request a pilot</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
