"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createExperimentAction, updateExperimentAction } from "@/lib/experiments/actions";

export type ExperimentDraft = {
  name: string; hypothesis: string; rationale: string; directionId: string; audience: string; method: string; primaryMetric: string;
  secondaryMetrics: string; budgetAssumptions: string; timeline: string; decisionThreshold: string; status: string;
};

const METHODS = ["Randomised A/B test (paid social)", "Pre/post brand lift study", "Qualitative concept test", "Matched-market test", "Survey-based message test"];

export function ExperimentForm({ projectId, experimentId, initial, directions, onDone }: {
  projectId: string; experimentId?: string; initial: ExperimentDraft; directions: { id: string; name: string }[]; onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = React.useState(initial);
  const [variants, setVariants] = React.useState([{ label: "Control — current positioning", description: "", isControl: true }, { label: "Variant A", description: "", isControl: false }]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const set = (k: keyof ExperimentDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const payload = { ...v, directionId: v.directionId || null, secondaryMetrics: v.secondaryMetrics.split(",").map((s) => s.trim()).filter(Boolean), status: v.status as "draft" };
      const r = experimentId ? await updateExperimentAction(experimentId, payload) : await createExperimentAction(projectId, payload, variants.filter((x) => x.label.trim()));
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return toast({ tone: "error", title: r.error });
      }
      toast({ tone: "success", title: experimentId ? "Experiment updated" : "Experiment saved" });
      onDone?.();
      if (!experimentId && r.data && "id" in r.data) router.push(`/projects/${projectId}/experiments/${(r.data as { id: string }).id}`);
      else router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Experiment name" htmlFor="x-name" error={errors.name}><Input id="x-name" value={v.name} onChange={set("name")} maxLength={200} /></Field>
        <Field label="Positioning direction" htmlFor="x-dir" optional>
          <Select id="x-dir" value={v.directionId} onChange={set("directionId")}><option value="">None</option>{directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </Field>
      </div>
      <Field label="Hypothesis" htmlFor="x-hyp" error={errors.hypothesis} hint="Write it so it can be wrong, e.g. “Messaging centred on daily self-care routines will generate greater audience interest than the current positioning.”">
        <Textarea id="x-hyp" value={v.hypothesis} onChange={set("hypothesis")} maxLength={2000} />
      </Field>
      <Field label="Rationale" htmlFor="x-rat" optional><Textarea id="x-rat" value={v.rationale} onChange={set("rationale")} maxLength={2000} className="min-h-16" /></Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Audience" htmlFor="x-aud" optional><Input id="x-aud" value={v.audience} onChange={set("audience")} maxLength={1000} /></Field>
        <Field label="Test method" htmlFor="x-method" optional hint="Causal claims need randomisation or a credible control.">
          <Input id="x-method" list="x-methods" value={v.method} onChange={set("method")} maxLength={1000} />
          <datalist id="x-methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Primary metric" htmlFor="x-pm" error={errors.primaryMetric}><Input id="x-pm" value={v.primaryMetric} onChange={set("primaryMetric")} placeholder="e.g. Click-through rate (%)" maxLength={200} /></Field>
        <Field label="Secondary metrics" htmlFor="x-sm" optional hint="Comma separated."><Input id="x-sm" value={v.secondaryMetrics} onChange={set("secondaryMetrics")} /></Field>
        <Field label="Budget assumptions" htmlFor="x-bud" optional><Input id="x-bud" value={v.budgetAssumptions} onChange={set("budgetAssumptions")} maxLength={1000} /></Field>
        <Field label="Timeline" htmlFor="x-time" optional><Input id="x-time" value={v.timeline} onChange={set("timeline")} maxLength={300} /></Field>
      </div>
      <Field label="Decision threshold" htmlFor="x-thr" optional hint="Agree before results arrive: what result would change your decision?">
        <Textarea id="x-thr" value={v.decisionThreshold} onChange={set("decisionThreshold")} className="min-h-16" maxLength={1000} />
      </Field>
      <Field label="Status" htmlFor="x-status"><Select id="x-status" value={v.status} onChange={set("status")}>{["draft", "planned", "running", "completed", "cancelled"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
      {!experimentId && (
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium">Creative variants</legend>
          {variants.map((x, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Variant ${i + 1} label`} value={x.label} onChange={(e) => setVariants(variants.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className="flex-1" />
              <Input aria-label={`Variant ${i + 1} description`} value={x.description} placeholder="Description" onChange={(e) => setVariants(variants.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} className="flex-[2]" />
              <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={x.isControl} onChange={(e) => setVariants(variants.map((y, j) => (j === i ? { ...y, isControl: e.target.checked } : y)))} /> Control</label>
              <button type="button" onClick={() => setVariants(variants.filter((_, j) => j !== i))} aria-label="Remove variant" className="text-muted hover:text-danger"><Trash2 className="size-4" /></button>
            </div>
          ))}
          {variants.length < 8 && <Button type="button" size="sm" variant="ghost" onClick={() => setVariants([...variants, { label: `Variant ${String.fromCharCode(65 + variants.length - 1)}`, description: "", isControl: false }])}><Plus /> Add variant</Button>}
        </fieldset>
      )}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : experimentId ? "Save changes" : "Save experiment"}</Button>
    </form>
  );
}
