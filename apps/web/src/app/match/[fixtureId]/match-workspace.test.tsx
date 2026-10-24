import type { FootballFixtureDetail } from "@goal-app/api-client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatKickoff, matchRefreshInterval } from "./match-presentation";
import { MatchWorkspace } from "./match-workspace";

const fixture: FootballFixtureDetail = {
  id: 42,
  name: "Home vs Away",
  startsAt: "2026-09-18T18:30:00.000Z",
  state: { id: 1, code: "NS", name: "Not Started" },
  isLive: false,
  homeScore: null,
  awayScore: null,
  league: { id: 82, name: "Bundesliga", imageUrl: null },
  seasonId: 1,
  stage: null,
  round: { id: 4, name: "4" },
  participants: [],
  events: [],
  formations: [],
  lineups: [],
  momentum: [],
  resultInfo: null,
  scores: [],
  statistics: [],
  lengthMinutes: 90,
};

function renderMatch(value: FootballFixtureDetail) {
  return renderToStaticMarkup(
    createElement(MatchWorkspace, {
      fixture: value,
      initialAi: { analysis: null, fixtureId: value.id, status: null, updatedAt: null },
    }),
  );
}

describe("match presentation", () => {
  it("opens a pre-match overview rather than empty AI or live-data panels", () => {
    const html = renderMatch(fixture);
    expect(html).toContain("ก่อนการแข่งขัน");
    expect(html).toContain("รอประกาศรายชื่อก่อนเริ่มเกม");
    expect(html).toContain("Bundesliga");
    expect(html).not.toContain("ยังไม่มีเหตุการณ์");
    expect(html).not.toContain("Live GOAL momentum");
    expect(formatKickoff(fixture.startsAt)).toContain("19 ก.ย.");
    expect(formatKickoff(fixture.startsAt)).toContain("01:30");
  });

  it("does not describe a completed match as waiting to kick off", () => {
    const html = renderMatch({
      ...fixture,
      state: { id: 5, code: "FT", name: "Full Time" },
      homeScore: 2,
      awayScore: 1,
      resultInfo: "Home won",
    });
    expect(html).toContain("Match Timeline");
    expect(html).toContain("Home won");
    expect(html).not.toContain("ก่อนการแข่งขัน");
  });

  it("continues refreshing from pre-match into live and stops for terminal states", () => {
    expect(matchRefreshInterval(fixture)).toBe(60_000);
    expect(matchRefreshInterval({ ...fixture, isLive: true })).toBe(10_000);
    for (const id of [5, 7, 8, 12, 14]) {
      expect(
        matchRefreshInterval({ ...fixture, state: { id, code: null, name: null } }),
      ).toBeNull();
    }
  });
});
