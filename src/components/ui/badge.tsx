import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-ink/5 text-ink/75 border-transparent",
  outline: "bg-paper text-muted border-line",
  violet: "bg-lilac/70 text-violet-ink border-transparent",
  peach: "bg-peach/40 text-[#8a3d22] border-transparent",
  success: "bg-success/10 text-success border-transparent",
  warning: "bg-warning/10 text-warning border-transparent",
  danger: "bg-danger/10 text-danger border-transparent",
  dark: "bg-ink text-white border-transparent",
  glass: "bg-white/15 text-white border-white/20 backdrop-blur",
};

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 [&_svg]:size-3", tones[tone], className)}
      {...props}
    />
  );
}
