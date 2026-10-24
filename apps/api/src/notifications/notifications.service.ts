import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  notificationHistoryResponseSchema,
  notificationPreferencesSchema,
  pushDeviceRegistrationResponseSchema,
  pushDeviceRemovalResponseSchema,
  type NotificationPreferences,
} from "@goal-app/contracts";
import { notificationJobSchema, queueNames, type QueueJobData } from "@goal-app/jobs";
import { z } from "zod";

import type { AuthPrincipal } from "../auth/auth-principal";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { SupabaseUserService } from "../auth/supabase-user.service";
import type { Environment } from "../config/environment";
import { VercelQueuePublisher } from "../platform/queue/vercel-queue.publisher";

type NotificationJob = QueueJobData[typeof queueNames.notifications];
type DataRow = Record<string, unknown>;
type QueueMetadata = { deliveryCount: number; messageId: string; topicName?: string };
type OutboxRow = {
  event_key: string;
  outbox_id: string;
  payload: unknown;
  publish_attempts: number;
};

const expoTicketSchema = z.object({
  data: z.array(
    z.union([
      z.object({ id: z.string(), status: z.literal("ok") }),
      z.object({
        details: z.object({ error: z.string().optional() }).optional(),
        message: z.string(),
        status: z.literal("error"),
      }),
    ]),
  ),
});

const expoReceiptSchema = z.object({
  data: z.record(
    z.string(),
    z.union([
      z.object({ status: z.literal("ok") }),
      z.object({
        details: z.object({ error: z.string().optional() }).optional(),
        message: z.string(),
        status: z.literal("error"),
      }),
    ]),
  ),
});

function secureEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger("Notifications");

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(SupabaseUserService) private readonly userData: SupabaseUserService,
    @Inject(VercelQueuePublisher) private readonly queue: VercelQueuePublisher,
  ) {}

  async getPreferences(principal: AuthPrincipal) {
    const { data, error } = await this.userData
      .getClient(principal)
      .from("notification_preferences")
      .select("*")
      .eq("user_id", principal.userId)
      .maybeSingle();
    if (error || !data) this.unavailable();
    return notificationPreferencesSchema.parse(this.mapPreferences(data));
  }

  async updatePreferences(input: Partial<NotificationPreferences>, principal: AuthPrincipal) {
    if (input.timezone) this.assertTimezone(input.timezone);
    const current = await this.getPreferences(principal);
    const merged = notificationPreferencesSchema.parse({ ...current, ...input });
    const client = this.userData.getClient(principal);
    const { data, error } = await client
      .from("notification_preferences")
      .update({
        ai_context: merged.aiContext,
        allow_live_during_quiet_hours: merged.allowLiveDuringQuietHours,
        goal: merged.goal,
        halftime_fulltime: merged.halftimeFulltime,
        kickoff_reminder: merged.kickoffReminder,
        lineup: merged.lineup,
        news_breaking: merged.newsBreaking,
        quiet_hours_enabled: merged.quietHoursEnabled,
        quiet_hours_end: merged.quietHoursEnd,
        quiet_hours_start: merged.quietHoursStart,
        red_card: merged.redCard,
        substitution: merged.substitution,
        timezone: merged.timezone,
        trending_news: merged.trendingNews,
        yellow_card: merged.yellowCard,
      })
      .eq("user_id", principal.userId)
      .select("*")
      .single();
    if (error) this.unavailable();
    const { error: rescheduleError } = await client.rpc("reschedule_my_notifications");
    if (rescheduleError) this.unavailable();
    return notificationPreferencesSchema.parse(this.mapPreferences(data));
  }

  async registerDevice(
    input: { expoPushToken: string; platform: "ios" | "android"; timezone: string },
    principal: AuthPrincipal,
  ) {
    this.assertTimezone(input.timezone);
    const client = this.userData.getClient(principal);
    const { data, error } = await client.rpc("register_my_push_device", {
      p_expo_push_token: input.expoPushToken,
      p_platform: input.platform,
      p_timezone: input.timezone,
    });
    if (error) this.unavailable();
    const device = ((data ?? []) as DataRow[])[0];
    if (!device) this.unavailable();

    return pushDeviceRegistrationResponseSchema.parse({
      device: {
        enabled: device.device_enabled,
        id: device.device_id,
        lastSeenAt: new Date(String(device.device_last_seen_at)).toISOString(),
        platform: device.device_platform,
      },
    });
  }

  async removeDevice(deviceId: string, principal: AuthPrincipal) {
    const { data, error } = await this.userData
      .getClient(principal)
      .rpc("disable_my_push_device", { p_device_id: deviceId });
    if (error?.code === "P0002") throw new NotFoundException("Push device not found");
    if (error) this.unavailable();
    if (!data) throw new NotFoundException("Push device not found");
    return pushDeviceRemovalResponseSchema.parse({ disabled: true });
  }

  async listHistory(input: { cursor?: string; limit?: number }, principal: AuthPrincipal) {
    const limit = input.limit ?? 20;
    let query = this.userData
      .getClient(principal)
      .from("notifications")
      .select("id,category,fixture_id,title,body,status,read_at,created_at")
      .eq("user_id", principal.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (input.cursor) {
      const cursor = this.decodeCursor(input.cursor);
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }
    const { data, error } = await query;
    if (error) this.unavailable();
    const rows = (data ?? []) as DataRow[];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return notificationHistoryResponseSchema.parse({
      data: page.map((row) => ({
        body: row.body,
        category: row.category,
        createdAt: new Date(String(row.created_at)).toISOString(),
        fixtureId: row.fixture_id,
        id: row.id,
        readAt: row.read_at ? new Date(String(row.read_at)).toISOString() : null,
        status: row.status,
        title: row.title,
      })),
      nextCursor:
        hasMore && last ? this.encodeCursor(String(last.created_at), String(last.id)) : null,
    });
  }

  async stageFixtureNotifications(fixtureId: number): Promise<void> {
    await this.publishFixtureFanout(
      fixtureId,
      `fixture:${fixtureId}:sync:${Math.floor(Date.now() / 10_000)}`,
    );
  }

  async stageAiContextNotifications(
    fixtureId: number,
    analysisId: string,
    body: string,
    confidence: number,
  ): Promise<void> {
    if (confidence < 0.75 || body.trim().length === 0) return;
    const fanoutId = randomUUID();
    await this.queue.publish(
      queueNames.notifications,
      {
        analysisId,
        body: body.trim().slice(0, 500),
        confidence,
        correlationId: fanoutId,
        fanoutId,
        fixtureId,
        requestedAt: new Date().toISOString(),
        schemaVersion: 1,
        type: "fanout-ai-context-notifications",
      },
      {
        idempotencyKey: `notification-fanout:ai:${analysisId}`,
        retentionSeconds: 24 * 60 * 60,
      },
    );
  }

  async stageNewsNotifications(articleId: string): Promise<void> {
    const fanoutId = randomUUID();
    await this.queue.publish(
      queueNames.notifications,
      {
        articleId,
        correlationId: fanoutId,
        fanoutId,
        requestedAt: new Date().toISOString(),
        schemaVersion: 1,
        type: "fanout-news-notifications",
      },
      {
        idempotencyKey: `notification-fanout:news:${articleId}`,
        retentionSeconds: 24 * 60 * 60,
      },
    );
  }

  async runCron(authorization?: string) {
    this.authorizeCron(authorization);
    const client = this.supabase.getClient();
    const ownerToken = randomUUID();
    const { data: acquired, error: lockError } = await client.rpc("try_acquire_cron_lock", {
      p_lock_key: "notifications:reconcile",
      p_owner_token: ownerToken,
      p_ttl_seconds: 50,
    });
    if (lockError) this.unavailable();
    if (!acquired) return { skipped: true };
    try {
      const { data: reconciliation, error } = await client.rpc("reconcile_due_notifications");
      if (error) this.unavailable();
      const fanoutsQueued = await this.queueDueFixtureFanouts();
      const outbox = await this.dispatchPending();
      const receiptsQueued = await this.queueReceiptCheck();
      return { fanoutsQueued, outbox, receiptsQueued, reconciliation, skipped: false };
    } finally {
      const { error } = await client.rpc("release_cron_lock", {
        p_lock_key: "notifications:reconcile",
        p_owner_token: ownerToken,
      });
      if (error) this.logger.error({ error: error.message, ownerToken });
    }
  }

  async dispatchPending(limit = 100) {
    const client = this.supabase.getClient();
    const ownerToken = randomUUID();
    const { data: acquired, error: lockError } = await client.rpc("try_acquire_cron_lock", {
      p_lock_key: "dispatcher:notification-outbox",
      p_owner_token: ownerToken,
      p_ttl_seconds: 50,
    });
    if (lockError) this.unavailable();
    if (!acquired) return { attempted: 0, failed: 0, published: 0, skipped: true };
    let attempted = 0;
    let failed = 0;
    let published = 0;
    try {
      const { data, error } = await client.rpc("get_pending_notification_outbox", {
        p_limit: limit,
      });
      if (error) this.unavailable();
      for (const row of (data ?? []) as OutboxRow[]) {
        attempted += 1;
        try {
          const payload = notificationJobSchema.parse(row.payload);
          const result = await this.queue.publish(queueNames.notifications, payload, {
            idempotencyKey: row.event_key,
            retentionSeconds: 24 * 60 * 60,
          });
          const { error: markError } = await client.rpc("mark_notification_outbox_published", {
            p_message_id: result.messageId ?? "accepted-without-message-id",
            p_outbox_id: row.outbox_id,
          });
          if (markError) throw new Error("Notification outbox acknowledgement failed");
          published += 1;
        } catch (cause) {
          failed += 1;
          const message = cause instanceof Error ? cause.message : "Unknown outbox error";
          await client.rpc("record_notification_outbox_failure", {
            p_error_message: message,
            p_outbox_id: row.outbox_id,
          });
          this.logger.warn({
            attempt: row.publish_attempts + 1,
            error: message,
            outboxId: row.outbox_id,
          });
        }
      }
      return { attempted, failed, published, skipped: false };
    } finally {
      await client.rpc("release_cron_lock", {
        p_lock_key: "dispatcher:notification-outbox",
        p_owner_token: ownerToken,
      });
    }
  }

  async process(job: NotificationJob): Promise<void> {
    if (job.type === "fanout-news-notifications") {
      await this.processNewsFanout(job);
      return;
    }
    if (
      job.type === "fanout-fixture-notifications" ||
      job.type === "fanout-ai-context-notifications"
    ) {
      await this.processNotificationFanout(job);
      return;
    }
    if (job.type === "check-push-receipts") {
      await this.processReceipts(job.receiptIds);
      return;
    }
    const client = this.supabase.getClient();
    const { data, error } = await client.rpc("claim_notification", {
      p_generation_id: job.generationId,
      p_notification_id: job.notificationId,
    });
    if (error) this.unavailable();
    const notification = ((data ?? []) as DataRow[])[0];
    if (!notification) return;

    const [{ data: preference, error: preferenceError }, { data: follow, error: followError }] =
      await Promise.all([
        client
          .from("notification_preferences")
          .select("*")
          .eq("user_id", notification.user_id)
          .maybeSingle(),
        notification.fixture_id
          ? client
              .from("match_follows")
              .select("fixture_id,notifications_enabled")
              .eq("user_id", notification.user_id)
              .eq("fixture_id", notification.fixture_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
    if (preferenceError || followError || !preference) this.unavailable();
    if (
      !this.categoryEnabled(String(notification.category), preference as DataRow) ||
      (notification.fixture_id && (!follow || !follow.notifications_enabled))
    ) {
      await client
        .from("notifications")
        .update({ error_code: "PREFERENCE_DISABLED", status: "suppressed" })
        .eq("id", job.notificationId)
        .eq("generation_id", job.generationId);
      return;
    }

    const { data: devices, error: deviceError } = await client
      .from("push_devices")
      .select("id,expo_push_token")
      .eq("user_id", notification.user_id)
      .eq("enabled", true)
      .is("invalidated_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(10);
    if (deviceError) this.unavailable();
    if (!devices || devices.length === 0) {
      await client
        .from("notifications")
        .update({ status: "suppressed", error_code: "NO_DEVICE" })
        .eq("id", job.notificationId);
      return;
    }

    try {
      const response = await this.expoRequest(
        "/push/send",
        devices.map((device) => ({
          body: notification.body,
          data: { ...(notification.data as object), notificationId: job.notificationId },
          sound: "default",
          title: notification.title,
          to: device.expo_push_token,
        })),
      );
      const tickets = expoTicketSchema.parse(response).data;
      const deliveryRows = devices.map((device, index) => {
        const ticket = tickets[index];
        return {
          device_id: device.id,
          error_code: ticket?.status === "error" ? (ticket.details?.error ?? "EXPO_ERROR") : null,
          error_message: ticket?.status === "error" ? ticket.message : null,
          expo_ticket_id: ticket?.status === "ok" ? ticket.id : null,
          notification_id: job.notificationId,
          ticket_status: ticket?.status ?? "error",
        };
      });
      const { error: deliveryError } = await client
        .from("notification_deliveries")
        .upsert(deliveryRows, { onConflict: "notification_id,device_id" });
      if (deliveryError) this.unavailable();
      const invalidDeviceIds = devices.flatMap((device, index) => {
        const ticket = tickets[index];
        return ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered"
          ? [device.id]
          : [];
      });
      if (invalidDeviceIds.length > 0) {
        const { error: invalidationError } = await client
          .from("push_devices")
          .update({ enabled: false, invalidated_at: new Date().toISOString() })
          .in("id", invalidDeviceIds);
        if (invalidationError) this.unavailable();
      }
      const sent = tickets.some((ticket) => ticket.status === "ok");
      const { error: updateError } = await client
        .from("notifications")
        .update({
          error_code: sent ? null : "EXPO_REJECTED",
          sent_at: sent ? new Date().toISOString() : null,
          status: sent ? "sent" : "failed",
        })
        .eq("id", job.notificationId)
        .eq("generation_id", job.generationId);
      if (updateError) this.unavailable();
      if (!sent) throw new ServiceUnavailableException("Expo rejected every push message");
    } catch (cause) {
      await client
        .from("notifications")
        .update({ error_code: "DELIVERY_FAILED", status: "failed" })
        .eq("id", job.notificationId)
        .eq("generation_id", job.generationId);
      throw cause;
    }
  }

  async recordDeadLetter(payload: unknown, metadata: QueueMetadata, cause: unknown): Promise<void> {
    const parsed = notificationJobSchema.safeParse(payload);
    let key = `invalid:${metadata.messageId}`;
    if (parsed.success) {
      if (parsed.data.type === "send-notification") {
        key = `notification:${parsed.data.notificationId}:${parsed.data.generationId}`;
      } else if (parsed.data.type === "check-push-receipts") {
        key = `notification-receipts:${createHash("sha256").update(parsed.data.receiptIds.join(",")).digest("hex")}`;
      } else {
        key = `notification-fanout:${parsed.data.fanoutId}:${parsed.data.afterUserId ?? "start"}`;
      }
    }
    const { error } = await this.supabase.getClient().rpc("record_notification_dead_letter", {
      p_delivery_count: metadata.deliveryCount,
      p_error_message: cause instanceof Error ? cause.message : "Unknown notification error",
      p_idempotency_key: key,
      p_message_id: metadata.messageId,
      p_payload: payload,
    });
    if (error) this.unavailable();
  }

  private async publishFixtureFanout(fixtureId: number, idempotencyKey: string): Promise<void> {
    const fanoutId = randomUUID();
    await this.queue.publish(
      queueNames.notifications,
      {
        correlationId: fanoutId,
        fanoutId,
        fixtureId,
        requestedAt: new Date().toISOString(),
        schemaVersion: 1,
        type: "fanout-fixture-notifications",
      },
      { idempotencyKey: `notification-fanout:${idempotencyKey}`, retentionSeconds: 300 },
    );
  }

  private async queueDueFixtureFanouts(): Promise<number> {
    const { data, error } = await this.supabase
      .getClient()
      .rpc("get_due_notification_fanout_fixture_ids");
    if (error) this.unavailable();
    const fixtureIds = ((data ?? []) as DataRow[]).map((row) => Number(row.fixture_id));
    const minuteBucket = Math.floor(Date.now() / 60_000);
    for (const fixtureId of fixtureIds) {
      await this.publishFixtureFanout(fixtureId, `fixture:${fixtureId}:cron:${minuteBucket}`);
    }
    return fixtureIds.length;
  }

  private async processNotificationFanout(
    job: Extract<
      NotificationJob,
      { type: "fanout-ai-context-notifications" | "fanout-fixture-notifications" }
    >,
  ): Promise<void> {
    const client = this.supabase.getClient();
    let query = client
      .from("match_follows")
      .select("user_id")
      .eq("fixture_id", job.fixtureId)
      .eq("notifications_enabled", true)
      .order("user_id", { ascending: true })
      .limit(251);
    if (job.afterUserId) query = query.gt("user_id", job.afterUserId);
    const { data, error } = await query;
    if (error) this.unavailable();
    const userIds = (data ?? []).slice(0, 250).map((row) => row.user_id);
    if (userIds.length === 0) return;

    const { error: stageError } =
      job.type === "fanout-fixture-notifications"
        ? await client.rpc("stage_fixture_notifications", {
            p_fixture_id: job.fixtureId,
            p_user_ids: userIds,
          })
        : await client.rpc("stage_ai_context_notifications", {
            p_analysis_id: job.analysisId,
            p_body: job.body,
            p_confidence: job.confidence,
            p_fixture_id: job.fixtureId,
            p_user_ids: userIds,
          });
    if (stageError) this.unavailable();
    await this.dispatchPendingSafely();

    if ((data ?? []).length > 250) {
      const afterUserId = userIds.at(-1);
      if (!afterUserId) return;
      const continuation = { ...job, afterUserId, requestedAt: new Date().toISOString() };
      await this.queue.publish(queueNames.notifications, continuation, {
        idempotencyKey: `notification-fanout:${job.fanoutId}:${afterUserId}`,
        retentionSeconds: 24 * 60 * 60,
      });
    }
  }

  private async processNewsFanout(
    job: Extract<NotificationJob, { type: "fanout-news-notifications" }>,
  ): Promise<void> {
    const client = this.supabase.getClient();
    const { data, error } = await client.rpc("get_news_notification_user_ids", {
      p_after_user_id: job.afterUserId ?? null,
      p_article_id: job.articleId,
      p_limit: 251,
    });
    if (error) this.unavailable();
    const userIds = ((data ?? []) as DataRow[]).slice(0, 250).map((row) => String(row.user_id));
    if (userIds.length === 0) return;
    const { error: stageError } = await client.rpc("stage_news_notifications", {
      p_article_id: job.articleId,
      p_user_ids: userIds,
    });
    if (stageError) this.unavailable();
    await this.dispatchPendingSafely();

    if ((data ?? []).length > 250) {
      const afterUserId = userIds.at(-1);
      if (!afterUserId) return;
      await this.queue.publish(
        queueNames.notifications,
        { ...job, afterUserId, requestedAt: new Date().toISOString() },
        {
          idempotencyKey: `notification-fanout:${job.fanoutId}:${afterUserId}`,
          retentionSeconds: 24 * 60 * 60,
        },
      );
    }
  }

  private async queueReceiptCheck(): Promise<number> {
    const { data, error } = await this.supabase
      .getClient()
      .from("notification_deliveries")
      .select("expo_ticket_id")
      .not("expo_ticket_id", "is", null)
      .is("receipt_checked_at", null)
      .lte("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
      .limit(100);
    if (error) this.unavailable();
    const receiptIds = (data ?? []).flatMap((row) =>
      row.expo_ticket_id ? [row.expo_ticket_id] : [],
    );
    if (receiptIds.length === 0) return 0;
    const fingerprint = createHash("sha256")
      .update([...receiptIds].sort().join(","))
      .digest("hex");
    await this.queue.publish(
      queueNames.notifications,
      {
        correlationId: randomUUID(),
        receiptIds,
        requestedAt: new Date().toISOString(),
        schemaVersion: 1,
        type: "check-push-receipts",
      },
      { idempotencyKey: `notification-receipts:${fingerprint}`, retentionSeconds: 60 * 60 },
    );
    return receiptIds.length;
  }

  private async processReceipts(receiptIds: string[]): Promise<void> {
    const receipts = expoReceiptSchema.parse(
      await this.expoRequest("/push/getReceipts", { ids: receiptIds }),
    ).data;
    const client = this.supabase.getClient();
    for (const [ticketId, receipt] of Object.entries(receipts)) {
      const { data: delivery, error } = await client
        .from("notification_deliveries")
        .update({
          error_code: receipt.status === "error" ? (receipt.details?.error ?? "EXPO_ERROR") : null,
          error_message: receipt.status === "error" ? receipt.message : null,
          receipt_checked_at: new Date().toISOString(),
          receipt_status: receipt.status,
        })
        .eq("expo_ticket_id", ticketId)
        .select("device_id")
        .maybeSingle();
      if (error) this.unavailable();
      if (
        delivery &&
        receipt.status === "error" &&
        receipt.details?.error === "DeviceNotRegistered"
      ) {
        await client
          .from("push_devices")
          .update({ enabled: false, invalidated_at: new Date().toISOString() })
          .eq("id", delivery.device_id);
      }
    }
  }

  private async expoRequest(path: string, body: unknown): Promise<unknown> {
    const accessToken = this.config.get("EXPO_PUSH_ACCESS_TOKEN", { infer: true });
    if (!accessToken) throw new ServiceUnavailableException("Expo push is not configured");
    let response: Response;
    try {
      response = await fetch(`${this.config.get("EXPO_PUSH_BASE_URL", { infer: true })}${path}`, {
        body: JSON.stringify(body),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(this.config.get("EXPO_PUSH_TIMEOUT_MS", { infer: true })),
      });
    } catch (cause) {
      throw new ServiceUnavailableException(
        cause instanceof Error
          ? `Expo push request failed: ${cause.message}`
          : "Expo push request failed",
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(`Expo push returned ${response.status}`);
    return response.json();
  }

  private mapPreferences(row: DataRow) {
    return {
      aiContext: row.ai_context,
      allowLiveDuringQuietHours: row.allow_live_during_quiet_hours,
      goal: row.goal,
      halftimeFulltime: row.halftime_fulltime,
      kickoffReminder: row.kickoff_reminder,
      lineup: row.lineup,
      newsBreaking: row.news_breaking,
      quietHoursEnabled: row.quiet_hours_enabled,
      quietHoursEnd: String(row.quiet_hours_end).slice(0, 5),
      quietHoursStart: String(row.quiet_hours_start).slice(0, 5),
      redCard: row.red_card,
      substitution: row.substitution,
      timezone: row.timezone,
      trendingNews: row.trending_news,
      yellowCard: row.yellow_card,
    };
  }

  private categoryEnabled(category: string, row: DataRow): boolean {
    const preferenceByCategory: Record<string, keyof DataRow> = {
      ai_context: "ai_context",
      breaking_news: "news_breaking",
      fulltime: "halftime_fulltime",
      goal: "goal",
      halftime: "halftime_fulltime",
      kickoff_reminder: "kickoff_reminder",
      lineup: "lineup",
      red_card: "red_card",
      score_correction: "goal",
      substitution: "substitution",
      trending_news: "trending_news",
      yellow_card: "yellow_card",
    };
    const key = preferenceByCategory[category];
    return key ? Boolean(row[key]) : false;
  }

  private assertTimezone(value: string): void {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
    } catch {
      throw new BadRequestException("Timezone is not recognized");
    }
  }

  private authorizeCron(authorization?: string): void {
    const secret = this.config.get("CRON_SECRET", { infer: true });
    if (!secret || !authorization || !secureEqual(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException("Invalid cron authorization");
    }
  }

  private async dispatchPendingSafely(): Promise<void> {
    try {
      await this.dispatchPending();
    } catch (cause) {
      this.logger.warn({
        error: cause instanceof Error ? cause.message : "Unknown notification outbox error",
        status: "outbox_pending",
      });
    }
  }

  private encodeCursor(createdAt: string, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64url");
  }

  private decodeCursor(value: string): { createdAt: string; id: string } {
    try {
      return z
        .object({ createdAt: z.iso.datetime(), id: z.uuid() })
        .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    } catch {
      throw new BadRequestException("Notification cursor is invalid");
    }
  }

  private unavailable(): never {
    throw new ServiceUnavailableException("Notification service is unavailable");
  }
}
