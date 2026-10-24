import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { aiAnalysisJobSchema, queueNames } from "@goal-app/jobs";

import { SupabaseAdminService } from "../../auth/supabase-admin.service";
import type { Environment } from "../../config/environment";
import { VercelQueuePublisher } from "./vercel-queue.publisher";

type OutboxRow = {
  event_key: string;
  outbox_id: string;
  payload: unknown;
  publish_attempts: number;
};

export type AiOutboxDispatchResult = {
  attempted: number;
  failed: number;
  published: number;
  skipped: boolean;
};

function secureStringEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

@Injectable()
export class AiOutboxService {
  private readonly logger = new Logger("AiOutbox");

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(VercelQueuePublisher) private readonly queue: VercelQueuePublisher,
  ) {}

  async dispatchCron(authorization?: string): Promise<AiOutboxDispatchResult> {
    const secret = this.config.get("CRON_SECRET", { infer: true });
    if (!secret || !authorization || !secureStringEqual(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException("Invalid cron authorization");
    }
    return this.dispatchPending();
  }

  async dispatchPending(limit = 20): Promise<AiOutboxDispatchResult> {
    const client = this.supabase.getClient();
    const ownerToken = randomUUID();
    const { data: acquired, error: lockError } = await client.rpc("try_acquire_cron_lock", {
      p_lock_key: "dispatcher:ai-outbox",
      p_owner_token: ownerToken,
      p_ttl_seconds: 50,
    });
    if (lockError) throw new ServiceUnavailableException("AI outbox lock is unavailable");
    if (!acquired) return { attempted: 0, failed: 0, published: 0, skipped: true };

    let attempted = 0;
    let failed = 0;
    let published = 0;
    try {
      const { data, error } = await client.rpc("get_pending_ai_outbox", { p_limit: limit });
      if (error) throw new ServiceUnavailableException("AI outbox is unavailable");
      for (const row of (data ?? []) as OutboxRow[]) {
        attempted += 1;
        try {
          const payload = aiAnalysisJobSchema.parse(row.payload);
          const result = await this.queue.publish(queueNames.aiAnalysis, payload, {
            idempotencyKey: row.event_key,
            retentionSeconds: 24 * 60 * 60,
          });
          const { error: markError } = await client.rpc("mark_ai_outbox_published", {
            p_message_id: result.messageId ?? "accepted-without-message-id",
            p_outbox_id: row.outbox_id,
          });
          if (markError) throw new ServiceUnavailableException("AI outbox acknowledgement failed");
          published += 1;
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : "Unknown AI outbox error";
          const { error: recordError } = await client.rpc("record_ai_outbox_publish_failure", {
            p_error_message: message,
            p_outbox_id: row.outbox_id,
          });
          if (recordError) {
            this.logger.error({ error: recordError.message, outboxId: row.outbox_id });
          }
          this.logger.warn({
            attempt: row.publish_attempts + 1,
            error: message,
            eventKey: row.event_key,
            outboxId: row.outbox_id,
          });
        }
      }
      return { attempted, failed, published, skipped: false };
    } finally {
      const { error } = await client.rpc("release_cron_lock", {
        p_lock_key: "dispatcher:ai-outbox",
        p_owner_token: ownerToken,
      });
      if (error) this.logger.error({ error: error.message, ownerToken });
    }
  }
}
