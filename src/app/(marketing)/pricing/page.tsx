import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CreditCard, Info } from "lucide-react";
import { ArtPlate } from "@/components/art/plate";
import { PilotRequestForm } from "@/components/marketing/pilot-request-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "CultureCrash plans — Pilot, Studio and Agency — with research-run, seat and project limits. Payment is not yet available; plans are currently offered as pilots.",
};

type Plan = {
  key: "pilot" | "studio" | "agency";
  name: string;
  who: string;
  limits: { label: string; value: string }[];
  includes: string[];
  className: string;
  dark?: boolean;
};

const plans: Plan[] = [
  {
    key: "pilot",
    name: "Pilot",
    who: "For a small team testing CultureCrash on one or two live briefs.",
    limits: [
      { label: "Research runs", value: "25 / day" },
      { label: "Seats", value: "3" },
      { label: "Active projects", value: "3" },
      { label: "Clients", value: "1" },
    ],
    includes: ["All five workflow stages", "Qloo-grounded research", "Reports with citations", "Shared read-only report links"],
    className: "lg:col-span-4",
  },
  {
    key: "studio",
    name: "Studio",
    who: "For independent agencies running several client accounts at once.",
    limits: [
      { label: "Research runs", value: "75 / day" },
      { label: "Seats", value: "10" },
      { label: "Active projects", value: "25" },
      { label: "Clients", value: "10" },
    ],
    includes: ["Everything in Pilot", "Client brand memory", "Roles & activity history", "Report versioning"],
    className: "lg:col-span-5 lg:-mt-8",
    dark: true,
  },
  {
    key: "agency",
    name: "Agency",
    who: "For agencies up to ~50 people with a dedicated strategy function.",
    limits: [
      { label: "Research runs", value: "200 / day" },
      { label: "Seats", value: "35" },
      { label: "Active projects", value: "Unlimited" },
      { label: "Clients", value: "Unlimited" },
    ],
    includes: ["Everything in Studio", "Configurable data retention", "Workspace-level usage limits", "Onboarding with your team"],
    className: "lg:col-span-3",
  },
];

const faqs = [
  ["Can I pay for a plan today?", "No. Billing is not configured yet, so there is no checkout and nothing to pay. Every workspace currently runs on pilot terms at no charge."],
  ["Why publish limits without prices?", "So you can judge whether a plan's shape fits your team. Prices will be published here before any billing starts, and nobody will be moved to a paid plan without agreeing to it."],
  ["What is a research run?", "One request to gather cultural data for a project — for example, a Qloo retrieval for an audience and market. Runs are counted per workspace over a rolling 24 hours."],
  ["What happens to pilot data?", "It stays in your workspace. You can export reports and delete projects; see the privacy policy for retention and deletion details."],
];

