import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApplication, createOpenApiDocument } from "./app-factory";

describe("generated OpenAPI contract", () => {
  let app: INestApplication;
  let document: ReturnType<typeof createOpenApiDocument>;

  beforeAll(async () => {
    process.env.APP_ENV = "nonprod";
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    app = await createApplication();
    await app.init();
    document = createOpenApiDocument(app, "test");
  });

  afterAll(async () => app.close());

  it("publishes OpenAPI 3.1 football request and response contracts", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(document.components?.schemas).toHaveProperty("FootballFixturePage");
    expect(document.components?.schemas).toHaveProperty("FootballFixtureDetail");
    expect(document.components?.schemas).toHaveProperty("ApiErrorResponse");

    const operation = document.paths["/v1/football/fixtures"]?.get;
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: "query", name: "from" }),
        expect.objectContaining({ in: "query", name: "to" }),
        expect.objectContaining({ in: "query", name: "leagueId" }),
        expect.objectContaining({ in: "query", name: "teamId" }),
        expect.objectContaining({ in: "query", name: "limit" }),
        expect.objectContaining({ in: "query", name: "cursor" }),
      ]),
    );
    expect(operation?.responses["200"]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/FootballFixturePage" },
        },
      },
    });
    expect(operation?.responses["400"]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorResponse" },
        },
      },
    });
  });

  it("documents not-found and dependency failures for match details", () => {
    const responses = document.paths["/v1/football/fixtures/{fixtureId}"]?.get?.responses;
    expect(Object.keys(responses ?? {})).toEqual(
      expect.arrayContaining(["200", "400", "404", "503"]),
    );
  });

  it("publishes stable operation IDs for Orval and AI schemas", () => {
    expect(document.paths["/v1/football/fixtures"]?.get?.operationId).toBe("listFootballFixtures");
    expect(document.paths["/v1/ai/matches/{fixtureId}/analysis"]?.get).toMatchObject({
      operationId: "getAiMatchAnalysis",
      responses: {
        "200": {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AiMatchAnalysisResponse" },
            },
          },
        },
      },
    });
    expect(document.paths["/v1/ai/matches/{fixtureId}/analysis"]?.post).toMatchObject({
      operationId: "requestAiMatchAnalysis",
      responses: { "202": {}, "400": {}, "401": {}, "404": {}, "429": {}, "503": {} },
    });
    expect(document.paths["/v1/ai/comparisons"]?.post).toMatchObject({
      operationId: "requestAiComparison",
      responses: { "202": {}, "400": {}, "401": {}, "404": {}, "429": {}, "503": {} },
    });
    expect(document.paths["/v1/ai/comparisons/{comparisonId}"]?.get).toMatchObject({
      operationId: "getAiComparison",
      responses: { "200": {}, "400": {}, "401": {}, "404": {}, "503": {} },
    });
  });

  it("publishes Phase 5 community and notification contracts for both clients", () => {
    expect(document.paths["/v1/community/feed"]?.get).toMatchObject({
      operationId: "getPersonalizedFootballFeed",
      responses: { "200": {}, "400": {}, "401": {}, "503": {} },
    });
    expect(document.paths["/v1/community/matches/{fixtureId}/heatmap"]?.get).toMatchObject({
      operationId: "getMatchFanHeatmap",
      responses: { "200": {}, "400": {}, "404": {}, "503": {} },
    });
    expect(document.paths["/v1/community/me/follows/{fixtureId}"]?.put).toMatchObject({
      operationId: "followMatch",
      responses: { "200": {}, "400": {}, "401": {}, "404": {}, "503": {} },
    });
    expect(document.paths["/v1/notifications/preferences"]?.put).toMatchObject({
      operationId: "updateNotificationPreferences",
      responses: { "200": {}, "400": {}, "401": {}, "503": {} },
    });
    expect(document.paths["/v1/notifications/devices"]?.post?.operationId).toBe(
      "registerPushDevice",
    );
    expect(document.components?.schemas).toHaveProperty("FanHeatmapResponse");
    expect(document.components?.schemas).toHaveProperty("NotificationPreferences");
  });

  it("publishes Phase 6 news contracts with stable Orval operation IDs", () => {
    expect(document.paths["/v1/news"]?.get).toMatchObject({
      operationId: "listFootballNews",
      responses: { "200": {}, "400": {}, "503": {} },
    });
    expect(document.paths["/v1/news/trending"]?.get?.operationId).toBe("listTrendingFootballNews");
    expect(document.paths["/v1/news/me"]?.get).toMatchObject({
      operationId: "listMyFootballNews",
      responses: { "200": {}, "400": {}, "401": {}, "503": {} },
    });
    expect(document.paths["/v1/news/related/matches/{fixtureId}"]?.get?.operationId).toBe(
      "listMatchRelatedNews",
    );
    expect(document.paths["/v1/news/{articleId}/engagement"]?.post).toMatchObject({
      operationId: "recordNewsEngagement",
      responses: { "200": {}, "400": {}, "401": {}, "404": {}, "429": {}, "503": {} },
    });
    expect(document.components?.schemas).toHaveProperty("NewsArticlePage");
    expect(document.components?.schemas).toHaveProperty("PersonalizedNewsResponse");
  });
});
