import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-label text-sm font-bold uppercase tracking-[0.08em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/30 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: { size: "default", variant: "default" },
    variants: {
      size: {
        default: "h-10 px-4 py-2",
        icon: "size-10",
        "icon-lg": "size-12",
        "icon-sm": "size-8",
        "icon-xs": "size-6",
        lg: "h-12 px-6 text-base",
        sm: "h-8 gap-1.5 px-3 text-xs",
        xs: "h-6 gap-1 px-2 text-[0.65rem]",
      },
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#ffe33d]",
        destructive: "bg-destructive text-white hover:bg-destructive/85",
        ghost: "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
        outline:
          "border border-border bg-surface text-foreground hover:border-primary hover:text-primary",
        secondary: "bg-foreground text-background hover:bg-foreground/85",
      },
    },
  },
);

function Button({
  asChild = false,
  className,
  size,
  variant,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      className={cn(buttonVariants({ className, size, variant }))}
      data-slot="button"
      {...props}
    />
  );
}

export { Button, buttonVariants };
