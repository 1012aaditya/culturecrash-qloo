import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id="ccm-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B8A5FF" />
          <stop offset="0.55" stopColor="#8064F5" />
          <stop offset="1" stopColor="#F29A8B" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#ccm-a)" />
      <circle cx="26" cy="15" r="13.5" fill={dark ? "#17151E" : "#111116"} />
      <circle cx="12.5" cy="27" r="2.2" fill="#fff" opacity="0.9" />
    </svg>
  );
}

export function Logo({ href = "/", dark = false, className }: { href?: string; dark?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="CultureCrash home">
      <LogoMark dark={dark} />
      <span className={cn("text-[19px] font-semibold tracking-[-0.03em]", dark ? "text-white" : "text-ink")}>CultureCrash</span>
    </Link>
  );
}
