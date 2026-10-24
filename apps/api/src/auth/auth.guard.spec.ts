import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthGuard, type AuthenticatedRequest } from "./auth.guard";
import type { SupabaseAdminService } from "./supabase-admin.service";
import type { SupabaseJwtService } from "./supabase-jwt.service";

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  it("verifies an exact bearer token and attaches the principal", async () => {
    const principal = {
      email: "fan@goal.co.th",
      expiresAt: 1_800_000_000,
      providers: ["email" as const],
      userId: "cb0462e0-bd23-4e9d-a31b-c086f59c6216",
    };
    const jwt = { verify: vi.fn().mockResolvedValue(principal) } as unknown as SupabaseJwtService;
    const chain = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis(),
    };
    const supabase = {
      getClient: () => ({ from: vi.fn().mockReturnValue(chain) }),
    } as unknown as SupabaseAdminService;
    const request = {
      header: vi.fn().mockReturnValue("Bearer valid-token"),
    } as unknown as AuthenticatedRequest;

    await expect(new AuthGuard(jwt, supabase).canActivate(contextFor(request))).resolves.toBe(true);
    expect(jwt.verify).toHaveBeenCalledWith("valid-token");
    expect(request.auth).toEqual({ ...principal, accessToken: "valid-token" });
  });

  it("rejects revoked and malformed credentials", async () => {
    const principal = {
      email: "fan@goal.co.th",
      expiresAt: 1_800_000_000,
      providers: ["email" as const],
      userId: "cb0462e0-bd23-4e9d-a31b-c086f59c6216",
    };
    const jwt = { verify: vi.fn().mockResolvedValue(principal) } as unknown as SupabaseJwtService;
    const chain = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: principal.userId }, error: null }),
      select: vi.fn().mockReturnThis(),
    };
    const supabase = {
      getClient: () => ({ from: vi.fn().mockReturnValue(chain) }),
    } as unknown as SupabaseAdminService;

    await expect(
      new AuthGuard(jwt, supabase).canActivate(
        contextFor({ header: vi.fn().mockReturnValue("Bearer revoked") }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      new AuthGuard(jwt, supabase).canActivate(
        contextFor({ header: vi.fn().mockReturnValue("bearer invalid") }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
