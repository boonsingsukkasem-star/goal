import { describe, expect, it } from "vitest";

import {
  apiErrorResponseSchema,
  aiMatchAnalysisContentSchema,
  cursorPageSchema,
  deleteAccountRequestSchema,
  footballFixtureDetailSchema,
  fanHeatmapResponseSchema,
  notificationPreferencesSchema,
  userProfileSchema,
} from "./index";

describe("API contracts", () => {
  it("accepts the standard error envelope", () => {
    expect(
      apiErrorResponseSchema.parse({
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
          requestId: "0198b135-d9d0-7000-8000-000000000001",
        },
      }).error.code,
    ).toBe("NOT_FOUND");
  });

  it("uses nullable cursors to mark the final page", () => {
    expect(cursorPageSchema.parse({ nextCursor: null })).toEqual({ nextCursor: null });
  });
});

describe("AI match contracts", () => {
  it("rejects ratings and momentum outside explainable bounds", () => {
    const base = {
      confidence: 0.7,
      explanation: { decidingFactors: ["Goal at 23 minutes"], whyResult: "More clinical." },
      momentum: [{ explanation: "Goal changed pressure", intensity: 80, minute: 23, teamId: 101 }],
      playerRatings: [
        { playerId: 301, playerName: "A Player", rating: 8.2, reasons: ["Scored"], teamId: 101 },
      ],
      summary: { headline: "Home ahead", keyMoments: ["23' goal"], short: "A narrow lead." },
      tactical: {
        away: { formation: "4-4-2", strengths: [], style: "Compact", weaknesses: [] },
        changes: [],
        home: { formation: "4-3-3", strengths: ["Width"], style: "Direct", weaknesses: [] },
      },
    };
    expect(aiMatchAnalysisContentSchema.parse(base).confidence).toBe(0.7);
    expect(() =>
      aiMatchAnalysisContentSchema.parse({
        ...base,
        playerRatings: [{ ...base.playerRatings[0], rating: 11 }],
      }),
    ).toThrow();
  });
});

describe("core football contracts", () => {
  it("requires canonical match details independent from provider payloads", () => {
    const match = footballFixtureDetailSchema.parse({
      awayScore: 1,
      events: [],
      formations: [],
      homeScore: 2,
      id: 19424997,
      isLive: false,
      league: { id: 501, imageUrl: null, name: "Premiership" },
      lengthMinutes: 90,
      lineups: [],
      name: "Home vs Away",
      participants: [],
      resultInfo: "Home won after full-time.",
      scores: [],
      seasonId: 19735,
      startsAt: "2026-08-16T12:00:00.000Z",
      state: { code: "FT", id: 5, name: "Finished" },
    });
    expect(match.homeScore).toBe(2);
  });
});

describe("authentication contracts", () => {
  it("accepts a user-owned profile", () => {
    expect(
      userProfileSchema.parse({
        avatarUrl: null,
        createdAt: "2026-08-16T04:00:00.000Z",
        displayName: "Arty",
        email: "arty@example.com",
        id: "cb0462e0-bd23-4e9d-a31b-c086f59c6216",
        locale: "th-TH",
        providers: ["email", "apple"],
        timezone: "Asia/Bangkok",
        updatedAt: "2026-08-16T04:00:00.000Z",
      }),
    ).toMatchObject({ displayName: "Arty", providers: ["email", "apple"] });
  });

  it("requires an explicit destructive-action confirmation", () => {
    expect(() => deleteAccountRequestSchema.parse({ confirmation: "yes" })).toThrow();
    expect(deleteAccountRequestSchema.parse({ confirmation: "DELETE" })).toEqual({
      confirmation: "DELETE",
    });
  });
});

describe("community and notification contracts", () => {
  it("keeps fan identity private and validates aggregate percentages", () => {
    expect(
      fanHeatmapResponseSchema.parse({
        fixtureId: 42,
        teams: [
          { percentage: 60, supporters: 6, teamId: 101 },
          { percentage: 40, supporters: 4, teamId: 102 },
        ],
        totalSupporters: 10,
        updatedAt: "2026-08-16T04:00:00.000Z",
      }).teams[0],
    ).not.toHaveProperty("userId");
  });

  it("requires valid quiet-hour clocks", () => {
    const preferences = {
      aiContext: true,
      allowLiveDuringQuietHours: false,
      goal: true,
      halftimeFulltime: true,
      kickoffReminder: true,
      lineup: true,
      newsBreaking: true,
      quietHoursEnabled: true,
      quietHoursEnd: "07:00",
      quietHoursStart: "23:00",
      redCard: true,
      substitution: false,
      timezone: "Asia/Bangkok",
      trendingNews: false,
      yellowCard: false,
    };
    expect(notificationPreferencesSchema.parse(preferences).quietHoursStart).toBe("23:00");
    expect(() =>
      notificationPreferencesSchema.parse({ ...preferences, quietHoursStart: "25:00" }),
    ).toThrow();
  });
});
