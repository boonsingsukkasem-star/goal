import { applyDecorators } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { openApiSchemaNames, openApiSchemaRef } from "./contract-schemas";

const errorSchema = openApiSchemaRef(openApiSchemaNames.apiError);

export function ApiPublicReadErrors(options: { notFound?: boolean } = {}) {
  return applyDecorators(
    ApiBadRequestResponse({ description: "Request validation failed", schema: errorSchema }),
    ...(options.notFound
      ? [ApiNotFoundResponse({ description: "Resource was not found", schema: errorSchema })]
      : []),
    ApiServiceUnavailableResponse({
      description: "A required data dependency is unavailable",
      schema: errorSchema,
    }),
  );
}

export function ApiAuthenticatedErrors(
  options: { notFound?: boolean; rateLimited?: boolean } = {},
) {
  return applyDecorators(
    ApiBadRequestResponse({ description: "Request validation failed", schema: errorSchema }),
    ApiUnauthorizedResponse({ description: "Authentication is required", schema: errorSchema }),
    ...(options.notFound
      ? [ApiNotFoundResponse({ description: "Resource was not found", schema: errorSchema })]
      : []),
    ...(options.rateLimited
      ? [
          ApiTooManyRequestsResponse({
            description: "A quota or resource limit was reached",
            schema: errorSchema,
          }),
        ]
      : []),
    ApiServiceUnavailableResponse({
      description: "A required dependency is unavailable",
      schema: errorSchema,
    }),
  );
}
