import { describe, expect, it } from "vitest";

import {
  aiAnalysisJobSchema,
  createDeterministicJobId,
  footballSyncJobSchema,
  newsIngestionJobSchema,
  notificationJobSchema,
  queueNames,
} from "./index";

describe("queue contracts", () => {
  it("versions and validates every job payload", () => {
    const job = footballSyncJobSchema.parse({
      correlationId: "0198b135-d9d0-7000-8000-000000000001",
      fixtureId: 42,
      requestedAt: "2026-08-16T04:00:00.000Z",
      schemaVersion: 2,
      type: "sync-fixture",
    });
    expect(job).toMatchObject({ fixtureId: 42, type: "sync-fixture" });
  });

  it("rejects old provider jobs instead of treating their IDs as API-Football", () => {
    expect(footballSyncJobSchema.safeParse({correlationId:"0198b135-d9d0-7000-8000-000000000001",fixtureId:42,requestedAt:"2026-09-18T00:00:00Z",schemaVersion:1,type:"sync-fixture"}).success).toBe(false);
  });

  it("creates stable job IDs for deduplication", () => {
    expect(createDeterministicJobId(queueNames.footballSync, "fixture-42")).toBe(
      "football-sync:fixture-42:v1",
    );
  });

  it("supports live and standings synchronization without inventing fixture IDs", () => {
    expect(
      footballSyncJobSchema.parse({
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
        mode: "scan",
        requestedAt: "2026-08-16T04:00:00.000Z",
        schemaVersion: 2,
        type: "sync-live-updates",
      }).type,
    ).toBe("sync-live-updates");
  });

  it("bounds fixture page jobs", () => {
    const payload = {
      correlationId: "0198b135-d9d0-7000-8000-000000000001",
      date: "2026-08-16",
      requestedAt: "2026-08-16T04:00:00.000Z",
      schemaVersion: 2,
      type: "sync-fixture-page",
    };
    expect(footballSyncJobSchema.parse({ ...payload, page: 1 })).toMatchObject({ page: 1 });
    expect(() => footballSyncJobSchema.parse({ ...payload, page: 101 })).toThrow();
  });

  it("pins AI jobs to one analysis and source revision", () => {
    expect(
      aiAnalysisJobSchema.parse({
        analysisId: "0198b135-d9d0-7000-8000-000000000002",
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
        fixtureId: 42,
        generationId: "0198b135-d9d0-7000-8000-000000000003",
        language: "th",
        requestedAt: "2026-08-16T04:00:00.000Z",
        schemaVersion: 1,
        sourceUpdatedAt: "2026-08-16T04:00:00.000Z",
        type: "analyze-match",
      }),
    ).toMatchObject({ fixtureId: 42, language: "th" });
  });

  it("pins push jobs to a notification generation and bounds receipt batches", () => {
    expect(
      notificationJobSchema.parse({
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
        generationId: "0198b135-d9d0-7000-8000-000000000002",
        notificationId: "0198b135-d9d0-7000-8000-000000000003",
        requestedAt: "2026-08-16T04:00:00.000Z",
        schemaVersion: 1,
        type: "send-notification",
      }),
    ).toMatchObject({ type: "send-notification" });
    expect(() =>
      notificationJobSchema.parse({
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
        receiptIds: [],
        requestedAt: "2026-08-16T04:00:00.000Z",
        schemaVersion: 1,
        type: "check-push-receipts",
      }),
    ).toThrow();
    expect(() =>
      notificationJobSchema.parse({
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
        receiptIds: Array.from({ length: 101 }, (_, index) => `ticket-${index}`),
        requestedAt: "2026-08-16T04:00:00.000Z",
        schemaVersion: 1,
        type: "check-push-receipts",
      }),
    ).toThrow();
  });

  it("bounds fixture fan-out with a stable run and cursor", () => {
    expect(
      notificationJobSchema.parse({
        afterUserId: "0198b135-d9d0-7000-8000-000000000004",
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
        fanoutId: "0198b135-d9d0-7000-8000-000000000002",
        fixtureId: 42,
        requestedAt: "2026-08-16T04:00:00.000Z",
        schemaVersion: 1,
        type: "fanout-fixture-notifications",
      }),
    ).toMatchObject({ fixtureId: 42, type: "fanout-fixture-notifications" });
  });

  it("carries AI context through bounded fan-out continuations", () => {
    expect(
      notificationJobSchema.parse({
        afterUserId: "0198b135-d9d0-7000-8000-000000000005",
        analysisId: "0198b135-d9d0-7000-8000-000000000004",
        body: "Liverpool are applying sustained pressure",
        confidence: 0.84,
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
        fanoutId: "0198b135-d9d0-7000-8000-000000000002",
        fixtureId: 42,
        requestedAt: "2026-08-16T04:00:00.000Z",
        schemaVersion: 1,
        type: "fanout-ai-context-notifications",
      }),
    ).toMatchObject({ type: "fanout-ai-context-notifications" });
  });

  it("requires complete entity metadata for bounded news ingestion", () => {
    const base = {
      correlationId: "0198b135-d9d0-7000-8000-000000000001",
      language: "th",
      query: "Liverpool football latest news",
      requestedAt: "2026-08-16T04:00:00.000Z",
      schemaVersion: 1,
      topicKey: "team:8",
      type: "ingest-topic",
    } as const;
    expect(
      newsIngestionJobSchema.parse({
        ...base,
        entityId: 8,
        entityName: "Liverpool",
        entityType: "team",
      }),
    ).toMatchObject({ entityId: 8, language: "th" });
    expect(() => newsIngestionJobSchema.parse({ ...base, entityId: 8 })).toThrow();
  });

  it("supports cursor-based news notification fan-out", () => {
    expect(
      notificationJobSchema.parse({
        afterUserId: "0198b135-d9d0-7000-8000-000000000004",
        articleId: "0198b135-d9d0-7000-8000-000000000003",
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
        fanoutId: "0198b135-d9d0-7000-8000-000000000002",
        requestedAt: "2026-08-16T04:00:00.000Z",
        schemaVersion: 1,
        type: "fanout-news-notifications",
      }),
    ).toMatchObject({ type: "fanout-news-notifications" });
  });
});
