import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ApiFootballService } from "./provider/api-football.service";
import type { Environment } from "../config/environment";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { VercelQueuePublisher } from "../platform/queue/vercel-queue.publisher";

function secureStringEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

@Injectable()
export class FootballCronService {
  private readonly logger = new Logger("FootballCron");

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(VercelQueuePublisher) private readonly queue: VercelQueuePublisher,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Optional() @Inject(ApiFootballService) private readonly provider?: ApiFootballService,
  ) {}

  async enqueueLiveSync(
    authorization?: string,
  ): Promise<{ enqueued: boolean; messageId: string | null }> {
    this.authorize(authorization);
    return this.withLease<{ enqueued: boolean; messageId: string | null }>(
      "cron:football-live",
      55,
      { enqueued: false, messageId: null },
      async () => {
        const now = new Date();
        const minute = now.toISOString().slice(0, 16);
        const result = await this.queue.publish(
          "football-sync",
          {
            correlationId: randomUUID(),
            mode: "scan",
            requestedAt: now.toISOString(),
            schemaVersion: 2,
            type: "sync-live-updates",
          },
          { idempotencyKey: `football-sync:live:${minute}`, retentionSeconds: 3600 },
        );
        return { enqueued: true, messageId: result.messageId };
      },
    );
  }

  async enqueueDailyFixtureWindow(
    authorization?: string,
  ): Promise<{ enqueued: boolean; messageId: string | null }> {
    this.authorize(authorization);
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 3);
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + 27);
    return this.withLease<{ enqueued: boolean; messageId: string | null }>(
      "cron:football-fixtures",
      300,
      { enqueued: false, messageId: null },
      () =>
        this.publishFixtureWindow(
          this.dateOnly(start),
          this.dateOnly(end),
          `football-sync:fixtures:${this.dateOnly(now)}`,
        ),
    );
  }

  async enqueueFixtureWindow(
    startDate: string,
    endDate: string,
    authorization?: string,
    idempotencyKey?: string,
  ): Promise<{ enqueued: boolean; messageId: string | null }> {
    this.authorize(authorization);
    return this.withLease<{ enqueued: boolean; messageId: string | null }>(
      `operation:football-fixtures:${startDate}:${endDate}`,
      300,
      { enqueued: false, messageId: null },
      () => this.publishFixtureWindow(startDate, endDate, idempotencyKey),
    );
  }

  private async publishFixtureWindow(
    startDate: string,
    endDate: string,
    idempotencyKey?: string,
  ): Promise<{ enqueued: boolean; messageId: string | null }> {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (
      !datePattern.test(startDate) ||
      !datePattern.test(endDate) ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      days < 0 ||
      days > 30
    ) {
      throw new BadRequestException("Fixture window must be a valid range of at most 31 days");
    }
    const now = new Date();
    const correlationId = randomUUID();
    const result = await this.queue.publish(
      "football-sync",
      {
        correlationId,
        endDate,
        requestedAt: now.toISOString(),
        schemaVersion: 2,
        startDate,
        type: "sync-fixture-window",
      },
      {
        idempotencyKey:
          idempotencyKey ?? `football-sync:fixtures:${startDate}:${endDate}:${correlationId}`,
        retentionSeconds: 24 * 60 * 60,
      },
    );
    return { enqueued: true, messageId: result.messageId };
  }

  async enqueueCurrentStandings(
    authorization?: string,
  ): Promise<{ enqueued: number; messageIds: (string | null)[]; skipped?: boolean }> {
    this.authorize(authorization);
    return this.withLease<{
      enqueued: number;
      messageIds: (string | null)[];
      skipped?: boolean;
    }>("cron:football-standings", 300, { enqueued: 0, messageIds: [], skipped: true }, async () => {
      const plan = await this.provider?.subscription();
      const { data, error } = await this.supabase
        .getClient()
        .from("football_seasons")
        .select("id")
        .eq("is_current", true)
        .eq("coverage->>standings", "true")
        .not("year", "is", null)
        .order("standings_checked_at", { ascending: true, nullsFirst: true })
        .limit(plan?.free ? 1 : 20);
      if (error) throw new ServiceUnavailableException("Current football seasons are unavailable");
      const day = this.dateOnly(new Date());
      const messageIds: (string | null)[] = [];
      for (const season of data ?? []) {
        const now = new Date();
        const result = await this.queue.publish(
          "football-sync",
          {
            correlationId: randomUUID(),
            requestedAt: now.toISOString(),
            schemaVersion: 2,
            seasonId: Number(season.id),
            type: "sync-standings",
          },
          {
            idempotencyKey: `football-sync:standings:${season.id}:${day}`,
            retentionSeconds: 24 * 60 * 60,
          },
        );
        messageIds.push(result.messageId);
      }
      return { enqueued: messageIds.length, messageIds };
    });
  }

  private authorize(authorization?: string): void {
    const secret = this.config.get("CRON_SECRET", { infer: true });
    if (!secret || !authorization || !secureStringEqual(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException("Invalid cron authorization");
    }
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private async withLease<T>(
    lockKey: string,
    ttlSeconds: number,
    skipped: T,
    action: () => Promise<T>,
  ): Promise<T> {
    const ownerToken = randomUUID();
    const client = this.supabase.getClient();
    const { data: acquired, error } = await client.rpc("try_acquire_cron_lock", {
      p_lock_key: lockKey,
      p_owner_token: ownerToken,
      p_ttl_seconds: ttlSeconds,
    });
    if (error) throw new ServiceUnavailableException("Cron lease is unavailable");
    if (!acquired) return skipped;

    try {
      return await action();
    } finally {
      const { error: releaseError } = await client.rpc("release_cron_lock", {
        p_lock_key: lockKey,
        p_owner_token: ownerToken,
      });
      if (releaseError) {
        this.logger.error({
          error: "Cron lease could not be released",
          lockKey,
          ownerToken,
        });
      }
    }
  }
}
