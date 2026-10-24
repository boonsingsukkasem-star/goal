import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFootballRequestError, ApiFootballService } from "./api-football.service";
import { apiFootballFixtureSchema } from "./api-football.schemas";
import fixture from "./__fixtures__/finished-match.json";
function service(free = false) {
  const config = {
    get: (key: string) =>
      ({
        API_FOOTBALL_API_KEY: "test-api-football-key",
        API_FOOTBALL_BASE_URL: "https://v3.football.api-sports.io",
        API_FOOTBALL_TIMEOUT_MS: 8000,
        API_FOOTBALL_LEAGUE_IDS: [],
      })[key],
  };
  const value = new ApiFootballService(config as never);
  vi.spyOn(value, "subscription").mockResolvedValue({
    free,
    checkedAt: Date.now(),
    remaining: 1000,
    limit: 1000,
    observed: 0,
  });
  return value;
}
const envelope = (response: unknown[], extra = {}) =>
  new Response(
    JSON.stringify({
      errors: [],
      results: response.length,
      paging: { current: 1, total: 1 },
      response,
      ...extra,
    }),
  );
afterEach(() => vi.restoreAllMocks());
describe("API-Football boundary", () => {
  it("validates a real finished fixture with all detail sections", () => {
    expect(apiFootballFixtureSchema.parse(fixture).events).toHaveLength(15);
  });
  it("keeps omitted sections distinct from empty sections", () => {
    const {
      events: _events,
      lineups: _lineups,
      statistics: _statistics,
      players: _players,
      ...summary
    } = fixture;
    expect(apiFootballFixtureSchema.parse(summary)).not.toHaveProperty("lineups");
    expect(apiFootballFixtureSchema.parse({ ...summary, lineups: [] })).toHaveProperty(
      "lineups",
      [],
    );
  });
  it("sends a header key, never a URL token, and batches at most 20", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => envelope([fixture]));
    await service().getFixtureDetails(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = fetch.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("ids")?.split("-")).toHaveLength(20);
    expect(String(url)).not.toContain("test-api");
    expect(options?.headers).toEqual({ "x-apisports-key": "test-api-football-key" });
  });
  it("handles HTTP 200 errors as failures rather than empty fixtures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      envelope([], { errors: { plan: "Not available" } }),
    );
    await expect(service().getFixturesPage("2026-09-18", "2026-09-18")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("backs off on rate limits even when they arrive in HTTP 200", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(envelope([], { errors: { rateLimit: "Too many requests" } }));
    const api = service();
    await expect(api.getInplayLivescores()).rejects.toBeInstanceOf(ApiFootballRequestError);
    await expect(api.getInplayLivescores()).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses one id on Free, whose ids batch parameter is forbidden", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => envelope([fixture]));
    await service(true).getFixtureDetails([1636285, 2]);
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get("id")).toBe("1636285");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not send a page or league without season for date calendar requests", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(envelope([]));
    await service().getFixturesPage("2026-09-18", "2026-09-18");
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.toString()).toBe(
      "date=2026-09-18&timezone=UTC",
    );
  });
});
