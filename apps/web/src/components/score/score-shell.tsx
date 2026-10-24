"use client";

import {
  Brain as BrainCircuit,
  Calendar as CalendarDays,
  StatsUpSquare as ChartNoAxesCombined,
  UserCircle as CircleUserRound,
  Home,
  PageEdit as Newspaper,
  Search,
} from "iconoir-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { GoalLogo } from "@/components/brand/goal-logo";
import { Button } from "@/components/ui/button";

const desktopNavigation = [
  { href: "/", label: "Scores", section: "scores" },
  { href: "/news", label: "News", section: "news" },
  { href: "/compare", label: "Comparison", section: "comparison" },
  { href: "/explore", label: "AI Insights", section: "insights" },
] as const;

const mobileNavigation = [
  { href: "/", icon: Home, label: "สกอร์", section: "scores" },
  { href: "/fixtures", icon: CalendarDays, label: "โปรแกรม", section: "fixtures" },
  { href: "/news", icon: Newspaper, label: "ข่าว", section: "news" },
  { href: "/compare", icon: ChartNoAxesCombined, label: "เทียบ", section: "comparison" },
  { href: "/explore", icon: BrainCircuit, label: "AI", section: "insights" },
] as const;

type SiteSection = "account" | "comparison" | "fixtures" | "insights" | "news" | "scores";

function sectionFromPathname(pathname: string): SiteSection | null {
  if (pathname === "/fixtures") return "fixtures";
  if (pathname.startsWith("/news")) return "news";
  if (pathname.startsWith("/compare")) return "comparison";
  if (pathname.startsWith("/explore")) return "insights";
  if (pathname.startsWith("/account") || pathname.startsWith("/community")) return "account";
  if (
    pathname === "/" ||
    pathname.startsWith("/live") ||
    pathname.startsWith("/match/") ||
    pathname.startsWith("/league/") ||
    pathname.startsWith("/team/") ||
    pathname.startsWith("/player/")
  ) {
    return "scores";
  }
  return null;
}

function SiteHeader({ active }: { active: SiteSection | null }) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-[#0d0e12]/95 backdrop-blur-xl">
      <div className="relative flex h-16 w-full items-center px-5 md:px-7">
        <Link
          aria-label="Goal home"
          className="shrink-0"
          href="/"
        >
          <GoalLogo className="w-[5.75rem]" priority />
        </Link>

        <nav
          aria-label="เมนูหลัก"
          className="absolute left-1/2 hidden h-full -translate-x-1/2 items-center gap-5 md:flex lg:gap-7"
        >
          {desktopNavigation.map((item) => (
            <Link
              aria-current={
                item.section === active || (item.section === "scores" && active === "fixtures")
                  ? "page"
                  : undefined
              }
              className={`relative flex h-full items-center px-1.5 font-headline text-sm tracking-[0.08em] uppercase transition-colors ${item.section === active || (item.section === "scores" && active === "fixtures") ? "text-foreground after:absolute after:inset-x-0 after:bottom-[-2px] after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground"}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild aria-label="ค้นหา" size="icon" variant="ghost">
            <Link href="/explore">
              <Search />
            </Link>
          </Button>
          <Button
            asChild
            aria-label="บัญชีผู้ใช้"
            className={active === "account" ? "border-primary text-primary" : undefined}
            size="icon"
            variant="outline"
          >
            <Link href="/account">
              <CircleUserRound />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function MobileNavigation({ active }: { active: SiteSection | null }) {
  return (
    <>
      <nav
        aria-label="เมนูมือถือ"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-[#0d0e12]/95 px-1 pt-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
      >
        {mobileNavigation.map((item) => (
          <Link
            aria-current={item.section === active ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 font-label text-[0.65rem] font-bold ${item.section === active ? "text-primary" : "text-muted-foreground"}`}
            href={item.href}
            key={item.href}
          >
            <item.icon className="size-[1.15rem]" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div aria-hidden="true" className="h-16 md:hidden" />
    </>
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authRoute = pathname.startsWith("/login");
  const active = sectionFromPathname(pathname);
  return (
    <div className="goal-score-shell">
      <SiteHeader active={active} />
      {children}
      {!authRoute && <MobileNavigation active={active} />}
    </div>
  );
}
