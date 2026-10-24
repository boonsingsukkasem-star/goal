import { Xmark as X } from "iconoir-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FavoriteChip({
  busy = false,
  href,
  label,
  onRemove,
  variant = "square",
}: {
  busy?: boolean;
  href: string;
  label: string;
  onRemove: () => void;
  variant?: "pill" | "square";
}) {
  return (
    <div
      className={cn(
        "group flex items-center overflow-hidden border border-border transition-colors hover:border-primary",
        variant === "pill" ? "rounded-full" : "bg-surface-elevated",
      )}
    >
      <Link
        className={cn(
          "group-hover:text-primary",
          variant === "pill"
            ? "px-3 py-1.5 text-sm"
            : "px-3 py-2 font-label text-xs font-bold tracking-[0.08em] uppercase",
        )}
        href={href}
      >
        {label}
      </Link>
      <Button
        aria-label={`เลิกติดตาม ${label}`}
        className="h-auto self-stretch rounded-none border-l border-border px-2.5 text-muted-foreground hover:bg-transparent hover:text-destructive"
        disabled={busy}
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <X aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}
