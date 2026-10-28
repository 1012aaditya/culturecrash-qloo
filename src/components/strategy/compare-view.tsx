"use client";

import { Loader2, Sparkles } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ComparisonOutput } from "@/lib/ai/schemas";
import { compareDirectionsAction } from "@/lib/strategy/actions";
import { cn } from "@/lib/utils";

const TONE = { stronger: "success", mixed: "peach", weaker: "neutral", unclear: "outline" } as const;

export function ComparisonMatrix({ projectId, versionId, names, initial, initialGenerator, llm }: {
  projectId: string; versionId: string; names: string[]; initial: ComparisonOutput; initialGenerator: string; llm: boolean;
}) {
  const { toast } = useToast();
  const [data, setData] = React.useState({ ...initial, generator: initialGenerator });
  const [pending, start] = React.useTransition();
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted">{data.generator === "template-engine" ? "Template comparison — based only on linked evidence counts and each direction’s stated assumptions." : `Qualitative assessment by ${data.generator.replace("llm:", "")}.`} No numeric scores are used: these are judgements with their basis shown.</p>
        {llm && <Button size="sm" variant="soft" disabled={pending} onClick={() => start(async () => { const r = await compareDirectionsAction(projectId, versionId); if (!r.ok) toast({ tone: "error", title: r.error }); else setData(r.data!); })}>{pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Run AI comparison</Button>}
      </div>
      <div className="overflow-x-auto rounded-cc-lg border border-line bg-paper">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead><tr className="border-b border-line"><th className="w-48 p-4 text-[11px] font-medium uppercase tracking-wider text-muted">Dimension</th>{names.map((n) => <th key={n} className="p-4 font-serif text-xl font-normal">{n}</th>)}</tr></thead>
          <tbody>
            {data.dimensions.map((dim) => (
              <tr key={dim.dimension} className="border-b border-line align-top last:border-0">
                <th scope="row" className="p-4 text-[13px] font-medium">{dim.dimension}</th>
                {names.map((n) => {
                  const a = dim.assessments.find((x) => x.directionName === n);
                  return (
                    <td key={n} className="p-4">
                      {a ? (<><Badge tone={TONE[a.assessment]}>{a.assessment}</Badge><p className="mt-2 text-[12px] leading-snug text-muted">{a.basis}</p></>) : <span className="text-faint">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13px]">{data.summary}</p>
    </section>
  );
}

type Rev = { id: string; revision: number; name: string; note: string | null; status: string; createdAt: string; content: Record<string, unknown> };
const FIELDS: [string, string][] = [["name", "Name"], ["coreIdea", "Core idea"], ["positioningStatement", "Positioning"], ["strategicRationale", "Rationale"], ["differentiation", "Differentiation"], ["messagingPillars", "Messaging pillars"], ["creativeImplications", "Creative implications"], ["tradeOffs", "Trade-offs"], ["uncertainties", "Uncertainties"], ["assumptionsToTest", "Assumptions"], ["suggestedExperiment", "Suggested experiment"]];
const show = (v: unknown) => (Array.isArray(v) ? v.join(" · ") : String(v ?? ""));

export function RevisionDiff({ revisions }: { revisions: Rev[] }) {
  const [a, setA] = React.useState(revisions[revisions.length - 2]?.id ?? revisions[0].id);
  const [b, setB] = React.useState(revisions[revisions.length - 1].id);
  const ra = revisions.find((r) => r.id === a)!;
  const rb = revisions.find((r) => r.id === b)!;
  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-3 text-[13px]">
        {[["Compare", a, setA], ["with", b, setB]].map(([label, val, set]) => (
          <label key={label as string} className="flex items-center gap-2">{label as string}
            <select value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} className="h-9 rounded-full border border-line bg-paper px-3">
              {revisions.map((r) => <option key={r.id} value={r.id}>Revision {r.revision}{r.status === "selected" ? " (selected)" : ""}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="overflow-hidden rounded-cc-lg border border-line bg-paper">
        {FIELDS.map(([k, label]) => {
          const changed = show(ra.content[k]) !== show(rb.content[k]);
          return (
            <div key={k} className={cn("grid gap-4 border-b border-line p-4 last:border-0 md:grid-cols-[160px_1fr_1fr]", changed && "bg-lilac/25")}>
              <p className="text-[12px] font-medium text-muted">{label}{changed && <Badge tone="violet" className="ml-2">changed</Badge>}</p>
              <p className="text-[13px] text-muted">{show(ra.content[k])}</p>
              <p className="text-[13px]">{show(rb.content[k])}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] text-muted">Revision {rb.revision}: {rb.note ?? "no note"}</p>
    </section>
  );
}
