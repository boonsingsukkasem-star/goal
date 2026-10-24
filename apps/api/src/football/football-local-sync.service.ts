import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { Environment } from "../config/environment";
import { ApiFootballRequestError, ApiFootballService } from "./provider/api-football.service";
import { FootballSyncService } from "./football-sync.service";

const liveIntervalMs = 60_000;
const recentIntervalMs = 5 * 60_000;
const calendarIntervalMs = 6 * 60 * 60_000;

type PageTask = { date: string; page: number };

// Requests use provider UTC dates; including yesterday covers the Bangkok boundary.
export function localFixtureDates(now: Date, full: boolean): string[] {
  const offsets = full
    ? [
        0,
        -1,
        1,
        ...Array.from({ length: 6 }, (_, index) => -index - 2),
        ...Array.from({ length: 26 }, (_, index) => index + 2),
      ]
    : [0, -1, 1];
  return offsets.map((offset) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
}

/** Started only by the standalone development entry point, never by a Vercel worker. */
@Injectable()
export class FootballLocalSyncService implements OnModuleDestroy {
  private readonly logger = new Logger("FootballLocalSync");
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private pending?: Promise<void>;
  private schemaReady = false;
  private nextLiveAt = 0;
  private liveDelayMs = liveIntervalMs;
  private freePlan = false;
  private nextPlanCheckAt = 0;
  private nextPageAt = 0;
  private nextCalendarAt = 0;
  private nextRecentAt = 0;
  private tasks: PageTask[] = [];

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(ApiFootballService) private readonly provider: ApiFootballService,
    @Inject(FootballSyncService) private readonly sync: FootballSyncService,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
  ) {}

  start(): void {
    if (
      !this.stopped ||
      process.env.VERCEL ||
      this.config.get("NODE_ENV", { infer: true }) !== "development" ||
      this.config.get("APP_ENV", { infer: true }) !== "nonprod" ||
      !this.config.get("FOOTBALL_LOCAL_AUTO_SYNC", { infer: true })
    )
      return;
    if (!this.config.get("API_FOOTBALL_API_KEY", { infer: true }) || !this.supabase.isConfigured) {
      this.logger.warn(
        "Local football sync needs API_FOOTBALL_API_KEY and Supabase server credentials.",
      );
      return;
    }
    this.stopped = false;
    this.nextLiveAt = Date.now() + this.liveDelayMs;
    this.logger.log(
      "Football auto sync starting against Supabase Cloud; frequency and calendar range adapt to the API-Football plan.",
    );
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.pending;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.pending = this.cycle();
    }, delayMs);
    this.timer.unref();
  }

  private async cycle(): Promise<void> {
    let delay = 1000;
    try {
      await this.syncNext();
      if (this.tasks.length === 0 || Date.now() < this.nextPageAt) {
        delay = Math.max(
          1000,
          Math.min(
            liveIntervalMs,
            this.nextLiveAt - Date.now(),
            this.tasks.length ? this.nextPageAt - Date.now() : Infinity,
          ),
        );
      }
    } catch (error) {
      await this.sync.recordFeedIssue(error).catch(() => undefined);
      delay = this.retryDelay(error);
      this.logFailure(error, delay, "all");
    } finally {
      this.schedule(delay);
    }
  }

  private retryDelay(error: unknown): number {
    if (!(error instanceof ApiFootballRequestError)) return 60_000;
    if (error.status === 401 || error.status === 403) return 15 * 60_000;
    return Math.max(60_000, (error.retryAfterSeconds ?? 60) * 1000);
  }

  private deferEndpoint(error: unknown, operation: "live" | "calendar"): number {
    // Authentication and quota errors apply across the provider; database errors
    // also need the outer backoff. An endpoint outage must not stop the other feed.
    if (!(error instanceof ApiFootballRequestError) || error.status === 401 || error.status === 429)
      throw error;
    const delay = this.retryDelay(error);
    this.logFailure(error, delay, operation);
    return Date.now() + delay;
  }

  private logFailure(error: unknown, delay: number, operation: "live" | "calendar" | "all") {
    this.logger.error({
      event: "local_football_sync_failed",
      operation,
      retryInSeconds: delay / 1000,
      message: error instanceof Error ? error.message : "Football sync failed",
    });
  }

  private async syncNext(): Promise<void> {
    if (this.stopped) return;
    const client = this.supabase.getClient();
    await this.refreshPlanIfDue();
    if (!this.schemaReady) {
      const { error } = await client
        .from("football_fixtures")
        .select("api_football_id,data_status")
        .limit(0);
      if (error)
        throw new Error(
          error.code === "42703"
            ? "Apply migration 20260918000000_api_football.sql before syncing (supabase db push)."
            : `Cannot read fixture schema (${error.code ?? "connection error"}).`,
        );
      await this.sync.syncCatalog();
      this.schemaReady = true;
    }
    const owner = randomUUID();
    const { data: acquired, error } = await client.rpc("try_acquire_cron_lock", {
      p_lock_key: "local:football-sync",
      p_owner_token: owner,
      p_ttl_seconds: 120,
    });
    if (error) throw new Error("Cannot acquire local football sync lease.");
    if (!acquired) return;
    try {
      if (this.stopped) return;
      const now = Date.now();
      if (now >= this.nextCalendarAt) {
        this.tasks = localFixtureDates(new Date(now), !this.freePlan).map((date) => ({
          date,
          page: 1,
        }));
        this.nextCalendarAt = now + calendarIntervalMs;
        this.nextRecentAt = now + (this.freePlan ? calendarIntervalMs : recentIntervalMs);
      } else if (now >= this.nextRecentAt) {
        const dates = localFixtureDates(new Date(now), false);
        this.tasks = [
          ...dates.map((date) => ({ date, page: 1 })),
          ...this.tasks.filter((task) => !dates.includes(task.date)),
        ];
        this.nextRecentAt = now + (this.freePlan ? calendarIntervalMs : recentIntervalMs);
      }
      if (now >= this.nextLiveAt) {
        try {
          await this.syncLive();
          this.nextLiveAt = Date.now() + this.liveDelayMs;
        } catch (error) {
          this.nextLiveAt = this.deferEndpoint(error, "live");
        }
        return;
      }
      const task = this.tasks[0];
      if (!task || now < this.nextPageAt) return;
      const fetchedAt = new Date().toISOString();
      let page: Awaited<ReturnType<ApiFootballService["getFixturesPage"]>>;
      try {
        page = await this.provider.getFixturesPage(task.date, task.date, task.page);
      } catch (error) {
        this.nextPageAt = this.deferEndpoint(error, "calendar");
        return;
      }
      if (this.stopped) return;
      await this.sync.ingestBatch(page.data, "fixture", fetchedAt);
      await this.sync.recordCalendarDate(task.date);
      if (page.hasMore) task.page += 1;
      else this.tasks.shift();
      this.logger.log({
        event: "local_football_page_synced",
        date: task.date,
        fixtures: page.data.length,
        pendingDays: this.tasks.length,
      });
    } finally {
      const { error: releaseError } = await client.rpc("release_cron_lock", {
        p_lock_key: "local:football-sync",
        p_owner_token: owner,
      });
      if (releaseError)
        this.logger.warn("Local football sync lease release failed; it will expire.");
    }
  }

  private async syncLive(): Promise<void> {
    await this.sync.syncLive(false);
  }

  private async refreshPlanIfDue(): Promise<void> {
    if (Date.now() < this.nextPlanCheckAt) return;
    const plan = await this.provider.subscription();
    const initial = this.nextPlanCheckAt === 0;
    const changed = !initial && plan.free !== this.freePlan;
    this.freePlan = plan.free;
    this.liveDelayMs = plan.free
      ? 60 * 60_000
      : this.config.get("FOOTBALL_LIVE_INTERVAL_SECONDS", { infer: true }) * 1000;
    this.nextPlanCheckAt = Date.now() + 5 * 60_000;
    if (changed) {
      // Rebuild the date window on both upgrade and downgrade; do not retain forbidden pages.
      this.tasks = [];
      this.nextCalendarAt = 0;
      this.nextPageAt = 0;
      this.nextLiveAt = Date.now();
      await this.sync.recordFeed();
      this.logger.log(
        `API-Football plan changed; refresh interval is ${this.liveDelayMs / 1000}s.`,
      );
    }
    if (plan.free && (initial || changed))
      this.logger.warn(
        "API-Football Free: calendar limited to yesterday/today/tomorrow; updates hourly to protect the 100/day quota.",
      );
  }
}
