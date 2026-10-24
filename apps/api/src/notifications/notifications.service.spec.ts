import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { SupabaseUserService } from "../auth/supabase-user.service";
import type { VercelQueuePublisher } from "../platform/queue/vercel-queue.publisher";
import { NotificationsService } from "./notifications.service";

const payload = {
  correlationId: "0198b135-d9d0-7000-8000-000000000001",
  generationId: "0198b135-d9d0-7000-8000-000000000002",
  notificationId: "0198b135-d9d0-7000-8000-000000000003",
  requestedAt: "2026-08-16T04:00:00.000Z",
  schemaVersion: 1,
  type: "send-notification",
} as const;

function setup(publish: ReturnType<typeof vi.fn>) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "try_acquire_cron_lock") return { data: true, error: null };
    if (name === "get_pending_notification_outbox") {
      return {
        data: [
          {
            event_key: "notification:event:v1",
            outbox_id: "0198b135-d9d0-7000-8000-000000000004",
            payload,
            publish_attempts: 0,
          },
        ],
        error: null,
      };
    }
    return { data: true, error: null };
  });
  const config = {
    get: (key: string) => (key === "CRON_SECRET" ? "a-production-cron-secret" : undefined),
  };
  const supabase = { getClient: () => ({ rpc }) } as unknown as SupabaseAdminService;
  const userData = { getClient: () => ({ rpc }) } as unknown as SupabaseUserService;
  const queue = { publish } as unknown as VercelQueuePublisher;
  return { rpc, service: new NotificationsService(config as never, supabase, userData, queue) };
}

