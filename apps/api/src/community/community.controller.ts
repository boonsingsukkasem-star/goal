import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  FanHeatmapResponse,
  FavoriteMutationResponse,
  FavoritesResponse,
  MatchFollowMutationResponse,
  MatchFollowsResponse,
  PersonalizedFeedResponse,
} from "@goal-app/contracts";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import type { AuthPrincipal } from "../auth/auth-principal";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiAuthenticatedErrors, ApiPublicReadErrors } from "../common/openapi/api-error-responses";
import { openApiSchemaNames, openApiSchemaRef } from "../common/openapi/contract-schemas";
import {
  CheerForFixtureDto,
  FavoriteEntityParamsDto,
  MatchFollowDto,
  PersonalizedFeedQueryDto,
} from "./community.dto";
import { CommunityService } from "./community.service";

@ApiTags("community")
@ApiExtraModels(
  CheerForFixtureDto,
  FavoriteEntityParamsDto,
  MatchFollowDto,
  PersonalizedFeedQueryDto,
)
@Controller({ path: "community", version: "1" })
export class CommunityController {
  constructor(@Inject(CommunityService) private readonly community: CommunityService) {}

  @Get("me/favorites")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ operationId: "listMyFavorites", summary: "List the current user's favorites" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.favoritesResponse) })
  @ApiAuthenticatedErrors()
  listFavorites(@CurrentUser() principal: AuthPrincipal): Promise<FavoritesResponse> {
    return this.community.listFavorites(principal);
  }

  @Put("me/favorites/:entityType/:entityId")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ operationId: "addMyFavorite", summary: "Favorite a team, player, or league" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.favoriteMutationResponse) })
  @ApiAuthenticatedErrors({ notFound: true, rateLimited: true })
  addFavorite(
    @Param() params: FavoriteEntityParamsDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<FavoriteMutationResponse> {
    return this.community.setFavorite(params.entityType, params.entityId, true, principal);
  }

  @Delete("me/favorites/:entityType/:entityId")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ operationId: "removeMyFavorite", summary: "Remove a favorite" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.favoriteMutationResponse) })
  @ApiAuthenticatedErrors()
  removeFavorite(
    @Param() params: FavoriteEntityParamsDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<FavoriteMutationResponse> {
    return this.community.setFavorite(params.entityType, params.entityId, false, principal);
  }

  @Get("me/follows")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ operationId: "listMyMatchFollows", summary: "List followed matches" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.matchFollowsResponse) })
  @ApiAuthenticatedErrors()
  listFollows(@CurrentUser() principal: AuthPrincipal): Promise<MatchFollowsResponse> {
    return this.community.listFollows(principal);
  }

  @Put("me/follows/:fixtureId")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ operationId: "followMatch", summary: "Follow a match and configure its alerts" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.matchFollowMutationResponse) })
  @ApiAuthenticatedErrors({ notFound: true, rateLimited: true })
  followMatch(
    @Param("fixtureId", ParseIntPipe) fixtureId: number,
    @Body() input: MatchFollowDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<MatchFollowMutationResponse> {
    return this.community.setFollow(fixtureId, true, input, principal);
  }

  @Delete("me/follows/:fixtureId")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ operationId: "unfollowMatch", summary: "Stop following a match" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.matchFollowMutationResponse) })
  @ApiAuthenticatedErrors()
  unfollowMatch(
    @Param("fixtureId", ParseIntPipe) fixtureId: number,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<MatchFollowMutationResponse> {
    return this.community.setFollow(fixtureId, false, {}, principal);
  }

  @Get("feed")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({
    operationId: "getPersonalizedFootballFeed",
    summary: "Get personalized fixtures",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.personalizedFeedResponse) })
  @ApiAuthenticatedErrors()
  getFeed(
    @Query() query: PersonalizedFeedQueryDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<PersonalizedFeedResponse> {
    return this.community.getPersonalizedFeed(query.limit ?? 20, principal);
  }

  @Get("matches/:fixtureId/heatmap")
  @ApiOperation({
    operationId: "getMatchFanHeatmap",
    summary: "Get anonymous live fan support totals",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.fanHeatmapResponse) })
  @ApiPublicReadErrors({ notFound: true })
  getHeatmap(@Param("fixtureId", ParseIntPipe) fixtureId: number): Promise<FanHeatmapResponse> {
    return this.community.getFanHeatmap(fixtureId);
  }

  @Put("matches/:fixtureId/cheer")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({
    operationId: "cheerForMatchTeam",
    summary: "Publish a five-minute fan presence heartbeat",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.fanHeatmapResponse) })
  @ApiAuthenticatedErrors({ notFound: true })
  cheer(
    @Param("fixtureId", ParseIntPipe) fixtureId: number,
    @Body() input: CheerForFixtureDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<FanHeatmapResponse> {
    return this.community.cheer(fixtureId, input.teamId, principal);
  }
}
