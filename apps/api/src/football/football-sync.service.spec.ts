import { describe, expect, it, vi } from "vitest";
import { ApiFootballRequestError } from "./provider/api-football.service";
import { FootballSyncService } from "./football-sync.service";
import fixture from "./provider/__fixtures__/finished-match.json";
import { apiFootballFixtureSchema } from "./provider/api-football.schemas";
function setup() {
  const rpc = vi.fn().mockResolvedValue({ data: 77, error: null });
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of [
    "select",
    "eq",
    "not",
    "gte",
    "lte",
    "or",
    "order",
    "limit",
    "upsert",
    "update",
    "single",
    "maybeSingle",
  ])
    q[key] = vi.fn(() => q);
  q.then = vi.fn((resolve: (value: unknown) => unknown) =>
    resolve({ data: [{ api_football_id: 1636285 }], error: null }),
  );
  const client = { rpc, from: vi.fn(() => q) };
  const provider = {
    subscription: vi.fn().mockResolvedValue({ free: false }),
    getInplayLivescores: vi.fn().mockResolvedValue([]),
    getFixtureDetails: vi.fn().mockResolvedValue([]),
    getFixturesPage: vi.fn(),
    getStandings: vi.fn().mockResolvedValue([]),
  };
  const config = {
    get: vi.fn((key: string): unknown => (key === "FOOTBALL_DETAIL_BATCH_SIZE" ? 20 : [])),
  };
  const football = { getFixture: vi.fn().mockResolvedValue({ id: 77, league: { id: 500 } }) };
  const aiOutbox = { dispatchPending: vi.fn() };
  const service = new FootballSyncService(
    provider as never,
    { getClient: () => client } as never,
    {} as never,
    config as never,
    football as never,
    aiOutbox as never,
    {} as never,
  );
  return { service, provider, rpc, q, config };
}
describe("API-Football synchronization", () => {
  it("rechecks plan-limited standings on paid upgrade instead of waiting a day or the Free lease", async () => {
    const { service, provider, q, rpc } = setup();
    q.maybeSingle!.mockResolvedValue({
      data: {
        id: 500,
        standings_status: "plan_limited",
        standings_checked_at: new Date().toISOString(),
      },
      error: null,
    });
    q.single!.mockResolvedValue({
      data: {
        year: 2026,
        coverage: { standings: true },
        league: { api_football_id: 39 },
      },
      error: null,
    });
    await service.refreshStandingsIfDue(500);
    expect(provider.getStandings).toHaveBeenCalledWith(39, 2026);
    expect(rpc).toHaveBeenCalledWith(
      "try_acquire_cron_lock",
      expect.objectContaining({
        p_lock_key: "api-football:standings:500:paid-retry",
        p_ttl_seconds: 900,
      }),
    );
  });
  it("passes internal league IDs to the AI reservation after checking upstream eligibility", async () => {
    const { service, rpc, q, config } = setup();
    config.get.mockImplementation((key) =>
      key === "AI_AUTO_LEAGUE_IDS" ? [fixture.league.id] : 10,
    );
    q.maybeSingle!.mockResolvedValue({
      data: { provider_last_processed_at: "2026-09-18T00:00:00Z" },
      error: null,
    });
    rpc.mockImplementation(async (name: string) => ({
      data: name === "reserve_system_ai_match_analysis" ? [{ reservation_outcome: "queued" }] : 77,
      error: null,
    }));
    const raw = apiFootballFixtureSchema.parse(fixture);
    delete raw.statistics;
    await service.ingestFixture(raw, true);
    expect(rpc).toHaveBeenCalledWith(
      "reserve_system_ai_match_analysis",
      expect.objectContaining({ p_allowed_league_ids: [500] }),
    );
  });
  it("quarantines permanent provider errors on the first delivery", async () => {
    const { service, provider, rpc } = setup();
    rpc.mockResolvedValue({ data: false, error: null });
    provider.getFixturesPage.mockRejectedValue(new ApiFootballRequestError("Plan denied", 403));
    await service.process(
      {
        type: "sync-fixture-page",
        schemaVersion: 2,
        page: 1,
        date: "2026-09-18",
        requestedAt: "2026-09-18T00:00:00Z",
        correlationId: "0198b135-d9d0-7000-8000-000000000001",
      },
      { deliveryCount: 1, messageId: "test" },
    );
    expect(rpc).toHaveBeenCalledWith("record_football_sync_dead_letter", expect.any(Object));
    expect(rpc).not.toHaveBeenCalledWith("record_football_sync_processed", expect.any(Object));
  });
  it("records a season plan restriction instead of leaving an unexplained empty standings page", async () => {
    const { service, provider, q } = setup();
    q.single!.mockResolvedValue({
      data: { year: 2026, coverage: { standings: true }, league: { api_football_id: 39 } },
      error: null,
    });
    provider.getStandings.mockRejectedValue(new ApiFootballRequestError("Plan denied", 403));
    await service.syncStandings(500);
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ standings_status: "plan_limited" }),
    );
    expect(provider.getStandings).toHaveBeenCalledWith(39, 2026);
  });
  it("clears a successfully empty standings response without retaining an old table", async () => {
    const { service, provider, q, rpc } = setup();
    q.single!.mockResolvedValue({
      data: { year: 2026, coverage: { standings: true }, league: { api_football_id: 39 } },
      error: null,
    });
    provider.getStandings.mockResolvedValue([]);
    await service.syncStandings(500);
    expect(rpc).toHaveBeenCalledWith("ingest_api_football_standings", {
      p_season_id: 500,
      payload: [],
    });
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ standings_status: "empty" }));
  });
  it("reconciles persisted matches even when they disappear from live after a restart", async () => {
    const { service, provider } = setup();
    await service.syncLive(false);
    expect(provider.getFixtureDetails).toHaveBeenCalledWith([1636285]);
  });
  it("stores a snapshot with an observation timestamp and returns the internal ID", async () => {
    const { service, rpc } = setup();
    const raw = apiFootballFixtureSchema.parse(fixture);
    delete raw.statistics;
    expect(await service.ingestFixture(raw, false, "2026-09-18T00:00:00Z")).toBe(77);
    expect(rpc).toHaveBeenCalledWith("ingest_api_football_fixture", {
      payload: raw,
      p_fetched_at: "2026-09-18T00:00:00Z",
    });
  });
  it("propagates ingestion failure instead of acknowledging an unwritten score", async () => {
    const { service, rpc } = setup();
    rpc.mockResolvedValue({ error: { code: "42703" } });
    await expect(
      service.ingestFixture(apiFootballFixtureSchema.parse(fixture), false),
    ).rejects.toThrow("42703");
  });
});
