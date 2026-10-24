import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { AiAnalysisRequestResponse, AiMatchAnalysisResponse } from "@goal-app/contracts";
import {
  ApiAcceptedResponse,
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
import { AiAnalysisService } from "./ai-analysis.service";
import { AiLanguageDto } from "./ai.dto";

@ApiTags("ai")
@ApiExtraModels(AiLanguageDto)
@Controller({ path: "ai/matches", version: "1" })
export class AiController {
  constructor(@Inject(AiAnalysisService) private readonly ai: AiAnalysisService) {}

  @Get(":fixtureId/analysis")
  @ApiOperation({ operationId: "getAiMatchAnalysis", summary: "Get the latest match AI analysis" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.aiMatchAnalysisResponse) })
  @ApiPublicReadErrors({ notFound: true })
  getMatchAnalysis(
    @Param("fixtureId", ParseIntPipe) fixtureId: number,
    @Query() query: AiLanguageDto,
  ): Promise<AiMatchAnalysisResponse> {
    return this.ai.getMatchAnalysis(fixtureId, query.language ?? "th");
  }

  @Post(":fixtureId/analysis")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({
    operationId: "requestAiMatchAnalysis",
    summary: "Queue a fresh match AI analysis when the source changed",
  })
  @ApiAcceptedResponse({ schema: openApiSchemaRef(openApiSchemaNames.aiAnalysisRequestResponse) })
  @ApiAuthenticatedErrors({ notFound: true, rateLimited: true })
  requestMatchAnalysis(
    @Param("fixtureId", ParseIntPipe) fixtureId: number,
    @Query() query: AiLanguageDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<AiAnalysisRequestResponse> {
    return this.ai.requestMatchAnalysis(fixtureId, query.language ?? "th", principal);
  }
}
