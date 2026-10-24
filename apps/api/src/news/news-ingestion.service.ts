import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { newsIngestionJobSchema, type QueueJobData } from "@goal-app/jobs";

import { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { Environment } from "../config/environment";
import { NotificationsService } from "../notifications/notifications.service";
import { RuntimeCacheService } from "../platform/cache/runtime-cache.service";
import { OpenAiNewsService } from "./openai-news.service";
import { writeStructuredLog } from "../common/http/structured-log";

type NewsJob = QueueJobData["news-ingestion"];
type DataRow = Record<string, unknown>;
export interface NewsQueueMetadata {
  deliveryCount: number;
  messageId: string;
  topicName?: string;
}

@Injectable()
export class NewsIngestionService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(OpenAiNewsService) private readonly openai: OpenAiNewsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(RuntimeCacheService) private readonly cache: RuntimeCacheService,
  ) {}

  async process(job: NewsJob, metadata: NewsQueueMetadata): Promise<void> {
    const startedAt = performance.now();
    const idempotencyKey = `news-ingestion:${job.correlationId}`;
    const client = this.supabase.getClient();
    const { data: processed, error: processedError } = await client.rpc(
      "is_news_ingestion_processed",
      { p_idempotency_key: idempotencyKey, p_message_id: metadata.messageId },
    );
    if (processedError) this.unavailable();
    if (processed) {
      writeStructuredLog("info", "NewsIngestion", {
        event: "job_skipped",
        messageId: metadata.messageId,
        reason: "already_processed",
      });
      return;
    }

    const { data, error } = await client.rpc("reserve_news_ingestion", {
      p_correlation_id: job.correlationId,
      p_daily_limit: this.config.get("NEWS_SYSTEM_DAILY_LIMIT", { infer: true }),
      p_language: job.language,
      p_topic_key: job.topicKey,
    });
    if (error) this.unavailable();
    const reservation = ((data ?? []) as DataRow[])[0];
    if (!reservation) this.unavailable();
    if (!reservation.should_process) {
      if (reservation.outcome !== "in_progress") {
        await this.recordProcessed(metadata.messageId, idempotencyKey, {
          articleCount: 0,
          outcome: reservation.outcome,
        });
      }
      writeStructuredLog("info", "NewsIngestion", {
        event: "job_skipped",
        messageId: metadata.messageId,
        outcome: reservation.outcome,
        reason: "reservation_denied",
      });
      return;
    }

    writeStructuredLog("info", "NewsIngestion", {
      correlationId: job.correlationId,
      deliveryCount: metadata.deliveryCount,
      event: "job_started",
      language: job.language,
      messageId: metadata.messageId,
      topicKey: job.topicKey,
    });

    try {
      const articles = await this.openai.research(job);
      const articleIds: string[] = [];
      for (const article of articles) {
        const { data: articleId, error: upsertError } = await client.rpc("upsert_news_article", {
          p_payload: article,
        });
        if (upsertError || !articleId) this.unavailable();
        articleIds.push(String(articleId));
      }
      const { error: completeError } = await client.rpc("complete_news_ingestion", {
        p_article_count: articleIds.length,
        p_correlation_id: job.correlationId,
      });
      if (completeError) this.unavailable();
      await this.cache.expireTag("news").catch((cause: unknown) =>
        writeStructuredLog("warn", "NewsIngestion", {
          error: cause instanceof Error ? cause.message : "Unknown cache invalidation error",
          status: "bounded_by_cache_ttl",
        }),
      );
      for (const articleId of articleIds) {
        await this.notifications.stageNewsNotifications(articleId).catch((cause: unknown) =>
          writeStructuredLog("warn", "NewsIngestion", {
            articleId,
            error: cause instanceof Error ? cause.message : "Unknown notification fanout error",
            status: "cron_reconciliation_pending",
          }),
        );
      }
      await this.recordProcessed(metadata.messageId, idempotencyKey, {
        articleCount: articleIds.length,
        outcome: "completed",
      });
      writeStructuredLog("info", "NewsIngestion", {
        articleCount: articleIds.length,
        correlationId: job.correlationId,
        deliveryCount: metadata.deliveryCount,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        event: "job_completed",
        language: job.language,
        messageId: metadata.messageId,
        topicKey: job.topicKey,
      });
    } catch (cause) {
      await client.rpc("fail_news_ingestion", {
        p_correlation_id: job.correlationId,
        p_error_code: cause instanceof Error ? cause.message : "UNKNOWN_ERROR",
      });
      writeStructuredLog("error", "NewsIngestion", {
        correlationId: job.correlationId,
        deliveryCount: metadata.deliveryCount,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        error: cause instanceof Error ? cause.message : "Unknown news ingestion error",
        event: "job_failed",
        messageId: metadata.messageId,
        topicKey: job.topicKey,
      });
      throw cause;
    }
  }

  async recordDeadLetter(
    payload: unknown,
    metadata: NewsQueueMetadata,
    cause: unknown,
  ): Promise<void> {
    const parsed = newsIngestionJobSchema.safeParse(payload);
    const idempotencyKey = parsed.success
      ? `news-ingestion:${parsed.data.correlationId}`
      : `invalid:${metadata.messageId}`;
    const { error } = await this.supabase.getClient().rpc("record_news_ingestion_dead_letter", {
      p_delivery_count: metadata.deliveryCount,
      p_error_message: cause instanceof Error ? cause.message : "Unknown news ingestion error",
      p_idempotency_key: idempotencyKey,
      p_message_id: metadata.messageId,
      p_payload: payload,
    });
    if (error) this.unavailable();
  }

  private async recordProcessed(
    messageId: string,
    idempotencyKey: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabase.getClient().rpc("record_news_ingestion_processed", {
      p_idempotency_key: idempotencyKey,
      p_message_id: messageId,
      p_result: result,
    });
    if (error) this.unavailable();
  }

  private unavailable(): never {
    throw new ServiceUnavailableException("News ingestion is temporarily unavailable");
  }
}
