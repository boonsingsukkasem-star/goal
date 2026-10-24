import { Controller, Get, Inject, Param, ParseIntPipe, Query } from "@nestjs/common";
import type {
  FootballFixtureDetail,
  FootballFixturePage,
  FootballCatalogResponse,
  FootballComparisonOptionsResponse,
  FootballLeagueProfile,
  FootballPlayerProfile,
  FootballStandings,
  FootballTeamProfile,
} from "@goal-app/contracts";
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ApiPublicReadErrors } from "../common/openapi/api-error-responses";
import { openApiSchemaNames, openApiSchemaRef } from "../common/openapi/contract-schemas";
import {
  FootballComparisonOptionsQueryDto,
  FootballExploreQueryDto,
  FixtureListQueryDto,
} from "./football.dto";
import { FootballComparisonCatalogService } from "./football-comparison-catalog.service";
import { FootballExploreService } from "./football-explore.service";
import { FootballSyncService } from "./football-sync.service";
import { FootballReadService } from "./football-read.service";

@ApiTags("football")
@ApiExtraModels(FixtureListQueryDto, FootballExploreQueryDto, FootballComparisonOptionsQueryDto)
@Controller({ path: "football", version: "1" })
export class FootballController {
  constructor(
    @Inject(FootballReadService) private readonly football: FootballReadService,
    @Inject(FootballSyncService) private readonly sync: FootballSyncService,
    @Inject(FootballExploreService) private readonly exploreService: FootballExploreService,
    @Inject(FootballComparisonCatalogService)
    private readonly comparisonCatalog: FootballComparisonCatalogService,
  ) {}

  @Get("comparison-options")
  @ApiOperation({
    operationId: "listFootballComparisonOptions",
    summary: "Browse football team or player options for AI comparison",
  })
  @ApiOkResponse({
    schema: openApiSchemaRef(openApiSchemaNames.footballComparisonOptionsResponse),
  })
  @ApiPublicReadErrors()
  comparisonOptions(
    @Query() query: FootballComparisonOptionsQueryDto,
  ): Promise<FootballComparisonOptionsResponse> {
    return this.comparisonCatalog.list(query);
  }

  @Get("explore")
  @ApiOperation({
    operationId: "exploreFootballCatalog",
    summary: "Browse or search football entities",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.footballCatalogResponse) })
  @ApiPublicReadErrors()
  explore(@Query() query: FootballExploreQueryDto): Promise<FootballCatalogResponse> {
    return this.exploreService.explore(query);
  }

  @Get("fixtures")
  @ApiOperation({ operationId: "listFootballFixtures", summary: "List fixtures and results" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.footballFixturePage) })
  @ApiPublicReadErrors()
  listFixtures(@Query() query: FixtureListQueryDto): Promise<FootballFixturePage> {
    return this.football.listFixtures(query);
  }

  @Get("fixtures/:fixtureId")
  @ApiOperation({
    operationId: "getFootballFixture",
    summary: "Get match details, events, scores, lineups, and formations",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.footballFixtureDetail) })
  @ApiPublicReadErrors({ notFound: true })
  async getFixture(
    @Param("fixtureId", ParseIntPipe) fixtureId: number,
  ): Promise<FootballFixtureDetail> {
    await this.sync.refreshFixtureIfDue(fixtureId);
    return this.football.getFixture(fixtureId);
  }

  @Get("leagues/:leagueId/standings")
  @ApiOperation({
    operationId: "getFootballStandings",
    summary: "Get a league table for a season",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.footballStandings) })
  @ApiPublicReadErrors()
  async getStandings(
    @Param("leagueId", ParseIntPipe) leagueId: number,
    @Query("seasonId", ParseIntPipe) seasonId: number,
  ): Promise<FootballStandings> {
    await this.sync.refreshStandingsIfDue(leagueId, seasonId);
    return this.football.getStandings(leagueId, seasonId);
  }

  @Get("leagues/:leagueId")
  @ApiOperation({
    operationId: "getFootballLeague",
    summary: "Get a league profile, table, and fixtures",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.footballLeagueProfile) })
  @ApiPublicReadErrors({ notFound: true })
  async getLeague(
    @Param("leagueId", ParseIntPipe) leagueId: number,
  ): Promise<FootballLeagueProfile> {
    await this.sync.refreshStandingsIfDue(leagueId);
    return this.football.getLeague(leagueId);
  }

  @Get("teams/:teamId")
  @ApiOperation({ operationId: "getFootballTeam", summary: "Get a team profile and fixtures" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.footballTeamProfile) })
  @ApiPublicReadErrors({ notFound: true })
  getTeam(@Param("teamId", ParseIntPipe) teamId: number): Promise<FootballTeamProfile> {
    return this.football.getTeam(teamId);
  }

  @Get("players/:playerId")
  @ApiOperation({
    operationId: "getFootballPlayer",
    summary: "Get a player profile and recent fixtures",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.footballPlayerProfile) })
  @ApiPublicReadErrors({ notFound: true })
  getPlayer(@Param("playerId", ParseIntPipe) playerId: number): Promise<FootballPlayerProfile> {
    return this.football.getPlayer(playerId);
  }
}
