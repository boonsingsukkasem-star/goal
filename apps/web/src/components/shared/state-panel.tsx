import type { Search } from "iconoir-react";
import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function StatePanel({
  action,
  className,
  description,
  icon: IconComponent,
  title,
}: {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: typeof Search;
  title: ReactNode;
}) {
  return (
    <Empty className={cn("min-h-40 bg-surface", className)}>
      <EmptyHeader>
        {IconComponent ? (
          <EmptyMedia variant="icon">
            <IconComponent aria-hidden="true" />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
