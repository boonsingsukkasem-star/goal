import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./environment";

describe("validateEnvironment", () => {
  it("enables local football sync by default and accepts an explicit opt-out", () => {
    expect(validateEnvironment({}).FOOTBALL_LOCAL_AUTO_SYNC).toBe(true);
    expect(
      validateEnvironment({ FOOTBALL_LOCAL_AUTO_SYNC: "false" }).FOOTBALL_LOCAL_AUTO_SYNC,
    ).toBe(false);
  });
  it("uses explicit origins and disables Swagger by default in production", () => {
    const environment = validateEnvironment({
      APP_ENV: "prod",
      CORS_ORIGINS: "https://goal.example, https://admin.goal.example",
      CRON_SECRET: "a-production-cron-secret",
      NODE_ENV: "production",
      SUPABASE_URL: "https://goal.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
      SUPABASE_SECRET_KEY: ["sb", "secret", "abcdefghijklmnopqrstuvwxyz123456"].join("_"),
      API_FOOTBALL_API_KEY: "sportmonks-production-token",
      OPENAI_API_KEY: "openai-production-key-long-enough",
      EXPO_PUSH_ACCESS_TOKEN: "expo-production-token-long-enough",
      AI_AUTO_LEAGUE_IDS: "8, 564",
      APPLE_CLIENT_ID: "th.co.goal.app",
      APPLE_TEAM_ID: "TEAM123456",
      APPLE_KEY_ID: "KEY123456",
      APPLE_PRIVATE_KEY_BASE64: "a".repeat(64),
    });

    expect(environment.CORS_ORIGINS).toEqual([
      "https://goal.example",
      "https://admin.goal.example",
    ]);
    expect(environment.SWAGGER_ENABLED).toBe(false);
    expect(environment.AI_AUTO_LEAGUE_IDS).toEqual([8, 564]);
    expect(environment.NEWS_ALLOWED_DOMAINS).toContain("reuters.com");
    expect(environment.NEWS_SYSTEM_DAILY_LIMIT).toBe(100);
  });

  it("allows Swagger to be explicitly enabled", () => {
    const environment = validateEnvironment({
      APP_ENV: "nonprod",
      SWAGGER_ENABLED: "true",
    });

    expect(environment.SWAGGER_ENABLED).toBe(true);
  });

  it("rejects wildcard or malformed CORS origins", () => {
    expect(() => validateEnvironment({ CORS_ORIGINS: "*", NODE_ENV: "production" })).toThrow();
  });

  it("requires a cron secret and non-local CORS in prod", () => {
    expect(() =>
      validateEnvironment({ APP_ENV: "prod", CORS_ORIGINS: "http://localhost:3000" }),
    ).toThrow();
  });

  it("allows optional AI league, push, and Apple revocation integrations to be disabled in prod", () => {
    const environment = validateEnvironment({
      APP_ENV: "prod",
      CORS_ORIGINS: "https://goal.co.th",
      CRON_SECRET: "a-production-cron-secret",
      SUPABASE_URL: "https://goal.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
      SUPABASE_SECRET_KEY: ["sb", "secret", "abcdefghijklmnopqrstuvwxyz123456"].join("_"),
      API_FOOTBALL_API_KEY: "api-football-production-token",
      OPENAI_API_KEY: "openai-production-key-long-enough",
    });

    expect(environment.AI_AUTO_LEAGUE_IDS).toEqual([]);
    expect(environment.EXPO_PUSH_ACCESS_TOKEN).toBeUndefined();
    expect(environment.APPLE_TEAM_ID).toBeUndefined();
  });

  it("requires new-format Supabase keys in prod", () => {
    expect(() =>
      validateEnvironment({
        APP_ENV: "prod",
        CORS_ORIGINS: "https://goal.co.th",
        CRON_SECRET: "a-production-cron-secret",
        SUPABASE_URL: "https://goal.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "legacy-anon-key-long-enough",
        SUPABASE_SECRET_KEY: "legacy-service-role-key-long-enough",
        API_FOOTBALL_API_KEY: "sportmonks-production-token",
        OPENAI_API_KEY: "openai-production-key-long-enough",
        EXPO_PUSH_ACCESS_TOKEN: "expo-production-token-long-enough",
        AI_AUTO_LEAGUE_IDS: "8",
        APPLE_CLIENT_ID: "th.co.goal.app",
        APPLE_TEAM_ID: "TEAM123456",
        APPLE_KEY_ID: "KEY123456",
        APPLE_PRIVATE_KEY_BASE64: "a".repeat(64),
      }),
    ).toThrow(/sb_publishable_/);
  });

  it("rejects unsafe news domains and unbounded ingestion settings", () => {
    expect(() => validateEnvironment({ NEWS_ALLOWED_DOMAINS: "http://example.com" })).toThrow();
    expect(() => validateEnvironment({ NEWS_MAX_TOPICS_PER_RUN: "51" })).toThrow();
    expect(() => validateEnvironment({ NEWS_SYSTEM_DAILY_LIMIT: "1001" })).toThrow();
  });
});
