import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { queueNames } from "@goal-app/jobs";

import { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { Environment } from "../config/environment";
import { FootballProviderEntityService } from "../football/football-provider-entity.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VercelQueuePublisher } from "../platform/queue/vercel-queue.publisher";
import { writeStructuredLog } from "../common/http/structured-log";

type DataRow = Record<string, unknown>;

function secureEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

@Injectable()
export class NewsCronService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(FootballProviderEntityService)
    private readonly footballEntities: FootballProviderEntityService,
    @Inject(VercelQueuePublisher) private readonly queue: VercelQueuePublisher,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async enqueue(authorization?: string) {
    this.authorize(authorization);
    const startedAt = performance.now();
    writeStructuredLog("info", "NewsCron", { event: "run_started" });
    const ownerToken = randomUUID();
    const client = this.supabase.getClient();
    const { data: acquired, error: lockError } = await client.rpc("try_acquire_cron_lock", {
      p_lock_key: "cron:news-ingestion",
      p_owner_token: ownerToken,
      p_ttl_seconds: 300,
    });
    if (lockError) {
      writeStructuredLog("error", "NewsCron", {
        error: lockError.message,
        event: "run_failed",
        stage: "acquire_lock",
      });
      this.unavailable();
    }
    if (!acquired) {
      writeStructuredLog("warn", "NewsCron", { event: "run_skipped", reason: "lock_held" });
      return { enqueued: 0, fanoutsReconciled: 0, purged: 0, skipped: true };
    }

    try {
      const maxTopics = this.config.get("NEWS_MAX_TOPICS_PER_RUN", { infer: true });
      const globalTopics = this.config.get("NEWS_GLOBAL_TOPICS", { infer: true }).map((query) => ({
        query,
        topicKey: `global:${createHash("sha256").update(query).digest("hex").slice(0, 16)}`,
      }));
      const remaining = Math.max(0, maxTopics - globalTopics.length);
      const { data, error } = await client.rpc("get_news_ingestion_topics", {
        p_limit: Math.max(remaining, 1),
      });
      if (error) this.unavailable();
      const entityTopicRows =
        remaining === 0 ? [] : ((data ?? []) as DataRow[]).slice(0, remaining);
      const resolvedEntities = await this.footballEntities.getMany(
        entityTopicRows.map((row) => ({
          entityId: Number(row.entity_id),
          entityType: row.entity_type as "league" | "player" | "team",
        })),
      );
      const entityTopics = entityTopicRows.flatMap((row) => {
        const entityType = row.entity_type as "league" | "player" | "team";
        const entityId = Number(row.entity_id);
        const entity = resolvedEntities.get(`${entityType}:${entityId}`);
        if (!entity) return [];
        const entityName = entity.entityType === "player" ? entity.displayName : entity.name;
        return [
          {
            entityId,
            entityName,
            entityType,
            query: `${entityName} football latest news injury transfer lineup interview`,
            topicKey: String(row.topic_key),
          },
        ];
      });
      const topics = [...globalTopics, ...entityTopics];
      const languages = this.config.get("NEWS_INGESTION_LANGUAGES", { infer: true });
      const now = new Date();
      const dayBucket = now.toISOString().slice(0, 10);
      let enqueued = 0;
      for (const topic of topics) {
        // One research job produces every configured language from the same sources.
        for (const language of languages.slice(0, 1)) {
          const correlationId = randomUUID();
          await this.queue.publish(
            queueNames.newsIngestion,
            {
              ...topic,
              correlationId,
              language,
              requestedAt: now.toISOString(),
              schemaVersion: 1,
              type: "ingest-topic",
            },
            {
              idempotencyKey: `news-ingestion:${topic.topicKey}:${dayBucket}`,
              retentionSeconds: 48 * 60 * 60,
            },
          );
          enqueued += 1;
        }
      }
      const fanoutsReconciled = await this.reconcileNewsFanouts();
      const { data: purged, error: purgeError } = await client.rpc("purge_expired_news");
      if (purgeError) writeStructuredLog("warn", "NewsCron", { error: purgeError.message });
      const result = {
        enqueued,
        fanoutsReconciled,
        purged: Number(purged ?? 0),
        skipped: false,
      };
      writeStructuredLog("info", "NewsCron", {
        ...result,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        event: "run_completed",
        topicsSelected: topics.length,
      });
      return result;
    } catch (cause) {
      writeStructuredLog("error", "NewsCron", {
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        error: cause instanceof Error ? cause.message : "Unknown news cron error",
        event: "run_failed",
      });
      throw cause;
    } finally {
      const { error } = await client.rpc("release_cron_lock", {
        p_lock_key: "cron:news-ingestion",
        p_owner_token: ownerToken,
      });
      if (error) {
        writeStructuredLog("error", "NewsCron", {
          error: error.message,
          event: "lock_release_failed",
        });
      }
    }
  }

  private async reconcileNewsFanouts(): Promise<number> {
    const { data, error } = await this.supabase
      .getClient()
      .from("news_articles")
      .select("id")
      .eq("status", "published")
      .gte("importance", 85)
      .gte("discovered_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .order("discovered_at", { ascending: false })
      .limit(100);
    if (error) this.unavailable();
    let queued = 0;
    for (const row of data ?? []) {
      try {
        await this.notifications.stageNewsNotifications(String(row.id));
        queued += 1;
      } catch (cause) {
        writeStructuredLog("warn", "NewsCron", {
          articleId: row.id,
          error:
            cause instanceof Error ? cause.message : "Unknown notification reconciliation error",
        });
      }
    }
    return queued;
  }

  private authorize(authorization?: string): void {
    const secret = this.config.get("CRON_SECRET", { infer: true });
    if (!secret || !authorization || !secureEqual(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException("Invalid cron authorization");
    }
  }

  private unavailable(): never {
    throw new ServiceUnavailableException("News ingestion scheduler is unavailable");
  }
}
