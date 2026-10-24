import type { FootballFixtureDetail } from "@goal-app/api-client";

type MatchState = Pick<FootballFixtureDetail, "isLive" | "state">;

export function isPreMatch(fixture: MatchState): boolean {
  return !fixture.isLive && ["NS", "TBD"].includes(fixture.state.code ?? "");
}

export function matchRefreshInterval(fixture: MatchState): number | null {
  if (fixture.isLive) return 10_000;
  return isPreMatch(fixture) ? 60_000 : null;
}

export function formatKickoff(startsAt: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(startsAt));
}
