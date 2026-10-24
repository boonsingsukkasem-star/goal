"use client";

import type { ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface UnderlineTabItem<Value extends string> {
  disabled?: boolean;
  label: ReactNode;
  value: Value;
}

export function UnderlineTabs<Value extends string>({
  ariaLabel,
  className,
  itemClassName,
  items,
  onValueChange,
  value,
}: {
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
  items: readonly UnderlineTabItem<Value>[];
  onValueChange: (value: Value) => void;
  value: Value;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <ToggleGroup
        aria-label={ariaLabel}
        className="h-12 w-max gap-0 rounded-none border-0 bg-transparent p-0"
        onValueChange={(nextValue) => {
          if (nextValue) onValueChange(nextValue as Value);
        }}
        spacing={1}
        type="single"
        value={value}
      >
        {items.map((item) => (
          <ToggleGroupItem
            className={cn(
              "relative h-12 w-[5.5rem] min-w-[5.5rem] rounded-none border-0 bg-transparent px-1 font-label text-[0.68rem] font-bold tracking-normal text-muted-foreground shadow-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-transparent after:content-[''] hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:after:bg-primary data-[state=on]:bg-transparent data-[state=on]:text-primary data-[state=on]:after:bg-primary data-[state=on]:hover:bg-transparent data-[state=on]:hover:text-primary",
              itemClassName,
            )}
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            <span className="truncate">{item.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
