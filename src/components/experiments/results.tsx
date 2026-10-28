"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { addVariantAction, recordResultAction, saveInterpretationAction } from "@/lib/experiments/actions";

export function RecordResultForm({ experimentId, variants, metrics }: { experimentId: string; variants: { id: string; label: string }[]; metrics: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const ref = React.useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      start(async () => {
        const r = await recordResultAction(experimentId, {
          variantId: (f.get("variantId") as string) || null, metric: String(f.get("metric")), value: Number(f.get("value")),
          sampleSize: f.get("sampleSize") ? Number(f.get("sampleSize")) : null, observedOn: (f.get("observedOn") as string) || null, notes: String(f.get("notes") ?? ""),
        });
        if (!r.ok) return toast({ tone: "error", title: r.error });
        toast({ tone: "success", title: "Result recorded", description: "Stored as observed data and added to the evidence ledger." });
        ref.current?.reset();
        router.refresh();
      });
    }}>
      <Field label="Variant" htmlFor="r-variant"><Select id="r-variant" name="variantId"><option value="">Whole experiment</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select></Field>
      <Field label="Metric" htmlFor="r-metric"><Input id="r-metric" name="metric" list="r-metrics" required defaultValue={metrics[0]} /><datalist id="r-metrics">{metrics.map((m) => <option key={m} value={m} />)}</datalist></Field>
      <Field label="Observed value" htmlFor="r-value"><Input id="r-value" name="value" type="number" step="any" required /></Field>
      <Field label="Sample size" htmlFor="r-n" optional><Input id="r-n" name="sampleSize" type="number" min={0} step={1} /></Field>
      <Field label="Observed on" htmlFor="r-date" optional><Input id="r-date" name="observedOn" type="date" /></Field>
      <Field label="Notes" htmlFor="r-notes" optional><Input id="r-notes" name="notes" maxLength={2000} placeholder="Source of the number, caveats…" /></Field>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Recording…" : "Record result"}</Button></div>
    </form>
  );
}

export function AddVariantForm({ experimentId }: { experimentId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [label, setLabel] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addVariantAction(experimentId, label, "", false); if (!r.ok) toast({ tone: "error", title: r.error }); else { setLabel(""); router.refresh(); } }); }}>
      <Input aria-label="New variant label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add a variant" className="h-9" />
      <Button size="sm" type="submit" variant="outline" disabled={pending || !label.trim()}>Add</Button>
    </form>
  );
}

export function InterpretationForm({ experimentId, interpretation, nextAction, completed }: { experimentId: string; interpretation: string; nextAction: string; completed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [i, setI] = React.useState(interpretation);
  const [n, setN] = React.useState(nextAction);
  const [pending, start] = React.useTransition();
  const save = (complete: boolean) => start(async () => { const r = await saveInterpretationAction(experimentId, i, n, complete); if (!r.ok) toast({ tone: "error", title: r.error }); else { toast({ tone: "success", title: complete ? "Experiment marked complete" : "Interpretation saved" }); router.refresh(); } });
  return (
    <div className="space-y-3">
      <Field label="Team interpretation" htmlFor="int" hint="Your reading of the observed results. Kept separate from the numbers themselves."><Textarea id="int" value={i} onChange={(e) => setI(e.target.value)} maxLength={4000} /></Field>
      <Field label="Next action" htmlFor="next"><Textarea id="next" value={n} onChange={(e) => setN(e.target.value)} maxLength={2000} className="min-h-16" /></Field>
      <div className="flex gap-2"><Button size="sm" onClick={() => save(false)} disabled={pending}>Save</Button>{!completed && <Button size="sm" variant="outline" onClick={() => save(true)} disabled={pending}>Save & mark complete</Button>}</div>
    </div>
  );
}
