import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Environment } from "../../config/environment";
import { RuntimeCacheService } from "./runtime-cache.service";

const { cache } = vi.hoisted(() => ({
  cache: {
    delete: vi.fn(),
    expireTag: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@vercel/functions", () => ({
  getCache: vi.fn(() => cache),
}));

describe("RuntimeCacheService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("namespaces data by application environment", async () => {
    const { getCache } = await import("@vercel/functions");
    const config = new ConfigService({ APP_ENV: "nonprod" }) as ConfigService<Environment, true>;

    new RuntimeCacheService(config);

    expect(getCache).toHaveBeenCalledWith({ namespace: "goal:nonprod:api" });
  });

  it("passes TTL and invalidation tags to Vercel Runtime Cache", async () => {
    const config = new ConfigService({ APP_ENV: "prod" }) as ConfigService<Environment, true>;
    const service = new RuntimeCacheService(config);

    await service.set("fixture:42", { score: "1-0" }, { tags: ["fixture:42"], ttl: 15 });
    await service.expireTag("fixture:42");

    expect(cache.set).toHaveBeenCalledWith(
      "fixture:42",
      { score: "1-0" },
      { tags: ["fixture:42"], ttl: 15 },
    );
    expect(cache.expireTag).toHaveBeenCalledWith("fixture:42");
  });
});
