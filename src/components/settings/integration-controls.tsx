"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { updateIntegrationAction } from "@/lib/data/settings-actions";
import { cn } from "@/lib/utils";
import { FormStatus } from "./form-status";

type Provider = "qloo" | "llm" | "web_research";

/** Admin-only, non-secret per-workspace preferences. Secrets are never entered here. */
export function IntegrationControls({ provider, enabled, defaultLocation, canManage }: { provider: Provider; enabled: boolean; defaultLocation?: string; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = React.useState(enabled);
  const [location, setLocation] = React.useState(defaultLocation ?? "");
  const [status, setStatus] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();
  const dirty = on !== enabled || (provider === "qloo" && location !== (defaultLocation ?? ""));

  const save = () =>
    start(async () => {
      const r = await updateIntegrationAction(
        provider === "qloo"
          ? { provider, enabled: on, config: { defaultLocation: location } }
          : { provider, enabled: on, config: {} },
      );
      if (!r.ok) return setStatus({ error: r.error });
      setStatus({ success: "Saved for this workspace." });
      toast({ tone: "success", title: "Integration preference saved" });
      router.refresh();
    });

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <span id={`int-${provider}`} className="text-[13px]">Use in this workspace</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`int-${provider}`}
          disabled={!canManage}
          onClick={() => setOn((v) => !v)}
          className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", on ? "bg-violet" : "bg-ink/15")}
        >
          <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
        </button>
      </div>
      {provider === "qloo" && (
        <Field label="Default location" htmlFor="qloo-location" optional hint="Non-secret default for audience and place signals, e.g. “London” or “New York”.">
          <Input id="qloo-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} disabled={!canManage} placeholder="Not set" />
        </Field>
      )}
      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : "Save preference"}</Button>
          <FormStatus error={status.error} success={status.success} />
        </div>
      ) : (
        <p className="text-[12px] text-muted">Only admins and owners can change integration preferences.</p>
      )}
    </div>
  );
}
