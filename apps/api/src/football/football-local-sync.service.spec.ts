import { afterEach, describe, expect, it, vi } from "vitest";
import { FootballLocalSyncService, localFixtureDates } from "./football-local-sync.service";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("development sync against hosted Supabase", () => {
  it("detects a running Free-to-paid upgrade and expands the calendar without restarting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
    vi.stubEnv("VERCEL", "");
    const values: Record<string, unknown> = {
      NODE_ENV: "development",
      APP_ENV: "nonprod",
      FOOTBALL_LOCAL_AUTO_SYNC: true,
      API_FOOTBALL_API_KEY: "test",
      FOOTBALL_LIVE_INTERVAL_SECONDS: 60,
    };
    const provider = {
      subscription: vi
        .fn()
        .mockResolvedValueOnce({ free: true })
        .mockResolvedValue({ free: false }),
      getFixturesPage: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
    };
    const sync = {
      syncCatalog: vi.fn(),
      syncLive: vi.fn(),
      recordFeed: vi.fn(),
      ingestBatch: vi.fn(),
      recordCalendarDate: vi.fn(),
      recordFeedIssue: vi.fn(),
    };
    const client = {
      from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    const service = new FootballLocalSyncService(
      { get: (key: string) => values[key] } as never,
      provider as never,
      sync as never,
      { isConfigured: true, getClient: () => client } as never,
    );
    service.start();
    try {
      await vi.advanceTimersByTimeAsync(240_000);
      expect(sync.syncLive).toHaveBeenCalledTimes(1);
      expect(provider.getFixturesPage).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(provider.subscription).toHaveBeenCalledTimes(2);
      expect(sync.recordFeed).toHaveBeenCalledTimes(1);
      expect(sync.syncLive.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(provider.getFixturesPage).toHaveBeenCalledWith("2026-10-19", "2026-10-19", 1);
      expect(sync.recordFeedIssue).not.toHaveBeenCalled();
    } finally {
      await service.onModuleDestroy();
    }
  });
  it("covers both sides of the Bangkok midnight boundary", () => {
    expect(localFixtureDates(new Date("2026-09-18T00:00:00Z"), false)).toEqual([
      "2026-09-18",
      "2026-09-17",
      "2026-09-19",
    ]);
  });
  it("never starts a second local scheduler inside a cloud function", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VERCEL", "1");
    const provider = { subscription: vi.fn() };
    const service = new FootballLocalSyncService(
      { get: () => true } as never,
      provider as never,
      {} as never,
      {} as never,
    );
    service.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(provider.subscription).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });
  it("does not start when the API key is absent", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VERCEL", "");
    const values: Record<string, unknown> = {
      NODE_ENV: "development",
      APP_ENV: "nonprod",
      FOOTBALL_LOCAL_AUTO_SYNC: true,
    };
    const provider = { subscription: vi.fn() };
    const service = new FootballLocalSyncService(
      { get: (key: string) => values[key] } as never,
      provider as never,
      {} as never,
      { isConfigured: true } as never,
    );
    service.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(provider.subscription).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });
});
