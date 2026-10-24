import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { Environment } from "../config/environment";
import type { FootballProviderEntityService } from "../football/football-provider-entity.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { VercelQueuePublisher } from "../platform/queue/vercel-queue.publisher";
import { NewsCronService } from "./news-cron.service";

describe("NewsCronService", () => {
  it("resolves favorite topic names from Sportmonks before publishing jobs", async () => {
    const values = {
      CRON_SECRET: "cron-secret",
      NEWS_GLOBAL_TOPICS: [],
      NEWS_INGESTION_LANGUAGES: ["th"],
      NEWS_MAX_TOPICS_PER_RUN: 10,
    };
    const config = {
      get: vi.fn((key: keyof typeof values) => values[key]),
    } as unknown as ConfigService<Environment, true>;
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      if (name === "try_acquire_cron_lock") return { data: true, error: null };
      if (name === "get_news_ingestion_topics") {
        return {
          data: [{ entity_id: 8, entity_type: "team", priority: 10, topic_key: "team:8" }],
          error: null,
        };
      }
      if (name === "purge_expired_news") return { data: 0, error: null };
      return { data: true, error: null };
    });
    const newsQuery = {
      eq: vi.fn(() => newsQuery),
      gte: vi.fn(() => newsQuery),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      order: vi.fn(() => newsQuery),
      select: vi.fn(() => newsQuery),
    };
    const supabase = {
      getClient: () => ({ from: vi.fn(() => newsQuery), rpc }),
    } as unknown as SupabaseAdminService;
    const footballEntities = {
      getMany: vi.fn().mockResolvedValue(
        new Map([
          [
            "team:8",
            {
              entityType: "team",
              founded: 1892,
              id: 8,
              imageUrl: null,
              name: "Liverpool",
              shortCode: "LIV",
            },
          ],
        ]),
      ),
    } as unknown as FootballProviderEntityService;
    const queue = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as VercelQueuePublisher;
    const notifications = {
      stageNewsNotifications: vi.fn(),
    } as unknown as NotificationsService;

    const result = await new NewsCronService(
      config,
      supabase,
      footballEntities,
      queue,
      notifications,
    ).enqueue("Bearer cron-secret");

    expect(footballEntities.getMany).toHaveBeenCalledWith([{ entityId: 8, entityType: "team" }]);
    expect(queue.publish).toHaveBeenCalledWith(
      "news-ingestion",
      expect.objectContaining({
        entityId: 8,
        entityName: "Liverpool",
        query: "Liverpool football latest news injury transfer lineup interview",
      }),
      expect.any(Object),
    );
    expect(result).toMatchObject({ enqueued: 1, skipped: false });
  });
});
