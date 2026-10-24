import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { QueueJobData } from "@goal-app/jobs";

import { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { Environment } from "../config/environment";
import { AiOutboxService } from "../platform/queue/ai-outbox.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VercelQueuePublisher } from "../platform/queue/vercel-queue.publisher";
import { FootballReadService } from "./football-read.service";
import { ApiFootballRequestError, ApiFootballService } from "./provider/api-football.service";
import { type ApiFootballFixture } from "./provider/api-football.schemas";
import { calculateMomentum, momentumModelVersion, type StatSnapshot } from "./football-momentum";

type FootballSyncJob = QueueJobData["football-sync"];

export interface FootballSyncMetadata {
  deliveryCount: number;
  messageId: string;
  topicName?: string;
}

@Injectable()
export class FootballSyncService {
  private readonly logger = new Logger("FootballSync");

  constructor(
    @Inject(ApiFootballService) private readonly provider: ApiFootballService,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(VercelQueuePublisher) private readonly queue: VercelQueuePublisher,
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(FootballReadService) private readonly football: FootballReadService,
    @Inject(AiOutboxService) private readonly aiOutbox: AiOutboxService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async process(job: FootballSyncJob, metadata: FootballSyncMetadata): Promise<void> {
    const startedAt = performance.now();
    const idempotencyKey = `api-football-sync:${job.correlationId}`;
    const client = this.supabase.getClient();
    const { data: processed, error: lookupError } = await client.rpc("is_football_sync_processed", {
      p_idempotency_key: idempotencyKey,
      p_message_id: metadata.messageId,
    });
    if (lookupError) throw new ServiceUnavailableException("Football sync ledger is unavailable");
    if (processed) {
      this.logExecution(job, metadata, startedAt, "duplicate");
      return;
    }

    try {
      const result = await this.execute(job);
      const { error } = await client.rpc("record_football_sync_processed", {
        p_idempotency_key: idempotencyKey,
        p_message_id: metadata.messageId,
        p_result: result,
      });
      if (error)
        throw new ServiceUnavailableException("Football sync result could not be recorded");
      this.logExecution(job, metadata, startedAt, "succeeded");
    } catch (error) {
      await this.recordFeedIssue(error).catch(() => undefined);
      const permanent =
        error instanceof ApiFootballRequestError &&
        [401, 403, 404, 422].includes(error.status ?? 0);
      if (!permanent && metadata.deliveryCount < 8) {
        this.logExecution(job, metadata, startedAt, "retrying", error);
        throw error;
      }
      await this.recordDeadLetter(job, metadata, idempotencyKey, error);
      this.logExecution(job, metadata, startedAt, "dead_lettered", error);
    }
  }

  async recordInvalidPayload(
    payload: unknown,
    metadata: FootballSyncMetadata,
    error: unknown,
  ): Promise<void> {
    const client = this.supabase.getClient();
    const { error: writeError } = await client.rpc("record_football_sync_dead_letter", {
      p_delivery_count: metadata.deliveryCount,
      p_error_message: this.errorMessage(error),
      p_idempotency_key: `invalid:${metadata.messageId}`,
      p_message_id: metadata.messageId,
      p_payload: payload,
    });
    if (writeError)
      throw new ServiceUnavailableException("Invalid football job could not be quarantined");
    this.logger.warn({
      correlationId: "invalid",
      deliveryCount: metadata.deliveryCount,
      durationMs: 0,
      error: this.errorMessage(error),
      messageId: metadata.messageId,
      status: "dead_lettered",
      topic: metadata.topicName ?? "football-sync",
    });
  }

  private async execute(job: FootballSyncJob): Promise<Record<string, unknown>> {
    if (job.type === "sync-catalog") {
      await this.syncCatalog();
      return { type: job.type };
    }
    if (job.type === "sync-fixture") {
      const { data, error } = await this.supabase
        .getClient()
        .from("football_fixtures")
        .select("api_football_id")
        .eq("id", job.fixtureId)
        .single();
      if (error || !data?.api_football_id)
        throw new ServiceUnavailableException("Fixture upstream identity is unavailable");
      const fetchedAt = new Date().toISOString();
      for (const fixture of await this.provider.getFixtureDetails([data.api_football_id]))
        await this.ingestFixture(fixture, true, fetchedAt);
      return { fixtureId: job.fixtureId, type: job.type };
    }
    if (job.type === "sync-standings") {
      await this.syncStandings(job.seasonId);
      return { seasonId: job.seasonId, type: job.type };
    }
    if (job.type === "sync-fixture-page") {
      const fetchedAt = new Date().toISOString();
      const page = await this.provider.getFixturesPage(job.date, job.date, job.page);
      await this.ingestBatch(page.data, "fixture", fetchedAt);
      await this.recordCalendarDate(job.date);
      return { date: job.date, fixtures: page.data.length, type: job.type };
    }
    if (job.type === "sync-fixture-window") {
      await this.syncCatalog();
      const plan = await this.provider.subscription();
      const today = new Date();
      const dates = plan.free
        ? [-1, 0, 1].map((offset) =>
            new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10),
          )
        : this.datesBetween(job.startDate, job.endDate);
      for (const date of dates) {
        await this.queue.publish(
          "football-sync",
          {
            correlationId: randomUUID(),
            date,
            page: 1,
            requestedAt: new Date().toISOString(),
            schemaVersion: 2,
            type: "sync-fixture-page",
          },
          {
            idempotencyKey: `api-football:calendar:${date}:${job.requestedAt.slice(0, 10)}`,
            retentionSeconds: 86400,
          },
        );
      }
      return { type: job.type };
    }
    await this.syncLive(true);
    return { type: job.type };
  }

  async refreshFixtureIfDue(fixtureId: number): Promise<void> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from("football_fixtures")
      .select("api_football_id,starts_at,detail_checked_at,is_live,state_code")
      .eq("id", fixtureId)
      .maybeSingle();
    if (error || !data?.api_football_id) return;
    try {
      const plan = await this.provider.subscription();
      const age = data.detail_checked_at
        ? Date.now() - new Date(data.detail_checked_at).getTime()
        : Infinity;
      const minimumAge = plan.free ? 3600_000 : data.is_live ? 60_000 : 15 * 60_000;
      if (age < minimumAge) return;
      const start = new Date(data.starts_at).getTime();
      // Final results can be corrected; old completed data needs no repeated paid request on navigation.
      if (data.detail_checked_at && !data.is_live && start < Date.now() - 48 * 3600_000) return;
      if (plan.free && Math.abs(start - Date.now()) > 48 * 3600_000) return;
      const { data: acquired, error: lockError } = await client.rpc("try_acquire_cron_lock", {
        p_lock_key: `api-football:detail:${fixtureId}`,
        p_owner_token: randomUUID(),
        p_ttl_seconds: plan.free ? 3600 : 60,
      });
      if (lockError || !acquired) return;
      const fetchedAt = new Date().toISOString();
      await this.ingestFixture(
        await this.provider.getFixture(Number(data.api_football_id)),
        false,
        fetchedAt,
      );
    } catch (error) {
      this.logger.warn({
        operation: "fixture_detail_refresh",
        fixtureId,
        error: this.errorMessage(error),
      });
      await this.recordFeedIssue(error).catch(() => undefined);
    }
  }

  async syncCatalog(): Promise<void> {
    const allowed = this.config.get("API_FOOTBALL_LEAGUE_IDS", { infer: true });
    const leagues = (await this.provider.getLeagues()).filter(
      (item) => !allowed.length || allowed.includes((item as { league: { id: number } }).league.id),
    );
    await this.ingestBatch(leagues, "league");
    await this.recordFeed();
  }

  async ingestBatch(
    items: unknown[],
    kind: "league" | "fixture",
    fetchedAt = new Date().toISOString(),
  ) {
    for (let offset = 0; offset < items.length; offset += 100) {
      const { error } = await this.supabase.getClient().rpc("ingest_api_football_batch", {
        payload: items.slice(offset, offset + 100),
        p_fetched_at: fetchedAt,
        p_kind: kind,
      });
      if (error)
        throw new ServiceUnavailableException(`Football batch ingestion failed (${error.code})`);
    }
  }

  async recordFeed(fields: Record<string, unknown> = {}) {
    const plan = await this.provider.subscription();
    const { error } = await this.supabase
      .getClient()
      .from("football_feed_status")
      .upsert({
        id: true,
        plan: plan.free ? "free" : "paid",
        refresh_seconds: plan.free
          ? 3600
          : this.config.get("FOOTBALL_LIVE_INTERVAL_SECONDS", { infer: true }),
        updated_at: new Date().toISOString(),
        ...fields,
      });
    if (error) throw new ServiceUnavailableException("Football feed status could not be saved");
  }

  async recordCalendarDate(date: string) {
    const { error } = await this.supabase
      .getClient()
      .rpc("record_football_calendar_date", { p_date: date });
    if (error) throw new ServiceUnavailableException("Calendar freshness could not be recorded");
  }

  async recordFeedIssue(error: unknown) {
    const code =
      error instanceof ApiFootballRequestError
        ? error.status === 429
          ? "quota"
          : error.status === 403
            ? "plan"
            : "provider"
        : "sync";
    await this.supabase
      .getClient()
      .from("football_feed_status")
      .update({ issue_code: code, updated_at: new Date().toISOString() })
      .eq("id", true);
  }

  async refreshStandingsIfDue(leagueId: number, seasonId?: number): Promise<void> {
    const client = this.supabase.getClient();
    let query = client
      .from("football_seasons")
      .select("id,standings_checked_at,standings_status")
      .eq("league_id", leagueId)
      .not("year", "is", null);
    if (seasonId) query = query.eq("id", seasonId);
    const { data, error } = await query
      .order("is_current", { ascending: false })
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return;
    try {
      const plan = await this.provider.subscription();
      const cooldown =
        data.standings_status === "unsupported" ||
        (data.standings_status === "plan_limited" && plan.free)
          ? 86400_000
          : data.standings_status === "plan_limited"
            ? 0
            : plan.free
              ? 3600_000
              : 900_000;
      if (
        data.standings_checked_at &&
        Date.now() - Date.parse(data.standings_checked_at) < cooldown
      )
        return;
      const { data: acquired, error: lockError } = await client.rpc("try_acquire_cron_lock", {
        p_lock_key: `api-football:standings:${data.id}${!plan.free && data.standings_status === "plan_limited" ? ":paid-retry" : ""}`,
        p_owner_token: randomUUID(),
        p_ttl_seconds: plan.free ? 3600 : 900,
      });
      if (lockError || !acquired) return;
      await this.syncStandings(Number(data.id));
    } catch (error) {
      this.logger.warn({
        operation: "standings_refresh",
        leagueId,
        error: this.errorMessage(error),
      });
    }
  }

  async syncStandings(seasonId: number): Promise<void> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from("football_seasons")
      .select("year,coverage,league:football_leagues!inner(api_football_id)")
      .eq("id", seasonId)
      .single();
    if (error || !data?.year) throw new ServiceUnavailableException("Season is unavailable");
    const mark = async (state: string) => {
      const result = await client
        .from("football_seasons")
        .update({ standings_status: state, standings_checked_at: new Date().toISOString() })
        .eq("id", seasonId);
      if (result.error) throw new ServiceUnavailableException("Standings status unavailable");
    };
    if (!(data.coverage as Record<string, unknown>)?.standings) {
      await mark("unsupported");
      return;
    }
    try {
      const league = data.league as unknown as { api_football_id: number };
      const response = await this.provider.getStandings(league.api_football_id, data.year);
      const tables = response.length
        ? (response[0] as { league: { standings: unknown[] } }).league.standings
        : [];
      if (!Array.isArray(tables))
        throw new ApiFootballRequestError("Invalid standings response", 502);
      const result = await client.rpc("ingest_api_football_standings", {
        p_season_id: seasonId,
        payload: tables,
      });
      if (result.error) throw new ServiceUnavailableException("Standings ingestion failed");
      await mark(
        tables.some((group) => Array.isArray(group) && group.length) ? "available" : "empty",
      );
    } catch (error) {
      if (error instanceof ApiFootballRequestError && error.status === 403) {
        await mark("plan_limited");
        return;
      }
      await mark("error");
      throw error;
    }
  }

  async syncLive(scheduleAi: boolean): Promise<void> {
    const plan = await this.provider.subscription();
    const client = this.supabase.getClient();
    if (plan.free) {
      const { data: acquired, error: leaseError } = await client.rpc("try_acquire_cron_lock", {
        p_lock_key: "api-football:free-hourly",
        p_owner_token: randomUUID(),
        p_ttl_seconds: 3600,
      });
      if (leaseError) throw new ServiceUnavailableException("Football quota lease unavailable");
      if (!acquired) return;
    }
    const fetchedAt = new Date().toISOString();
    const live = await this.provider.getInplayLivescores();
    for (const fixture of live) await this.ingestFixture(fixture, false, fetchedAt);
    // Durable reconciliation: recover final whistles after restarts, and collect post-match corrections.
    // Prioritize active matches, then reconcile the least recently checked completed matches.
    const { data: due, error } = await client
      .from("football_fixtures")
      .select("api_football_id")
      .not("api_football_id", "is", null)
      .gte("starts_at", new Date(Date.now() - 26 * 3600_000).toISOString())
      .lte("starts_at", new Date(Date.now() + 60 * 60_000).toISOString())
      .or(
        `detail_checked_at.is.null,detail_checked_at.lt.${new Date(Date.now() - 60_000).toISOString()}`,
      )
      .order("is_live", { ascending: false })
      .order("detail_checked_at", { ascending: true, nullsFirst: true })
      .limit(plan.free ? 1 : this.config.get("FOOTBALL_DETAIL_BATCH_SIZE", { infer: true }));
    if (error) throw new ServiceUnavailableException("Fixture reconciliation is unavailable");
    const ids = (due ?? []).map((row) => Number(row.api_football_id));
    const detailAt = new Date().toISOString();
    for (const fixture of await this.provider.getFixtureDetails(ids))
      await this.ingestFixture(fixture, scheduleAi, detailAt);
    await client.rpc("prune_football_snapshots");
    await this.recordFeed({ live_updated_at: new Date().toISOString(), issue_code: null });
  }

  async ingestFixture(
    fixture: ApiFootballFixture,
    scheduleAi: boolean,
    fetchedAt = new Date().toISOString(),
  ): Promise<number> {
    const client = this.supabase.getClient();
    const { data, error } = await client.rpc("ingest_api_football_fixture", {
      payload: fixture,
      p_fetched_at: fetchedAt,
    });
    if (error)
      throw new ServiceUnavailableException(
        `Fixture ingestion failed (${error.code ?? "database"})`,
      );
    const id = Number(data);
    // Optional derivatives must never prevent score ingestion or make a whole match unavailable.
    if (fixture.statistics)
      await this.updateMomentum(id).catch((error) =>
        this.logger.warn({ operation: "momentum", fixtureId: id, error: this.errorMessage(error) }),
      );
    if (scheduleAi) {
      await this.scheduleMilestoneAnalysis(fixture, id).catch((error) =>
        this.logger.warn({
          operation: "ai_schedule",
          fixtureId: id,
          error: this.errorMessage(error),
        }),
      );
      await this.stageNotificationsSafely(id);
    }
    return id;
  }

  private async updateMomentum(fixtureId: number) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from("football_stat_snapshots")
      .select("captured_at,minute,extra,statistics")
      .eq("fixture_id", fixtureId)
      .order("captured_at", { ascending: false })
      .limit(2);
    if (error) throw error;
    if (!data || data.length < 2) return;
    for (const point of calculateMomentum(data[1] as StatSnapshot, data[0] as StatSnapshot)) {
      const result = await client.rpc("save_football_momentum", {
        p_fixture_id: fixtureId,
        p_team_id: point.teamId,
        p_minute: point.minute,
        p_extra: point.extraMinute,
        p_value: point.value,
        p_model: momentumModelVersion,
        p_evidence: point.evidence,
      });
      if (result.error) throw result.error;
    }
  }

  private async stageNotificationsSafely(fixtureId: number): Promise<void> {
    try {
      await this.notifications.stageFixtureNotifications(fixtureId);
    } catch (error) {
      this.logger.warn({
        error: this.errorMessage(error),
        fixtureId,
        status: "notification_reconciliation_pending",
      });
    }
  }

  private async scheduleMilestoneAnalysis(
    fixture: ApiFootballFixture,
    fixtureId: number,
  ): Promise<void> {
    const code = fixture.fixture.status.short;
    const triggerKey =
      code === "HT" ? "halftime" : ["FT", "AET", "PEN"].includes(code) ? "fulltime" : null;
    if (!triggerKey) return;
    const allowedLeagueIds = this.config.get("AI_AUTO_LEAGUE_IDS", { infer: true });
    if (!allowedLeagueIds.includes(fixture.league.id)) return;
    const { data, error } = await this.reserveMilestoneWithSnapshot(fixtureId, triggerKey);
    if (error) throw new ServiceUnavailableException("Automatic AI analysis reservation failed");
    const reservation = (data as Record<string, unknown>[] | null)?.[0];
    if (!reservation) throw new ServiceUnavailableException("Automatic AI reservation is empty");
    if (["budget_exhausted", "not_eligible"].includes(String(reservation.reservation_outcome))) {
      this.logger.warn({
        fixtureId,
        outcome: reservation.reservation_outcome,
        status: "automatic_ai_skipped",
        triggerKey,
      });
      return;
    }
    await this.aiOutbox.dispatchPending();
  }

  private async reserveMilestoneWithSnapshot(fixtureId: number, triggerKey: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: revision, error: revisionError } = await this.supabase
        .getClient()
        .from("football_fixtures")
        .select("provider_last_processed_at,updated_at")
        .eq("id", fixtureId)
        .maybeSingle();
      if (revisionError || !revision) {
        throw new ServiceUnavailableException("Automatic AI fixture revision is unavailable");
      }
      const snapshot = await this.football.getFixture(fixtureId);
      const result = await this.supabase.getClient().rpc("reserve_system_ai_match_analysis", {
        p_allowed_league_ids: [snapshot.league.id],
        p_daily_limit: this.config.get("AI_SYSTEM_DAILY_LIMIT", { infer: true }),
        p_expected_source_updated_at: String(
          revision.provider_last_processed_at ?? revision.updated_at,
        ),
        p_fixture_id: fixtureId,
        p_input_snapshot: snapshot,
        p_language: "th",
        p_prompt_version: "match-companion-v1",
        p_trigger_key: triggerKey,
      });
      if (result.error?.code === "P0003" && attempt === 0) continue;
      return result;
    }
    throw new ServiceUnavailableException("Fixture changed during automatic AI reservation");
  }

  private async recordDeadLetter(
    job: FootballSyncJob,
    metadata: FootballSyncMetadata,
    idempotencyKey: string,
    error: unknown,
  ): Promise<void> {
    const { error: writeError } = await this.supabase
      .getClient()
      .rpc("record_football_sync_dead_letter", {
        p_delivery_count: metadata.deliveryCount,
        p_error_message: this.errorMessage(error),
        p_idempotency_key: idempotencyKey,
        p_message_id: metadata.messageId,
        p_payload: job,
      });
    if (writeError) throw error;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown football sync error";
  }

  private datesBetween(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  private logExecution(
    job: FootballSyncJob,
    metadata: FootballSyncMetadata,
    startedAt: number,
    status: "dead_lettered" | "duplicate" | "retrying" | "succeeded",
    error?: unknown,
  ): void {
    const entry = {
      correlationId: job.correlationId,
      deliveryCount: metadata.deliveryCount,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: error ? this.errorMessage(error) : undefined,
      jobType: job.type,
      messageId: metadata.messageId,
      status,
      topic: metadata.topicName ?? "football-sync",
    };
    if (error) this.logger.warn(entry);
    else this.logger.log(entry);
  }
}
