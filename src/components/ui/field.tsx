import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-cc-sm border border-line bg-paper px-3.5 text-[14px] text-ink placeholder:text-faint transition-colors hover:border-line-strong focus:border-violet focus:outline-none focus:ring-4 focus:ring-violet/12 disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23696774%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-ink", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
  optional,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-presence-field={htmlFor}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional && <span className="text-[11px] text-faint">Optional</span>}
      </div>
      {children}
      {error ? (
        <p className="text-[12px] text-danger" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
