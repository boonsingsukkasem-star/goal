import type { FixtureListQueryDto, FootballFixturePageDataItem } from "@goal-app/api-client";
import { getBangkokDayWindow, getDateKey } from "@goal-app/config";

export type HomeFixtureFilter = "all" | "live" | "finished" | "upcoming";

export function shiftHomeDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return getDateKey(date);
}

export function homeFixtureQuery(
  dateKey: string,
  filter: HomeFixtureFilter,
  now = new Date(),
): FixtureListQueryDto {
  const { from } = getBangkokDayWindow(dateKey);
  // Daily view includes the next morning, with an exclusive 06:00 Bangkok boundary.
  const endDate = shiftHomeDate(dateKey, filter === "upcoming" ? 27 : 1);
  const end = new Date(`${endDate}T${filter === "upcoming" ? "00" : "06"}:00:00+07:00`);
  return {
    from:
      filter === "upcoming" && dateKey === getDateKey(now)
        ? new Date(Math.max(Date.parse(from), now.getTime())).toISOString()
        : from,
    to: new Date(end.getTime() - 1).toISOString(),
    limit: 50,
    order: "asc",
    ...(filter === "live" ? { liveOnly: true } : {}),
    ...(filter === "finished" || filter === "upcoming" ? { status: filter } : {}),
  };
}

export function liveHomeQuery(now = new Date()): FixtureListQueryDto {
  return {
    from: new Date(now.getTime() - 86_400_000).toISOString(),
    to: new Date(now.getTime() + 86_400_000).toISOString(),
    liveOnly: true,
    limit: 6,
    order: "asc",
  };
}

export function groupHomeFixtures(fixtures: FootballFixturePageDataItem[]) {
  const groups = new Map<
    string,
    {
      key: string;
      date: string;
      league: FootballFixturePageDataItem["league"];
      stage: FootballFixturePageDataItem["stage"];
      round: FootballFixturePageDataItem["round"];
      fixtures: FootballFixturePageDataItem[];
    }
  >();
  for (const fixture of [...fixtures].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id,
  )) {
    const date = getDateKey(new Date(fixture.startsAt));
    const key = `${date}:${fixture.league.id}:${fixture.seasonId}:${fixture.stage?.id ?? ""}:${fixture.round?.id ?? fixture.round?.name ?? ""}`;
    const group = groups.get(key);
    if (group) group.fixtures.push(fixture);
    else
      groups.set(key, {
        key,
        date,
        league: fixture.league,
        stage: fixture.stage,
        round: fixture.round,
        fixtures: [fixture],
      });
  }
  return [...groups.values()];
}

export function homeDateLabel(date: string, today: string) {
  if (date === today) return "วันนี้";
  if (date === shiftHomeDate(today, 1)) return "พรุ่งนี้";
  if (date === shiftHomeDate(today, -1)) return "เมื่อวาน";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${date}T12:00:00+07:00`));
}
