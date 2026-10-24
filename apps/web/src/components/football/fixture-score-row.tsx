import Link from "next/link";

import { cn } from "@/lib/utils";

type ScoreRowFixture = {
  awayScore: number | null;
  homeScore: number | null;
  id: number;
  isLive?: boolean;
  league: { name: string };
  participants: Array<{ location: string; team: { name: string } }>;
  startsAt: string;
  state: { name: null | string };
};

function fixtureTeams(fixture: ScoreRowFixture) {
  return {
    away: fixture.participants.find((item) => item.location === "away")?.team.name ?? "Away",
    home: fixture.participants.find((item) => item.location === "home")?.team.name ?? "Home",
  };
}

function fixtureTime(fixture: ScoreRowFixture, includeDate: boolean) {
  if (fixture.isLive) return fixture.state.name || "LIVE";
  return new Intl.DateTimeFormat(
    "th-TH",
    includeDate
      ? { dateStyle: "medium", timeStyle: "short" }
      : { hour: "2-digit", minute: "2-digit" },
  ).format(new Date(fixture.startsAt));
}

export function FixtureScoreRow({
  className,
  fixture,
  variant = "detailed",
}: {
  className?: string;
  fixture: ScoreRowFixture;
  variant?: "compact" | "detailed";
}) {
  const { away, home } = fixtureTeams(fixture);
  const liveClassName = fixture.isLive ? "text-accent" : undefined;

  if (variant === "compact") {
    return (
      <Link
        className={cn(
          "grid grid-cols-[1fr_auto] gap-3 border border-border bg-background p-4 transition-colors hover:border-primary/60",
          className,
        )}
        href={`/match/${fixture.id}`}
      >
        <div>
          <p className="font-label text-xs text-muted-foreground">
            {fixture.league.name} · {fixtureTime(fixture, true)}
          </p>
          <p className="mt-2 font-semibold">
            {home} — {away}
          </p>
        </div>
        <div className="self-center font-headline text-xl font-bold text-primary">
          {fixture.homeScore ?? "–"} : {fixture.awayScore ?? "–"}
        </div>
      </Link>
    );
  }

  return (
    <Link
      className={cn(
        "grid gap-4 border border-border bg-surface p-5 transition-colors hover:border-primary/60 sm:grid-cols-[9rem_1fr_auto] sm:items-center",
        className,
      )}
      href={`/match/${fixture.id}`}
    >
      <div>
        <p className="font-label text-xs text-muted-foreground">{fixture.league.name}</p>
        <p className={cn("mt-1 font-label text-sm", liveClassName)}>
          {fixtureTime(fixture, false)}
        </p>
      </div>
      <div className="space-y-2 font-body font-semibold">
        <p>{home}</p>
        <p>{away}</p>
      </div>
      <div className="space-y-2 text-right font-headline text-2xl font-bold">
        <p>{fixture.homeScore ?? "–"}</p>
        <p>{fixture.awayScore ?? "–"}</p>
      </div>
    </Link>
  );
}
