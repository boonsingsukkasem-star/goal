import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseAdminService } from "../../auth/supabase-admin.service";
import { AiOutboxService } from "./ai-outbox.service";
import type { VercelQueuePublisher } from "./vercel-queue.publisher";

const payload = {
  analysisId: "0198b135-d9d0-7000-8000-000000000002",
  correlationId: "0198b135-d9d0-7000-8000-000000000001",
  fixtureId: 42,
  generationId: "0198b135-d9d0-7000-8000-000000000003",
  language: "th",
  requestedAt: "2026-08-16T04:00:00.000Z",
  schemaVersion: 1,
  sourceUpdatedAt: "2026-08-16T04:00:00.000Z",
  type: "analyze-match",
};

function setup(publish: ReturnType<typeof vi.fn>) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "try_acquire_cron_lock") return { data: true, error: null };
    if (name === "get_pending_ai_outbox") {
      return {
        data: [
          {
            event_key: "ai-analysis:event:v1",
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
  const config = { get: () => "a-production-cron-secret" };
  const supabase = { getClient: () => ({ rpc }) } as unknown as SupabaseAdminService;
  const queue = { publish } as unknown as VercelQueuePublisher;
  return { rpc, service: new AiOutboxService(config as never, supabase, queue) };
}

describe("AiOutboxService", () => {
  it("publishes and acknowledges a durable outbox record", async () => {
    const publish = vi.fn().mockResolvedValue({ messageId: "queue-message" });
    const { rpc, service } = setup(publish);

    await expect(service.dispatchPending()).resolves.toEqual({
      attempted: 1,
      failed: 0,
      published: 1,
      skipped: false,
    });
    expect(publish).toHaveBeenCalledWith(
      "ai-analysis",
      expect.objectContaining({ generationId: payload.generationId }),
      expect.objectContaining({ idempotencyKey: "ai-analysis:event:v1" }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "mark_ai_outbox_published",
      expect.objectContaining({ p_message_id: "queue-message" }),
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "release_cron_lock",
      expect.objectContaining({ p_lock_key: "dispatcher:ai-outbox" }),
    );
  });

  it("keeps a failed publish pending with bounded backoff evidence", async () => {
    const { rpc, service } = setup(vi.fn().mockRejectedValue(new Error("queue unavailable")));

    await expect(service.dispatchPending()).resolves.toMatchObject({ failed: 1, published: 0 });
    expect(rpc).toHaveBeenCalledWith(
      "record_ai_outbox_publish_failure",
      expect.objectContaining({ p_error_message: "queue unavailable" }),
    );
    expect(rpc).not.toHaveBeenCalledWith("mark_ai_outbox_published", expect.anything());
  });

  it("protects the recovery Cron endpoint", async () => {
    const { service } = setup(vi.fn());
    await expect(service.dispatchCron("Bearer wrong")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
