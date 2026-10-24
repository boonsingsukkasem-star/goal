import type * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group/input-group relative flex w-full items-center border border-input bg-background outline-none transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 has-[[data-slot=input][aria-invalid=true]]:border-destructive",
        className,
      )}
      data-slot="input-group"
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        "flex-1 border-0 bg-transparent shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0",
        className,
      )}
      data-slot="input-group-control"
      {...props}
    />
  );
}

function InputGroupAddon({
  align = "inline-start",
  className,
  ...props
}: React.ComponentProps<"div"> & { align?: "inline-end" | "inline-start" }) {
  return (
    <div
      className={cn(
        "order-first flex shrink-0 items-center gap-2 px-3 text-muted-foreground [&_svg]:size-4",
        align === "inline-end" && "order-last",
        className,
      )}
      data-align={align}
      data-slot="input-group-addon"
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-sm", className)} data-slot="input-group-text" {...props} />;
}

export { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText };
