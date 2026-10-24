import { describe, expect, it, vi } from "vitest";

import openApi from "../../../openapi/goal-api.json";

import type { ApiRequestError } from "./index";
import {
  ApiResponseValidationError,
  configureGoalApi,
  exploreFootballCatalog,
  getFootballFixture,
  listFootballComparisonOptions,
  listFootballFixtures,
  validatedSuccessOperations,
} from "./index";

describe("Orval Goal API client", () => {
  it("has a runtime validator for every successful generated operation", () => {
    const documentedOperations = Object.entries(openApi.paths).flatMap(([path, item]) =>
      Object.entries(item).flatMap(([method, operation]) =>
        "responses" in operation &&
        Object.keys(operation.responses).some((status) => status.startsWith("2"))
          ? [`${method.toUpperCase()} ${path}`]
          : [],
      ),
    );

    expect([...validatedSuccessOperations].sort()).toEqual(documentedOperations.sort());
  });

  it("encodes generated fixture filters", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 }),
      );
    configureGoalApi({ baseUrl: "https://api.goal.co.th/", fetcher });

    await expect(listFootballFixtures({ leagueId: 8, limit: 10 })).resolves.toEqual({
      data: [],
      nextCursor: null,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.goal.co.th/v1/football/fixtures?leagueId=8&limit=10",
    );
  });

  it("encodes generated catalog search filters", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          generatedAt: "2026-08-17T00:00:00.000Z",
          query: "Liverpool",
        }),
        { status: 200 },
      ),
    );
    configureGoalApi({ baseUrl: "https://api.goal.co.th/", fetcher });

    await exploreFootballCatalog({ limit: 10, q: "Liverpool", types: "team,player" });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.goal.co.th/v1/football/explore?limit=10&q=Liverpool&types=team%2Cplayer",
    );
  });

  it("encodes page-based Sportmonks comparison options", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          generatedAt: "2026-09-07T00:00:00.000Z",
          hasMore: true,
          page: 2,
          perPage: 20,
          query: "Salah",
        }),
        { status: 200 },
      ),
    );
    configureGoalApi({ baseUrl: "https://api.goal.co.th/", fetcher });

    await listFootballComparisonOptions({
      entityType: "player",
      page: 2,
      perPage: 20,
      q: "Salah",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.goal.co.th/v1/football/comparison-options?entityType=player&page=2&perPage=20&q=Salah",
    );
  });

  it("rejects a non-standard API error body", async () => {
    configureGoalApi({
      baseUrl: "https://api.goal.co.th",
      fetcher: vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    });
    await expect(listFootballFixtures()).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 503,
    } satisfies Partial<ApiRequestError>);
  });

  it("preserves the standard error code and request ID", async () => {
    configureGoalApi({
      baseUrl: "https://api.goal.co.th",
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "NOT_FOUND",
              message: "Fixture not found",
              requestId: "0198b135-d9d0-7000-8000-000000000001",
            },
          }),
          { status: 404 },
        ),
      ),
    });
    await expect(getFootballFixture(42)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Fixture not found",
      requestId: "0198b135-d9d0-7000-8000-000000000001",
      status: 404,
    });
  });

  it("maps canonical xG statistics and GOAL momentum points through the generated fixture client", async () => {
    const fixture = {
      awayScore: 0,
      events: [],
      formations: [],
      homeScore: 1,
      id: 42,
      isLive: true,
      league: { id: 8, imageUrl: null, name: "Premier League" },
      lengthMinutes: 90,
      lineups: [],
      name: "Home vs Away",
      participants: [],
      momentum: [
        {
          extraMinute: null,
          id: 90,
          minute: 23,
          periodId: 1,
          teamId: 101,
          value: 10.92,
        },
      ],
      resultInfo: null,
      scores: [],
      seasonId: 2026,
      startsAt: "2026-08-16T19:00:00.000Z",
      state: { code: "INPLAY_1ST_HALF", id: 2, name: "1st Half" },
      statistics: [
        {
          teamId: 101,
          typeCode: "EXPECTED_GOALS",
          typeId: 5304,
          typeName: "Expected Goals (xG)",
          value: 1.42,
        },
      ],
    };
    configureGoalApi({
      baseUrl: "https://api.goal.co.th",
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 })),
    });

    await expect(getFootballFixture(42)).resolves.toMatchObject({
      momentum: [{ minute: 23, value: 10.92 }],
      statistics: [{ typeCode: "EXPECTED_GOALS", value: 1.42 }],
    });
  });

  it("rejects a successful response that violates the generated runtime contract", async () => {
    configureGoalApi({
      baseUrl: "https://api.goal.co.th",
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: "not-an-array", nextCursor: null }), {
          status: 200,
        }),
      ),
    });

    await expect(listFootballFixtures()).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
});
