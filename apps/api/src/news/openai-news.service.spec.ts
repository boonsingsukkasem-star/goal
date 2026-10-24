import { ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { Environment } from "../config/environment";
import { OpenAiNewsService } from "./openai-news.service";

function config(apiKey?: string) {
  return {
    get: vi.fn((key: keyof Environment) => {
      if (key === "OPENAI_API_KEY") return apiKey;
      if (key === "OPENAI_MODEL") return "gpt-5.6-sol";
      if (key === "OPENAI_TIMEOUT_MS") return 120000;
      if (key === "NEWS_ALLOWED_DOMAINS") return ["bbc.com", "reuters.com"];
      return undefined;
    }),
  } as unknown as ConfigService<Environment, true>;
}

const job = {
  correlationId: "0198b135-d9d0-7000-8000-000000000001",
  entityId: 8,
  entityName: "Liverpool",
  entityType: "team",
  language: "th",
  query: "Liverpool football latest news",
  requestedAt: "2026-08-16T04:00:00.000Z",
  schemaVersion: 1,
  topicKey: "team:8",
  type: "ingest-topic",
} as const;

describe("OpenAiNewsService", () => {
  it("fails closed without a server-side OpenAI credential", async () => {
    await expect(new OpenAiNewsService(config()).research(job)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("keeps approved HTTPS citations visible and excludes untrusted sources", async () => {
    const service = new OpenAiNewsService(config("openai-test-key-long-enough"));
    const create = vi.fn().mockResolvedValue({
      id: "resp_search",
      output: [
        {
          action: {
            sources: [
              {
                title: "Club update",
                url: "https://www.bbc.com/sport/football/story?utm_source=test",
              },
              { title: "Untrusted", url: "https://example.com/copied-story" },
              { title: "Insecure", url: "http://reuters.com/sports/story" },
            ],
          },
          type: "web_search_call",
        },
      ],
      output_text: "Liverpool confirmed an official team update [citation].",
      usage: { input_tokens: 40, output_tokens: 20 },
    });
    const parse = vi.fn().mockResolvedValue({
      id: "resp_summary",
      output_parsed: {
        stories: [
          {
            category: "general",
            confidence: 0.9,
            headline: "ลิเวอร์พูลยืนยันความเคลื่อนไหวของทีม",
            importance: 75,
            isBreaking: false,
            sourceIndexes: [0],
            summary: "สโมสรยืนยันความเคลื่อนไหวล่าสุดผ่านแหล่งข่าวที่ตรวจสอบได้",
            summaryBullets: ["มีการยืนยันจากแหล่งข่าวที่อนุญาต"],
          },
        ],
      },
      usage: { input_tokens: 60, output_tokens: 30 },
    });
    (
      service as unknown as {
        client: { responses: { create: typeof create; parse: typeof parse } };
      }
    ).client = { responses: { create, parse } };

    const result = await service.research(job);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entities: [{ entityId: 8, entityType: "team", relevance: 1 }],
      inputTokens: 100,
      outputTokens: 50,
      primaryUrl: "https://www.bbc.com/sport/football/story",
    });
    expect(result[0]?.sources).toEqual([
      expect.objectContaining({ domain: "www.bbc.com", position: 1 }),
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: ["web_search_call.action.sources"],
        store: false,
        tools: [
          expect.objectContaining({
            filters: { allowed_domains: ["bbc.com", "reuters.com"] },
            type: "web_search",
          }),
        ],
      }),
    );
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({ store: false }));
  });
});
