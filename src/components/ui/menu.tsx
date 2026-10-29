"use client";

import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;

export function MenuContent({ className, align = "end", children, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={8}
        className={cn(
          "z-50 min-w-56 rounded-cc border border-line bg-paper/95 p-1.5 shadow-[0_24px_60px_-20px_rgba(17,17,22,0.35)] backdrop-blur-xl origin-[var(--radix-dropdown-menu-content-transform-origin)] data-[state=open]:animate-[cc-scale-in_.24s_var(--cc-ease-out)] data-[state=closed]:animate-[cc-scale-out_.12s_var(--cc-ease-in)]",
          className,
        )}
        {...props}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] text-ink outline-none transition-colors duration-150 data-[highlighted]:bg-ink/5 data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("cc-eyebrow px-2.5 pb-1 pt-2 text-[10px] text-faint", className)} {...props} />;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}
