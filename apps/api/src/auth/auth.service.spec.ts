import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AppleTokenRevocationService } from "./apple-token-revocation.service";
import { AuthService } from "./auth.service";
import type { SupabaseAdminService } from "./supabase-admin.service";
import type { SupabaseUserService } from "./supabase-user.service";

const principal = {
  accessToken: "user-access-token",
  email: "fan@goal.co.th",
  expiresAt: 1_800_000_000,
  providers: ["email" as const],
  userId: "cb0462e0-bd23-4e9d-a31b-c086f59c6216",
};

describe("AuthService", () => {
  it("maps the owner profile without exposing auth internals", async () => {
    const chain = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          avatar_url: null,
          created_at: "2026-08-16T04:00:00.000Z",
          display_name: "Goal Fan",
          locale: "th-TH",
          timezone: "Asia/Bangkok",
          updated_at: "2026-08-16T04:00:00.000Z",
          user_id: principal.userId,
        },
        error: null,
      }),
      select: vi.fn().mockReturnThis(),
    };
    const userData = {
      getClient: () => ({ from: vi.fn().mockReturnValue(chain) }),
    } as unknown as SupabaseUserService;
    const supabase = {} as SupabaseAdminService;
    const apple = { revoke: vi.fn() } as unknown as AppleTokenRevocationService;

    await expect(
      new AuthService(supabase, userData, apple).getProfile(principal),
    ).resolves.toMatchObject({
      displayName: "Goal Fan",
      email: principal.email,
      id: principal.userId,
    });
  });

  it("deletes atomically through the server-only database function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "request-id", error: null });
    const supabase = { getClient: () => ({ rpc }) } as unknown as SupabaseAdminService;
    const apple = { revoke: vi.fn() } as unknown as AppleTokenRevocationService;

    await expect(
      new AuthService(supabase, {} as SupabaseUserService, apple).deleteAccount(principal),
    ).resolves.toEqual({
      deleted: true,
      providerRevocation: "not_applicable",
    });
    expect(rpc).toHaveBeenCalledWith(
      "delete_authenticated_user",
      expect.objectContaining({ target_user_id: principal.userId }),
    );
  });

  it("does not report success when transactional deletion fails", async () => {
    const supabase = {
      getClient: () => ({ rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("db") }) }),
    } as unknown as SupabaseAdminService;
    const apple = { revoke: vi.fn() } as unknown as AppleTokenRevocationService;
    await expect(
      new AuthService(supabase, {} as SupabaseUserService, apple).deleteAccount(principal),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
