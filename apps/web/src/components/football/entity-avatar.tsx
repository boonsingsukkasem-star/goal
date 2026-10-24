import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function fallbackInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function FootballEntityAvatar({
  className,
  fallback,
  imageClassName,
  imageUrl,
  name,
}: {
  className?: string;
  fallback?: ReactNode;
  imageClassName?: string;
  imageUrl?: null | string;
  name: string;
}) {
  return (
    <Avatar
      aria-label={name}
      className={cn(
        "size-12 rounded-none border border-border bg-surface-elevated text-primary",
        className,
      )}
    >
      {imageUrl ? (
        <AvatarImage alt={name} className={cn("object-contain", imageClassName)} src={imageUrl} />
      ) : null}
      <AvatarFallback className="rounded-none bg-surface-elevated font-headline text-primary">
        {fallback ?? fallbackInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function FootballEntityWatermark({
  className,
  imageClassName,
  imageUrl,
}: {
  className?: string;
  imageClassName?: string;
  imageUrl?: null | string;
}) {
  if (!imageUrl) return null;

  return (
    <Avatar
      aria-hidden="true"
      className={cn(
        "pointer-events-none size-40 rounded-none border-0 bg-transparent",
        className,
      )}
    >
      <AvatarImage
        alt=""
        className={cn(
          "object-contain opacity-[0.09] grayscale contrast-125 transition-[filter,opacity,transform] duration-300 group-hover:scale-[1.03] group-hover:opacity-[0.14]",
          imageClassName,
        )}
        src={imageUrl}
      />
    </Avatar>
  );
}