describe("NotificationsService outbox", () => {
  it("publishes and acknowledges a generation-aware notification job", async () => {
    const publish = vi.fn().mockResolvedValue({ messageId: "queue-message" });
    const { rpc, service } = setup(publish);

    await expect(service.dispatchPending()).resolves.toEqual({
      attempted: 1,
      failed: 0,
      published: 1,
      skipped: false,
    });
    expect(publish).toHaveBeenCalledWith(
      "notifications",
      expect.objectContaining({ generationId: payload.generationId }),
      expect.objectContaining({ idempotencyKey: "notification:event:v1" }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "mark_notification_outbox_published",
      expect.objectContaining({ p_message_id: "queue-message" }),
    );
  });

  it("records publish failure and keeps the outbox recoverable", async () => {
    const { rpc, service } = setup(vi.fn().mockRejectedValue(new Error("queue unavailable")));
    await expect(service.dispatchPending()).resolves.toMatchObject({ failed: 1, published: 0 });
    expect(rpc).toHaveBeenCalledWith(
      "record_notification_outbox_failure",
      expect.objectContaining({ p_error_message: "queue unavailable" }),
    );
  });

  it("queues high-confidence AI context for bounded fan-out", async () => {
    const publish = vi.fn().mockResolvedValue({ messageId: "queue-message" });
    const { service } = setup(publish);
    await service.stageAiContextNotifications(
      42,
      "0198b135-d9d0-7000-8000-000000000005",
      "เจ้าบ้านเริ่มกดดันหนักขึ้น",
      0.82,
    );
    expect(publish).toHaveBeenCalledWith(
      "notifications",
      expect.objectContaining({
        analysisId: "0198b135-d9d0-7000-8000-000000000005",
        type: "fanout-ai-context-notifications",
      }),
      expect.objectContaining({
        idempotencyKey: "notification-fanout:ai:0198b135-d9d0-7000-8000-000000000005",
      }),
    );
  });

  it("queues one idempotent notification fan-out per news article", async () => {
    const publish = vi.fn().mockResolvedValue({ messageId: "queue-message" });
    const { service } = setup(publish);
    await service.stageNewsNotifications("0198b135-d9d0-7000-8000-000000000006");
    expect(publish).toHaveBeenCalledWith(
      "notifications",
      expect.objectContaining({
        articleId: "0198b135-d9d0-7000-8000-000000000006",
        type: "fanout-news-notifications",
      }),
      expect.objectContaining({
        idempotencyKey: "notification-fanout:news:0198b135-d9d0-7000-8000-000000000006",
      }),
    );
  });

  it("protects the reconciliation Cron", async () => {
    const { service } = setup(vi.fn());
    await expect(service.runCron("Bearer wrong")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("fans fixture notifications out in bounded, cursor-based batches", async () => {
    const users = Array.from({ length: 251 }, (_, index) => ({
      user_id: `0198b135-d9d0-7000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const queryResult = { data: users, error: null };
    const query = {
      eq: vi.fn(() => query),
      gt: vi.fn(() => query),
      limit: vi.fn(() => query),
      order: vi.fn(() => query),
      select: vi.fn(() => query),
      then: (resolve: (value: typeof queryResult) => unknown) =>
        Promise.resolve(queryResult).then(resolve),
    };
    const rpc = vi.fn(async (name: string) => {
      if (name === "try_acquire_cron_lock") return { data: false, error: null };
      return { data: 0, error: null };
    });
    const publish = vi.fn().mockResolvedValue({ messageId: "next-batch" });
    const supabase = {
      getClient: () => ({ from: vi.fn(() => query), rpc }),
    } as unknown as SupabaseAdminService;
    const config = { get: vi.fn() };
    const service = new NotificationsService(
      config as never,
      supabase,
      {
        getClient: () => ({ from: vi.fn(() => query), rpc }),
      } as unknown as SupabaseUserService,
      {
        publish,
      } as unknown as VercelQueuePublisher,
    );

    await service.process({
      correlationId: "0198b135-d9d0-7000-8000-000000000010",
      fanoutId: "0198b135-d9d0-7000-8000-000000000011",
      fixtureId: 42,
      requestedAt: "2026-08-16T04:00:00.000Z",
      schemaVersion: 1,
      type: "fanout-fixture-notifications",
    });

    expect(rpc).toHaveBeenCalledWith("stage_fixture_notifications", {
      p_fixture_id: 42,
      p_user_ids: users.slice(0, 250).map((row) => row.user_id),
    });
    expect(publish).toHaveBeenCalledWith(
      "notifications",
      expect.objectContaining({ afterUserId: users[249]?.user_id, fanoutId: expect.any(String) }),
      expect.objectContaining({
        idempotencyKey: `notification-fanout:0198b135-d9d0-7000-8000-000000000011:${users[249]?.user_id}`,
      }),
    );
  });

  it("invalidates a device immediately when Expo rejects its push token", async () => {
    const invalidated = vi.fn().mockResolvedValue({ data: null, error: null });
    const updatePushDevices = { in: invalidated };
    const notificationUpdate = {
      eq: vi.fn(() => notificationUpdate),
      then: (resolve: (value: { error: null }) => unknown) =>
        Promise.resolve({ error: null }).then(resolve),
    };
    const from = vi.fn((table: string) => {
      if (table === "notification_preferences") {
        const preference = {
          eq: vi.fn(() => preference),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { goal: true },
            error: null,
          }),
          select: vi.fn(() => preference),
        };
        return preference;
      }
      if (table === "match_follows") {
        const follow = {
          eq: vi.fn(() => follow),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { fixture_id: 42, notifications_enabled: true },
            error: null,
          }),
          select: vi.fn(() => follow),
        };
        return follow;
      }
      if (table === "push_devices") {
        const devices = {
          eq: vi.fn(() => devices),
          in: invalidated,
          is: vi.fn(() => devices),
          limit: vi.fn().mockResolvedValue({
            data: [
              { expo_push_token: "ExpoPushToken[invalid]", id: "device-invalid" },
              { expo_push_token: "ExpoPushToken[valid]", id: "device-valid" },
            ],
            error: null,
          }),
          order: vi.fn(() => devices),
          select: vi.fn(() => devices),
          update: vi.fn(() => updatePushDevices),
        };
        return devices;
      }
      if (table === "notification_deliveries") {
        return { upsert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      return { update: vi.fn(() => notificationUpdate) };
    });
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          body: "Goal",
          category: "goal",
          data: { fixtureId: 42 },
          fixture_id: 42,
          title: "GOAL",
          user_id: "0198b135-d9d0-7000-8000-000000000099",
        },
      ],
      error: null,
    });
    const config = {
      get: (key: string) =>
        ({
          EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
          EXPO_PUSH_BASE_URL: "https://exp.host/--/api/v2",
          EXPO_PUSH_TIMEOUT_MS: 5_000,
        })[key],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              details: { error: "DeviceNotRegistered" },
              message: "Device not registered",
              status: "error",
            },
            { id: "expo-ticket-ok", status: "ok" },
          ],
        }),
        { status: 200 },
      ),
    );
    const service = new NotificationsService(
      config as never,
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseAdminService,
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseUserService,
      { publish: vi.fn() } as unknown as VercelQueuePublisher,
    );

    await service.process(payload);

    expect(invalidated).toHaveBeenCalledWith("id", ["device-invalid"]);
    fetchMock.mockRestore();
  });

  it("invalidates a device when an Expo receipt reports DeviceNotRegistered", async () => {
    const disableDevice = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn((table: string) => {
      if (table === "notification_deliveries") {
        const delivery = {
          eq: vi.fn(() => delivery),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { device_id: "device-from-receipt" },
            error: null,
          }),
          select: vi.fn(() => delivery),
          update: vi.fn(() => delivery),
        };
        return delivery;
      }
      return { update: vi.fn(() => ({ eq: disableDevice })) };
    });
    const config = {
      get: (key: string) =>
        ({
          EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
          EXPO_PUSH_BASE_URL: "https://exp.host/--/api/v2",
          EXPO_PUSH_TIMEOUT_MS: 5_000,
        })[key],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            "expo-ticket-invalid": {
              details: { error: "DeviceNotRegistered" },
              message: "Device not registered",
              status: "error",
            },
          },
        }),
        { status: 200 },
      ),
    );
    const service = new NotificationsService(
      config as never,
      { getClient: () => ({ from, rpc: vi.fn() }) } as unknown as SupabaseAdminService,
      { getClient: () => ({ from, rpc: vi.fn() }) } as unknown as SupabaseUserService,
      { publish: vi.fn() } as unknown as VercelQueuePublisher,
    );

    await service.process({
      correlationId: "0198b135-d9d0-7000-8000-000000000020",
      receiptIds: ["expo-ticket-invalid"],
      requestedAt: "2026-08-16T04:00:00.000Z",
      schemaVersion: 1,
      type: "check-push-receipts",
    });

    expect(disableDevice).toHaveBeenCalledWith("id", "device-from-receipt");
    fetchMock.mockRestore();
  });
});
