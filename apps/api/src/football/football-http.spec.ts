import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApplication } from "../app-factory";
import { FootballComparisonCatalogService } from "./football-comparison-catalog.service";
import { FootballReadService } from "./football-read.service";
import { FootballExploreService } from "./football-explore.service";

describe("Football HTTP API", () => {
  let app: INestApplication;
  let listFixtures: ReturnType<typeof vi.spyOn>;
  let explore: ReturnType<typeof vi.spyOn>;
  let comparisonOptions: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    process.env.APP_ENV = "nonprod";
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    app = await createApplication();
    await app.init();
    listFixtures = vi
      .spyOn(app.get(FootballReadService), "listFixtures")
      .mockResolvedValue({ data: [], nextCursor: null });
    explore = vi.spyOn(app.get(FootballExploreService), "explore").mockResolvedValue({
      data: [],
      generatedAt: "2026-08-17T00:00:00.000Z",
      query: null,
    });
    comparisonOptions = vi
      .spyOn(app.get(FootballComparisonCatalogService), "list")
      .mockResolvedValue({
        data: [],
        generatedAt: "2026-09-07T00:00:00.000Z",
        hasMore: false,
        page: 2,
        perPage: 20,
        query: "City",
      });
  });

  it("transforms and bounds public football discovery parameters", async () => {
    await request(app.getHttpServer())
      .get("/v1/football/explore?q=Liverpool&limit=10&types=team,player")
      .expect(200);
    expect(explore).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, q: "Liverpool", types: "team,player" }),
    );
    await request(app.getHttpServer()).get("/v1/football/explore?q=x&limit=51").expect(400);
  });

  it("transforms and bounds Sportmonks comparison catalog pagination", async () => {
    await request(app.getHttpServer())
      .get("/v1/football/comparison-options?entityType=team&page=2&perPage=20&q=City")
      .expect(200);
    expect(comparisonOptions).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "team", page: 2, perPage: 20, q: "City" }),
    );
    await request(app.getHttpServer())
      .get("/v1/football/comparison-options?entityType=team&perPage=51")
      .expect(400);
    await request(app.getHttpServer())
      .get("/v1/football/comparison-options?entityType=player&q=x")
      .expect(400);
  });

  afterAll(async () => app.close());

  it("transforms and whitelists fixture query parameters", async () => {
    await request(app.getHttpServer())
      .get("/v1/football/fixtures?limit=10&teamId=9&liveOnly=true")
      .expect(200, { data: [], nextCursor: null });
    expect(listFixtures).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, liveOnly: true, teamId: 9 }),
    );
  });

  it("returns the standard error envelope for unsupported or unsafe filters", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/football/fixtures?limit=51&unsupported=true")
      .expect(400);
    expect(response.body).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Request validation failed",
        requestId: response.headers["x-request-id"],
      },
    });
  });
});
