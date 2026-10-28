import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[background,color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-charcoal-2 shadow-[0_6px_18px_-8px_rgba(17,17,22,0.6)]",
        accent: "bg-violet text-white hover:bg-violet-ink shadow-[0_8px_22px_-10px_rgba(128,100,245,0.9)]",
        outline: "border border-line bg-paper text-ink hover:border-line-strong hover:bg-ivory",
        ghost: "text-ink hover:bg-ink/5",
        soft: "bg-lilac/70 text-violet-ink hover:bg-lilac",
        danger: "bg-danger text-white hover:bg-danger/90",
        inverse: "bg-white text-ink hover:bg-ivory",
        "ghost-dark": "text-white/80 hover:bg-white/10 hover:text-white",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
