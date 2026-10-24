import { BadRequestException } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { SupabasePublicService } from "../auth/supabase-public.service";
import type { FootballProviderEntityService } from "./football-provider-entity.service";
import { FootballReadService } from "./football-read.service";

function queryResult(data: unknown) {
  const query = {
    eq: vi.fn(() => query),
    not: vi.fn(() => query),
    gte: vi.fn(() => query),
    in: vi.fn(() => query),
    limit: vi.fn(() => query),
    lte: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }),
  };
  return query;
}

function service(
  client: Partial<SupabaseClient>,
  entities: Partial<FootballProviderEntityService> = {},
) {
  const publicClient = { getClient: () => client as SupabaseClient } as SupabasePublicService;
  return new FootballReadService(publicClient, entities as FootballProviderEntityService);
}

describe("FootballReadService", () => {
  it("keeps the match readable when optional statistics fail and normalizes database timestamps", async () => {
    const row = {
      id: 7,
      league: { id: 8, name: "League", image_url: null },
      name: "Home vs Away",
      home_score: 1,
      away_score: 0,
      is_live: false,
      season_id: 9,
      starts_at: "2026-09-18T00:00:00Z",
      state_id: 5,
      state_code: "FT",
      state_name: "Finished",
      length_minutes: null,
      result_info: null,
      data_status: { events: { state: "available", checkedAt: "2026-09-18T01:00:00+00:00" } },
    };
    const failed = queryResult([]);
    failed.then = (resolve) => resolve({ data: null, error: { code: "57014" } });
    const from = vi.fn((table: string) =>
      table === "football_fixtures"
        ? queryResult(row)
        : table === "football_fixture_statistics"
          ? failed
          : queryResult([]),
    );
    const result = await service({ from } as unknown as Partial<SupabaseClient>).getFixture(7);
    expect(result.homeScore).toBe(1);
    expect(result.statistics).toEqual([]);
    expect(result.dataStatus).toMatchObject({
      statistics: { state: "error" },
      events: { checkedAt: "2026-09-18T01:00:00.000Z" },
    });
  });

  it("filters teams through an indexed relation without loading every historical fixture ID", async () => {
    const fixtureQuery = queryResult([]);
    const from = vi.fn(() => fixtureQuery);

    await service({ from } as unknown as Partial<SupabaseClient>).listFixtures({
      limit: 10,
      teamId: 9,
    });

    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenCalledWith("football_fixtures");
    expect(fixtureQuery.select).toHaveBeenCalledWith(expect.stringContaining("team_filter"));
    expect(fixtureQuery.eq).toHaveBeenCalledWith("team_filter.team_id", 9);
  });

  it("applies the live-only filter at the database query", async () => {
    const fixtureQuery = queryResult([]);
    const from = vi.fn(() => fixtureQuery);

    await service({ from } as unknown as Partial<SupabaseClient>).listFixtures({
      limit: 10,
      liveOnly: true,
    });

    expect(fixtureQuery.eq).toHaveBeenCalledWith("is_live", true);
  });

  it("filters final and upcoming states before applying the page limit", async () => {
    const query = queryResult([]);
    const from = vi.fn(() => query);
    const reader = service({ from } as unknown as Partial<SupabaseClient>);
    await reader.listFixtures({ status: "finished" });
    expect(query.in).toHaveBeenCalledWith("state_code", ["FT", "AET", "PEN", "AWD", "WO"]);
    await reader.listFixtures({ status: "upcoming" });
    expect(query.in).toHaveBeenCalledWith("state_code", ["NS", "TBD"]);
    await expect(reader.listFixtures({ status: "wrong" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("returns stage and round labels and tolerates older rows without names", async () => {
    const base = {
      id: 1,
      league: { id: 8, name: "League", image_url: null },
      name: "Home vs Away",
      home_score: null,
      away_score: null,
      is_live: false,
      season_id: 2026,
      starts_at: "2026-09-17T12:00:00Z",
      state_id: 1,
      state_code: "NS",
      state_name: "Not Started",
      stage_id: 12,
      round_id: 34,
    };
    const fixtureQuery = queryResult([
      { ...base, stage_name: "League Stage", round_name: "2" },
      { ...base, id: 2 },
    ]);
    const from = vi.fn((table: string) =>
      table === "football_fixtures" ? fixtureQuery : queryResult([]),
    );
    const result = await service({ from } as unknown as Partial<SupabaseClient>).listFixtures({});
    expect(result.data[0]).toMatchObject({
      stage: { id: 12, name: "League Stage" },
      round: { id: 34, name: "2" },
    });
    expect(result.data[1]).toMatchObject({
      stage: { id: 12, name: null },
      round: null,
    });
  });

  it("rejects fixture windows large enough to create an unbounded public query", async () => {
    await expect(
      service({}).listFixtures({
        from: "2025-01-01T00:00:00.000Z",
        to: "2026-08-16T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("loads player appearances from the chronological database RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          fixture_id: 9001,
          fixture_name: "Home vs Away",
          jersey_number: 9,
          starts_at: "2026-08-16T19:00:00.000Z",
          team_id: 101,
        },
      ],
      error: null,
    });

    const get = vi.fn().mockResolvedValue({
      dateOfBirth: null,
      displayName: "Player One",
      entityType: "player",
      id: 301,
      imageUrl: null,
    });
    const result = await service({ rpc } as unknown as Partial<SupabaseClient>, { get }).getPlayer(
      301,
    );

    expect(get).toHaveBeenCalledWith("player", 301);
    expect(rpc).toHaveBeenCalledWith("get_football_player_recent_fixtures", {
      p_limit: 10,
      p_player_id: 301,
    });
    expect(result.recentFixtures[0]).toMatchObject({
      fixtureId: 9001,
      startsAt: "2026-08-16T19:00:00.000Z",
    });
  });

  it("loads team identity from Sportmonks while using local fixtures only as recent context", async () => {
    const fixtureQuery = queryResult([]);
    const from = vi.fn(() => fixtureQuery);
    const get = vi.fn().mockResolvedValue({
      entityType: "team",
      founded: 1892,
      id: 8,
      imageUrl: null,
      name: "Liverpool",
      shortCode: "LIV",
    });

    const result = await service({ from } as unknown as Partial<SupabaseClient>, { get }).getTeam(
      8,
    );

    expect(get).toHaveBeenCalledWith("team", 8);
    expect(result).toMatchObject({
      fixtures: [],
      team: { id: 8, name: "Liverpool", shortCode: "LIV" },
    });
  });
});
