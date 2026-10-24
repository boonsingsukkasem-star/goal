import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { FootballComparisonCatalogService } from "./football-comparison-catalog.service";
import type { FootballProviderEntityService } from "./football-provider-entity.service";

function setup() {
  const entities = {
    list: vi.fn().mockResolvedValue({ data: [], hasMore: false, message: null }),
  } as unknown as FootballProviderEntityService;
  return { entities, service: new FootballComparisonCatalogService(entities) };
}

describe("FootballComparisonCatalogService", () => {
  it("browses a requested team page through the shared Sportmonks gateway", async () => {
    const { entities, service } = setup();
    vi.mocked(entities.list).mockResolvedValue({
      data: [
        {
          entityType: "team",
          founded: 1892,
          id: 8,
          imageUrl: "https://cdn.sportmonks.com/team.png",
          name: "Liverpool",
          shortCode: "LIV",
        },
      ],
      hasMore: true,
      message: null,
    });

    const result = await service.list({ entityType: "team", page: 2, perPage: 20 });

    expect(entities.list).toHaveBeenCalledWith("team", {
      page: 2,
      perPage: 20,
      query: null,
    });
    expect(result).toMatchObject({
      data: [{ entityType: "team", id: 8, name: "Liverpool" }],
      hasMore: true,
      page: 2,
    });
  });

  it("normalizes player search before calling the gateway", async () => {
    const { entities, service } = setup();
    const result = await service.list({ entityType: "player", page: "3", q: " Salah " });
    expect(entities.list).toHaveBeenCalledWith("player", {
      page: 3,
      perPage: 20,
      query: "Salah",
    });
    expect(result).toMatchObject({ data: [], page: 3, query: "Salah" });
  });

  it("returns an accessible empty Sportmonks page as success", async () => {
    const { service } = setup();
    await expect(service.list({ entityType: "player" })).resolves.toMatchObject({
      data: [],
      hasMore: false,
      page: 1,
    });
  });

  it("rejects invalid bounds before calling the gateway", async () => {
    const { entities, service } = setup();
    await expect(service.list({ page: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list({ perPage: 51 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list({ q: "x" })).rejects.toBeInstanceOf(BadRequestException);
    expect(entities.list).not.toHaveBeenCalled();
  });
});
