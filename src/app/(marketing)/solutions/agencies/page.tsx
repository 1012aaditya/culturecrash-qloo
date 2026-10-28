import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookMarked, FileCheck2, FolderLock, Presentation, Users } from "lucide-react";
import { ArtPlate } from "@/components/art/plate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "For agencies",
  description:
    "CultureCrash for independent branding and advertising agencies: faster pitch research, client workspaces with brand memory, and reports with citations.",
};

const moments = [
  {
    eyebrow: "Monday · brief lands",
    title: "Pitch research in days, not a fortnight.",
    body: "Turn the RFP into a structured brief, run cultural research on the audience and markets, and arrive at the chemistry meeting with three distinct directions — each showing the evidence it stands on.",
    theme: "music" as const,
  },
  {
    eyebrow: "Mid-project · client asks “why?”",
    title: "Answer with the source, not a hunch.",
    body: "Every claim in a strategy or creative brief traces to an observation, a source or a labelled interpretation. When a client challenges a direction, open the evidence instead of the deck history.",
    theme: "beauty" as const,
  },
  {
    eyebrow: "After launch · learning",
    title: "Keep what you learn per client.",
    body: "Experiment results and approved conclusions are stored in the client's workspace, ready for the next brief — not lost in someone's drive when they move on.",
    theme: "travel" as const,
  },
];

const features = [
  { icon: FolderLock, title: "Client workspaces", body: "Each client's briefs, evidence, conversations and reports are isolated by workspace permissions and database-level row security." },
  { icon: BookMarked, title: "Brand memory", body: "Approved guidelines, tone, previous positioning and exclusions stored per client and used as context for that client only." },
  { icon: FileCheck2, title: "Reports with citations", body: "Versioned, editorial reports with sources and evidence labels intact, shareable through expiring read-only links." },
  { icon: Users, title: "Roles for real teams", body: "Owners, strategists and reviewers with the permissions they need — and an activity history of who changed what." },
  { icon: Presentation, title: "Pitch-ready output", body: "Strategy comparisons and creative briefs structured to drop into your own presentation craft, not replace it." },
];

const roles = [
  ["Agency founders", "See the reasoning behind every recommendation before it reaches a client."],
  ["Strategy directors", "Review evidence, approve conclusions and keep standards consistent across accounts."],
  ["Brand & creative strategists", "Spend time on interpretation and ideas instead of tab-wrangling and copy-paste."],
  ["Planning & account teams", "Answer client questions quickly with sources at hand."],
];

