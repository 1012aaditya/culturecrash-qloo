"use client";

import { Ago } from "@/components/ui/time";
import Link from "next/link";
import { Bookmark, Eye, Link2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ArtPlate, type PlateTheme } from "@/components/art/plate";
import { DemoBadge, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { EVIDENCE_LABEL } from "@/lib/evidence-labels";
import { setOpportunityStatusAction } from "@/lib/strategy/actions";
import { cn, timeAgo } from "@/lib/utils";

export type Opp = {
  id: string; title: string; description: string; whyItMatters: string | null; unknowns: string | null; strategicUse: string | null; validationStep: string | null;
  status: string; generator: string; generatorLabel: string; isDemo: boolean; evidence: { id: string; claim: string }[]; entityNames: string[]; linkedDirection: string | null;
};
export type EvidenceItem = { id: string; type: string; claim: string; review: string; isDemo: boolean; value: number | null; createdAt: string };

const STATUS_TONE: Record<string, "violet" | "neutral" | "peach" | "success" | "outline"> = { new: "outline", saved: "violet", investigating: "peach", linked: "success", dismissed: "neutral" };

export function OpportunityBoard({ projectId, opportunities, evidence, directions, canEdit, theme }: {
  projectId: string; opportunities: Opp[]; evidence: EvidenceItem[]; directions: { id: string; name: string }[]; canEdit: boolean; theme: PlateTheme;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDismissed, setShowDismissed] = React.useState(false);
  const [evType, setEvType] = React.useState("");
  const [q, setQ] = React.useState("");
  const [pending, start] = React.useTransition();

  const update = (o: Opp, status: string, directionId?: string) =>
    start(async () => {
      const r = await setOpportunityStatusAction({ projectId, opportunityId: o.id, status: status as "saved", directionId: directionId ?? null });
      if (!r.ok) toast({ tone: "error", title: r.error });
      router.refresh();
    });

  const shown = opportunities.filter((o) => showDismissed || o.status !== "dismissed");
  const filteredEvidence = evidence.filter((e) => (!evType || e.type === evType) && (!q || e.claim.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-12">
      {shown.length === 0 ? (
        <EmptyState title="No opportunities yet" body="Generate hypotheses from the latest completed research run. Each will cite the observations it rests on." />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-12">
          {shown.map((o, i) => (
            <li key={o.id} id={`opp-${o.id}`} className={cn("scroll-mt-28 overflow-hidden rounded-[30px] border border-line bg-paper shadow-card", i === 0 ? "lg:col-span-12" : i % 3 === 1 ? "lg:col-span-7" : "lg:col-span-5", o.status === "dismissed" && "opacity-60")}>
              <div className={cn("grid h-full", i === 0 && "lg:grid-cols-[1fr_1.15fr]")}>
                <div className={cn("relative overflow-hidden bg-charcoal text-white", i === 0 ? "min-h-[300px]" : "min-h-[180px]")}>
                  <ArtPlate theme={theme} seed={o.id} rounded={false} className="absolute inset-0" />
                  <div className="absolute inset-0 bg-gradient-to-t from-charcoal/85 to-transparent" />
                  <div className="absolute inset-x-5 top-5 flex flex-wrap gap-1.5"><Badge tone="glass">Hypothesis</Badge><Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>{o.isDemo && <DemoBadge label="Demo" />}</div>
                  <div className="absolute inset-x-5 bottom-5">
                    <p className="cc-eyebrow text-[10px] text-white/65">Opportunity</p>
                    <h2 className={cn("cc-display mt-1", i === 0 ? "text-5xl" : "text-3xl")}>{o.title}</h2>
                  </div>
                </div>
                <div className="flex flex-col gap-4 p-6">
                  <p className="text-[14px] leading-relaxed">{o.description}</p>
                  <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                    {[["Why it may matter", o.whyItMatters], ["What remains unknown", o.unknowns], ["Potential strategic use", o.strategicUse], ["Proposed validation", o.validationStep]].map(([k, v]) => v && (
                      <div key={k}><dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{k}</dt><dd className="mt-1 leading-snug">{v}</dd></div>
                    ))}
                  </dl>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Supporting evidence ({o.evidence.length})</p>
                    <ul className="mt-1.5 space-y-1">
                      {o.evidence.slice(0, 4).map((e) => <li key={e.id}><Link href={`/projects/${projectId}/evidence/${e.id}`} className="line-clamp-1 text-[12px] text-ink/80 hover:text-violet">• {e.claim}</Link></li>)}
                    </ul>
                  </div>
                  <p className="text-[11px] text-faint">{o.generatorLabel}{o.linkedDirection && ` · linked to “${o.linkedDirection}”`}</p>
                  {canEdit && (
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
                      <Button size="sm" variant={o.status === "saved" ? "soft" : "outline"} disabled={pending} onClick={() => update(o, o.status === "saved" ? "new" : "saved")}><Bookmark /> {o.status === "saved" ? "Saved" : "Save"}</Button>
                      <Button size="sm" variant={o.status === "investigating" ? "soft" : "outline"} disabled={pending} onClick={() => update(o, "investigating")}><Eye /> Investigate</Button>
                      {directions.length > 0 && (
                        <label className="flex items-center gap-1.5 text-[12px]"><Link2 className="size-3.5 text-muted" /><span className="sr-only">Link to direction</span>
                          <Select className="h-8 w-44 text-[12px]" value="" onChange={(e) => e.target.value && update(o, "linked", e.target.value)} disabled={pending}>
                            <option value="">Link to direction…</option>
                            {directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </Select>
                        </label>
                      )}
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => update(o, o.status === "dismissed" ? "new" : "dismissed")}><X /> {o.status === "dismissed" ? "Restore" : "Dismiss"}</Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {opportunities.some((o) => o.status === "dismissed") && (
        <button onClick={() => setShowDismissed((v) => !v)} className="text-[13px] text-muted underline-offset-2 hover:underline">{showDismissed ? "Hide" : "Show"} dismissed opportunities</button>
      )}

      <section id="evidence" className="scroll-mt-28">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="cc-eyebrow text-muted">Evidence ledger</p>
            <h2 className="cc-display mt-2 text-4xl">Everything this campaign knows — and how it knows it.</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex h-10 items-center gap-2 rounded-full border border-line bg-paper px-3"><Search className="size-4 text-muted" /><span className="sr-only">Search evidence</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search evidence" className="w-44 bg-transparent text-[13px] outline-none" /></label>
            <Select value={evType} onChange={(e) => setEvType(e.target.value)} className="w-auto rounded-full" aria-label="Evidence type">
              <option value="">All types</option>
              {Object.entries(EVIDENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
        </div>
        {filteredEvidence.length === 0 ? <EmptyState className="mt-5" title="No evidence matches" body="Evidence is created by research runs, AI interpretation, experiment results and approvals." /> : (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-cc-lg border border-line bg-paper">
            {filteredEvidence.map((e) => (
              <li key={e.id}>
                <Link href={`/projects/${projectId}/evidence/${e.id}`} className="flex flex-col gap-2 px-5 py-3.5 hover:bg-ivory/70 md:flex-row md:items-center">
                  <Badge tone={EVIDENCE_LABEL[e.type]?.tone ?? "neutral"} className="w-fit shrink-0">{EVIDENCE_LABEL[e.type]?.label ?? e.type}</Badge>
                  <span className="min-w-0 flex-1 text-[13px]">{e.claim}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted">{e.isDemo && <DemoBadge label="Demo" />}{e.review.replace("_", " ")} · <Ago value={e.createdAt} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
