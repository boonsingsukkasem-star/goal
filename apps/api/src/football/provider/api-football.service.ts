import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseAdminService } from "../../auth/supabase-admin.service";
import type { Environment } from "../../config/environment";
import {
  apiFootballEnvelopeSchema,
  apiFootballFixtureSchema,
  type ApiFootballFixture,
} from "./api-football.schemas";

export class ApiFootballRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiFootballRequestError";
  }
}
export interface ApiFootballPage<T> {
  data: T[];
  hasMore: boolean;
}

@Injectable()
export class ApiFootballService {
  private readonly logger = new Logger("ApiFootball");
  private blockedUntil = 0;
  private planCache?: {
    free: boolean;
    checkedAt: number;
    remaining: number;
    limit: number;
    observed: number;
  };
  async subscription() {
    if (this.planCache && Date.now() - this.planCache.checkedAt < 300_000) return this.planCache;
    const key = this.config.get("API_FOOTBALL_API_KEY", { infer: true });
    if (!key) throw new ServiceUnavailableException("API-Football is not configured");
    const url = new URL(
      "status",
      `${this.config.get("API_FOOTBALL_BASE_URL", { infer: true }).replace(/\/$/, "")}/`,
    );
    const response = await fetch(url, {
      headers: { "x-apisports-key": key },
      signal: AbortSignal.timeout(8000),
    });
    const result = (await response.json()) as {
      errors?: Record<string, unknown>;
      response?: {
        subscription?: { plan?: string; active?: boolean };
        requests?: { current?: number; limit_day?: number };
      };
    };
    if (
      !response.ok ||
      Object.keys(result.errors ?? {}).length ||
      !result.response?.subscription?.active
    )
      throw new ApiFootballRequestError("API-Football subscription is unavailable", 403);
    this.planCache = {
      free: result.response.subscription.plan === "Free",
      checkedAt: Date.now(),
      limit: result.response.requests?.limit_day ?? 100,
      observed: result.response.requests?.current ?? 0,
      remaining: Math.max(
        0,
        (result.response.requests?.limit_day ?? 100) - (result.response.requests?.current ?? 0),
      ),
    };
    return this.planCache;
  }
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Optional() @Inject(SupabaseAdminService) private readonly supabase?: SupabaseAdminService,
  ) {}

  async request(path: string, query: Record<string, string | number> = {}) {
    const key = this.config.get("API_FOOTBALL_API_KEY", { infer: true });
    if (!key) throw new ServiceUnavailableException("API-Football is not configured");
    if (Date.now() < this.blockedUntil)
      throw new ApiFootballRequestError(
        "API-Football quota cooldown",
        429,
        Math.ceil((this.blockedUntil - Date.now()) / 1000),
      );
    const plan = await this.subscription();
    if (plan.remaining <= 5)
      throw new ApiFootballRequestError(
        "API-Football daily quota reserve reached",
        429,
        Math.ceil(
          (Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate() + 1,
          ) -
            Date.now()) /
            1000,
        ),
      );
    if (this.supabase) {
      const { data, error } = await this.supabase.getClient().rpc("reserve_api_football_request", {
        p_day: new Date().toISOString().slice(0, 10),
        p_limit: plan.limit,
        p_observed: plan.observed,
      });
      if (error) throw new ServiceUnavailableException("Football quota reservation is unavailable");
      if (!data)
        throw new ApiFootballRequestError("API-Football daily quota reserve reached", 429, 3600);
    }
    plan.remaining -= 1;
    const url = new URL(
      path.replace(/^\//, ""),
      `${this.config.get("API_FOOTBALL_BASE_URL", { infer: true }).replace(/\/$/, "")}/`,
    );
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "x-apisports-key": key },
        signal: AbortSignal.timeout(this.config.get("API_FOOTBALL_TIMEOUT_MS", { infer: true })),
      });
    } catch {
      throw new ApiFootballRequestError("API-Football request timed out or failed", null);
    }
    const retry = Number(response.headers.get("retry-after")) || 60;
    if (!response.ok) {
      if (response.status === 429) this.blockedUntil = Date.now() + retry * 1000;
      throw new ApiFootballRequestError(
        `API-Football HTTP ${response.status}`,
        response.status,
        retry,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiFootballRequestError("API-Football returned invalid JSON", response.status);
    }
    const parsed = apiFootballEnvelopeSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiFootballRequestError("API-Football response schema mismatch", response.status);
    // API-SPORTS also reports authentication, subscription and quota errors with HTTP 200.
    if (Object.keys(parsed.data.errors).length) {
      const fields = Object.keys(parsed.data.errors).join(",");
      const quota = /rateLimit|requests|limit/i.test(fields);
      if (quota) this.blockedUntil = Date.now() + retry * 1000;
      throw new ApiFootballRequestError(
        `API-Football application error (${fields})`,
        quota
          ? 429
          : /token|key|authentication/i.test(fields)
            ? 401
            : /plan/i.test(fields)
              ? 403
              : 422,
        retry,
      );
    }
    this.logger.debug({
      operation: path,
      results: parsed.data.results,
      remaining: response.headers.get("x-ratelimit-requests-remaining"),
    });
    return parsed.data;
  }

  private fixtures(values: unknown[]): ApiFootballFixture[] {
    return values.map((value) => apiFootballFixtureSchema.parse(value));
  }
  async getFixture(providerId: number): Promise<ApiFootballFixture> {
    const data = this.fixtures((await this.request("fixtures", { id: providerId })).response);
    if (!data[0]) throw new ApiFootballRequestError("Fixture not found", 404);
    return data[0];
  }
  async getFixtureDetails(providerIds: number[]): Promise<ApiFootballFixture[]> {
    if (!providerIds.length) return [];
    const plan = await this.subscription();
    if (plan.free) {
      const output: ApiFootballFixture[] = [];
      for (const id of providerIds.slice(0, 1)) output.push(await this.getFixture(id));
      return output;
    }
    const output: ApiFootballFixture[] = [];
    for (let i = 0; i < providerIds.length; i += 20) {
      output.push(
        ...this.fixtures(
          (await this.request("fixtures", { ids: providerIds.slice(i, i + 20).join("-") }))
            .response,
        ),
      );
    }
    return output;
  }
  async getInplayLivescores(): Promise<ApiFootballFixture[]> {
    const leagues = this.config.get("API_FOOTBALL_LEAGUE_IDS", { infer: true });
    return this.fixtures(
      (await this.request("fixtures", { live: leagues.length ? leagues.join("-") : "all" }))
        .response,
    );
  }
  async getFixturesPage(
    startDate: string,
    endDate: string,
    page = 1,
  ): Promise<ApiFootballPage<ApiFootballFixture>> {
    if (startDate !== endDate || page !== 1)
      throw new ApiFootballRequestError(
        "Fixture calendar requires a single date and is not paginated",
        null,
      );
    const leagues = this.config.get("API_FOOTBALL_LEAGUE_IDS", { infer: true });
    const data = this.fixtures(
      (await this.request("fixtures", { date: startDate, timezone: "UTC" })).response,
    );
    return {
      data: leagues.length ? data.filter((item) => leagues.includes(item.league.id)) : data,
      hasMore: false,
    };
  }
  async getStandings(league: number, season: number) {
    return (await this.request("standings", { league, season })).response;
  }
  async getLeagues() {
    return (await this.request("leagues", { current: "true" })).response;
  }
}
