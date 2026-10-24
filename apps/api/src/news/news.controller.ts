import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  NewsArticlePage,
  PersonalizedNewsResponse,
  RelatedNewsResponse,
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
import { NewsFeedQueryDto, NewsListQueryDto } from "./news.dto";
import { NewsService } from "./news.service";

@ApiTags("news")
@ApiExtraModels(NewsFeedQueryDto, NewsListQueryDto)
@Controller({ path: "news", version: "1" })
export class NewsController {
  constructor(@Inject(NewsService) private readonly news: NewsService) {}

  @Get()
  @ApiOperation({ operationId: "listFootballNews", summary: "List current football news" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.newsArticlePage) })
  @ApiPublicReadErrors()
  list(@Query() query: NewsFeedQueryDto): Promise<NewsArticlePage> {
    return this.news.listFeed(query);
  }

  @Get("trending")
  @ApiOperation({ operationId: "listTrendingFootballNews", summary: "List trending news" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.newsArticlePage) })
  @ApiPublicReadErrors()
  trending(@Query() query: NewsListQueryDto): Promise<NewsArticlePage> {
    return this.news.getTrending(query.language, query.limit);
  }

  @Get("me")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ operationId: "listMyFootballNews", summary: "List personalized news" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.personalizedNewsResponse) })
  @ApiAuthenticatedErrors()
  personalized(
    @Query() query: NewsListQueryDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<PersonalizedNewsResponse> {
    return this.news.getPersonalized(query.language ?? "th", query.limit ?? 20, principal);
  }

  @Get("related/matches/:fixtureId")
  @ApiOperation({ operationId: "listMatchRelatedNews", summary: "List news related to a match" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.relatedNewsResponse) })
  @ApiPublicReadErrors({ notFound: true })
  related(
    @Param("fixtureId", ParseIntPipe) fixtureId: number,
    @Query() query: NewsListQueryDto,
  ): Promise<RelatedNewsResponse> {
    return this.news.getRelated(fixtureId, query.language, query.limit);
  }

  @Post(":articleId/engagement")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ operationId: "recordNewsEngagement", summary: "Record a news open" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.newsEngagementResponse) })
  @ApiAuthenticatedErrors({ notFound: true, rateLimited: true })
  engagement(
    @Param("articleId", ParseUUIDPipe) articleId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<{ recorded: true }> {
    return this.news.recordEngagement(articleId, principal);
  }
}
