import * as React from "react";
import { cn } from "@/lib/utils";

/** Quiet two-column settings block: explanation on the left, controls on a white surface. */
export function SettingsSection({ title, description, children, className, aside }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={cn("grid gap-4 border-b border-line py-8 first:pt-2 last:border-0 md:grid-cols-[280px_1fr] md:gap-10", className)}>
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <div className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</div>}
        {aside && <div className="mt-3">{aside}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function ReadOnlyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-cc-sm bg-ink/[0.04] px-3 py-2 text-[12px] text-muted">{children}</p>;
}
