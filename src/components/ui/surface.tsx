import * as React from "react";
import { cn } from "@/lib/utils";

/** White content surface (evidence, research cards, report content). */
export function Surface({ className, as: Tag = "section", ...props }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" | "aside" }) {
  return <Tag className={cn("rounded-cc-lg border border-line bg-paper shadow-card", className)} {...props} />;
}

export function SectionTitle({ eyebrow, title, action, className }: { eyebrow?: string; title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && <p className="cc-eyebrow mb-1.5 text-muted">{eyebrow}</p>}
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}
