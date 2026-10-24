import type { FootballFixturePageDataItem } from "@goal-app/api-client";
import { describe, expect, it } from "vitest";
import { fixtureStatus, isFixtureFinished, isFixtureUpcoming } from "@/lib/fixture-status";
import {
  groupHomeFixtures,
  homeFixtureQuery,
  liveHomeQuery,
  shiftHomeDate,
} from "./home-fixture-model";

const fixture = {
  id: 1,
  isLive: false,
  homeScore: 0,
  awayScore: 0,
  startsAt: "2026-09-17T19:00:00.000Z",
  state: { id: 1, code: "NS", name: "Not Started" },
  seasonId: 2026,
  league: { id: 8, name: "Premier League", imageUrl: null },
  participants: [],
  name: "Home vs Away",
} satisfies FootballFixturePageDataItem;

describe("Home match calendar", () => {
  it("includes tomorrow at 02:00 Bangkok but excludes tomorrow at 06:00", () => {
    const query = homeFixtureQuery("2026-09-17", "all");
    expect(query.from).toBe("2026-09-16T17:00:00.000Z");
    expect(query.to).toBe("2026-09-17T22:59:59.999Z");
    expect(Date.parse(fixture.startsAt)).toBeLessThan(Date.parse(query.to!));
  });
  it("filters status before pagination and only requests upcoming fixtures after now for today", () => {
    expect(homeFixtureQuery("2026-09-17", "live").liveOnly).toBe(true);
    expect(homeFixtureQuery("2026-09-17", "finished").status).toBe("finished");
    expect(
      homeFixtureQuery("2026-09-17", "upcoming", new Date("2026-09-17T12:00:00Z")),
    ).toMatchObject({
      from: "2026-09-17T12:00:00.000Z",
      to: "2026-10-13T16:59:59.999Z",
      status: "upcoming",
    });
  });
  it("keeps yesterday's ongoing games in Live Now after midnight", () => {
    const query = liveHomeQuery(new Date("2026-09-17T17:05:00Z"));
    expect(Date.parse(query.from!)).toBeLessThan(Date.parse("2026-09-17T16:00:00Z"));
    expect(query.liveOnly).toBe(true);
  });
  it("handles month and year boundaries", () => {
    expect(shiftHomeDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftHomeDate("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("separates Bangkok dates and rounds, retains finished and scheduled matches together", () => {
    const stage = { id: 10, name: "League Stage" };
    const round = { id: 20, name: "1" };
    const first = { ...fixture, stage, round, startsAt: "2026-09-17T15:00:00Z" };
    const finished = { ...first, id: 2, state: { id: 5, code: "FT", name: "Full Time" } };
    const groups = groupHomeFixtures([
      fixture,
      finished,
      first,
      { ...first, id: 3, round: { id: 21, name: "2" } },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]?.fixtures.map((row) => row.id)).toEqual([1, 2]);
    expect(groups[2]?.date).toBe("2026-09-18");
  });
  it("uses provider state even if a scheduled game has 0–0 scores or FT has missing scores", () => {
    expect(isFixtureFinished(fixture)).toBe(false);
    expect(isFixtureUpcoming(fixture)).toBe(true);
    expect(fixtureStatus(fixture)).toBe("02:00");
    expect(isFixtureFinished({ ...fixture, state: { id: 5, code: "FT", name: "Full Time" } })).toBe(
      true,
    );
    for (const id of [10, 11, 12, 15, 18]) {
      const other = { ...fixture, state: { id, code: null, name: null } };
      expect(isFixtureUpcoming(other)).toBe(false);
      expect(isFixtureFinished(other)).toBe(false);
      expect(fixtureStatus(other)).not.toBe("02:00");
    }
    expect(fixtureStatus({ ...fixture, state: { id: 13, code: "TBD", name: null } })).toBe(
      "รอยืนยันเวลา",
    );
  });
});
