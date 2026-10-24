import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset className={cn("flex flex-col gap-5", className)} data-slot="field-set" {...props} />
  );
}

function FieldLegend({ className, ...props }: React.ComponentProps<"legend">) {
  return (
    <legend
      className={cn("mb-3 font-headline text-2xl uppercase", className)}
      data-slot="field-legend"
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-5", className)} data-slot="field-group" {...props} />
  );
}

const fieldVariants = cva("group/field flex w-full gap-2 data-[invalid=true]:text-destructive", {
  defaultVariants: { orientation: "vertical" },
  variants: {
    orientation: {
      horizontal: "flex-row items-center justify-between",
      responsive:
        "flex-col sm:flex-row sm:items-center sm:justify-between data-[orientation=responsive]:flex-col",
      vertical: "flex-col",
    },
  },
});

function Field({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      className={cn(fieldVariants({ orientation }), className)}
      data-orientation={orientation}
      data-slot="field"
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-1 flex-col gap-1", className)}
      data-slot="field-content"
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label className={cn(className)} data-slot="field-label" {...props} />;
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-xs leading-relaxed text-muted-foreground", className)}
      data-slot="field-description"
      {...props}
    />
  );
}

function FieldError({ className, children, ...props }: React.ComponentProps<"div">) {
  if (!children) return null;
  return (
    <div
      className={cn("text-xs text-destructive", className)}
      data-slot="field-error"
      role="alert"
      {...props}
    >
      {children}
    </div>
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
};
