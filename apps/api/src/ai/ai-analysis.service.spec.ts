import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthPrincipal } from "../auth/auth-principal";
import type { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { SupabaseUserService } from "../auth/supabase-user.service";
import type { FootballReadService } from "../football/football-read.service";
import type { AiOutboxService } from "../platform/queue/ai-outbox.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { AiAnalysisService } from "./ai-analysis.service";
import type { OpenAiFootballService } from "./openai-football.service";

const principal: AuthPrincipal = {
  accessToken: "user-access-token",
  email: "fan@example.com",
  expiresAt: 1_800_000_000,
  providers: ["email"],
  userId: "0198b135-d9d0-7000-8000-000000000001",
};

function setup(reservation: Record<string, unknown>) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      provider_last_processed_at: "2026-08-16T04:00:00.000Z",
      updated_at: "2026-08-16T04:00:00.000Z",
    },
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue({ data: [reservation], error: null });
  const client = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    }),
    rpc,
  };
  const dispatchPending = vi.fn().mockResolvedValue({ published: 1 });
  const service = new AiAnalysisService(
    { get: vi.fn().mockReturnValue(20) } as never,
    { getClient: () => client } as unknown as SupabaseAdminService,
    { getClient: () => client } as unknown as SupabaseUserService,
    { getFixture: vi.fn().mockResolvedValue({ id: 42 }) } as unknown as FootballReadService,
    {} as OpenAiFootballService,
    { dispatchPending } as unknown as AiOutboxService,
    { stageAiContextNotifications: vi.fn() } as unknown as NotificationsService,
  );
  return { dispatchPending, rpc, service };
}

describe("AiAnalysisService reservations", () => {
  it("returns a queued reservation and immediately attempts durable outbox dispatch", async () => {
    const { dispatchPending, rpc, service } = setup({
      analysis_id: "0198b135-d9d0-7000-8000-000000000002",
      analysis_status: "queued",
      quota_remaining: 19,
      reservation_outcome: "queued",
    });

    await expect(service.requestMatchAnalysis(42, "th", principal)).resolves.toEqual({
      fixtureId: 42,
      quotaRemaining: 19,
      status: "queued",
    });
    expect(rpc).toHaveBeenCalledWith(
      "reserve_ai_match_analysis",
      expect.objectContaining({
        p_expected_source_updated_at: "2026-08-16T04:00:00.000Z",
        p_fixture_id: 42,
        p_input_snapshot: { id: 42 },
      }),
    );
    expect(dispatchPending).toHaveBeenCalledOnce();
  });

  it("returns HTTP 429 from the explicit transactional quota outcome", async () => {
    const { dispatchPending, service } = setup({
      analysis_id: null,
      analysis_status: "failed",
      quota_remaining: 0,
      reservation_outcome: "quota_exhausted",
    });

    const error = await service.requestMatchAnalysis(42, "th", principal).catch((cause) => cause);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(dispatchPending).not.toHaveBeenCalled();
  });
});
