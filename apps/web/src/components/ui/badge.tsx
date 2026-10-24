import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border px-2 py-1 font-label text-[0.65rem] font-bold uppercase tracking-[0.14em] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-primary aria-invalid:ring-destructive/30 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground",
        destructive: "border-[#93000a] bg-[#93000a] text-[#ffb4ab]",
        outline: "border-border bg-surface-elevated text-muted-foreground",
        secondary: "border-border bg-foreground text-background",
      },
    },
  },
);

function Badge({
  asChild = false,
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp className={cn(badgeVariants({ variant }), className)} data-slot="badge" {...props} />
  );
}

export { Badge, badgeVariants };
