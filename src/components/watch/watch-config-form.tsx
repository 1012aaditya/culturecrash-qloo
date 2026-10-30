"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveWatchAction } from "@/lib/watch/actions";

type Values = { company: string; competitors: string[]; keywords: string[]; market: string; frequency: "daily" | "weekly" };

/** What to watch: the client's company name as the press writes it, up to two competitors, optional topics. */
export function WatchConfigForm({ clientId, initial, canEdit, exists }: { clientId: string; initial: Values; canEdit: boolean; exists: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [company, setCompany] = React.useState(initial.company);
  const [c1, setC1] = React.useState(initial.competitors[0] ?? "");
  const [c2, setC2] = React.useState(initial.competitors[1] ?? "");
  const [keywords, setKeywords] = React.useState(initial.keywords.join(", "));
  const [market, setMarket] = React.useState(initial.market);
  const [frequency, setFrequency] = React.useState(initial.frequency);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();

  const save = () =>
    start(async () => {
      const r = await saveWatchAction(clientId, {
        company,
        competitors: [c1, c2],
        keywords: keywords.split(",").map((k) => k.trim()),
        market,
        frequency,
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setMsg({ error: r.error });
        return;
      }
      setErrors({});
      setMsg({ success: r.message });
      toast({ tone: "success", title: exists ? "Watch updated" : "Watch started", description: r.message });
      router.refresh();
    });

  return (
    <form className="rounded-cc-lg border border-line bg-paper p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <p className="cc-eyebrow text-muted">{exists ? "What we watch" : "Set up Watch"}</p>
      <fieldset disabled={!canEdit || pending} className="mt-4 space-y-4">
        <Field label="Company" htmlFor="watch-company" hint="The name the press uses." error={errors.company}>
          <Input id="watch-company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} required aria-invalid={Boolean(errors.company)} />
        </Field>
        <Field label="Competitors" htmlFor="watch-c1" optional hint="Up to two." error={errors.competitors}>
          <div className="space-y-2">
            <Input id="watch-c1" value={c1} onChange={(e) => setC1(e.target.value)} maxLength={120} placeholder="Competitor" aria-label="First competitor" />
            <Input value={c2} onChange={(e) => setC2(e.target.value)} maxLength={120} placeholder="Competitor" aria-label="Second competitor" />
          </div>
        </Field>
        <Field label="Topics" htmlFor="watch-keywords" optional hint="Comma-separated, e.g. sustainability, running. Left empty, we look for launches, campaigns and partnerships." error={errors.keywords}>
          <Input id="watch-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} maxLength={600} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Market" htmlFor="watch-market" optional error={errors.market}>
            <Input id="watch-market" value={market} onChange={(e) => setMarket(e.target.value)} maxLength={80} placeholder="e.g. UK" />
          </Field>
          <Field label="Checks" htmlFor="watch-frequency" error={errors.frequency}>
            <Select id="watch-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Values["frequency"])}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>
        </div>
      </fieldset>
      {canEdit ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : exists ? "Save changes" : "Start watching"}</Button>
          <FormStatus error={msg.error} success={msg.success} />
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-muted">Viewers can see the watch but not change it.</p>
      )}
    </form>
  );
}
