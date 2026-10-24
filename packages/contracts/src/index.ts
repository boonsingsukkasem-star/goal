import { z } from "zod";

export const requestIdSchema = z.uuid();

export const apiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
]);

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    details: z.array(z.string()).optional(),
    message: z.string(),
    requestId: requestIdSchema,
  }),
});

export const cursorPageSchema = z.object({
  nextCursor: z.string().nullable(),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type CursorPage = z.infer<typeof cursorPageSchema>;

export const healthResponseSchema = z.object({
  service: z.string(),
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
  version: z.string(),
});

export const readinessResponseSchema = z.object({
  service: z.string(),
  status: z.literal("ready"),
  timestamp: z.iso.datetime(),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const authProviderSchema = z.enum(["email", "facebook", "google", "apple"]);

export const userProfileSchema = z.object({
  avatarUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
  displayName: z.string().min(1).max(80).nullable(),
  email: z.email(),
  id: z.uuid(),
  locale: z.string().min(2).max(16),
  providers: z.array(authProviderSchema),
  timezone: z.string().min(1).max(64),
  updatedAt: z.iso.datetime(),
});

export const deleteAccountRequestSchema = z.object({
  appleAuthorizationCode: z.string().min(1).max(4096).optional(),
  confirmation: z.literal("DELETE"),
});

export const deleteAccountResponseSchema = z.object({
  deleted: z.literal(true),
  providerRevocation: z.enum(["not_applicable", "succeeded", "unavailable", "failed"]),
});

export type AuthProvider = z.infer<typeof authProviderSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;

export const footballTeamSchema = z.object({
  founded: z.number().int().nullable(),
  id: z.number().int().positive(),
  imageUrl: z.url().nullable(),
  name: z.string(),
  shortCode: z.string().nullable(),
});

export const footballLeagueSchema = z.object({
  id: z.number().int().positive(),
  imageUrl: z.url().nullable(),
  name: z.string().min(1).max(160),
  shortCode: z.string().max(16).nullable(),
  type: z.string().nullable(),
});

export const footballSeasonSchema = z.object({
  endsOn: z.iso.date().nullable(),
  id: z.number().int().positive(),
  isCurrent: z.boolean(),
  name: z.string().min(1).max(80),
  startsOn: z.iso.date().nullable(),
});

export const footballPlayerSchema = z.object({
  dateOfBirth: z.iso.date().nullable(),
  displayName: z.string(),
  id: z.number().int().positive(),
  imageUrl: z.url().nullable(),
});

export const footballFixtureParticipantSchema = z.object({
  location: z.enum(["home", "away"]),
  team: footballTeamSchema,
  winner: z.boolean().nullable(),
});

export const footballFixtureSummarySchema = z.object({
  awayScore: z.number().int().nonnegative().nullable(),
  homeScore: z.number().int().nonnegative().nullable(),
  id: z.number().int().positive(),
  isLive: z.boolean(),
  league: z.object({
    id: z.number().int().positive(),
    imageUrl: z.url().nullable(),
    name: z.string(),
  }),
  name: z.string(),
  participants: z.array(footballFixtureParticipantSchema).max(2),
  seasonId: z.number().int().positive(),
  stage: z
    .object({ id: z.number().int().positive(), name: z.string().nullable() })
    .nullable()
    .optional(),
  round: z
    .object({ id: z.number().int().positive().nullable(), name: z.string().nullable() })
    .nullable()
    .optional(),
  startsAt: z.iso.datetime(),
  state: z.object({
    code: z.string().nullable(),
    id: z.number().int().positive(),
    name: z.string().nullable(),
  }),
});

export const footballEventSchema = z.object({
  extraMinute: z.number().int().nullable(),
  id: z.number().int().positive(),
  info: z.string().nullable(),
  minute: z.number().int().nullable(),
  playerId: z.number().int().positive().nullable(),
  playerName: z.string().nullable(),
  relatedPlayerId: z.number().int().positive().nullable(),
  relatedPlayerName: z.string().nullable(),
  result: z.string().nullable(),
  teamId: z.number().int().positive().nullable(),
  typeCode: z.string().nullable(),
  typeId: z.number().int().positive(),
  typeName: z.string().nullable(),
});

export const footballLineupSchema = z.object({
  formationField: z.string().nullable(),
  formationPosition: z.number().int().nullable(),
  id: z.number().int().positive(),
  jerseyNumber: z.number().int().nullable(),
  playerId: z.number().int().positive(),
  playerName: z.string(),
  positionId: z.number().int().positive().nullable(),
  teamId: z.number().int().positive(),
  typeId: z.number().int().positive(),
});

export const footballFeedStatusSchema = z.object({
  plan: z.enum(["free", "paid"]),
  refreshSeconds: z.number().int().positive(),
  calendarFrom: z.iso.date().nullable(),
  calendarTo: z.iso.date().nullable(),
  calendarUpdatedAt: z.iso.datetime().nullable(),
  liveUpdatedAt: z.iso.datetime().nullable(),
  issueCode: z.string().nullable(),
});

export const footballFixtureDetailSchema = footballFixtureSummarySchema.extend({
  source: z.enum(["api-football", "archived"]).optional(),
  sourceUpdatedAt: z.iso.datetime().nullable().optional(),
  elapsed: z.number().int().nullable().optional(),
  dataStatus: z
    .record(
      z.string(),
      z.object({
        state: z.enum(["available", "empty", "unsupported", "pending", "error"]),
        checkedAt: z.iso.datetime().optional(),
      }),
    )
    .optional(),
  events: z.array(footballEventSchema),
  formations: z.array(
    z.object({
      formation: z.string(),
      location: z.enum(["home", "away"]).nullable(),
      teamId: z.number().int().positive(),
    }),
  ),
  lengthMinutes: z.number().int().nullable(),
  lineups: z.array(footballLineupSchema),
  momentum: z
    .array(
      z.object({
        extraMinute: z.number().int().nonnegative().nullable(),
        id: z.number().int().positive(),
        minute: z.number().int().nonnegative(),
        periodId: z.number().int().positive().nullable(),
        teamId: z.number().int().positive(),
        value: z.number(),
      }),
    )
    .default([]),
  resultInfo: z.string().nullable(),
  scores: z.array(
    z.object({
      description: z.string(),
      goals: z.number().int().nullable(),
      location: z.enum(["home", "away"]).nullable(),
      teamId: z.number().int().positive().nullable(),
    }),
  ),
  statistics: z
    .array(
      z.object({
        teamId: z.number().int().positive(),
        typeCode: z.string().nullable(),
        typeId: z.number().int().positive(),
        typeName: z.string().nullable(),
        value: z.union([z.number(), z.string()]).nullable(),
      }),
    )
    .default([]),
});

export const footballFixturePageSchema = z.object({
  feed: footballFeedStatusSchema.nullable().optional(),
  data: z.array(footballFixtureSummarySchema),
  nextCursor: z.string().nullable(),
});

export const footballStandingRowSchema = z.object({
  groupName: z.string().nullable().optional(),
  details: z.record(z.string(), z.number().nullable()),
  form: z.string().nullable(),
  movement: z.string().nullable(),
  points: z.number().int(),
  position: z.number().int().positive(),
  team: footballTeamSchema,
});

export const footballStandingsStatusSchema = z.object({
  state: z.enum(["pending", "available", "empty", "unsupported", "plan_limited", "error"]),
  checkedAt: z.iso.datetime().nullable(),
});

export const footballStandingsSchema = z.object({
  availability: footballStandingsStatusSchema.optional(),
  data: z.array(footballStandingRowSchema),
  leagueId: z.number().int().positive(),
  seasonId: z.number().int().positive(),
});

export const footballTeamProfileSchema = z.object({
  fixtures: z.array(footballFixtureSummarySchema),
  team: footballTeamSchema,
});

export const footballPlayerProfileSchema = z.object({
  player: footballPlayerSchema,
  recentFixtures: z.array(
    z.object({
      fixtureId: z.number().int().positive(),
      fixtureName: z.string(),
      jerseyNumber: z.number().int().nullable(),
      startsAt: z.iso.datetime(),
      teamId: z.number().int().positive(),
    }),
  ),
});

export const footballLeagueProfileSchema = z.object({
  standingsStatus: footballStandingsStatusSchema.optional(),
  fixtures: z.array(footballFixtureSummarySchema).max(20),
  league: footballLeagueSchema,
  season: footballSeasonSchema.nullable(),
  standings: z.array(footballStandingRowSchema),
});

export const footballCatalogEntityTypeSchema = z.enum(["league", "team", "player"]);
export const footballCatalogItemSchema = z.discriminatedUnion("entityType", [
  footballLeagueSchema.extend({ entityType: z.literal("league") }),
  footballTeamSchema.extend({ entityType: z.literal("team") }),
  footballPlayerSchema.extend({ entityType: z.literal("player") }),
]);
export const footballCatalogResponseSchema = z.object({
  data: z.array(footballCatalogItemSchema).max(50),
  generatedAt: z.iso.datetime(),
  query: z.string().nullable(),
});

export const footballComparisonOptionSchema = z.discriminatedUnion("entityType", [
  footballTeamSchema.extend({ entityType: z.literal("team") }),
  footballPlayerSchema.extend({ entityType: z.literal("player") }),
]);
export const footballComparisonOptionsResponseSchema = z.object({
  data: z.array(footballComparisonOptionSchema).max(50),
  generatedAt: z.iso.datetime(),
  hasMore: z.boolean(),
  page: z.number().int().positive(),
  perPage: z.number().int().min(1).max(50),
  query: z.string().nullable(),
});

export type FootballFixtureDetail = z.infer<typeof footballFixtureDetailSchema>;
export type FootballFixturePage = z.infer<typeof footballFixturePageSchema>;
export type FootballFixtureSummary = z.infer<typeof footballFixtureSummarySchema>;
export type FootballCatalogEntityType = z.infer<typeof footballCatalogEntityTypeSchema>;
export type FootballCatalogItem = z.infer<typeof footballCatalogItemSchema>;
export type FootballCatalogResponse = z.infer<typeof footballCatalogResponseSchema>;
export type FootballComparisonOption = z.infer<typeof footballComparisonOptionSchema>;
export type FootballComparisonOptionsResponse = z.infer<
  typeof footballComparisonOptionsResponseSchema
>;
export type FootballLeague = z.infer<typeof footballLeagueSchema>;
export type FootballLeagueProfile = z.infer<typeof footballLeagueProfileSchema>;
export type FootballStandings = z.infer<typeof footballStandingsSchema>;
export type FootballTeam = z.infer<typeof footballTeamSchema>;
export type FootballPlayerProfile = z.infer<typeof footballPlayerProfileSchema>;
export type FootballTeamProfile = z.infer<typeof footballTeamProfileSchema>;

export const aiLanguageSchema = z.enum(["th", "en"]);
export const aiAnalysisStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

const aiTeamTacticalSchema = z.object({
  formation: z.string(),
  style: z.string(),
  strengths: z.array(z.string()).max(5),
  weaknesses: z.array(z.string()).max(5),
});

export const aiMatchAnalysisContentSchema = z.object({
  confidence: z.number().min(0).max(1),
  explanation: z.object({
    decidingFactors: z.array(z.string()).min(1).max(5),
    whyResult: z.string(),
  }),
  momentum: z
    .array(
      z.object({
        explanation: z.string(),
        intensity: z.number().int().min(0).max(100),
        minute: z.number().int().min(0).max(240),
        teamId: z.number().int().positive().nullable(),
      }),
    )
    .max(20),
  playerRatings: z
    .array(
      z.object({
        playerId: z.number().int().positive(),
        playerName: z.string(),
        rating: z.number().min(0).max(10),
        reasons: z.array(z.string()).min(1).max(4),
        teamId: z.number().int().positive(),
      }),
    )
    .max(36),
  summary: z.object({
    headline: z.string(),
    keyMoments: z.array(z.string()).max(6),
    short: z.string(),
  }),
  tactical: z.object({
    away: aiTeamTacticalSchema,
    changes: z.array(z.string()).max(6),
    home: aiTeamTacticalSchema,
  }),
});

export const aiMatchAnalysisSchema = aiMatchAnalysisContentSchema.extend({
  fixtureId: z.number().int().positive(),
  generatedAt: z.iso.datetime(),
  language: aiLanguageSchema,
  model: z.string(),
  promptVersion: z.string(),
  sourceUpdatedAt: z.iso.datetime(),
});

export const aiMatchAnalysisResponseSchema = z.object({
  analysis: aiMatchAnalysisSchema.nullable(),
  fixtureId: z.number().int().positive(),
  status: aiAnalysisStatusSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
});

export const aiAnalysisRequestResponseSchema = z.object({
  fixtureId: z.number().int().positive(),
  quotaRemaining: z.number().int().nonnegative(),
  status: aiAnalysisStatusSchema,
});

export type AiLanguage = z.infer<typeof aiLanguageSchema>;
export type AiMatchAnalysis = z.infer<typeof aiMatchAnalysisSchema>;
export type AiMatchAnalysisContent = z.infer<typeof aiMatchAnalysisContentSchema>;
export type AiMatchAnalysisResponse = z.infer<typeof aiMatchAnalysisResponseSchema>;
export type AiAnalysisRequestResponse = z.infer<typeof aiAnalysisRequestResponseSchema>;

export const aiCompareEntityTypeSchema = z.enum(["team", "player"]);
export const aiCompareContentSchema = z.object({
  caveats: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
  dimensions: z
    .array(
      z.object({
        edge: z.enum(["left", "right", "even"]),
        explanation: z.string(),
        left: z.string(),
        name: z.string(),
        right: z.string(),
      }),
    )
    .min(1)
    .max(10),
  headline: z.string(),
  verdict: z.string(),
});
export const aiComparisonResponseSchema = z.object({
  comparisonId: z.uuid(),
  entityType: aiCompareEntityTypeSchema,
  language: aiLanguageSchema,
  leftId: z.number().int().positive(),
  result: aiCompareContentSchema.nullable(),
  rightId: z.number().int().positive(),
  status: aiAnalysisStatusSchema,
  updatedAt: z.iso.datetime(),
});
export const aiComparisonRequestResponseSchema = z.object({
  comparisonId: z.uuid(),
  quotaRemaining: z.number().int().nonnegative(),
  status: aiAnalysisStatusSchema,
});
export type AiCompareContent = z.infer<typeof aiCompareContentSchema>;
export type AiCompareEntityType = z.infer<typeof aiCompareEntityTypeSchema>;
export type AiComparisonResponse = z.infer<typeof aiComparisonResponseSchema>;
export type AiComparisonRequestResponse = z.infer<typeof aiComparisonRequestResponseSchema>;

export const favoriteEntityTypeSchema = z.enum(["team", "player", "league"]);
export const favoriteSchema = z.object({
  createdAt: z.iso.datetime(),
  entityId: z.number().int().positive(),
  entityType: favoriteEntityTypeSchema,
  imageUrl: z.url().nullable(),
  name: z.string().min(1).max(160),
});
export const favoritesResponseSchema = z.object({ data: z.array(favoriteSchema) });
export const favoriteMutationResponseSchema = z.object({
  active: z.boolean(),
  entityId: z.number().int().positive(),
  entityType: favoriteEntityTypeSchema,
});

export const matchFollowSchema = z.object({
  createdAt: z.iso.datetime(),
  fixtureId: z.number().int().positive(),
  liveAlertsDuringQuietHours: z.boolean(),
  notificationsEnabled: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export const matchFollowListItemSchema = matchFollowSchema.extend({
  fixture: footballFixtureSummarySchema,
});
export const matchFollowsResponseSchema = z.object({
  data: z.array(matchFollowListItemSchema),
});
export const matchFollowMutationResponseSchema = z.object({
  active: z.boolean(),
  follow: matchFollowSchema.nullable(),
  fixtureId: z.number().int().positive(),
});

export const personalizedFeedReasonSchema = z.enum([
  "followed_match",
  "favorite_team",
  "favorite_league",
  "favorite_player",
]);
export const personalizedFixtureSchema = z.object({
  fixture: footballFixtureSummarySchema,
  reasons: z.array(personalizedFeedReasonSchema).min(1),
});
export const personalizedFeedResponseSchema = z.object({
  data: z.array(personalizedFixtureSchema),
  generatedAt: z.iso.datetime(),
});

export const fanHeatmapTeamSchema = z.object({
  percentage: z.number().min(0).max(100),
  supporters: z.number().int().nonnegative(),
  teamId: z.number().int().positive(),
});
export const fanHeatmapResponseSchema = z.object({
  fixtureId: z.number().int().positive(),
  teams: z.array(fanHeatmapTeamSchema).max(2),
  totalSupporters: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
});

const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const notificationPreferencesSchema = z.object({
  aiContext: z.boolean(),
  allowLiveDuringQuietHours: z.boolean(),
  goal: z.boolean(),
  halftimeFulltime: z.boolean(),
  kickoffReminder: z.boolean(),
  lineup: z.boolean(),
  newsBreaking: z.boolean(),
  quietHoursEnabled: z.boolean(),
  quietHoursEnd: clockTimeSchema,
  quietHoursStart: clockTimeSchema,
  redCard: z.boolean(),
  substitution: z.boolean(),
  timezone: z.string().min(1).max(64),
  trendingNews: z.boolean(),
  yellowCard: z.boolean(),
});

export const pushDevicePlatformSchema = z.enum(["ios", "android"]);
export const pushDeviceSchema = z.object({
  enabled: z.boolean(),
  id: z.uuid(),
  lastSeenAt: z.iso.datetime(),
  platform: pushDevicePlatformSchema,
});
export const pushDeviceRegistrationResponseSchema = z.object({ device: pushDeviceSchema });
export const pushDeviceRemovalResponseSchema = z.object({ disabled: z.literal(true) });

export const notificationCategorySchema = z.enum([
  "kickoff_reminder",
  "goal",
  "score_correction",
  "halftime",
  "fulltime",
  "red_card",
  "lineup",
  "substitution",
  "yellow_card",
  "ai_context",
  "breaking_news",
  "trending_news",
]);
export const notificationHistoryItemSchema = z.object({
  body: z.string(),
  category: notificationCategorySchema,
  createdAt: z.iso.datetime(),
  fixtureId: z.number().int().positive().nullable(),
  id: z.uuid(),
  readAt: z.iso.datetime().nullable(),
  status: z.enum(["pending", "queued", "sending", "sent", "failed", "suppressed"]),
  title: z.string(),
});
export const notificationHistoryResponseSchema = z.object({
  data: z.array(notificationHistoryItemSchema),
  nextCursor: z.string().nullable(),
});

export type Favorite = z.infer<typeof favoriteSchema>;
export type FavoriteEntityType = z.infer<typeof favoriteEntityTypeSchema>;
export type FavoritesResponse = z.infer<typeof favoritesResponseSchema>;
export type FavoriteMutationResponse = z.infer<typeof favoriteMutationResponseSchema>;
export type MatchFollow = z.infer<typeof matchFollowSchema>;
export type MatchFollowListItem = z.infer<typeof matchFollowListItemSchema>;
export type MatchFollowsResponse = z.infer<typeof matchFollowsResponseSchema>;
export type MatchFollowMutationResponse = z.infer<typeof matchFollowMutationResponseSchema>;
export type PersonalizedFeedResponse = z.infer<typeof personalizedFeedResponseSchema>;
export type FanHeatmapResponse = z.infer<typeof fanHeatmapResponseSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type PushDevice = z.infer<typeof pushDeviceSchema>;
export type PushDeviceRegistrationResponse = z.infer<typeof pushDeviceRegistrationResponseSchema>;
export type NotificationHistoryResponse = z.infer<typeof notificationHistoryResponseSchema>;

export const newsLanguageSchema = z.enum(["th", "en"]);
export const newsCategorySchema = z.enum([
  "breaking",
  "injury",
  "lineup",
  "match",
  "transfer",
  "interview",
  "general",
]);
export const newsSourceSchema = z.object({
  domain: z.string().min(1).max(253),
  title: z.string().min(1).max(300),
  url: z.url(),
});
export const newsEntityReferenceSchema = z.object({
  entityId: z.number().int().positive(),
  entityType: favoriteEntityTypeSchema,
  relevance: z.number().min(0).max(1),
});
export const newsArticleSchema = z.object({
  category: newsCategorySchema,
  confidence: z.number().min(0).max(1),
  discoveredAt: z.iso.datetime(),
  entities: z.array(newsEntityReferenceSchema).max(20),
  headline: z.string().min(1).max(240),
  id: z.uuid(),
  importance: z.number().int().min(0).max(100),
  isBreaking: z.boolean(),
  language: newsLanguageSchema,
  primaryUrl: z.url(),
  sources: z.array(newsSourceSchema).min(1).max(10),
  summary: z.string().min(1).max(1200),
  summaryBullets: z.array(z.string().min(1).max(300)).min(1).max(5),
  topicKey: z.string().min(1).max(160),
  updatedAt: z.iso.datetime(),
});
export const newsArticlePageSchema = z.object({
  data: z.array(newsArticleSchema),
  nextCursor: z.string().nullable(),
});
export const personalizedNewsReasonSchema = z.enum([
  "favorite_team",
  "favorite_player",
  "favorite_league",
  "trending",
]);
export const personalizedNewsResponseSchema = z.object({
  data: z.array(
    z.object({
      article: newsArticleSchema,
      reasons: z.array(personalizedNewsReasonSchema).min(1),
    }),
  ),
  generatedAt: z.iso.datetime(),
});
export const relatedNewsResponseSchema = z.object({
  data: z.array(newsArticleSchema),
  fixtureId: z.number().int().positive(),
});
export const newsEngagementResponseSchema = z.object({ recorded: z.literal(true) });

export type NewsArticle = z.infer<typeof newsArticleSchema>;
export type NewsArticlePage = z.infer<typeof newsArticlePageSchema>;
export type NewsCategory = z.infer<typeof newsCategorySchema>;
export type NewsLanguage = z.infer<typeof newsLanguageSchema>;
export type PersonalizedNewsResponse = z.infer<typeof personalizedNewsResponseSchema>;
export type RelatedNewsResponse = z.infer<typeof relatedNewsResponseSchema>;
