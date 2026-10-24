import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionHeading({
  action,
  children,
  className,
  live = false,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  live?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-10 items-end justify-between gap-4",
        !live && "border-b border-border pb-2",
        className,
      )}
      data-slot="section-heading"
    >
      <h2 className="flex items-center gap-2 font-headline text-2xl tracking-[0.04em] uppercase sm:text-3xl">
        {live ? <span className="size-2.5 animate-pulse rounded-full bg-[#ffb4ab]" /> : null}
        {children}
      </h2>
      {action}
    </div>
  );
}
