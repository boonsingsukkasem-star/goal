import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { AiComparisonRequestResponse, AiComparisonResponse } from "@goal-app/contracts";
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import type { AuthPrincipal } from "../auth/auth-principal";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiAuthenticatedErrors } from "../common/openapi/api-error-responses";
import { openApiSchemaNames, openApiSchemaRef } from "../common/openapi/contract-schemas";
import { AiAnalysisService } from "./ai-analysis.service";
import { AiComparisonRequestDto } from "./ai.dto";

@ApiTags("ai")
@ApiBearerAuth()
@ApiExtraModels(AiComparisonRequestDto)
@UseGuards(AuthGuard)
@Controller({ path: "ai", version: "1" })
export class AiCompareController {
  constructor(@Inject(AiAnalysisService) private readonly ai: AiAnalysisService) {}

  @Post("comparisons")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    operationId: "requestAiComparison",
    summary: "Queue a team or player comparison",
  })
  @ApiBody({ type: AiComparisonRequestDto })
  @ApiAcceptedResponse({ schema: openApiSchemaRef(openApiSchemaNames.aiComparisonRequestResponse) })
  @ApiAuthenticatedErrors({ notFound: true, rateLimited: true })
  request(
    @Body() input: AiComparisonRequestDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<AiComparisonRequestResponse> {
    return this.ai.requestComparison(input, principal);
  }

  @Get("comparisons/:comparisonId")
  @ApiOperation({ operationId: "getAiComparison", summary: "Get an owned AI comparison" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.aiComparisonResponse) })
  @ApiAuthenticatedErrors({ notFound: true })
  get(
    @Param("comparisonId", new ParseUUIDPipe()) comparisonId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<AiComparisonResponse> {
    return this.ai.getComparison(comparisonId, principal);
  }
}
