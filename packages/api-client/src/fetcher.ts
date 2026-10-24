import {
  aiAnalysisRequestResponseSchema,
  aiComparisonRequestResponseSchema,
  aiComparisonResponseSchema,
  aiMatchAnalysisResponseSchema,
  apiErrorResponseSchema,
  deleteAccountResponseSchema,
  fanHeatmapResponseSchema,
  favoriteMutationResponseSchema,
  favoritesResponseSchema,
  footballFixtureDetailSchema,
  footballFixturePageSchema,
  footballCatalogResponseSchema,
  footballComparisonOptionsResponseSchema,
  footballLeagueProfileSchema,
  footballPlayerProfileSchema,
  footballStandingsSchema,
  footballTeamProfileSchema,
  healthResponseSchema,
  matchFollowMutationResponseSchema,
  matchFollowsResponseSchema,
  notificationHistoryResponseSchema,
  notificationPreferencesSchema,
  newsArticlePageSchema,
  newsEngagementResponseSchema,
  personalizedNewsResponseSchema,
  personalizedFeedResponseSchema,
  pushDeviceRegistrationResponseSchema,
  pushDeviceRemovalResponseSchema,
  readinessResponseSchema,
  relatedNewsResponseSchema,
  userProfileSchema,
} from "@goal-app/contracts";

export interface GoalApiRuntimeOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string | null> | string | null;
}

let runtime: GoalApiRuntimeOptions = { baseUrl: "http://127.0.0.1:4000" };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class ApiResponseValidationError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiResponseValidationError";
  }
}

const successResponseSchemas: ReadonlyArray<{
  method: string;
  openApiPath: string;
  path: RegExp;
  schema: {
    safeParse(
      input: unknown,
    ): { data: unknown; success: true } | { error: Error | { message: string }; success: false };
  };
}> = [
  {
    method: "GET",
    openApiPath: "/v1/football/comparison-options",
    path: /^\/v1\/football\/comparison-options$/,
    schema: footballComparisonOptionsResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/football/explore",
    path: /^\/v1\/football\/explore$/,
    schema: footballCatalogResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/health",
    path: /^\/v1\/health$/,
    schema: healthResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/health/ready",
    path: /^\/v1\/health\/ready$/,
    schema: readinessResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/me",
    path: /^\/v1\/me$/,
    schema: userProfileSchema,
  },
  {
    method: "DELETE",
    openApiPath: "/v1/me",
    path: /^\/v1\/me$/,
    schema: deleteAccountResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/ai/matches/{fixtureId}/analysis",
    path: /^\/v1\/ai\/matches\/\d+\/analysis$/,
    schema: aiMatchAnalysisResponseSchema,
  },
  {
    method: "POST",
    openApiPath: "/v1/ai/matches/{fixtureId}/analysis",
    path: /^\/v1\/ai\/matches\/\d+\/analysis$/,
    schema: aiAnalysisRequestResponseSchema,
  },
  {
    method: "POST",
    openApiPath: "/v1/ai/comparisons",
    path: /^\/v1\/ai\/comparisons$/,
    schema: aiComparisonRequestResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/ai/comparisons/{comparisonId}",
    path: /^\/v1\/ai\/comparisons\/[0-9a-f-]+$/i,
    schema: aiComparisonResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/football/fixtures",
    path: /^\/v1\/football\/fixtures$/,
    schema: footballFixturePageSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/football/fixtures/{fixtureId}",
    path: /^\/v1\/football\/fixtures\/\d+$/,
    schema: footballFixtureDetailSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/football/leagues/{leagueId}/standings",
    path: /^\/v1\/football\/leagues\/\d+\/standings$/,
    schema: footballStandingsSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/football/leagues/{leagueId}",
    path: /^\/v1\/football\/leagues\/\d+$/,
    schema: footballLeagueProfileSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/football/teams/{teamId}",
    path: /^\/v1\/football\/teams\/\d+$/,
    schema: footballTeamProfileSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/football/players/{playerId}",
    path: /^\/v1\/football\/players\/\d+$/,
    schema: footballPlayerProfileSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/notifications/preferences",
    path: /^\/v1\/notifications\/preferences$/,
    schema: notificationPreferencesSchema,
  },
  {
    method: "PUT",
    openApiPath: "/v1/notifications/preferences",
    path: /^\/v1\/notifications\/preferences$/,
    schema: notificationPreferencesSchema,
  },
  {
    method: "POST",
    openApiPath: "/v1/notifications/devices",
    path: /^\/v1\/notifications\/devices$/,
    schema: pushDeviceRegistrationResponseSchema,
  },
  {
    method: "DELETE",
    openApiPath: "/v1/notifications/devices/{deviceId}",
    path: /^\/v1\/notifications\/devices\/[0-9a-f-]+$/i,
    schema: pushDeviceRemovalResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/notifications",
    path: /^\/v1\/notifications$/,
    schema: notificationHistoryResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/news",
    path: /^\/v1\/news$/,
    schema: newsArticlePageSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/news/trending",
    path: /^\/v1\/news\/trending$/,
    schema: newsArticlePageSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/news/me",
    path: /^\/v1\/news\/me$/,
    schema: personalizedNewsResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/news/related/matches/{fixtureId}",
    path: /^\/v1\/news\/related\/matches\/\d+$/,
    schema: relatedNewsResponseSchema,
  },
  {
    method: "POST",
    openApiPath: "/v1/news/{articleId}/engagement",
    path: /^\/v1\/news\/[0-9a-f-]+\/engagement$/i,
    schema: newsEngagementResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/community/me/favorites",
    path: /^\/v1\/community\/me\/favorites$/,
    schema: favoritesResponseSchema,
  },
  {
    method: "PUT",
    openApiPath: "/v1/community/me/favorites/{entityType}/{entityId}",
    path: /^\/v1\/community\/me\/favorites\/(team|player|league)\/\d+$/,
    schema: favoriteMutationResponseSchema,
  },
  {
    method: "DELETE",
    openApiPath: "/v1/community/me/favorites/{entityType}/{entityId}",
    path: /^\/v1\/community\/me\/favorites\/(team|player|league)\/\d+$/,
    schema: favoriteMutationResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/community/me/follows",
    path: /^\/v1\/community\/me\/follows$/,
    schema: matchFollowsResponseSchema,
  },
  {
    method: "PUT",
    openApiPath: "/v1/community/me/follows/{fixtureId}",
    path: /^\/v1\/community\/me\/follows\/\d+$/,
    schema: matchFollowMutationResponseSchema,
  },
  {
    method: "DELETE",
    openApiPath: "/v1/community/me/follows/{fixtureId}",
    path: /^\/v1\/community\/me\/follows\/\d+$/,
    schema: matchFollowMutationResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/community/feed",
    path: /^\/v1\/community\/feed$/,
    schema: personalizedFeedResponseSchema,
  },
  {
    method: "GET",
    openApiPath: "/v1/community/matches/{fixtureId}/heatmap",
    path: /^\/v1\/community\/matches\/\d+\/heatmap$/,
    schema: fanHeatmapResponseSchema,
  },
  {
    method: "PUT",
    openApiPath: "/v1/community/matches/{fixtureId}/cheer",
    path: /^\/v1\/community\/matches\/\d+\/cheer$/,
    schema: fanHeatmapResponseSchema,
  },
];

