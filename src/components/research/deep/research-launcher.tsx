"use client";

import { useRouter } from "next/navigation";
import { CircleCheck, CircleDashed, Loader2, Play, Search } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { startResearchAction } from "@/lib/research/actions";
import type { ProviderStatus } from "@/lib/research/deep/view-types";
import { cn } from "@/lib/utils";

const DEPTHS = [
  { key: "quick", label: "Quick", body: "A few focused searches, short qualified answer.", cap: "≤ 6 provider calls · ≈ $0.15 max" },
  { key: "standard", label: "Standard", body: "Several sources, selected full pages, one follow-up round.", cap: "≤ 16 calls · ≈ $0.60 max" },
  { key: "deep", label: "Deep", body: "Broader plan, counter-evidence, up to two follow-up rounds.", cap: "≤ 32 calls · ≈ $1.50 max" },
] as const;

/** The research brief form: question, depth, timeframe and an honest view of which sources are available. */
export function ResearchLauncher({ projectId, providers, qlooConfigured, webEnabled, disabled, label }: {
  projectId: string; providers: ProviderStatus[]; qlooConfigured: boolean; webEnabled: boolean; disabled: boolean; label: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const [depth, setDepth] = React.useState<"quick" | "standard" | "deep">("standard");
  const [freshness, setFreshness] = React.useState<"month" | "year" | "any">("year");
  const [pending, setPending] = React.useState(false);
  const key = React.useRef<string | null>(null);
  const external = providers.filter((p) => p.key !== "brand_docs" && p.key !== "demo_web");
  const anySource = webEnabled && external.some((p) => p.configured);

  async function start() {
    if (pending) return;
    key.current ??= crypto.randomUUID();
    setPending(true);
    const res = await startResearchAction({ projectId, mode: "live", idempotencyKey: key.current, depth, question: question.trim() || null, freshness });
    setPending(false);
    key.current = null;
    if (!res.ok) return toast({ tone: "error", title: "Research not started", description: res.error });
    setOpen(false);
    toast({ tone: "success", title: res.reused ? "A research job is already running" : "Research started" });
    router.push(`/projects/${projectId}/research?run=${res.runId}`);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}><Play /> {label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New research" description="Qloo maps the cultural affinities around your brief first; CultureCrash then investigates the strongest connections with the sources that can answer each question, follows up on gaps and writes a cited report." className="flex max-h-[86dvh] w-[min(680px,calc(100vw-24px))] flex-col">
          {/* The body scrolls; the action row stays on screen on short viewports. */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <Field label="Research question" htmlFor="rq" optional hint="Leave empty to research the brief as a whole.">
              <Textarea id="rq" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} placeholder="e.g. What frustrates Gen Z about skincare routines in India, and how do competitors talk about it?" className="min-h-20" />
            </Field>
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">Depth</legend>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
                {DEPTHS.map((d) => (
                  <button key={d.key} type="button" role="radio" aria-checked={depth === d.key} onClick={() => setDepth(d.key)}
                    className={cn("rounded-cc border p-3 text-left transition-[border-color,background,box-shadow] duration-200", depth === d.key ? "border-violet bg-lilac/40 shadow-[0_0_0_3px_rgba(128,100,245,0.15)]" : "border-line hover:border-line-strong")}>
                    <span className="block text-[14px] font-medium">{d.label}</span>
                    <span className="mt-1 block text-[12px] leading-snug text-muted">{d.body}</span>
                    <span className="mt-2 block font-mono text-[10px] text-faint">{d.cap}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">Limits are ceilings, not targets: research stops early once the questions are covered.</p>
            </fieldset>
            <Field label="Timeframe" htmlFor="rq-time">
              <Select id="rq-time" value={freshness} onChange={(e) => setFreshness(e.target.value as typeof freshness)}>
                <option value="month">Past month</option>
                <option value="year">Past year</option>
                <option value="any">Any time</option>
              </Select>
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-medium">Sources</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                <li className="flex items-start gap-2 text-[12px]">{qlooConfigured ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-faint" />}<span><b className="font-medium">Qloo — core</b> <span className="text-muted">— {qlooConfigured ? "runs first; its strongest cultural connections become questions for the other sources" : "not configured: research will not be grounded in cultural-affinity data"}</span></span></li>
                {providers.filter((p) => p.key !== "demo_web").map((p) => (
                  <li key={p.key} className="flex items-start gap-2 text-[12px]" title={p.unavailableReason ?? p.costModel}>
                    {p.configured && (webEnabled || p.key === "brand_docs") ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-faint" />}
                    <span><b className="font-medium">{p.label}</b> <span className="text-muted">— {p.configured && (webEnabled || p.key === "brand_docs") ? p.strengths : (!webEnabled && p.key !== "brand_docs" ? "web research is off for this workspace" : p.unavailableReason)}</span></span>
                  </li>
                ))}
              </ul>
              {!anySource && <p className="mt-2 rounded-cc-sm bg-ink/5 p-2.5 text-[12px] text-muted">No web, video or community source is available, so this run can only use client documents{qlooConfigured ? " and Qloo" : ""}. The report will say so.</p>}
            </div>
          </div>
          <div className="mt-5 flex shrink-0 items-center justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={start} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Search />} Start research</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
