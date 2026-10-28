"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Contextual horizontal pill tabs used under a page header (settings, workspace).
 * Deliberately not a sidebar: it scrolls horizontally on small screens.
 */
export function TabRow({ tabs, label }: { tabs: { href: string; label: string; badge?: string; exact?: boolean }[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => {
        const on = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
              on ? "bg-ink text-white" : "text-muted hover:bg-ink/5 hover:text-ink",
            )}
          >
            {t.label}
            {t.badge && <span className={cn("rounded-full px-1.5 text-[10px]", on ? "bg-white/15" : "bg-ink/5")}>{t.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
