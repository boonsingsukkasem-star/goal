import { Controller, Get, Inject } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";

import { openApiSchemaNames, openApiSchemaRef } from "../common/openapi/contract-schemas";
import type { HealthResponseDto, ReadinessResponseDto } from "./health.dto";
import { ReadinessService } from "./readiness.service";

@ApiTags("system")
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}

  @Get()
  @ApiOperation({ operationId: "getHealth", summary: "Check API availability" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.health) })
  getHealth(): HealthResponseDto {
    return {
      service: "goal-api",
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? "0.1.0",
    };
  }

  @Get("ready")
  @ApiOperation({
    operationId: "getReadiness",
    summary: "Check whether the API can accept traffic",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.readiness) })
  @ApiServiceUnavailableResponse({
    description: "A required dependency is unavailable",
    schema: openApiSchemaRef(openApiSchemaNames.apiError),
  })
  async getReadiness(): Promise<ReadinessResponseDto> {
    await this.readiness.assertReady();
    return {
      service: "goal-api",
      status: "ready",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? "0.1.0",
    };
  }
}
