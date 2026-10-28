import Link from "next/link";
import { FileWarning } from "lucide-react";
import * as React from "react";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/** Shared layout for policy pages: editorial header, draft notice, contents rail and readable body. */
export function LegalDocument({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <article className="cc-atmosphere pt-28 sm:pt-36">
      <header className="mx-auto grid max-w-[1320px] gap-8 px-5 pb-14 md:px-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="cc-eyebrow text-muted">{eyebrow}</p>
          <h1 className="cc-display mt-6 text-[52px] sm:text-[72px]">{title}</h1>
          <p className="mt-4 text-[13px] text-muted">Last updated {updated}</p>
        </div>
        <div role="note" className="flex gap-3 rounded-cc-lg border border-peach bg-peach/25 p-5 text-[14px] leading-relaxed">
          <FileWarning className="mt-0.5 size-5 shrink-0 text-[#8a3d22]" />
          <p>
            <span className="font-semibold">Draft for review.</span>{" "}
            <span className="text-muted">
              This document is a plain-language draft written for CultureCrash&rsquo;s pilot stage. It has not yet been
              reviewed by legal counsel and will be revised before general availability.
            </span>
          </p>
        </div>
      </header>

      <div className="border-t border-line bg-paper">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-16 md:px-10 lg:grid-cols-[260px_1fr] lg:py-20">
          <nav aria-label="Contents" className="lg:sticky lg:top-28 lg:self-start">
            <p className="cc-eyebrow text-[10px] text-muted">Contents</p>
            <ol className="mt-4 space-y-2 text-[13px]">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <Link href={`#${s.id}`} className="flex gap-3 text-muted transition-colors hover:text-ink">
                    <span className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <div className="max-w-[720px]">
            <div className="text-[17px] leading-relaxed text-ink">{intro}</div>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-28 border-t border-line pt-8 mt-10" aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`} className="flex items-baseline gap-4 text-xl font-semibold tracking-tight">
                  <span className="font-mono text-xs font-normal text-faint">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
