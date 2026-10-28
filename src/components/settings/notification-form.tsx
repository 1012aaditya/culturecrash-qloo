"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { updateNotificationsAction } from "@/lib/data/settings-actions";
import { cn } from "@/lib/utils";
import { FormStatus } from "./form-status";

const ITEMS: { key: string; title: string; body: string }[] = [
  { key: "research_completed", title: "Research run finished", body: "When a research run you started completes or fails." },
  { key: "report_shared", title: "Report shared", body: "When a teammate shares a report link from a campaign you own." },
  { key: "weekly_digest", title: "Weekly digest", body: "A Monday summary of workspace activity and open tasks." },
];

export function NotificationForm({ initial }: { initial: Record<string, boolean> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [prefs, setPrefs] = React.useState(initial);
  const [status, setStatus] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();
  const dirty = ITEMS.some((i) => prefs[i.key] !== initial[i.key]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateNotificationsAction(prefs);
          if (!r.ok) return setStatus({ error: r.error });
          setStatus({ success: "Preferences saved." });
          toast({ tone: "success", title: "Notification preferences saved" });
          router.refresh();
        });
      }}
    >
      <ul className="divide-y divide-line rounded-cc-lg border border-line bg-paper">
        {ITEMS.map((item) => {
          const on = Boolean(prefs[item.key]);
          return (
            <li key={item.key} className="flex items-start justify-between gap-4 p-4">
              <div>
                <p id={`n-${item.key}`} className="text-[14px] font-medium">{item.title}</p>
                <p className="mt-0.5 text-[12px] text-muted">{item.body}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`n-${item.key}`}
                onClick={() => setPrefs((p) => ({ ...p, [item.key]: !on }))}
                className={cn("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", on ? "bg-violet" : "bg-ink/15")}
              >
                <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : "Save preferences"}</Button>
        <FormStatus error={status.error} success={status.success} />
      </div>
    </form>
  );
}
