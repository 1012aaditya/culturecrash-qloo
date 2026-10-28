"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Re-fetches the server-rendered task list every few seconds while any task is
 * queued or running. Stops when nothing is active or the tab is hidden.
 */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  const [refreshing, start] = React.useTransition();

  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") start(() => router.refresh());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, router]);

  return (
    <div className="flex items-center gap-2 text-[12px] text-muted" aria-live="polite">
      {active ? (
        <>
          <span className="size-2 rounded-full bg-violet cc-animate-pulse" aria-hidden />
          Updating automatically while tasks are running
        </>
      ) : (
        <span>No running tasks — not auto-updating</span>
      )}
      <button
        type="button"
        onClick={() => start(() => router.refresh())}
        className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-ink hover:bg-ink/5"
        aria-label="Refresh tasks now"
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Refresh
      </button>
    </div>
  );
}
