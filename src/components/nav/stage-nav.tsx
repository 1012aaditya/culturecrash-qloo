"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ClipboardList, Compass, FlaskConical, LineChart, Sparkles } from "lucide-react";
import { STAGES, stageForPath, stageHref, type StageKey } from "@/lib/stages";
import type { StageState } from "@/lib/progress";
import { cn } from "@/lib/utils";

const icons: Record<StageKey, React.ComponentType<{ className?: string }>> = {
  explore: Compass, interpret: Sparkles, create: ClipboardList, test: FlaskConical, track: LineChart,
};

export type StageInfo = { state: StageState; missing: string | null };

const tabs: Record<StageKey, { href: string; label: string }[]> = {
  explore: [{ href: "brief", label: "Brief" }, { href: "research", label: "Research canvas" }, { href: "research/history", label: "Run history" }],
  interpret: [{ href: "opportunities", label: "Opportunities & evidence" }],
  create: [{ href: "strategy", label: "Strategy studio" }, { href: "strategy/compare", label: "Compare" }, { href: "creative-brief", label: "Creative brief" }],
  test: [{ href: "experiments", label: "Experiments" }],
  track: [{ href: "reports", label: "Reports" }],
};

/** Horizontal workflow navigator used on every campaign page except the immersive research canvas. */
export function StageNav({ projectId, stages }: { projectId: string; stages: Record<StageKey, StageInfo> }) {
  const pathname = usePathname();
  const active = stageForPath(pathname);
  // The research canvas has its own immersive vertical rail on wide screens.
  const research = /\/research$/.test(pathname);
  const sub = pathname.split(`/projects/${projectId}/`)[1] ?? "";
  return (
    <div className={cn("cc-no-print space-y-3", research && "xl:hidden")}>
      <nav aria-label="Campaign workflow" className="cc-glass-dark flex gap-1 overflow-x-auto rounded-full p-1.5 text-white">
        {STAGES.map((s) => {
          const Icon = icons[s.key];
          const info = stages[s.key];
          const isActive = active === s.key;
          return (
            <Link
              key={s.key}
              href={stageHref(projectId, s.key)}
              aria-current={isActive ? "step" : undefined}
              title={info.missing ?? undefined}
              className={cn(
                "group flex min-w-[150px] flex-1 items-center gap-2.5 rounded-full px-3 py-2 transition-colors",
                isActive ? "bg-white text-ink" : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", isActive ? "border-violet/30 bg-lilac text-violet" : "border-white/15")}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-tight">{s.label}</span>
                <span className={cn("block truncate text-[10px]", isActive ? "text-muted" : "text-white/45")}>
                  {info.state === "done" ? "Complete" : info.missing ?? (info.state === "partial" ? "In progress" : "Not started")}
                </span>
              </span>
              <span className={cn("font-mono text-[10px]", isActive ? "text-muted" : "text-white/40")}>{s.number}</span>
              {info.state === "done" && <Check className={cn("size-3.5", isActive ? "text-violet" : "text-lavender")} aria-label="complete" />}
            </Link>
          );
        })}
      </nav>
      {active && tabs[active].length > 1 && (
        <div role="tablist" aria-label={`${active} views`} className="flex gap-1 overflow-x-auto">
          {tabs[active].map((t) => {
            const on = sub === t.href || (t.href === "research" && sub === "research");
            return (
              <Link key={t.href} role="tab" aria-selected={on} href={`/projects/${projectId}/${t.href}`} className={cn("rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap", on ? "bg-ink text-white" : "text-muted hover:bg-ink/5 hover:text-ink")}>
                {t.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Immersive vertical stage treatment used on the research canvas (not a global sidebar). */
export function StageRail({ projectId, stages }: { projectId: string; stages: Record<StageKey, StageInfo> }) {
  return (
    <nav aria-label="Campaign workflow" className="flex flex-col gap-2">
      {STAGES.map((s) => {
        const Icon = icons[s.key];
        const on = s.key === "explore";
        return (
          <Link
            key={s.key}
            href={stageHref(projectId, s.key)}
            aria-current={on ? "step" : undefined}
            title={stages[s.key].missing ?? undefined}
            className={cn("flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-4 transition-colors", on ? "bg-white/12 text-white ring-1 ring-white/25" : "text-white/65 hover:bg-white/8 hover:text-white")}
          >
            <span className={cn("flex size-10 items-center justify-center rounded-full border", on ? "border-white/40 bg-white text-ink" : "border-white/20")}>
              <Icon className="size-4" />
            </span>
            <span className="flex-1 text-[15px]">{s.label}</span>
            <span className="font-mono text-[11px] text-white/50">{s.number}</span>
            {stages[s.key].state === "done" && <Check className="size-3.5 text-lavender" aria-label="complete" />}
          </Link>
        );
      })}
    </nav>
  );
}
