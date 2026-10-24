import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  footballFixtureDetailSchema,
  footballFeedStatusSchema,
  footballFixturePageSchema,
  footballLeagueProfileSchema,
  footballPlayerProfileSchema,
  footballStandingsSchema,
  footballTeamProfileSchema,
  type FootballFixtureSummary,
} from "@goal-app/contracts";
import { z } from "zod";

import { SupabasePublicService } from "../auth/supabase-public.service";
import { FootballProviderEntityService } from "./football-provider-entity.service";

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  leagueId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  liveOnly: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(["upcoming", "finished"]).optional(),
  teamId: z.coerce.number().int().positive().optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

const cursorSchema = z.object({
  id: z.number().int().positive(),
  order: z.enum(["asc", "desc"]),
  startsAt: z.iso.datetime(),
});
type DataRow = Record<string, unknown>;

@Injectable()
export class FootballReadService {
  private readonly logger = new Logger(FootballReadService.name);

  constructor(
    @Inject(SupabasePublicService) private readonly supabase: SupabasePublicService,
    @Inject(FootballProviderEntityService)
    private readonly entities: FootballProviderEntityService,
  ) {}

  async listFixtures(input: unknown) {
    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Invalid fixture filters");
    const now = Date.now();
    const from = parsed.data.from ?? new Date(now - 12 * 60 * 60 * 1000).toISOString();
    const to = parsed.data.to ?? new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    if (new Date(from) > new Date(to)) throw new BadRequestException("from must be before to");
    if (new Date(to).getTime() - new Date(from).getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("Fixture range cannot exceed 366 days");
    }

    const selection: string = parsed.data.teamId
      ? "*, league:football_leagues!inner(*), team_filter:football_fixture_participants!inner(team_id)"
      : "*, league:football_leagues!inner(*)";
    let query = this.supabase
      .getClient()
      .from("football_fixtures")
      .select(selection)
      .not("api_football_id", "is", null)
      .gte("starts_at", from)
      .lte("starts_at", to)
      .order("starts_at", { ascending: parsed.data.order === "asc" })
      .order("id", { ascending: parsed.data.order === "asc" })
      .limit(parsed.data.limit + 1);
    if (parsed.data.leagueId) query = query.eq("league_id", parsed.data.leagueId);
    if (parsed.data.liveOnly) query = query.eq("is_live", true);
    if (parsed.data.status === "upcoming") query = query.in("state_code", ["NS", "TBD"]);
    if (parsed.data.status === "finished")
      query = query.in("state_code", ["FT", "AET", "PEN", "AWD", "WO"]);
    if (parsed.data.teamId) query = query.eq("team_filter.team_id", parsed.data.teamId);
    if (parsed.data.cursor) {
      const cursor = this.decodeCursor(parsed.data.cursor);
      if (cursor.order !== parsed.data.order) {
        throw new BadRequestException("Fixture cursor does not match requested order");
      }
      const comparison = parsed.data.order === "asc" ? "gt" : "lt";
      query = query.or(
        `starts_at.${comparison}.${cursor.startsAt},and(starts_at.eq.${cursor.startsAt},id.${comparison}.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) this.unavailable(error);
    const rows = (data ?? []) as unknown as DataRow[];
    const hasMore = rows.length > parsed.data.limit;
    const pageRows = rows.slice(0, parsed.data.limit);
    const participants = await this.participantsFor(pageRows.map((row) => Number(row.id)));
    const summaries = pageRows.map((row) => this.mapSummary(row, participants));
    const last = summaries.at(-1);
    const feed = await this.feedStatus();
    return footballFixturePageSchema.parse({
      feed,
      data: summaries,
      nextCursor:
        hasMore && last ? this.encodeCursor(last.startsAt, last.id, parsed.data.order) : null,
    });
  }

  private async feedStatus() {
    const { data, error } = await this.supabase
      .getClient()
      .from("football_feed_status")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return null;
    const iso = (value: string | null) => (value ? new Date(value).toISOString() : null);
    const parsed = footballFeedStatusSchema.safeParse({
      plan: data.plan,
      refreshSeconds: data.refresh_seconds,
      calendarFrom: data.calendar_from,
      calendarTo: data.calendar_to,
      calendarUpdatedAt: iso(data.calendar_updated_at),
      liveUpdatedAt: iso(data.live_updated_at),
      issueCode: data.issue_code,
    });
    return parsed.success ? parsed.data : null;
  }

  async getFixture(fixtureId: number) {
    const client = this.supabase.getClient();
    const fixtureRequest = client
      .from("football_fixtures")
      .select("*, league:football_leagues!inner(*)")
      .eq("id", fixtureId)
      .maybeSingle();
    const [fixture, participantRows, events, lineups, formations, scores, statistics, momentum] =
      await Promise.all([
        fixtureRequest,
        client
          .from("football_fixture_participants")
          .select("*, team:football_teams!inner(*)")
          .eq("fixture_id", fixtureId),
        client
          .from("football_fixture_events")
          .select("*")
          .eq("fixture_id", fixtureId)
          .order("sort_order"),
        client.from("football_fixture_lineups").select("*").eq("fixture_id", fixtureId),
        client.from("football_fixture_formations").select("*").eq("fixture_id", fixtureId),
        client.from("football_fixture_scores").select("*").eq("fixture_id", fixtureId),
        client.from("football_fixture_statistics").select("*").eq("fixture_id", fixtureId),
        client
          .from("football_fixture_momentum")
          .select("*")
          .eq("fixture_id", fixtureId)
          .eq("model_version", "attacking-activity-v1")
          .order("minute")
          .order("extra_minute"),
      ]);
    const dependencyError = fixture.error ?? participantRows.error;
    if (dependencyError) this.unavailable(dependencyError);
    const dataStatus = Object.fromEntries(
      Object.entries(fixture.data?.data_status ?? {}).map(([key, value]) => {
        const section = value as { state: string; checkedAt?: string };
        return [
          key,
          {
            ...section,
            ...(section.checkedAt ? { checkedAt: new Date(section.checkedAt).toISOString() } : {}),
          },
        ];
      }),
    );
    for (const [section, result] of Object.entries({
      events,
      lineups,
      formations,
      scores,
      statistics,
      momentum,
    })) {
      if (result.error) {
        dataStatus[section] = { state: "error" };
        this.logger.warn({
          operation: "fixture_section",
          fixtureId,
          section,
          code: result.error.code,
        });
      }
    }
    if (!fixture.data) throw new NotFoundException("Fixture not found");
    const participantMap = new Map([[fixtureId, (participantRows.data ?? []) as DataRow[]]]);
    const summary = this.mapSummary(fixture.data as DataRow, participantMap);
    return footballFixtureDetailSchema.parse({
      ...summary,
      source: fixture.data.api_football_id ? "api-football" : "archived",
      sourceUpdatedAt: fixture.data.provider_last_processed_at
        ? new Date(fixture.data.provider_last_processed_at).toISOString()
        : null,
      elapsed: fixture.data.elapsed ?? null,
      dataStatus,
      events: (events.data ?? []).map((row) => ({
        extraMinute: row.extra_minute,
        id: row.id,
        info: row.info,
        minute: row.minute,
        playerId: row.player_id,
        playerName: row.player_name,
        relatedPlayerId: row.related_player_id,
        relatedPlayerName: row.related_player_name,
        result: row.result,
        teamId: row.team_id,
        typeCode: row.type_code,
        typeId: row.type_id,
        typeName: row.type_name,
      })),
      formations: (formations.data ?? []).map((row) => ({
        formation: row.formation,
        location: row.location,
        teamId: row.team_id,
      })),
      lengthMinutes: fixture.data.length_minutes,
      lineups: (lineups.data ?? []).map((row) => ({
        formationField: row.formation_field,
        formationPosition: row.formation_position,
        id: row.id,
        jerseyNumber: row.jersey_number,
        playerId: row.player_id,
        playerName: row.player_name,
        positionId: row.position_id,
        teamId: row.team_id,
        typeId: row.type_id,
      })),
      momentum: (momentum.data ?? []).map((row) => ({
        extraMinute: row.extra_minute,
        id: row.id,
        minute: row.minute,
        periodId: row.period_id,
        teamId: row.team_id,
        value: Number(row.value),
      })),
      resultInfo: fixture.data.result_info,
      scores: (scores.data ?? []).map((row) => ({
        description: row.description,
        goals: row.goals,
        location: row.location,
        teamId: row.team_id,
      })),
      statistics: (statistics.data ?? []).map((row) => ({
        teamId: row.team_id,
        typeCode: row.type_code,
        typeId: row.type_id,
        typeName: row.type_name,
        value: typeof row.value === "number" || typeof row.value === "string" ? row.value : null,
      })),
    });
  }

  async getFixtureSummariesByIds(fixtureIds: number[]): Promise<FootballFixtureSummary[]> {
    const uniqueIds = [...new Set(fixtureIds)].filter((id) => Number.isInteger(id) && id > 0);
    if (uniqueIds.length === 0) return [];
    const { data, error } = await this.supabase
      .getClient()
      .from("football_fixtures")
      .select("*, league:football_leagues!inner(*)")
      .in("id", uniqueIds);
    if (error) this.unavailable(error);
    const rows = (data ?? []) as unknown as DataRow[];
    const participants = await this.participantsFor(uniqueIds);
    const byId = new Map(rows.map((row) => [Number(row.id), this.mapSummary(row, participants)]));
    return uniqueIds.flatMap((id) => {
      const fixture = byId.get(id);
      return fixture ? [fixture] : [];
    });
  }

  async getStandings(leagueId: number, seasonId: number) {
    const { data, error } = await this.supabase
      .getClient()
      .from("football_standings")
      .select("*, team:football_teams!inner(*)")
      .eq("league_id", leagueId)
      .eq("season_id", seasonId)
      .order("group_id")
      .order("position");
    if (error) this.unavailable(error);
    const season = await this.supabase
      .getClient()
      .from("football_seasons")
      .select("standings_status,standings_checked_at")
      .eq("id", seasonId)
      .eq("league_id", leagueId)
      .maybeSingle();
    const availability = {
      state: season.error ? "error" : (season.data?.standings_status ?? "pending"),
      checkedAt: season.data?.standings_checked_at
        ? new Date(season.data.standings_checked_at).toISOString()
        : null,
    };
    return footballStandingsSchema.parse({
      availability,
      data: (data ?? []).map((row) => ({
        groupName: row.group_name ?? null,
        details: this.mapStandingDetails(row.details),
        form: row.form,
        movement: row.movement,
        points: row.points,
        position: row.position,
        team: this.mapTeam(row.team as DataRow),
      })),
      leagueId,
      seasonId,
    });
  }

  async getLeague(leagueId: number) {
    const client = this.supabase.getClient();
    const [league, seasonResult] = await Promise.all([
      this.entities.get("league", leagueId),
      client
        .from("football_seasons")
        .select("*")
        .eq("league_id", leagueId)
        .order("is_current", { ascending: false })
        .order("starts_on", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (seasonResult.error) this.unavailable(seasonResult.error);
    if (league.entityType !== "league") throw new NotFoundException("League not found");

    const now = Date.now();
    const fixturesPromise = this.listFixtures({
      from: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      leagueId,
      limit: 20,
      to: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const standingsPromise = seasonResult.data
      ? this.getStandings(leagueId, Number(seasonResult.data.id))
      : Promise.resolve({ data: [], leagueId, seasonId: 0 });
    const [fixtures, standings] = await Promise.all([fixturesPromise, standingsPromise]);
    return footballLeagueProfileSchema.parse({
      fixtures: fixtures.data,
      league: {
        id: league.id,
        imageUrl: league.imageUrl,
        name: league.name,
        shortCode: league.shortCode,
        type: league.type,
      },
      season: seasonResult.data
        ? {
            endsOn: seasonResult.data.ends_on,
            id: Number(seasonResult.data.id),
            isCurrent: Boolean(seasonResult.data.is_current),
            name: seasonResult.data.name,
            startsOn: seasonResult.data.starts_on,
          }
        : null,
      standings: standings.data,
      standingsStatus: "availability" in standings ? standings.availability : undefined,
    });
  }

  async getTeam(teamId: number) {
    const team = await this.entities.get("team", teamId);
    if (team.entityType !== "team") throw new NotFoundException("Team not found");
    const now = Date.now();
    const page = await this.listFixtures({
      from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      limit: 20,
      teamId,
      to: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return footballTeamProfileSchema.parse({
      fixtures: page.data,
      team: {
        founded: team.founded,
        id: team.id,
        imageUrl: team.imageUrl,
        name: team.name,
        shortCode: team.shortCode,
      },
    });
  }

  async getPlayer(playerId: number) {
    const client = this.supabase.getClient();
    const player = await this.entities.get("player", playerId);
    if (player.entityType !== "player") throw new NotFoundException("Player not found");
    const { data: lineups, error: lineupError } = await client.rpc(
      "get_football_player_recent_fixtures",
      { p_limit: 10, p_player_id: playerId },
    );
    if (lineupError) this.unavailable(lineupError);
    return footballPlayerProfileSchema.parse({
      player: {
        dateOfBirth: player.dateOfBirth,
        displayName: player.displayName,
        id: player.id,
        imageUrl: player.imageUrl,
      },
      recentFixtures: ((lineups ?? []) as DataRow[]).map((row) => ({
        fixtureId: row.fixture_id,
        fixtureName: row.fixture_name,
        jerseyNumber: row.jersey_number,
        startsAt: new Date(String(row.starts_at)).toISOString(),
        teamId: row.team_id,
      })),
    });
  }

  private async participantsFor(fixtureIds: number[]): Promise<Map<number, DataRow[]>> {
    const result = new Map<number, DataRow[]>();
    if (fixtureIds.length === 0) return result;
    const { data, error } = await this.supabase
      .getClient()
      .from("football_fixture_participants")
      .select("*, team:football_teams!inner(*)")
      .in("fixture_id", fixtureIds);
    if (error) this.unavailable(error);
    for (const row of (data ?? []) as DataRow[]) {
      const id = Number(row.fixture_id);
      result.set(id, [...(result.get(id) ?? []), row]);
    }
    return result;
  }

  private mapSummary(row: DataRow, participants: Map<number, DataRow[]>): FootballFixtureSummary {
    const id = Number(row.id);
    const league = row.league as DataRow;
    return {
      awayScore: row.away_score as number | null,
      homeScore: row.home_score as number | null,
      id,
      isLive: Boolean(row.is_live),
      league: {
        id: Number(league.id),
        imageUrl: league.image_url as string | null,
        name: String(league.name),
      },
      name: String(row.name),
      participants: (participants.get(id) ?? []).map((participant) => ({
        location: participant.location as "home" | "away",
        team: this.mapTeam(participant.team as DataRow),
        winner: participant.winner as boolean | null,
      })),
      seasonId: Number(row.season_id),
      stage: row.stage_id
        ? { id: Number(row.stage_id), name: (row.stage_name as string | null) ?? null }
        : null,
      round: row.round_name
        ? {
            id: row.round_id == null ? null : Number(row.round_id),
            name: (row.round_name as string | null) ?? null,
          }
        : null,
      startsAt: new Date(String(row.starts_at)).toISOString(),
      state: {
        code: row.state_code as string | null,
        id: Number(row.state_id),
        name: row.state_name as string | null,
      },
    };
  }

  private mapTeam(row: DataRow) {
    return {
      founded: row.founded as number | null,
      id: Number(row.id),
      imageUrl: row.image_url as string | null,
      name: String(row.name),
      shortCode: row.short_code as string | null,
    };
  }

  private mapStandingDetails(value: unknown): Record<string, number | null> {
    if (value && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, number | null>;
    if (!Array.isArray(value)) return {};
    return Object.fromEntries(
      value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as DataRow;
        const key = String(
          (row.type as DataRow | undefined)?.developer_name ?? row.type_id ?? "unknown",
        );
        const numeric = row.value === null ? null : Number(row.value);
        return [[key, Number.isNaN(numeric) ? null : numeric]];
      }),
    );
  }

  private encodeCursor(startsAt: string, id: number, order: "asc" | "desc"): string {
    return Buffer.from(JSON.stringify({ id, order, startsAt })).toString("base64url");
  }

  private decodeCursor(value: string): z.infer<typeof cursorSchema> {
    try {
      return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    } catch {
      throw new BadRequestException("Invalid fixture cursor");
    }
  }

  private unavailable(cause?: unknown): never {
    if (cause && typeof cause === "object") {
      const error = cause as Record<string, unknown>;
      this.logger.error({
        code: error.code,
        details: error.details,
        event: "football_database_query_failed",
        hint: error.hint,
        message: error.message,
      });
    }
    throw new ServiceUnavailableException("Football data is unavailable");
  }
}
