import { cn, hashString, initials } from "@/lib/utils";

const tones = ["#8064F5", "#F29A8B", "#17151E", "#B8A5FF", "#c58b6d", "#5b3fd6"];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const bg = tones[hashString(name) % tones.length];
  return (
    <span
      title={name}
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white", className)}
      style={{ background: bg }}
    >
      {initials(name)}
    </span>
  );
}
