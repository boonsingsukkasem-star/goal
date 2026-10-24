import { createDeterministicJobId, queueNames } from "@goal-app/jobs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VercelQueuePublisher } from "./vercel-queue.publisher";

const { send } = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ messageId: "message-1" }),
}));

vi.mock("@vercel/queue", () => ({ send }));

describe("VercelQueuePublisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and publishes versioned messages with an idempotency key", async () => {
    const publisher = new VercelQueuePublisher();
    const payload = {
      correlationId: "0198b135-d9d0-7000-8000-000000000001",
      fixtureId: 42,
      requestedAt: "2026-08-16T04:00:00.000Z",
      schemaVersion: 2 as const,
      type: "sync-fixture" as const,
    };
    const idempotencyKey = createDeterministicJobId(queueNames.footballSync, "fixture-42");

    await publisher.publish(queueNames.footballSync, payload, { idempotencyKey });

    expect(send).toHaveBeenCalledWith(queueNames.footballSync, payload, {
      idempotencyKey,
      retentionSeconds: 86_400,
    });
  });

  it("rejects a delivery delay beyond message retention", async () => {
    const publisher = new VercelQueuePublisher();

    await expect(
      publisher.publish(
        queueNames.notifications,
        {
          correlationId: "0198b135-d9d0-7000-8000-000000000001",
          generationId: "0198b135-d9d0-7000-8000-000000000003",
          notificationId: "0198b135-d9d0-7000-8000-000000000002",
          requestedAt: "2026-08-16T04:00:00.000Z",
          schemaVersion: 1,
          type: "send-notification",
        },
        { delaySeconds: 61, idempotencyKey: "notification-1", retentionSeconds: 60 },
      ),
    ).rejects.toThrow("delaySeconds cannot exceed retentionSeconds");
  });
});
