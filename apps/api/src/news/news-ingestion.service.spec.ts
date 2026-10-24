import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { Environment } from "../config/environment";
import type { NotificationsService } from "../notifications/notifications.service";
import type { RuntimeCacheService } from "../platform/cache/runtime-cache.service";
import { NewsIngestionService } from "./news-ingestion.service";
import type { OpenAiNewsService } from "./openai-news.service";

const job = {
  correlationId: "0198b135-d9d0-7000-8000-000000000001",
  language: "th",
  query: "football breaking news",
  requestedAt: "2026-08-16T04:00:00.000Z",
  schemaVersion: 1,
  topicKey: "global:breaking",
  type: "ingest-topic",
} as const;

const article = {
  category: "breaking",
  confidence: 0.9,
  discoveredAt: "2026-08-16T04:01:00.000Z",
  entities: [],
  headline: "Major football update",
  importance: 90,
  inputTokens: 100,
  isBreaking: true,
  language: "th",
  model: "gpt-5.6-sol",
  outputTokens: 50,
  primaryUrl: "https://bbc.com/sport/football/story",
  searchResponseId: "resp_search",
  sourceFingerprint: "a".repeat(64),
  sources: [
    {
      domain: "bbc.com",
      position: 1,
      title: "Major football update",
      url: "https://bbc.com/sport/football/story",
    },
  ],
  summary: "A concise cited summary",
  summaryBullets: ["Confirmed update"],
  summaryResponseId: "resp_summary",
  topicKey: "global:breaking",
} as const;

describe("NewsIngestionService", () => {
  it("publishes, invalidates cache, fans out alerts, and records idempotency evidence", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "is_news_ingestion_processed") return { data: false, error: null };
      if (name === "reserve_news_ingestion") {
        return { data: [{ outcome: "claimed", should_process: true }], error: null };
      }
      if (name === "upsert_news_article") {
        return { data: "0198b135-d9d0-7000-8000-000000000009", error: null };
      }
      return { data: true, error: null };
    });
    const research = vi.fn().mockResolvedValue([article]);
    const stageNewsNotifications = vi.fn().mockResolvedValue(undefined);
    const expireTag = vi.fn().mockResolvedValue(undefined);
    const config = {
      get: vi.fn((key: keyof Environment) => (key === "NEWS_SYSTEM_DAILY_LIMIT" ? 100 : undefined)),
    } as unknown as ConfigService<Environment, true>;
    const service = new NewsIngestionService(
      config,
      { getClient: () => ({ rpc }) } as unknown as SupabaseAdminService,
      { research } as unknown as OpenAiNewsService,
      { stageNewsNotifications } as unknown as NotificationsService,
      { expireTag } as unknown as RuntimeCacheService,
    );

    await service.process(job, { deliveryCount: 1, messageId: "message-news-1" });

    expect(rpc).toHaveBeenCalledWith("upsert_news_article", { p_payload: article });
    expect(rpc).toHaveBeenCalledWith("complete_news_ingestion", {
      p_article_count: 1,
      p_correlation_id: job.correlationId,
    });
    expect(expireTag).toHaveBeenCalledWith("news");
    expect(stageNewsNotifications).toHaveBeenCalledWith("0198b135-d9d0-7000-8000-000000000009");
    expect(rpc).toHaveBeenCalledWith(
      "record_news_ingestion_processed",
      expect.objectContaining({
        p_idempotency_key: `news-ingestion:${job.correlationId}`,
        p_result: { articleCount: 1, outcome: "completed" },
      }),
    );
  });

  it("does not call OpenAI when the durable daily budget is exhausted", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "is_news_ingestion_processed"
        ? { data: false, error: null }
        : name === "reserve_news_ingestion"
          ? { data: [{ outcome: "budget_exhausted", should_process: false }], error: null }
          : { data: true, error: null },
    );
    const research = vi.fn();
    const service = new NewsIngestionService(
      { get: () => 100 } as unknown as ConfigService<Environment, true>,
      { getClient: () => ({ rpc }) } as unknown as SupabaseAdminService,
      { research } as unknown as OpenAiNewsService,
      { stageNewsNotifications: vi.fn() } as unknown as NotificationsService,
      { expireTag: vi.fn() } as unknown as RuntimeCacheService,
    );

    await service.process(job, { deliveryCount: 1, messageId: "message-news-budget" });

    expect(research).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "record_news_ingestion_processed",
      expect.objectContaining({ p_result: { articleCount: 0, outcome: "budget_exhausted" } }),
    );
  });
});
