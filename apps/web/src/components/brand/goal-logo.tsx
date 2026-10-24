import Image from "next/image";

import { cn } from "@/lib/utils";

type GoalLogoProps = {
  className?: string;
  priority?: boolean;
};

export function GoalLogo({ className, priority = false }: GoalLogoProps) {
  return (
    <Image
      alt="GOAL"
      className={cn("h-auto w-24", className)}
      height={72}
      priority={priority}
      src="/brand/goal-logo.svg"
      width={206}
    />
  );
}
