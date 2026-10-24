import { ServiceUnavailableException } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseAdminService } from "../auth/supabase-admin.service";
import { ReadinessService } from "./readiness.service";

function freshnessQuery(data: unknown, error: unknown = null) {
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn().mockResolvedValue({ data, error }),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };
  return query;
}

describe("ReadinessService", () => {
  it("fails readiness when a live fixture has not been refreshed within 60 seconds", async () => {
    const profiles = { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const fixtures = freshnessQuery([{ updated_at: new Date(Date.now() - 61_000).toISOString() }]);
    const from = vi.fn().mockReturnValueOnce(profiles).mockReturnValueOnce(fixtures);
    const admin = {
      getClient: () => ({ from }) as unknown as SupabaseClient,
      isConfigured: true,
    } as SupabaseAdminService;

    await expect(new ReadinessService(admin).assertReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("allows traffic when there is no active match to keep fresh", async () => {
    const profiles = { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const fixtures = freshnessQuery([]);
    const from = vi.fn().mockReturnValueOnce(profiles).mockReturnValueOnce(fixtures);
    const admin = {
      getClient: () => ({ from }) as unknown as SupabaseClient,
      isConfigured: true,
    } as SupabaseAdminService;

    await expect(new ReadinessService(admin).assertReady()).resolves.toBeUndefined();
  });
});
