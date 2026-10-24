import { z } from "zod";

export const queueNames = {
  aiAnalysis: "ai-analysis",
  footballSync: "football-sync",
  newsIngestion: "news-ingestion",
  notifications: "notifications",
} as const;

export const queueNameSchema = z.enum([
  queueNames.aiAnalysis,
  queueNames.footballSync,
  queueNames.newsIngestion,
  queueNames.notifications,
]);

const jobMetadataSchema = z.object({
  correlationId: z.uuid(),
  requestedAt: z.iso.datetime(),
  schemaVersion: z.literal(1),
});

const footballJobMetadataSchema = jobMetadataSchema.extend({ schemaVersion: z.literal(2) });

export const footballSyncJobSchema = z.discriminatedUnion("type", [
  footballJobMetadataSchema.extend({ type: z.literal("sync-catalog") }),
  footballJobMetadataSchema.extend({
    fixtureId: z.number().int().positive(),
    type: z.literal("sync-fixture"),
  }),
  footballJobMetadataSchema.extend({
    activeUntil: z.iso.datetime().optional(),
    mode: z.enum(["scan", "delta"]),
    type: z.literal("sync-live-updates"),
  }),
  footballJobMetadataSchema.extend({
    seasonId: z.number().int().positive(),
    type: z.literal("sync-standings"),
  }),
  footballJobMetadataSchema.extend({
    endDate: z.iso.date(),
    startDate: z.iso.date(),
    type: z.literal("sync-fixture-window"),
  }),
  footballJobMetadataSchema.extend({
    date: z.iso.date(),
    page: z.number().int().min(1).max(100),
    type: z.literal("sync-fixture-page"),
  }),
]);

export const aiAnalysisJobSchema = z.discriminatedUnion("type", [
  jobMetadataSchema.extend({
    analysisId: z.uuid(),
    fixtureId: z.number().int().positive(),
    generationId: z.uuid(),
    language: z.enum(["th", "en"]),
    sourceUpdatedAt: z.iso.datetime(),
    type: z.literal("analyze-match"),
  }),
  jobMetadataSchema.extend({
    comparisonId: z.uuid(),
    entityType: z.enum(["team", "player"]),
    generationId: z.uuid(),
    language: z.enum(["th", "en"]),
    leftId: z.number().int().positive(),
    rightId: z.number().int().positive(),
    sourceFingerprint: z.string().length(32),
    type: z.literal("compare-entities"),
  }),
]);

export const newsIngestionJobSchema = jobMetadataSchema
  .extend({
    entityId: z.number().int().positive().optional(),
    entityName: z.string().min(1).max(160).optional(),
    entityType: z.enum(["team", "player", "league"]).optional(),
    language: z.enum(["th", "en"]),
    query: z.string().min(3).max(300),
    topicKey: z.string().min(1).max(160),
    type: z.literal("ingest-topic"),
  })
  .refine(
    (job) =>
      (job.entityId === undefined &&
        job.entityName === undefined &&
        job.entityType === undefined) ||
      (job.entityId !== undefined && job.entityName !== undefined && job.entityType !== undefined),
    { message: "News entity metadata must be complete" },
  );

export const notificationJobSchema = z.discriminatedUnion("type", [
  jobMetadataSchema.extend({
    afterUserId: z.uuid().optional(),
    analysisId: z.uuid(),
    body: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    fanoutId: z.uuid(),
    fixtureId: z.number().int().positive(),
    type: z.literal("fanout-ai-context-notifications"),
  }),
  jobMetadataSchema.extend({
    afterUserId: z.uuid().optional(),
    fanoutId: z.uuid(),
    fixtureId: z.number().int().positive(),
    type: z.literal("fanout-fixture-notifications"),
  }),
  jobMetadataSchema.extend({
    afterUserId: z.uuid().optional(),
    articleId: z.uuid(),
    fanoutId: z.uuid(),
    type: z.literal("fanout-news-notifications"),
  }),
  jobMetadataSchema.extend({
    generationId: z.uuid(),
    notificationId: z.uuid(),
    type: z.literal("send-notification"),
  }),
  jobMetadataSchema.extend({
    receiptIds: z.array(z.string().min(1).max(256)).min(1).max(100),
    type: z.literal("check-push-receipts"),
  }),
]);

export const queueJobSchemas = {
  [queueNames.aiAnalysis]: aiAnalysisJobSchema,
  [queueNames.footballSync]: footballSyncJobSchema,
  [queueNames.newsIngestion]: newsIngestionJobSchema,
  [queueNames.notifications]: notificationJobSchema,
} as const;

export type QueueName = z.infer<typeof queueNameSchema>;
export type QueueJobData = {
  [Name in QueueName]: z.infer<(typeof queueJobSchemas)[Name]>;
};

export function createDeterministicJobId(
  queueName: QueueName,
  resourceKey: string,
  schemaVersion = 1,
): string {
  return `${queueName}:${resourceKey}:v${schemaVersion}`;
}
