"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { addVariantAction, importResultsCsvAction, recordResultAction, saveInterpretationAction } from "@/lib/experiments/actions";

export function RecordResultForm({ experimentId, variants, metrics }: { experimentId: string; variants: { id: string; label: string }[]; metrics: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  // Rates (successes out of exposures) can be compared statistically; a single number can only be listed.
  const [mode, setMode] = React.useState<"rate" | "value">("rate");
  const ref = React.useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
      start(async () => {
        const successes = mode === "rate" ? num("successes") : null;
        const exposures = mode === "rate" ? num("exposures") : num("sampleSize");
        const r = await recordResultAction(experimentId, {
          variantId: (f.get("variantId") as string) || null, metric: String(f.get("metric")),
          value: mode === "rate" ? (successes ?? 0) / Math.max(1, exposures ?? 1) : Number(f.get("value")),
          sampleSize: exposures, successes, observedOn: (f.get("observedOn") as string) || null, notes: String(f.get("notes") ?? ""),
        });
        if (!r.ok) return toast({ tone: "error", title: r.error });
        toast({ tone: "success", title: "Result recorded", description: "Stored as observed data and added to the evidence ledger." });
        ref.current?.reset();
        router.refresh();
      });
    }}>
      <fieldset className="flex flex-wrap gap-4 text-[13px] sm:col-span-2">
        <legend className="sr-only">Kind of result</legend>
        <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "rate"} onChange={() => setMode("rate")} /> Rate: successes out of exposures</label>
        <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "value"} onChange={() => setMode("value")} /> A single number</label>
      </fieldset>
      <Field label="Variant" htmlFor="r-variant"><Select id="r-variant" name="variantId"><option value="">Whole experiment</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select></Field>
      <Field label="Metric" htmlFor="r-metric"><Input id="r-metric" name="metric" list="r-metrics" required defaultValue={metrics[0]} /><datalist id="r-metrics">{metrics.map((m) => <option key={m} value={m} />)}</datalist></Field>
      {mode === "rate" ? (
        <>
          <Field label="Successes" htmlFor="r-succ" hint="e.g. conversions, clicks, sign-ups"><Input id="r-succ" name="successes" type="number" min={0} step={1} required /></Field>
          <Field label="Exposures" htmlFor="r-exp" hint="e.g. impressions, visitors, people reached"><Input id="r-exp" name="exposures" type="number" min={1} step={1} required /></Field>
        </>
      ) : (
        <>
          <Field label="Observed value" htmlFor="r-value"><Input id="r-value" name="value" type="number" step="any" required /></Field>
          <Field label="Sample size" htmlFor="r-n" optional><Input id="r-n" name="sampleSize" type="number" min={0} step={1} /></Field>
        </>
      )}
      <Field label="Observed on" htmlFor="r-date" optional><Input id="r-date" name="observedOn" type="date" /></Field>
      <Field label="Notes" htmlFor="r-notes" optional><Input id="r-notes" name="notes" maxLength={2000} placeholder="Source of the number, caveats…" /></Field>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Recording…" : "Record result"}</Button></div>
    </form>
  );
}

/** Upload an ad-platform export; rows are matched to variants by name and added as rate results. */
export function ImportCsvForm({ experimentId, variants }: { experimentId: string; variants: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const [unmatched, setUnmatched] = React.useState<string[]>([]);
  return (
    <div className="space-y-2 text-[13px]">
      <p className="text-muted">Export a report from Meta Ads Manager, Google Ads or TikTok Ads with one row per ad set or campaign, named after a variant ({variants.join(", ") || "add variants first"}). Impressions are read as exposures and conversions, results or clicks as successes.</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 font-medium hover:bg-ivory">
        <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" disabled={pending} onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          start(async () => {
            const r = await importResultsCsvAction(experimentId, await file.text());
            if (!r.ok) return toast({ tone: "error", title: "Nothing imported", description: r.error });
            setUnmatched(r.data?.unmatched ?? []);
            toast({ tone: "success", title: `Imported ${r.data?.imported} variant result(s)` });
            router.refresh();
          });
        }} />
        {pending ? "Importing…" : "Import CSV export"}
      </label>
      {unmatched.length > 0 && <p className="text-[12px] text-warning">Not imported (no matching variant): {unmatched.slice(0, 8).join(", ")}{unmatched.length > 8 ? "…" : ""}</p>}
    </div>
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
