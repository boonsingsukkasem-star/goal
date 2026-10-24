import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { FootballProviderEntityService } from "./football-provider-entity.service";
import { FootballExploreService } from "./football-explore.service";

function createService() {
  const entities = {
    list: vi.fn().mockResolvedValue({ data: [], hasMore: false, message: null }),
  } as unknown as FootballProviderEntityService;
  return { entities, service: new FootballExploreService(entities) };
}

describe("FootballExploreService", () => {
  it("searches Sportmonks through the provider gateway", async () => {
    const { entities, service } = createService();
    vi.mocked(entities.list).mockResolvedValue({
      data: [
        {
          dateOfBirth: null,
          displayName: "Player One",
          entityType: "player",
          id: 301,
          imageUrl: null,
        },
      ],
      hasMore: false,
      message: null,
    });

    const result = await service.explore({ limit: 10, q: " Player ", types: "player" });

    expect(entities.list).toHaveBeenCalledWith("player", {
      page: 1,
      perPage: 10,
      query: "Player",
    });
    expect(result.data[0]).toMatchObject({ entityType: "player", id: 301 });
  });

  it("round-robins mixed entity types so one provider list cannot starve the others", async () => {
    const { entities, service } = createService();
    vi.mocked(entities.list).mockImplementation(async (type) => ({
      data:
        type === "league"
          ? [
              {
                entityType: "league" as const,
                id: 1,
                imageUrl: null,
                name: "League",
                shortCode: null,
                type: null,
              },
            ]
          : type === "team"
            ? [
                {
                  entityType: "team" as const,
                  founded: null,
                  id: 2,
                  imageUrl: null,
                  name: "Team",
                  shortCode: null,
                },
              ]
            : [
                {
                  dateOfBirth: null,
                  displayName: "Player",
                  entityType: "player" as const,
                  id: 3,
                  imageUrl: null,
                },
              ],
      hasMore: false,
      message: null,
    }));

    const result = await service.explore({ limit: 3 });
    expect(result.data.map((item) => item.entityType)).toEqual(["league", "team", "player"]);
  });

  it("rejects normalized whitespace, unknown types, and unbounded limits defensively", async () => {
    const { service } = createService();
    await expect(service.explore({ q: "  " })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.explore({ types: "club" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.explore({ limit: 51 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("coerces query-string limits defensively outside the validation-pipe runtime", async () => {
    const { entities, service } = createService();
    await service.explore({ limit: "10", types: "team" });
    expect(entities.list).toHaveBeenCalledWith("team", {
      page: 1,
      perPage: 10,
      query: null,
    });
  });
});
