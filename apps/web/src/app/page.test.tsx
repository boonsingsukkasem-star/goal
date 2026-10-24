import type { FootballFixturePageDataItem } from "@goal-app/api-client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeScoreboard } from "./home-scoreboard";

const fixture: FootballFixturePageDataItem = {
  awayScore: 1,
  homeScore: 2,
  id: 101,
  isLive: true,
  league: { id: 8, imageUrl: null, name: "Premier League" },
  name: "Liverpool vs Arsenal",
  participants: [
    {
      location: "home",
      team: { founded: 1892, id: 1, imageUrl: null, name: "Liverpool", shortCode: "LIV" },
      winner: true,
    },
    {
      location: "away",
      team: { founded: 1886, id: 2, imageUrl: null, name: "Arsenal", shortCode: "ARS" },
      winner: false,
    },
  ],
  seasonId: 2026,
  startsAt: "2026-08-20T12:00:00.000Z",
  state: { code: "2H", id: 2, name: "Second half" },
};

describe("HomeScoreboard", () => {
  it("prioritizes live scores and keeps AI as supporting context", () => {
    const html = renderToStaticMarkup(
      createElement(HomeScoreboard, {
        initialFixtures: [fixture],
        news: [],
        todayKey: "2026-08-20",
      }),
    );

    expect(html).toContain("ฟุตบอลวันนี้");
    expect(html).toContain("Liverpool");
    expect(html).toContain("Arsenal");
    expect(html).toContain("Premier League");
    expect(html).toContain("Match of the Day");
    expect(html).toContain("AI Momentum");
    expect(html).toContain("ผลบอลและโปรแกรม");
  });
  it("shows final results, scheduled matches and next-morning fixtures in one calendar", () => {
    const html = renderToStaticMarkup(
      createElement(HomeScoreboard, {
        todayKey: "2026-08-20",
        news: [],
        initialNextCursor: "next-page",
        initialFixtures: [
          {
            ...fixture,
            isLive: false,
            state: { id: 5, code: "FT", name: "Full Time" },
            stage: { id: 3, name: "League Stage" },
            round: { id: 10, name: "1" },
          },
          {
            ...fixture,
            id: 102,
            isLive: false,
            state: { id: 1, code: "NS", name: "Not Started" },
            startsAt: "2026-08-20T19:00:00.000Z",
          },
        ],
      }),
    );
    expect(html).toContain("FT");
    expect(html).toContain("02:00");
    expect(html).toContain("League Stage");
    expect(html).toContain("รอบ 1");
    expect(html).toContain("เช้ามืดพรุ่งนี้");
    expect(html).toContain("โหลดการแข่งขันเพิ่มเติม");
    expect(html).toContain("เลือกวันที่แข่งขัน");
  });
});
