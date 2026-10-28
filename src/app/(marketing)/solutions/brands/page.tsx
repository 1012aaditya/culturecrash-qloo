import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Globe2, Handshake, Layers, ScanSearch, Target } from "lucide-react";
import { ArtPlate, type PlateTheme } from "@/components/art/plate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "For brand teams",
  description:
    "CultureCrash for in-house brand, marketing and consumer insights teams: audience understanding, market entry, positioning and agency briefing grounded in evidence.",
};

const useCases: { icon: typeof Compass; title: string; body: string; question: string; theme?: PlateTheme; className: string }[] = [
  {
    icon: Globe2,
    title: "Entering a new market",
    question: "What does our audience care about in a market we don't know yet?",
    body: "Map the cultural adjacencies of an audience in a new city or country — brands, music, places, food — before committing a launch plan.",
    theme: "travel",
    className: "md:col-span-7 md:row-span-2",
  },
  {
    icon: Target,
    title: "Repositioning",
    question: "Where can we credibly stand that competitors don't already own?",
    body: "Compare the associations around your brand and competitors, then develop positioning alternatives with explicit trade-offs.",
    className: "md:col-span-5",
  },
  {
    icon: ScanSearch,
    title: "Audience deep-dives",
    question: "Who is this segment beyond its demographics?",
    body: "Go past age and income to the tastes that co-occur with an audience, with every data point traceable to its provider.",
    className: "md:col-span-5",
  },
  {
    icon: Layers,
    title: "Launch and product naming",
    question: "Which cultural territory fits this product?",
    body: "Test candidate territories as hypotheses, then design fair experiments before the budget is committed.",
    theme: "food",
    className: "md:col-span-5",
  },
  {
    icon: Handshake,
    title: "Briefing your agencies",
    question: "How do we give our agencies a sharper starting point?",
    body: "Share a cited research report and creative brief so agency work starts from the same evidence your team reviewed.",
    className: "md:col-span-7 justify-end bg-lilac/40",
  },
];

export default function BrandsPage() {
  return (
    <>
      {/* HERO */}
      <section className="cc-atmosphere relative overflow-hidden pt-28 sm:pt-36">
        <div className="relative mx-auto grid max-w-[1320px] gap-10 px-5 pb-20 md:px-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div className="relative order-2 h-[380px] lg:order-1 lg:h-[540px]" aria-hidden="true">
            <ArtPlate theme="sustainability" seed="brands-hero" className="absolute left-0 top-0 h-[82%] w-[70%] rounded-[36px]" />
            <ArtPlate theme="beauty" seed="brands-hero-2" className="absolute bottom-0 right-0 h-[52%] w-[46%] rounded-[28px] shadow-[0_30px_60px_-30px_rgba(23,21,30,0.6)]" />
            <div className="cc-glass absolute bottom-[8%] left-[6%] max-w-[240px] rounded-cc p-4">
              <p className="cc-eyebrow text-[10px] text-muted">Your question</p>
              <p className="mt-2 text-[14px] font-medium leading-snug">Who are our customers beyond the category?</p>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="cc-eyebrow text-muted">Solutions · Brand & insights teams</p>
            <h1 className="cc-display mt-6 text-[52px] sm:text-[72px] xl:text-[84px]">
              Know your audience through what they <em className="text-violet">love.</em>
            </h1>
            <p className="mt-7 max-w-lg text-[17px] leading-relaxed text-muted">
              For in-house brand, marketing and consumer insights teams who need cultural context they can defend —
              to leadership, to agencies and to themselves.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/signup">Start a campaign <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/pricing#pilot">Request a pilot</Link></Button>
            </div>
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="brand-uses-title">
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
          <h2 id="brand-uses-title" className="cc-display text-5xl md:text-6xl">The questions brand teams bring.</h2>
          <p className="max-w-md text-[15px] leading-relaxed text-muted md:justify-self-end">
            Each starts as a brief and moves through the same five stages: explore, interpret, create, test, track.
          </p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-12">
          {useCases.map(({ icon: Icon, title, body, question, theme, className }) => (
            <article key={title} className={cn("relative flex flex-col overflow-hidden rounded-cc-lg border border-line", !className.includes("bg-") && "bg-paper", className)}>
              {theme && <ArtPlate theme={theme} seed={title} rounded={false} className="h-48 md:h-auto md:min-h-[220px] md:flex-1" />}
              <div className="p-6">
                <div className="flex items-center gap-2 text-violet">
                  <Icon className="size-4" />
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em]">{title}</h3>
                </div>
                <p className={cn("cc-display mt-4", theme ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl")}>&ldquo;{question}&rdquo;</p>
                <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-muted">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* DEFENSIBLE */}
      <section className="relative overflow-hidden bg-charcoal py-24 text-white md:py-32" aria-labelledby="defensible-title">
        <div className="pointer-events-none absolute -right-40 top-0 size-[560px] rounded-full bg-violet/25 blur-[140px]" />
        <div className="relative mx-auto grid max-w-[1320px] gap-14 px-5 md:px-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="cc-eyebrow text-white/45">Inside a larger organisation</p>
            <h2 id="defensible-title" className="cc-display mt-5 text-5xl md:text-7xl">Recommendations that survive the steering committee.</h2>
          </div>
          <ul className="space-y-8 self-end">
            {[
              ["Clear provenance", "Observed data, sourced evidence and AI interpretation are labelled differently everywhere, including exported reports."],
              ["Honest limits", "Affinity describes correlation in taste. CultureCrash does not present it as purchase intent or proof a campaign will work."],
              ["Decisions on record", "Who approved a conclusion, and on what evidence, is kept with the project."],
            ].map(([t, b]) => (
              <li key={t} className="border-l border-lavender/40 pl-6">
                <h3 className="text-lg font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/65">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32">
        <div className="grid items-end gap-10 md:grid-cols-[1.5fr_1fr]">
          <div>
            <Compass className="size-6 text-violet" />
            <h2 className="cc-display mt-6 text-5xl md:text-7xl">Bring one real question.</h2>
          </div>
          <div>
            <p className="text-[15px] leading-relaxed text-muted">
              The best way to judge CultureCrash is on a brief you already understand. Start one yourself, or request a
              guided pilot.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/pricing#pilot">Request a pilot <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/solutions/agencies">Agency solutions</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