export const validatedSuccessOperations = successResponseSchemas.map(
  ({ method, openApiPath }) => `${method} ${openApiPath}`,
);

function validateSuccessResponse<T>(method: string, path: string, body: unknown): T {
  const pathname = path.split("?", 1)[0] ?? path;
  const route = successResponseSchemas.find(
    (candidate) => candidate.method === method && candidate.path.test(pathname),
  );
  if (!route) {
    throw new ApiResponseValidationError(
      "Generated API operation has no runtime response validator",
      method,
      pathname,
    );
  }
  const parsed = route.schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiResponseValidationError(
      "API success response violated its contract",
      method,
      pathname,
      {
        cause: parsed.error,
      },
    );
  }
  return parsed.data as T;
}

export function configureGoalApi(options: GoalApiRuntimeOptions): void {
  runtime = { ...options, baseUrl: options.baseUrl.replace(/\/$/, "") };
}

export async function goalFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await runtime.getAccessToken?.();
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await (runtime.fetcher ?? fetch)(`${runtime.baseUrl}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    const parsed = apiErrorResponseSchema.safeParse(body);
    throw new ApiRequestError(
      parsed.success
        ? parsed.data.error.message
        : `API request failed with status ${response.status}`,
      response.status,
      parsed.success ? parsed.data.error.code : undefined,
      parsed.success ? parsed.data.error.requestId : undefined,
    );
  }
  if (response.status === 204) return undefined as T;
  const method = String(options.method ?? "GET").toUpperCase();
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new ApiResponseValidationError("API success response was not valid JSON", method, path, {
      cause: error,
    });
  }
  return validateSuccessResponse<T>(method, path, body);
}

export type ErrorType<Error> = ApiRequestError & { responseBody?: Error };
export type BodyType<Body> = Body;
