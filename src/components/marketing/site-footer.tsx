import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const groups = [
  { title: "Product", links: [["/product", "Capabilities"], ["/showcase", "Showcase"], ["/pricing", "Pricing"], ["/signup", "Start a campaign"]] },
  { title: "Solutions", links: [["/solutions/agencies", "Agencies"], ["/solutions/brands", "Brand teams"], ["/pricing#pilot", "Request a pilot"]] },
  { title: "Company", links: [["/about", "About"], ["/help", "Help & feedback"]] },
  { title: "Legal", links: [["/privacy", "Privacy"], ["/terms", "Terms"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-charcoal text-white">
      <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-violet/25 blur-[120px]" />
      <div className="relative mx-auto grid max-w-[1320px] gap-12 px-6 py-16 md:grid-cols-[1.4fr_repeat(4,1fr)] md:px-10">
        <div className="max-w-xs">
          <Logo dark />
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Cultural intelligence and campaign strategy for brand and creative teams. Evidence first, hypotheses labelled.
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <p className="cc-eyebrow mb-4 text-white/40">{g.title}</p>
            <ul className="space-y-2.5">
              {g.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-white/75 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="relative mx-auto flex max-w-[1320px] flex-col justify-between gap-2 border-t border-white/10 px-6 py-6 text-xs text-white/45 md:flex-row md:px-10">
        <p>© {new Date().getFullYear()} CultureCrash. Cultural data from providers is used under their terms.</p>
        <p>Affinity data describes correlation in taste, not purchase intent or causation.</p>
      </div>
    </footer>
  );
}
