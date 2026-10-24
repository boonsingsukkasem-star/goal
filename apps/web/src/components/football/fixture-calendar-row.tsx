import Link from "next/link";

import { cn } from "@/lib/utils";

type CalendarFixture = {
  awayScore: number | null;
  homeScore: number | null;
  id: number;
  isLive?: boolean;
  league: { name: string };
  participants: Array<{ location: string; team: { name: string } }>;
  startsAt: string;
  state: { name: null | string };
};

function fixtureTeams(fixture: CalendarFixture) {
  return {
    away: fixture.participants.find((item) => item.location === "away")?.team.name ?? "Away",
    home: fixture.participants.find((item) => item.location === "home")?.team.name ?? "Home",
  };
}

function fixtureTime(startsAt: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

export function FixtureCalendarRow({ fixture }: { fixture: CalendarFixture }) {
  const { away, home } = fixtureTeams(fixture);

  return (
    <Link
      aria-label={`${home} พบ ${away}`}
      className={cn(
        "group relative flex min-h-24 flex-col bg-surface transition-colors hover:bg-surface-elevated focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:min-h-20 sm:flex-row",
        fixture.isLive &&
          "z-10 ring-1 ring-inset ring-primary shadow-[0_0_16px_rgb(234_234_0_/_0.14)]",
      )}
      href={`/match/${fixture.id}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-[#0d0e12] px-4 py-2 sm:w-32 sm:flex-col sm:items-start sm:justify-center sm:border-r sm:border-b-0">
        <span className="max-w-full truncate font-label text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground uppercase">
          {fixture.league.name}
        </span>
        {fixture.isLive ? (
          <span className="inline-flex items-center gap-1.5 border border-destructive px-2 py-0.5 font-label text-[0.65rem] font-bold text-destructive uppercase">
            <span aria-hidden="true" className="size-1.5 animate-pulse bg-destructive" />
            {fixture.state.name || "Live"}
          </span>
        ) : (
          <time
            className="font-label text-xs font-bold text-foreground"
            dateTime={fixture.startsAt}
          >
            {fixtureTime(fixture.startsAt)}
          </time>
        )}
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-3 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] sm:px-6">
        <p className="truncate text-right font-headline text-lg uppercase sm:text-xl">{home}</p>
        <div
          className={cn(
            "flex h-11 items-center justify-center border border-border bg-background font-headline text-2xl font-bold tracking-wider text-foreground transition-colors group-hover:border-primary/60",
            fixture.isLive && "border-primary text-primary",
          )}
        >
          <span>{fixture.homeScore ?? "–"}</span>
          <span className="px-1.5 text-muted-foreground">:</span>
          <span>{fixture.awayScore ?? "–"}</span>
        </div>
        <p className="truncate font-headline text-lg uppercase sm:text-xl">{away}</p>
      </div>
    </Link>
  );
}
