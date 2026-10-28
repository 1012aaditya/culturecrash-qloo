"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/product", label: "Product" },
  { href: "/solutions/agencies", label: "Agencies" },
  { href: "/solutions/brands", label: "Brand teams" },
  { href: "/showcase", label: "Showcase" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <nav aria-label="Primary" className="cc-glass pointer-events-auto mx-auto flex h-14 max-w-[1320px] items-center gap-3 rounded-full pl-4 pr-2">
        <Logo />
        <ul className="ml-6 hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-2 text-[13px] text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink",
                  pathname === l.href && "bg-ink/5 text-ink",
                )}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto hidden items-center gap-1.5 sm:flex">
          {signedIn ? (
            <Button asChild size="sm" className="h-10 px-4">
              <Link href="/dashboard">Open workspace</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="h-10 px-4">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="h-10 px-4">
                <Link href="/signup">Start a campaign</Link>
              </Button>
            </>
          )}
        </div>
        <button
          className="ml-auto inline-flex size-10 items-center justify-center rounded-full hover:bg-ink/5 sm:ml-1 lg:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      {open && (
        <div id="site-menu" className="cc-glass cc-animate-in pointer-events-auto mx-auto mt-2 max-w-[1320px] rounded-cc-lg p-3 lg:hidden">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block rounded-cc-sm px-3 py-3 text-[15px] hover:bg-ink/5">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2 border-t border-line pt-3">
            {signedIn ? (
              <Button asChild className="flex-1"><Link href="/dashboard">Open workspace</Link></Button>
            ) : (
              <>
                <Button asChild variant="outline" className="flex-1"><Link href="/login">Sign in</Link></Button>
                <Button asChild className="flex-1"><Link href="/signup">Start a campaign</Link></Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
