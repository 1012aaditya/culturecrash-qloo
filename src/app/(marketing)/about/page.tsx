import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ArtPlate } from "@/components/art/plate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description: "Why CultureCrash exists and the principles behind how it handles cultural data, AI and strategy.",
};

const principles = [
  { n: "01", t: "Evidence before eloquence", b: "A well-written recommendation with no visible basis is a liability. We design for traceability first, then polish." },
  { n: "02", t: "Label the machine", b: "AI output is useful and fallible. It is always marked as interpretation, and people decide what becomes a conclusion." },
  { n: "03", t: "Correlation is not a forecast", b: "Taste data shows what tends to go together. We will not dress it up as prediction, intent or guaranteed impact." },
  { n: "04", t: "Empty is an answer", b: "When research returns nothing, the honest output is “nothing found”. We never fill gaps with plausible fiction." },
  { n: "05", t: "Clients stay separate", b: "Agencies hold their clients' trust. Briefs, evidence and brand memory are isolated per client by design." },
  { n: "06", t: "Strategists stay in charge", b: "CultureCrash removes research drudgery; it doesn't replace the judgement, taste and craft agencies are hired for." },
];

export default function AboutPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden pt-28 sm:pt-36">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 pb-20 md:px-10 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div>
            <p className="cc-eyebrow text-muted">About CultureCrash</p>
            <h1 className="cc-display mt-6 text-[52px] sm:text-[76px] xl:text-[96px]">
              Culture is evidence. We built a place to <em className="text-violet">treat it that way.</em>
            </h1>
          </div>
          <p className="max-w-md text-[16px] leading-relaxed text-muted">
            CultureCrash is an early-stage product for brand and creative teams. It brings cultural research, strategy
            and experimentation into one workspace — and keeps the line between what is known and what is guessed
            visible the whole way through.
          </p>
        </div>
      </section>

      {/* STORY */}
      <section className="relative overflow-hidden bg-charcoal py-24 text-white md:py-32" aria-labelledby="why-title">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 md:px-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <ArtPlate theme="culture" seed="about-story" className="h-[320px] rounded-[32px] md:h-[460px]" />
          <div className="space-y-6 text-[16px] leading-relaxed text-white/70">
            <p className="cc-eyebrow text-white/45">Why it exists</p>
            <h2 id="why-title" className="cc-display text-5xl text-white md:text-6xl">The work deserved better tools.</h2>
            <p>
              Cultural strategy is some of the most valuable work an agency does, and some of the most fragile. Research
              is scattered across tools and tabs, insights get paraphrased from slide to slide, and by the time a
              recommendation reaches a client its origins are hard to reconstruct.
            </p>
            <p>
              Language models made it easy to produce confident-sounding strategy at speed. That raised the stakes:
              without provenance, it is harder than ever to tell an insight from an invention.
            </p>
            <p className="text-white">
              CultureCrash pairs licensed cultural affinity data with grounded AI and a disciplined workflow, so speed
              doesn&rsquo;t come at the cost of honesty.
            </p>
          </div>
        </div>
      </section>

      {/* PRINCIPLES */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="about-principles-title">
        <p className="cc-eyebrow text-muted">Principles</p>
        <h2 id="about-principles-title" className="cc-display mt-4 max-w-3xl text-5xl md:text-6xl">Six commitments that shape the product.</h2>
        <ol className="mt-14 grid gap-4 md:grid-cols-6">
          {principles.map((p, i) => (
            <li
              key={p.n}
              className={cn(
                "flex min-h-[220px] flex-col justify-between rounded-cc-lg border border-line p-7",
                i === 0 && "bg-lilac/50 md:col-span-4",
                i === 1 && "bg-paper md:col-span-2",
                i === 2 && "bg-paper md:col-span-2",
                i === 3 && "bg-peach/30 md:col-span-2",
                i === 4 && "bg-paper md:col-span-2",
                i === 5 && "border-transparent bg-charcoal text-white md:col-span-6 md:min-h-[260px]",
              )}
            >
              <span className={cn("font-mono text-xs", i === 5 ? "text-white/50" : "text-muted")}>{p.n}</span>
              <div className={cn(i === 5 && "md:max-w-3xl")}>
                <h3 className={cn("cc-display", i === 0 || i === 5 ? "text-4xl md:text-5xl" : "text-3xl")}>{p.t}</h3>
                <p className={cn("mt-3 max-w-xl text-[14px] leading-relaxed", i === 5 ? "text-white/70" : "text-muted")}>{p.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* STAGE */}
      <section className="border-y border-line bg-paper py-20" aria-labelledby="stage-title">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 md:px-10 lg:grid-cols-[1fr_1.4fr]">
          <h2 id="stage-title" className="cc-display text-4xl md:text-5xl">Where we are today.</h2>
          <div className="space-y-4 text-[15px] leading-relaxed text-muted">
            <p>
              CultureCrash is in its pilot stage. We are working with a small number of teams on real briefs, and the
              product changes quickly as a result. Paid plans are not yet available.
            </p>
            <p>
              Cultural data is provided by Qloo and used under its terms. CultureCrash is an independent product and is
              not affiliated with or endorsed by the data providers it integrates with.
            </p>
            <p>
              Questions, feedback or something broken? Visit <Link href="/help" className="text-ink underline underline-offset-2">help &amp; feedback</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <h2 className="cc-display max-w-2xl text-5xl md:text-7xl">See the principles in practice.</h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/showcase">Open the showcase <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pricing#pilot">Request a pilot</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
