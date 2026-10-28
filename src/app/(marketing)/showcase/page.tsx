import type { Metadata } from "next";
import Link from "next/link";
import { ShowcaseCanvas } from "@/components/marketing/showcase-canvas";
import { ReportDocument } from "@/components/reports/report-document";
import { DemoBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { showcaseReport } from "@/lib/showcase";

export const metadata: Metadata = { title: "Showcase", description: "An interactive sample campaign and report built entirely from labelled demonstration data." };

export default function ShowcasePage() {
  return (
    <div className="cc-atmosphere pb-24 pt-28">
      <div className="mx-auto max-w-[1320px] px-5 md:px-10">
        <div className="grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
          <div>
            <DemoBadge label="Everything on this page is demonstration data" />
            <h1 className="cc-display mt-5 text-6xl md:text-7xl">A sample campaign, end to end.</h1>
          </div>
          <p className="text-[15px] leading-relaxed text-muted">Explore the research canvas and a sample report for a fictional skincare launch. Entities are invented and values are illustrative — they were not returned by Qloo or any other provider.</p>
        </div>
        <section className="mt-12" aria-labelledby="canvas-title">
          <h2 id="canvas-title" className="cc-eyebrow mb-4 text-muted">Research canvas · interactive</h2>
          <ShowcaseCanvas />
        </section>
        <section className="mt-20" aria-labelledby="report-title">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div><p className="cc-eyebrow text-muted">Sample report</p><h2 id="report-title" className="cc-display mt-2 text-5xl">What a client receives.</h2></div>
            <Button asChild><Link href="/signup">Start a real campaign</Link></Button>
          </div>
          <ReportDocument s={showcaseReport} version={1} createdAt={showcaseReport.generatedAt} />
        </section>
      </div>
    </div>
  );
}
