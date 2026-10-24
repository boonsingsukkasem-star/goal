import type { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { Environment } from "../config/environment";
import { AuthRetentionService } from "./auth-retention.service";
import type { SupabaseAdminService } from "./supabase-admin.service";

describe("AuthRetentionService", () => {
  const config = {
    get: vi.fn().mockReturnValue("the-production-cron-secret"),
  } as unknown as ConfigService<Environment, true>;

  it("rejects calls without Vercel Cron authorization", async () => {
    const supabase = { getClient: vi.fn() } as unknown as SupabaseAdminService;
    await expect(new AuthRetentionService(config, supabase).run()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("runs the idempotent database cleanup for an authorized day", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "succeeded" }, error: null });
    const supabase = { getClient: () => ({ rpc }) } as unknown as SupabaseAdminService;
    await expect(
      new AuthRetentionService(config, supabase).run("Bearer the-production-cron-secret"),
    ).resolves.toEqual({ status: "succeeded" });
    expect(rpc).toHaveBeenCalledWith(
      "run_auth_retention",
      expect.objectContaining({ p_scheduled_for: expect.stringMatching(/T00:00:00.000Z$/) }),
    );
  });
});