export default function PricingPage() {
  return (
    <>
      {/* HERO */}
      <section className="cc-atmosphere relative overflow-hidden pt-28 sm:pt-36">
        <div className="relative mx-auto grid max-w-[1320px] gap-10 px-5 pb-16 md:px-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <p className="cc-eyebrow text-muted">Pricing</p>
            <h1 className="cc-display mt-6 text-[52px] sm:text-[72px] xl:text-[88px]">Plans shaped around how agencies work.</h1>
          </div>
          <div role="note" className="flex gap-4 rounded-cc-lg border border-peach bg-peach/25 p-5">
            <CreditCard className="mt-0.5 size-5 shrink-0 text-[#8a3d22]" />
            <div className="text-[14px] leading-relaxed">
              <p className="font-semibold text-ink">Payment is not yet available.</p>
              <p className="mt-1 text-muted">
                Billing hasn&rsquo;t been set up, so there is no checkout. All plans are currently offered as free
                pilots while we work with early teams.{" "}
                <Link href="#pilot" className="font-medium text-ink underline underline-offset-2">Request a pilot</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section className="mx-auto max-w-[1320px] px-5 pb-24 pt-12 md:px-10 md:pb-32 md:pt-20" aria-labelledby="plans-title">
        <h2 id="plans-title" className="sr-only">Plans and usage limits</h2>
        <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
          {plans.map((plan) => (
            <article
              key={plan.key}
              className={cn(
                "flex flex-col rounded-cc-lg border p-7",
                plan.dark ? "relative overflow-hidden border-transparent bg-charcoal text-white" : "border-line bg-paper",
                plan.className,
              )}
              aria-labelledby={`plan-${plan.key}`}
            >
              {plan.dark && <div className="pointer-events-none absolute -right-20 -top-20 size-[300px] rounded-full bg-violet/35 blur-[90px]" />}
              <div className="relative flex items-start justify-between gap-3">
                <h3 id={`plan-${plan.key}`} className={cn("cc-display", plan.dark ? "text-6xl" : "text-5xl")}>{plan.name}</h3>
                <Badge tone={plan.dark ? "glass" : "peach"}>Pilot terms</Badge>
              </div>
              <p className={cn("relative mt-4 text-[14px] leading-relaxed", plan.dark ? "text-white/70" : "text-muted")}>{plan.who}</p>
              <p className={cn("relative mt-6 text-[13px]", plan.dark ? "text-white/55" : "text-muted")}>
                Price <span className={cn("font-medium", plan.dark ? "text-white" : "text-ink")}>to be announced</span> · no charge during pilot
              </p>
              <dl className={cn("relative mt-6 divide-y border-y text-[14px]", plan.dark ? "divide-white/10 border-white/10" : "divide-line border-line")}>
                {plan.limits.map((l) => (
                  <div key={l.label} className="flex items-baseline justify-between gap-4 py-3">
                    <dt className={plan.dark ? "text-white/60" : "text-muted"}>{l.label}</dt>
                    <dd className="font-mono text-[13px] font-medium">{l.value}</dd>
                  </div>
                ))}
              </dl>
              <ul className="relative mt-6 space-y-2.5 text-[14px]">
                {plan.includes.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check className={cn("mt-0.5 size-4 shrink-0", plan.dark ? "text-lavender" : "text-violet")} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button asChild className="relative mt-8" variant={plan.dark ? "inverse" : "outline"}>
                <Link href="#pilot">Request {plan.key === "agency" ? "an" : "a"} {plan.name} pilot <ArrowRight /></Link>
              </Button>
            </article>
          ))}
        </div>
        <p className="mt-6 flex max-w-3xl gap-2 text-[13px] leading-relaxed text-muted">
          <Info className="mt-0.5 size-4 shrink-0" />
          Limits describe the intended plans and may change before billing launches. During pilots we set limits per
          workspace with you. Usage limits exist to keep provider costs predictable — they are not a measure of value.
        </p>
      </section>

      {/* PILOT */}
      <section id="pilot" className="scroll-mt-24 border-y border-line bg-ivory-2/60 py-24 md:py-32" aria-labelledby="pilot-title">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 md:px-10 lg:grid-cols-[1fr_1.35fr]">
          <div>
            <p className="cc-eyebrow text-muted">Pilot programme</p>
            <h2 id="pilot-title" className="cc-display mt-4 text-5xl md:text-6xl">Request a pilot.</h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              Tell us about your team and the kind of brief you&rsquo;d run. Pilots are free, run on a real project, and
              end with an honest conversation about whether CultureCrash helped.
            </p>
            <ArtPlate theme="culture" seed="pilot" className="mt-10 hidden h-[260px] rounded-[28px] lg:block" />
            <p className="mt-6 text-[13px] text-muted">
              Prefer to look around first?{" "}
              <Link href="/signup" className="text-ink underline underline-offset-2">Create a workspace</Link> — it starts on
              pilot limits.
            </p>
          </div>
          <PilotRequestForm />
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-10 md:py-32" aria-labelledby="faq-title">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
          <h2 id="faq-title" className="cc-display text-5xl md:text-6xl">Questions about plans.</h2>
          <dl className="divide-y divide-line border-y border-line">
            {faqs.map(([q, a]) => (
              <div key={q} className="py-6">
                <dt className="text-lg font-semibold tracking-tight">{q}</dt>
                <dd className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
