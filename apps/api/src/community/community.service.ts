import {
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  fanHeatmapResponseSchema,
  favoriteMutationResponseSchema,
  favoritesResponseSchema,
  matchFollowMutationResponseSchema,
  matchFollowsResponseSchema,
  personalizedFeedResponseSchema,
  type FavoriteEntityType,
} from "@goal-app/contracts";

import type { AuthPrincipal } from "../auth/auth-principal";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { SupabasePublicService } from "../auth/supabase-public.service";
import { SupabaseUserService } from "../auth/supabase-user.service";
import { FootballProviderEntityService } from "../football/football-provider-entity.service";
import { FootballReadService } from "../football/football-read.service";

type DataRow = Record<string, unknown>;

@Injectable()
export class CommunityService {
  constructor(
    @Inject(SupabaseUserService) private readonly userData: SupabaseUserService,
    @Inject(SupabaseAdminService) private readonly adminData: SupabaseAdminService,
    @Inject(SupabasePublicService) private readonly publicData: SupabasePublicService,
    @Inject(FootballProviderEntityService)
    private readonly entities: FootballProviderEntityService,
    @Inject(FootballReadService) private readonly football: FootballReadService,
  ) {}

  async listFavorites(principal: AuthPrincipal) {
    const client = this.userData.getClient(principal);
    const { data, error } = await client
      .from("user_favorites")
      .select("entity_type,entity_id,created_at")
      .eq("user_id", principal.userId)
      .order("created_at", { ascending: false });
    if (error) this.unavailable();
    const rows = (data ?? []) as DataRow[];
    const entities = await this.entities.getMany(
      rows.map((row) => ({
        entityId: Number(row.entity_id),
        entityType: row.entity_type as FavoriteEntityType,
      })),
    );
    return favoritesResponseSchema.parse({
      data: rows.flatMap((row) => {
        const entityType = row.entity_type as FavoriteEntityType;
        const entityId = Number(row.entity_id);
        const entity = entities.get(`${entityType}:${entityId}`);
        return entity
          ? [
              {
                createdAt: new Date(String(row.created_at)).toISOString(),
                entityId,
                entityType,
                imageUrl: entity.imageUrl,
                name: entity.entityType === "player" ? entity.displayName : entity.name,
              },
            ]
          : [];
      }),
    });
  }

  async setFavorite(
    entityType: FavoriteEntityType,
    entityId: number,
    active: boolean,
    principal: AuthPrincipal,
  ) {
    if (active) await this.entities.get(entityType, entityId);
    const { error } = await this.adminData.getClient().rpc("set_user_favorite", {
      p_active: active,
      p_entity_id: entityId,
      p_entity_type: entityType,
      p_user_id: principal.userId,
    });
    if (error?.code === "P0001") {
      throw new HttpException("Favorite limit reached", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error) this.unavailable();
    return favoriteMutationResponseSchema.parse({ active, entityId, entityType });
  }

  async listFollows(principal: AuthPrincipal) {
    const { data, error } = await this.userData
      .getClient(principal)
      .from("match_follows")
      .select(
        "fixture_id,notifications_enabled,live_alerts_during_quiet_hours,created_at,updated_at",
      )
      .eq("user_id", principal.userId)
      .order("created_at", { ascending: false });
    if (error) this.unavailable();
    const rows = (data ?? []) as DataRow[];
    const fixtures = await this.football.getFixtureSummariesByIds(
      rows.map((row) => Number(row.fixture_id)),
    );
    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    return matchFollowsResponseSchema.parse({
      data: rows.flatMap((row) => {
        const fixtureId = Number(row.fixture_id);
        const fixture = fixtureById.get(fixtureId);
        return fixture ? [{ ...this.mapFollow(row), fixture }] : [];
      }),
    });
  }

  async setFollow(
    fixtureId: number,
    active: boolean,
    input: { liveAlertsDuringQuietHours?: boolean; notificationsEnabled?: boolean },
    principal: AuthPrincipal,
  ) {
    const { data, error } = await this.userData.getClient(principal).rpc("set_my_match_follow", {
      p_active: active,
      p_fixture_id: fixtureId,
      p_live_alerts_during_quiet_hours: input.liveAlertsDuringQuietHours ?? false,
      p_notifications_enabled: input.notificationsEnabled ?? true,
    });
    if (error?.code === "P0002") throw new NotFoundException("Fixture not found");
    if (error?.code === "P0001") {
      throw new HttpException("Match follow limit reached", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error) this.unavailable();
    const row = ((data ?? []) as DataRow[])[0];
    return matchFollowMutationResponseSchema.parse({
      active,
      fixtureId,
      follow: row ? this.mapFollow(row) : null,
    });
  }

  async getPersonalizedFeed(limit: number, principal: AuthPrincipal) {
    const { data, error } = await this.userData
      .getClient(principal)
      .rpc("get_my_personalized_fixture_ids", {
        p_limit: limit,
      });
    if (error) this.unavailable();
    const rows = (data ?? []) as DataRow[];
    const fixtures = await this.football.getFixtureSummariesByIds(
      rows.map((row) => Number(row.fixture_id)),
    );
    const reasons = new Map(rows.map((row) => [Number(row.fixture_id), row.reasons]));
    return personalizedFeedResponseSchema.parse({
      data: fixtures.map((fixture) => ({ fixture, reasons: reasons.get(fixture.id) ?? [] })),
      generatedAt: new Date().toISOString(),
    });
  }

  async getFanHeatmap(fixtureId: number) {
    const [fixture, totals] = await Promise.all([
      this.football.getFixture(fixtureId),
      this.publicData
        .getClient()
        .from("fixture_fan_heatmap_totals")
        .select("team_id,supporters,updated_at")
        .eq("fixture_id", fixtureId),
    ]);
    if (totals.error) this.unavailable();
    const byTeam = new Map((totals.data ?? []).map((row) => [Number(row.team_id), row]));
    const supporters = fixture.participants.map(({ team }) =>
      Number(byTeam.get(team.id)?.supporters ?? 0),
    );
    const totalSupporters = supporters.reduce((sum, count) => sum + count, 0);
    const updatedAtValues = (totals.data ?? []).map((row) => new Date(row.updated_at).getTime());
    return fanHeatmapResponseSchema.parse({
      fixtureId,
      teams: fixture.participants.map(({ team }, index) => ({
        percentage:
          totalSupporters === 0
            ? 0
            : Math.round(((supporters[index] ?? 0) / totalSupporters) * 1000) / 10,
        supporters: supporters[index] ?? 0,
        teamId: team.id,
      })),
      totalSupporters,
      updatedAt:
        updatedAtValues.length > 0 ? new Date(Math.max(...updatedAtValues)).toISOString() : null,
    });
  }

  async cheer(fixtureId: number, teamId: number, principal: AuthPrincipal) {
    const { error } = await this.userData.getClient(principal).rpc("cheer_for_my_fixture", {
      p_fixture_id: fixtureId,
      p_team_id: teamId,
    });
    if (error?.code === "P0002") {
      throw new NotFoundException("Team does not participate in this fixture");
    }
    if (error) this.unavailable();
    return this.getFanHeatmap(fixtureId);
  }

  private mapFollow(row: DataRow) {
    return {
      createdAt: new Date(String(row.created_at)).toISOString(),
      fixtureId: Number(row.fixture_id),
      liveAlertsDuringQuietHours: Boolean(row.live_alerts_during_quiet_hours),
      notificationsEnabled: Boolean(row.notifications_enabled),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  private unavailable(): never {
    throw new ServiceUnavailableException("Community data is unavailable");
  }
}
