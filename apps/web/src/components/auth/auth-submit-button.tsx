"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function AuthSubmitButton({
  children,
  className,
  pendingLabel = "Please wait",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();

  return (
    <Button className={className} disabled={pending} type="submit" variant={variant}>
      {pending && <Spinner />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
