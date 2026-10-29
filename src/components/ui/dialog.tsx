"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-[2px] data-[state=open]:animate-[cc-fade-in_.25s_ease-out] data-[state=closed]:animate-[cc-fade-out_.15s_ease-in]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[12vh] z-50 max-h-[86dvh] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-y-auto rounded-cc-lg border border-line bg-paper p-6 shadow-[0_30px_80px_-20px_rgba(17,17,22,0.45)] focus:outline-none data-[state=open]:animate-[cc-dialog-in_.32s_var(--cc-ease-out)] data-[state=closed]:animate-[cc-dialog-out_.16s_var(--cc-ease-in)]",
          className,
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-lg font-semibold tracking-tight">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
