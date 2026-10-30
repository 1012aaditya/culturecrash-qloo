"use client";

import Link from "next/link";
import * as React from "react";
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
  create: [{ href: "strategy", label: "Strategy studio" }, { href: "strategy/compare", label: "Compare" }, { href: "creative-brief", label: "Creative brief" }, { href: "boards", label: "Inspiration boards" }],
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
  const navRef = React.useRef<HTMLElement>(null);
  const { box, animate } = useActivePill(navRef, active);
  return (
    <div className={cn("cc-no-print space-y-3", research && "xl:hidden")}>
      <nav ref={navRef} aria-label="Campaign workflow" className="cc-glass-dark relative flex gap-1 overflow-x-auto rounded-full p-1.5 text-white">
        {/* One white pill that glides to the active stage */}
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute top-1.5 bottom-1.5 rounded-full bg-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)]", animate && "transition-[left,width] duration-500 ease-[var(--cc-ease-spring)]")}
          style={{ left: box.left, width: box.width, opacity: box.width ? 1 : 0 }}
        />
        {STAGES.map((s) => {
          const Icon = icons[s.key];
          const info = stages[s.key];
          const isActive = active === s.key;
          return (
            <Link
              key={s.key}
              href={stageHref(projectId, s.key)}
              aria-current={isActive ? "step" : undefined}
              data-stage={s.key}
              title={info.missing ?? undefined}
              className={cn(
                "group relative z-10 flex min-w-[150px] flex-1 items-center gap-2.5 rounded-full px-3 py-2 transition-colors duration-300",
                isActive ? "text-ink" : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border transition-[background,border-color,color,scale] duration-300 group-hover:scale-110", isActive ? "border-violet/30 bg-lilac text-violet" : "border-white/15")}>
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
            const on = sub === t.href || (t.href === "research" && sub === "research") || (t.href === "boards" && sub.startsWith("boards/"));
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

/** Measures the active stage link so the indicator can slide to it (no slide on first paint). */
function useActivePill(navRef: React.RefObject<HTMLElement | null>, active: StageKey | null) {
  const [box, setBox] = React.useState({ left: 0, width: 0 });
  const [animate, setAnimate] = React.useState(false);
  React.useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const el = active ? nav.querySelector<HTMLElement>(`[data-stage="${active}"]`) : null;
    // ResizeObserver calls back once immediately, then on every size change.
    const ro = new ResizeObserver(() => setBox(el ? { left: el.offsetLeft, width: el.offsetWidth } : { left: 0, width: 0 }));
    ro.observe(nav);
    const id = requestAnimationFrame(() => setAnimate(true));
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(id);
    };
  }, [navRef, active]);
  return { box, animate };
}
