import Link from "next/link";
import { AlertTriangle, FlaskConical, Info } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title, body, action, icon: Icon = Info, className, tone = "light",
}: {
  title: string; body?: React.ReactNode; action?: { href: string; label: string } | React.ReactNode; icon?: React.ComponentType<{ className?: string }>; className?: string; tone?: "light" | "dark";
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-cc-lg border border-dashed p-8", tone === "dark" ? "border-white/15 text-white" : "border-line-strong bg-paper/60", className)}>
      <span className={cn("flex size-10 items-center justify-center rounded-full", tone === "dark" ? "bg-white/10" : "bg-lilac/60 text-violet-ink")}>
        <Icon className="size-[18px]" />
      </span>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {body && <div className={cn("max-w-md text-[13px] leading-relaxed", tone === "dark" ? "text-white/65" : "text-muted")}>{body}</div>}
      {action && (typeof action === "object" && "href" in (action as object) ? (
        <Button asChild size="sm" className="mt-1"><Link href={(action as { href: string }).href}>{(action as { label: string }).label}</Link></Button>
      ) : (action as React.ReactNode))}
    </div>
  );
}

export function ErrorNotice({ title, body, children, className }: { title: string; body?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex gap-3 rounded-cc border border-danger/20 bg-danger/[0.04] p-4", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-medium text-ink">{title}</p>
        {body && <div className="mt-1 leading-relaxed text-muted">{body}</div>}
        {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

/** Mandatory label on anything derived from fixture data. */
export function DemoBadge({ className, label = "Demonstration data" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-peach/50 px-2.5 py-0.5 text-[11px] font-medium text-[#8a3d22]", className)} title="Fixture records for demonstration. Not live research.">
      <FlaskConical className="size-3" /> {label}
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-5 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="cc-eyebrow mb-3 text-muted">{eyebrow}</div>}
        <h1 className="cc-display text-5xl md:text-[64px]">{title}</h1>
        {description && <div className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
