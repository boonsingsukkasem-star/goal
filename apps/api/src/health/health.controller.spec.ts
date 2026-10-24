import { describe, expect, it, vi } from "vitest";

import { HealthController } from "./health.controller";
import type { ReadinessService } from "./readiness.service";

describe("HealthController", () => {
  const readiness = {
    assertReady: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReadinessService;

  it("returns a healthy service response", () => {
    const response = new HealthController(readiness).getHealth();

    expect(response.service).toBe("goal-api");
    expect(response.status).toBe("ok");
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
  });

  it("checks dependencies before reporting readiness", async () => {
    await expect(new HealthController(readiness).getReadiness()).resolves.toMatchObject({
      status: "ready",
    });
    expect(readiness.assertReady).toHaveBeenCalled();
  });
});
