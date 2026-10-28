"use client";

import { Sparkles } from "lucide-react";

/** Compact assistant entry point: opens the command palette. */
export function AskEntry({ label = "Ask CultureCrash, or jump to anything…" }: { label?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("cc:open-palette"))}
      className="flex h-12 w-full max-w-md items-center gap-3 rounded-full border border-line bg-paper/80 px-4 text-left text-[13px] text-muted shadow-card transition-colors hover:border-line-strong"
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-lilac text-violet"><Sparkles className="size-3.5" /></span>
      <span className="flex-1">{label}</span>
      <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd>
    </button>
  );
}