export default function AgenciesPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-charcoal pt-28 text-white sm:pt-36">
        <ArtPlate theme="fashion" seed="agencies-hero" rounded={false} className="absolute inset-y-0 right-0 hidden w-[46%] opacity-90 lg:block" />
        <div className="pointer-events-none absolute inset-y-0 right-[30%] hidden w-[30%] bg-gradient-to-r from-charcoal to-transparent lg:block" />
        <div className="pointer-events-none absolute -left-40 bottom-0 size-[520px] rounded-full bg-violet/25 blur-[140px]" />
        <div className="relative mx-auto max-w-[1320px] px-5 pb-24 md:px-10 md:pb-32">
          <p className="cc-eyebrow text-white/50">Solutions · Independent agencies</p>
          <h1 className="cc-display mt-6 max-w-3xl text-[52px] sm:text-[72px] xl:text-[88px]">
            Big-agency research depth, at <em className="text-lavender">independent</em> speed.
          </h1>
          <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-white/70">
            Built first for branding and advertising agencies of roughly 5–50 people — teams where the strategist is
            also the researcher, the planner and often the person presenting.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="inverse"><Link href="/pricing#pilot">Request an agency pilot <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="ghost-dark"><Link href="/showcase">See a sample campaign</Link></Button>
          </div>
          <ArtPlate theme="fashion" seed="agencies-hero" className="mt-12 h-56 lg:hidden" />
        </div>
      </section>

      {/* MOMENTS */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="moments-title">
        <p className="cc-eyebrow text-muted">Where it earns its place</p>
        <h2 id="moments-title" className="cc-display mt-4 max-w-3xl text-5xl md:text-6xl">Three moments in an agency&rsquo;s week.</h2>
        <div className="mt-16 space-y-20 md:space-y-28">
          {moments.map((m, i) => (
            <article
              key={m.title}
              className={cn("grid items-center gap-8 md:gap-14", i % 2 === 0 ? "md:grid-cols-[1.3fr_1fr]" : "md:grid-cols-[1fr_1.3fr]")}
            >
              <ArtPlate
                theme={m.theme}
                seed={`moment-${i}`}
                className={cn("h-[280px] rounded-[28px] md:h-[400px]", i % 2 === 1 && "md:order-2")}
              />
              <div className={cn("max-w-md", i % 2 === 1 && "md:order-1 md:justify-self-end")}>
                <p className="cc-eyebrow text-violet">{m.eyebrow}</p>
                <h3 className="cc-display mt-4 text-4xl md:text-5xl">{m.title}</h3>
                <p className="mt-5 text-[15px] leading-relaxed text-muted">{m.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="border-y border-line bg-paper py-24 md:py-32" aria-labelledby="features-title">
        <div className="mx-auto grid max-w-[1320px] gap-14 px-5 md:px-10 lg:grid-cols-[1fr_1.7fr]">
          <div>
            <p className="cc-eyebrow text-muted">Agency workspace</p>
            <h2 id="features-title" className="cc-display mt-4 text-5xl md:text-6xl">Many clients. One way of working. No leaks.</h2>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-cc-lg border border-line bg-line sm:grid-cols-2">
            {features.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className={cn("bg-paper p-7", i === 0 && "sm:col-span-2 sm:bg-lilac/40")}>
                <Icon className="size-5 text-violet" />
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ROLES */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="roles-title">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 id="roles-title" className="cc-display text-5xl md:text-6xl">Who uses it inside the agency.</h2>
            <dl className="mt-12 divide-y divide-line border-y border-line">
              {roles.map(([role, body]) => (
                <div key={role} className="grid gap-2 py-6 sm:grid-cols-[220px_1fr] sm:gap-8">
                  <dt className="font-semibold tracking-tight">{role}</dt>
                  <dd className="text-[14px] leading-relaxed text-muted">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <aside className="self-end rounded-cc-lg bg-charcoal p-8 text-white">
            <Badge tone="glass">How pilots work</Badge>
            <h3 className="cc-display mt-6 text-4xl">Pilot on one live client project.</h3>
            <ol className="mt-6 space-y-4 text-[14px] leading-relaxed text-white/70">
              <li><span className="mr-2 font-mono text-xs text-lavender">01</span>Pick a real brief — a pitch or an active account.</li>
              <li><span className="mr-2 font-mono text-xs text-lavender">02</span>Run it through all five stages with your own team.</li>
              <li><span className="mr-2 font-mono text-xs text-lavender">03</span>Judge the output against how you would have done it.</li>
            </ol>
            <p className="mt-6 text-[13px] text-white/50">Paid plans are not available yet; pilots are free while billing is set up.</p>
            <Button asChild variant="inverse" className="mt-6"><Link href="/pricing#pilot">Request a pilot <ArrowRight /></Link></Button>
          </aside>
        </div>
      </section>

      {/* CROSS LINK */}
      <section className="mx-auto max-w-[1320px] px-5 pb-24 md:px-10 md:pb-32">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] border border-line bg-ivory-2/60 p-8 md:flex-row md:items-center md:p-10">
          <p className="cc-display max-w-xl text-3xl md:text-4xl">Working in-house instead?</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline"><Link href="/solutions/brands">CultureCrash for brand teams</Link></Button>
            <Button asChild variant="ghost"><Link href="/product">How the product works <ArrowRight /></Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
