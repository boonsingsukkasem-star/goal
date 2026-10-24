import type { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { Environment } from "../config/environment";
import { OpenAiFootballService } from "./openai-football.service";

describe("OpenAiFootballService", () => {
  it("fails closed when the server credential is absent", async () => {
    const config = {
      get: vi.fn((key: keyof Environment) => {
        if (key === "OPENAI_MODEL") return "gpt-5.6-sol";
        if (key === "OPENAI_TIMEOUT_MS") return 120000;
        return undefined;
      }),
    } as unknown as ConfigService<Environment, true>;
    const service = new OpenAiFootballService(config);
    await expect(service.analyzeMatch({} as never, "th")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("uses Responses structured output without provider storage or SDK retries", async () => {
    const config = {
      get: vi.fn((key: keyof Environment) => {
        if (key === "OPENAI_API_KEY") return "openai-test-key-long-enough";
        if (key === "OPENAI_MODEL") return "gpt-5.6-sol";
        if (key === "OPENAI_TIMEOUT_MS") return 120000;
        return undefined;
      }),
    } as unknown as ConfigService<Environment, true>;
    const service = new OpenAiFootballService(config);
    const content = {
      confidence: 0.8,
      explanation: { decidingFactors: ["ประตูแรก"], whyResult: "จบสกอร์ได้ดีกว่า" },
      momentum: [],
      playerRatings: [],
      summary: { headline: "เจ้าบ้านชนะ", keyMoments: ["23' goal"], short: "เกมสูสี" },
      tactical: {
        away: { formation: "4-4-2", strengths: [], style: "Compact", weaknesses: [] },
        changes: [],
        home: { formation: "4-3-3", strengths: ["Width"], style: "Direct", weaknesses: [] },
      },
    };
    const parse = vi.fn().mockResolvedValue({
      id: "resp_123",
      output_parsed: content,
      usage: { input_tokens: 120, output_tokens: 80 },
    });
    (service as unknown as { client: { responses: { parse: typeof parse } } }).client = {
      responses: { parse },
    };

    await expect(
      service.analyzeMatch(
        {
          awayScore: 0,
          events: [],
          formations: [],
          homeScore: 1,
          id: 42,
          isLive: false,
          league: { id: 8, imageUrl: null, name: "League" },
          lengthMinutes: 90,
          lineups: [],
          name: "Home vs Away",
          participants: [],
          momentum: [
            {
              extraMinute: null,
              id: 90,
              minute: 23,
              periodId: 1,
              teamId: 101,
              value: 10.92,
            },
          ],
          resultInfo: "Home won",
          scores: [],
          seasonId: 9,
          startsAt: "2026-08-16T12:00:00.000Z",
          state: { code: "FT", id: 5, name: "Full time" },
          statistics: [],
        },
        "th",
      ),
    ).resolves.toMatchObject({ content, inputTokens: 120, outputTokens: 80 });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6-sol",
        reasoning: { effort: "low" },
        store: false,
      }),
    );
    expect(JSON.parse(String(parse.mock.calls[0]?.[0]?.input))).toMatchObject({
      momentum: [{ minute: 23, teamId: 101, value: 10.92 }],
    });
  });

  it("fails closed when the provider omits a parsed structured result", async () => {
    const config = {
      get: vi.fn((key: keyof Environment) => {
        if (key === "OPENAI_API_KEY") return "openai-test-key-long-enough";
        if (key === "OPENAI_MODEL") return "gpt-5.6-sol";
        if (key === "OPENAI_TIMEOUT_MS") return 120000;
        return undefined;
      }),
    } as unknown as ConfigService<Environment, true>;
    const service = new OpenAiFootballService(config);
    (service as unknown as { client: { responses: { parse: ReturnType<typeof vi.fn> } } }).client =
      {
        responses: {
          parse: vi.fn().mockResolvedValue({ id: "resp_refusal", output_parsed: null }),
        },
      };
    await expect(service.analyzeMatch({} as never, "th")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
