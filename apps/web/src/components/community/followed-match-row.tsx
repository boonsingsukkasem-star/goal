import type { FootballFixturePageDataItem } from "@goal-app/api-client";
import Link from "next/link";
import type { ReactNode } from "react";

function teams(fixture: FootballFixturePageDataItem) {
  return {
    away: fixture.participants.find((item) => item.location === "away")?.team.name ?? "Away",
    home: fixture.participants.find((item) => item.location === "home")?.team.name ?? "Home",
  };
}

export function FollowedMatchRow({
  action,
  fixture,
}: {
  action: ReactNode;
  fixture: FootballFixturePageDataItem;
}) {
  const { away, home } = teams(fixture);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center border border-border bg-[#1a1b1f]">
      <Link className="min-w-0 px-4 py-3 hover:bg-surface-elevated" href={`/match/${fixture.id}`}>
        <p className="truncate font-label text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">
          {fixture.league.name} · {fixture.isLive ? fixture.state.name || "LIVE" : "Match"}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <p className="truncate font-semibold text-foreground">
            {home} vs {away}
          </p>
          <span className="shrink-0 font-headline text-lg text-primary">
            {fixture.homeScore ?? "–"} : {fixture.awayScore ?? "–"}
          </span>
        </div>
      </Link>
      <div className="border-l border-border px-2">{action}</div>
    </div>
  );
}
