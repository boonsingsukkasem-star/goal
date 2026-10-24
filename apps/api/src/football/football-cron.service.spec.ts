import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { Environment } from "../config/environment";
import type { VercelQueuePublisher } from "../platform/queue/vercel-queue.publisher";
import { FootballCronService } from "./football-cron.service";

const authorization = "Bearer cron-secret-long-enough";

function setup(acquired = true) {
  const config = {
    get: vi.fn((key: keyof Environment) =>
      key === "CRON_SECRET" ? "cron-secret-long-enough" : undefined,
    ),
  } as unknown as ConfigService<Environment, true>;
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: acquired, error: null })
    .mockResolvedValueOnce({ data: true, error: null });
  const admin = {
    getClient: () => ({ rpc }) as unknown as SupabaseClient,
  } as SupabaseAdminService;
  const queue = {
    publish: vi.fn().mockResolvedValue({ messageId: "queue-message" }),
  } as unknown as VercelQueuePublisher;
  return { queue, rpc, service: new FootballCronService(config, queue, admin) };
}

describe("FootballCronService", () => {
  it("rejects requests before touching the lease or queue", async () => {
    const { queue, rpc, service } = setup();
    await expect(service.enqueueLiveSync("Bearer wrong-secret-value")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("holds a database lease while publishing a live watchdog job", async () => {
    const { queue, rpc, service } = setup();
    await expect(service.enqueueLiveSync(authorization)).resolves.toEqual({
      enqueued: true,
      messageId: "queue-message",
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "try_acquire_cron_lock",
      "release_cron_lock",
    ]);
    expect(queue.publish).toHaveBeenCalledTimes(1);
  });

  it("skips an overlapping Cron invocation without publishing", async () => {
    const { queue, rpc, service } = setup(false);
    await expect(service.enqueueLiveSync(authorization)).resolves.toEqual({
      enqueued: false,
      messageId: null,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("releases the lease when queue publishing fails", async () => {
    const { queue, rpc, service } = setup();
    vi.mocked(queue.publish).mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(service.enqueueLiveSync(authorization)).rejects.toThrow("queue unavailable");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "try_acquire_cron_lock",
      "release_cron_lock",
    ]);
  });
});
