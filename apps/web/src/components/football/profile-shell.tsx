import { ArrowLeft } from "iconoir-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FootballEntityAvatar } from "@/components/football/entity-avatar";

export function FootballProfilePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className="goal-discovery-grid min-h-screen border-t border-border">
      <div className={cn("mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10", className)}>
        <Button asChild className="-ml-3 text-xs" variant="ghost">
          <Link href="/explore">
            <ArrowLeft aria-hidden="true" /> Explore
          </Link>
        </Button>
        {children}
      </div>
    </main>
  );
}

export function FootballProfileHeader({
  action,
  description,
  eyebrow,
  imageUrl,
  title,
}: {
  action?: ReactNode;
  description: ReactNode;
  eyebrow: ReactNode;
  imageUrl?: null | string;
  title: ReactNode;
}) {
  const accessibleTitle = typeof title === "string" ? title : "Football profile";
  return (
    <Card className="relative mt-6 overflow-hidden bg-[#15161a]">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <CardContent className="grid p-0 sm:min-h-64 sm:grid-cols-[11rem_1fr]">
        <div className="flex items-center justify-center border-b border-border bg-black/20 p-7 sm:border-r sm:border-b-0">
          <FootballEntityAvatar
            className="size-28 shrink-0 rounded-none border border-border bg-background p-2"
            imageUrl={imageUrl}
            name={accessibleTitle}
          />
        </div>
        <div className="flex min-w-0 flex-col justify-center p-7 sm:p-10">
          <p className="font-label text-xs font-bold tracking-[0.2em] text-primary uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-headline text-5xl leading-none font-normal tracking-[0.02em] uppercase sm:text-6xl">
            {title}
          </h1>
          <p className="mt-4 font-label text-xs tracking-[0.12em] text-muted-foreground uppercase sm:text-sm">
            {description}
          </p>
          {action ? <div className="mt-6">{action}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function FootballProfilePanel({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden bg-[#15161a]", className)}>
      <CardHeader className="min-h-16 content-center px-5 py-4 sm:px-6">
        <CardTitle className="flex items-center gap-3 font-body text-2xl font-bold tracking-tight normal-case sm:text-3xl">
          <span aria-hidden="true" className="h-6 w-1 bg-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">{children}</CardContent>
    </Card>
  );
}
