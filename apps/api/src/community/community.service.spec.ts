import { HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthPrincipal } from "../auth/auth-principal";
import type { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { SupabasePublicService } from "../auth/supabase-public.service";
import type { SupabaseUserService } from "../auth/supabase-user.service";
import type { FootballProviderEntityService } from "../football/football-provider-entity.service";
import type { FootballReadService } from "../football/football-read.service";
import { CommunityService } from "./community.service";

const principal: AuthPrincipal = {
  accessToken: "user-access-token",
  email: "fan@example.com",
  expiresAt: 1_800_000_000,
  providers: ["email"],
  userId: "0198b135-d9d0-7000-8000-000000000001",
};

function service(
  rpc: ReturnType<typeof vi.fn>,
  publicRows: unknown[] = [],
  userRows: unknown[] = [],
  entityGet: (entityType: string, entityId: number) => Promise<unknown> = vi
    .fn()
    .mockResolvedValue({
      entityType: "team",
      founded: null,
      id: 999,
      imageUrl: null,
      name: "Provider Team",
      shortCode: null,
    }),
) {
  const query = {
    eq: vi.fn().mockResolvedValue({ data: publicRows, error: null }),
    select: vi.fn(() => query),
  };
  const userQuery = {
    eq: vi.fn(() => userQuery),
    order: vi.fn().mockResolvedValue({ data: userRows, error: null }),
    select: vi.fn(() => userQuery),
  };
  const userData = {
    getClient: () => ({ from: vi.fn(() => userQuery), rpc }),
  } as unknown as SupabaseUserService;
  const adminData = {
    getClient: () => ({ rpc }),
  } as unknown as SupabaseAdminService;
  const publicData = {
    getClient: () => ({ from: vi.fn(() => query) }),
  } as unknown as SupabasePublicService;
  const football = {
    getFixture: vi.fn().mockResolvedValue({
      participants: [
        { location: "home", team: { id: 101, imageUrl: null, name: "Home" } },
        { location: "away", team: { id: 102, imageUrl: null, name: "Away" } },
      ],
    }),
    getFixtureSummariesByIds: vi.fn().mockResolvedValue([
      {
        awayScore: null,
        homeScore: null,
        id: 42,
        isLive: false,
        league: { id: 8, imageUrl: null, name: "Premier League" },
        name: "Home vs Away",
        participants: [
          {
            location: "home",
            team: { founded: null, id: 101, imageUrl: null, name: "Home", shortCode: "HOM" },
            winner: null,
          },
          {
            location: "away",
            team: { founded: null, id: 102, imageUrl: null, name: "Away", shortCode: "AWY" },
            winner: null,
          },
        ],
        seasonId: 9,
        startsAt: "2026-08-21T12:00:00.000Z",
        state: { code: "NS", id: 1, name: "Not started" },
      },
    ]),
  } as unknown as FootballReadService;
  const entities = {
    get: entityGet,
    getMany: vi.fn().mockImplementation(async (references) => {
      const result = new Map();
      for (const reference of references) {
        const entity = await entityGet(reference.entityType, reference.entityId);
        result.set(`${reference.entityType}:${reference.entityId}`, entity);
      }
      return result;
    }),
  } as unknown as FootballProviderEntityService;
  return new CommunityService(userData, adminData, publicData, entities, football);
}

describe("CommunityService", () => {
  it("hydrates favorite display fields from Sportmonks instead of local football tables", async () => {
    const result = await service(
      vi.fn(),
      [],
      [
        {
          created_at: "2026-09-07T10:00:00.000Z",
          entity_id: 999,
          entity_type: "team",
        },
      ],
    ).listFavorites(principal);

    expect(result.data).toEqual([
      {
        createdAt: "2026-09-07T10:00:00.000Z",
        entityId: 999,
        entityType: "team",
        imageUrl: null,
        name: "Provider Team",
      },
    ]);
  });

  it("maps only anonymous aggregate supporter totals", async () => {
    const result = await service(vi.fn(), [
      { supporters: 6, team_id: 101, updated_at: "2026-08-16T04:00:00.000Z" },
      { supporters: 4, team_id: 102, updated_at: "2026-08-16T04:00:00.000Z" },
    ]).getFanHeatmap(42);
    expect(result).toMatchObject({
      totalSupporters: 10,
      teams: [{ percentage: 60 }, { percentage: 40 }],
    });
    expect(result.teams[0]).not.toHaveProperty("userId");
  });

  it("turns provider-entity validation failures into a stable 404", async () => {
    const rpc = vi.fn();
    const entityGet = vi.fn().mockRejectedValue(new NotFoundException("Football entity not found"));
    await expect(
      service(rpc, [], [], entityGet).setFavorite("team", 999, true, principal),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a stable 429 when the account favorite cap is reached", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001" } });
    const result = service(rpc).setFavorite("team", 999, true, principal);
    await expect(result).rejects.toBeInstanceOf(HttpException);
    await expect(result).rejects.toMatchObject({ status: 429 });
  });

  it("validates a favorite against Sportmonks then stores only its provider reference", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const entityGet = vi.fn().mockResolvedValue({
      entityType: "team",
      founded: null,
      id: 999,
      imageUrl: null,
      name: "Provider Team",
      shortCode: null,
    });

    await service(rpc, [], [], entityGet).setFavorite("team", 999, true, principal);

    expect(entityGet).toHaveBeenCalledWith("team", 999);
    expect(rpc).toHaveBeenCalledWith("set_user_favorite", {
      p_active: true,
      p_entity_id: 999,
      p_entity_type: "team",
      p_user_id: principal.userId,
    });
  });

  it("allows favorite removal without a provider lookup", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const entityGet = vi.fn();

    await service(rpc, [], [], entityGet).setFavorite("team", 999, false, principal);

    expect(entityGet).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "set_user_favorite",
      expect.objectContaining({ p_active: false, p_user_id: principal.userId }),
    );
  });

  it("hydrates followed matches with fixture data required by the clients", async () => {
    const result = await service(
      vi.fn(),
      [],
      [
        {
          created_at: "2026-08-21T10:00:00.000Z",
          fixture_id: 42,
          live_alerts_during_quiet_hours: false,
          notifications_enabled: true,
          updated_at: "2026-08-21T10:00:00.000Z",
        },
      ],
    ).listFollows(principal);

    expect(result.data[0]).toMatchObject({
      fixture: { id: 42, name: "Home vs Away" },
      fixtureId: 42,
      notificationsEnabled: true,
    });
  });
});
