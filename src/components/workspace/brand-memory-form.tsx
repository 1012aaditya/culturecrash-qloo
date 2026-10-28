"use client";

import { BadgeCheck, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveBrandMemoryAction, setBrandApprovalAction } from "@/lib/data/client-actions";
import { cn } from "@/lib/utils";

export type BrandValues = { guidelines: string; approvedMessaging: string; positioning: string; audienceDefinitions: string; priorDecisions: string };

const FIELDS: { key: keyof BrandValues; label: string; hint: string; rows: number; max: number; wide?: boolean }[] = [
  { key: "positioning", label: "Positioning", hint: "How the brand wants to be understood, and against whom.", rows: 5, max: 6000 },
  { key: "approvedMessaging", label: "Approved messaging", hint: "Lines, claims and proof points the client has signed off.", rows: 5, max: 8000 },
  { key: "audienceDefinitions", label: "Audience definitions", hint: "Named audiences with the traits the client uses to describe them.", rows: 6, max: 8000 },
  { key: "guidelines", label: "Brand guidelines", hint: "Tone of voice, mandatories, no-go territories, visual rules.", rows: 6, max: 12000 },
  { key: "priorDecisions", label: "Prior decisions", hint: "What was decided before, when, and why — so the team doesn’t relitigate it.", rows: 5, max: 8000, wide: true },
];

export function BrandMemoryForm({
  clientId, initial, status, canEdit, canApprove,
}: { clientId: string; initial: BrandValues; status: "draft" | "approved"; canEdit: boolean; canApprove: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();
  const dirty = FIELDS.some((f) => v[f.key] !== initial[f.key]);
  const hasContent = FIELDS.some((f) => initial[f.key].trim());

  const save = () =>
    start(async () => {
      const r = await saveBrandMemoryAction(clientId, v);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setMsg({ error: r.error });
        return;
      }
      setErrors({});
      setMsg({ success: r.message });
      toast({ tone: "success", title: "Brand memory saved", description: r.message });
      router.refresh();
    });

  const approve = (yes: boolean) =>
    start(async () => {
      const r = await setBrandApprovalAction(clientId, yes);
      if (!r.ok) {
        setMsg({ error: r.error });
        toast({ tone: "error", title: r.error });
        return;
      }
      setMsg({ success: yes ? "Approved." : "Returned to draft." });
      toast({ tone: "success", title: yes ? "Brand memory approved" : "Returned to draft" });
      router.refresh();
    });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="grid gap-5 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={cn("rounded-cc-lg border border-line bg-paper p-5", f.wide && "md:col-span-2")}>
            <Field label={f.label} htmlFor={`brand-${f.key}`} hint={f.hint} error={errors[f.key]}>
              <Textarea
                id={`brand-${f.key}`}
                value={v[f.key]}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                rows={f.rows}
                maxLength={f.max}
                readOnly={!canEdit}
                placeholder={canEdit ? "Not recorded yet" : "Not recorded"}
                className={cn(!canEdit && "bg-ivory/60")}
                aria-invalid={Boolean(errors[f.key])}
              />
            </Field>
          </div>
        ))}
      </div>

      <div className="cc-glass sticky bottom-4 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-full px-4 py-2.5">
        {canEdit ? (
          <Button type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : status === "approved" && dirty ? "Save as draft" : "Save"}</Button>
        ) : (
          <span className="px-2 text-[13px] text-muted">Read-only for viewers.</span>
        )}
        {canApprove && status === "draft" && (
          <Button type="button" variant="accent" disabled={pending || dirty || !hasContent} onClick={() => approve(true)} title={dirty ? "Save your edits before approving" : undefined}>
            <BadgeCheck /> Approve
          </Button>
        )}
        {canApprove && status === "approved" && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => approve(false)}><Undo2 /> Return to draft</Button>
        )}
        <div className="min-w-0 flex-1 text-[12px]">
          {msg.error || msg.success ? (
            <FormStatus error={msg.error} success={msg.success} />
          ) : dirty ? (
            <span className="text-muted">Unsaved changes{status === "approved" ? " — saving returns this to draft." : "."}</span>
          ) : !canApprove && status === "draft" ? (
            <span className="text-muted">An admin or owner can approve this once it’s complete.</span>
          ) : null}
        </div>
      </div>
    </form>
  );
}
