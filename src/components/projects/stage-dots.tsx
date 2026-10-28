import { STAGES } from "@/lib/stages";
import type { StageState } from "@/lib/progress";
import { cn } from "@/lib/utils";

export function StageDots({ states, dark = false }: { states: Record<string, StageState>; dark?: boolean }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Workflow progress">
      {STAGES.map((s) => (
        <li key={s.key} title={`${s.label}: ${states[s.key] === "done" ? "complete" : states[s.key] === "partial" ? "in progress" : "not started"}`} className="flex items-center">
          <span
            className={cn(
              "block h-1.5 w-5 rounded-full",
              states[s.key] === "done" ? "bg-violet" : states[s.key] === "partial" ? (dark ? "bg-lavender/70" : "bg-lavender") : dark ? "bg-white/20" : "bg-ink/10",
            )}
          />
          <span className="sr-only">{s.label}: {states[s.key]}</span>
        </li>
      ))}
    </ol>
  );
}
