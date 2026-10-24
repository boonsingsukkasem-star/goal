import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  aiAnalysisRequestResponseSchema,
  aiComparisonRequestResponseSchema,
  aiComparisonResponseSchema,
  footballFixtureDetailSchema,
  footballPlayerProfileSchema,
  footballTeamProfileSchema,
  aiMatchAnalysisResponseSchema,
  type AiCompareEntityType,
  type AiLanguage,
} from "@goal-app/contracts";
import { aiAnalysisJobSchema, queueNames, type QueueJobData } from "@goal-app/jobs";

import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { SupabaseUserService } from "../auth/supabase-user.service";
import type { AuthPrincipal } from "../auth/auth-principal";
import type { Environment } from "../config/environment";
import { FootballReadService } from "../football/football-read.service";
import { AiOutboxService } from "../platform/queue/ai-outbox.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OpenAiFootballService } from "./openai-football.service";

export const AI_MATCH_PROMPT_VERSION = "match-companion-v1";
export const AI_COMPARE_PROMPT_VERSION = "entity-compare-v1";
type DataRow = Record<string, unknown>;

export interface AiAnalysisMetadata {
  deliveryCount: number;
  messageId: string;
  topicName?: string;
}

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger("AiAnalysis");
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(SupabaseUserService) private readonly userData: SupabaseUserService,
    @Inject(FootballReadService) private readonly football: FootballReadService,
    @Inject(OpenAiFootballService) private readonly openai: OpenAiFootballService,
    @Inject(AiOutboxService) private readonly outbox: AiOutboxService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async getMatchAnalysis(fixtureId: number, language: AiLanguage) {
    const { data, error } = await this.supabase
      .getClient()
      .from("ai_match_analyses")
      .select("*")
      .eq("fixture_id", fixtureId)
      .eq("language", language)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) throw new ServiceUnavailableException("AI analysis is unavailable");
    if (!data || data.length === 0) {
      const { data: fixture, error: fixtureError } = await this.supabase
        .getClient()
        .from("football_fixtures")
        .select("id")
        .eq("id", fixtureId)
        .maybeSingle();
      if (fixtureError) throw new ServiceUnavailableException("AI analysis is unavailable");
      if (!fixture) throw new NotFoundException("Fixture not found");
    }

    const rows = (data ?? []) as DataRow[];
    const row = rows[0] ?? null;
    const completed = rows.find(
      (candidate) => candidate.status === "completed" && candidate.result,
    );
    const analysis = completed
      ? {
          ...(completed.result as object),
          fixtureId,
          generatedAt: new Date(String(completed.generated_at)).toISOString(),
          language,
          model: String(completed.model),
          promptVersion: String(completed.prompt_version),
          sourceUpdatedAt: new Date(String(completed.source_updated_at)).toISOString(),
        }
      : null;
    return aiMatchAnalysisResponseSchema.parse({
      analysis,
      fixtureId,
      status: row?.status ?? null,
      updatedAt: row ? new Date(String(row.updated_at)).toISOString() : null,
    });
  }

  async requestMatchAnalysis(fixtureId: number, language: AiLanguage, principal: AuthPrincipal) {
    const { data, error } = await this.reserveMatchWithSnapshot(fixtureId, language, principal);
    if (error?.code === "P0002") throw new NotFoundException("Fixture not found");
    if (error) throw new ServiceUnavailableException("Unable to reserve AI analysis");
    const reservation = (data as DataRow[] | null)?.[0];
    if (!reservation) throw new ServiceUnavailableException("Unable to reserve AI analysis");

    const status = String(reservation.analysis_status);
    const quotaRemaining = Number(reservation.quota_remaining);
    if (reservation.reservation_outcome === "quota_exhausted") {
      throw new HttpException("Daily AI analysis quota reached", HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.dispatchOutboxSafely();

    return aiAnalysisRequestResponseSchema.parse({
      fixtureId,
      quotaRemaining,
      status,
    });
  }

  async process(
    job: QueueJobData[typeof queueNames.aiAnalysis],
    _metadata: unknown,
  ): Promise<void> {
    if (job.type === "compare-entities") {
      await this.processComparison(job);
      return;
    }
    const client = this.supabase.getClient();
    const { data: claimedRows, error: claimError } = await client.rpc("claim_ai_match_analysis", {
      p_analysis_id: job.analysisId,
      p_generation_id: job.generationId,
      p_source_updated_at: job.sourceUpdatedAt,
    });
    if (claimError) throw new ServiceUnavailableException("Unable to claim AI analysis");
    const claimed = (claimedRows as DataRow[] | null)?.[0];
    if (!claimed) return;

    try {
      const fixture = footballFixtureDetailSchema.parse(claimed.input_snapshot);
      const generation = await this.openai.analyzeMatch(fixture, job.language);
      const generatedAt = new Date().toISOString();
      const { error } = await client
        .from("ai_match_analyses")
        .update({
          error_code: null,
          generated_at: generatedAt,
          input_tokens: generation.inputTokens,
          model: this.openai.model,
          output_tokens: generation.outputTokens,
          provider_response_id: generation.responseId,
          result: generation.content,
          status: "completed",
        })
        .eq("id", job.analysisId)
        .eq("generation_id", job.generationId)
        .eq("source_updated_at", job.sourceUpdatedAt);
      if (error) throw new ServiceUnavailableException("Unable to save AI analysis");
      await this.notifications
        .stageAiContextNotifications(
          job.fixtureId,
          job.analysisId,
          generation.content.summary.short,
          generation.content.confidence,
        )
        .catch((notificationError: unknown) =>
          this.logger.warn({
            analysisId: job.analysisId,
            error:
              notificationError instanceof Error
                ? notificationError.message
                : "Unknown notification staging error",
            status: "notification_outbox_pending",
          }),
        );
    } catch (error) {
      await client
        .from("ai_match_analyses")
        .update({ error_code: "GENERATION_FAILED", status: "failed" })
        .eq("id", job.analysisId)
        .eq("generation_id", job.generationId)
        .eq("source_updated_at", job.sourceUpdatedAt);
      throw error;
    }
  }

  async requestComparison(
    input: {
      entityType: AiCompareEntityType;
      language: AiLanguage;
      leftId: number;
      rightId: number;
    },
    principal: AuthPrincipal,
  ) {
    if (input.leftId === input.rightId) {
      throw new HttpException("Comparison entities must be different", HttpStatus.BAD_REQUEST);
    }
    const [leftSnapshot, rightSnapshot] = await Promise.all(
      input.entityType === "team"
        ? [this.football.getTeam(input.leftId), this.football.getTeam(input.rightId)]
        : [this.football.getPlayer(input.leftId), this.football.getPlayer(input.rightId)],
    );
    const dailyLimit = this.config.get("AI_DAILY_REQUEST_LIMIT", { infer: true });
    const { data, error } = await this.supabase.getClient().rpc("reserve_ai_comparison", {
      p_daily_limit: dailyLimit,
      p_entity_type: input.entityType,
      p_language: input.language,
      p_left_id: input.leftId,
      p_prompt_version: AI_COMPARE_PROMPT_VERSION,
      p_right_id: input.rightId,
      p_user_id: principal.userId,
      p_left_snapshot: leftSnapshot,
      p_right_snapshot: rightSnapshot,
    });
    if (error?.code === "P0002") throw new NotFoundException("Comparison entity not found");
    if (error) throw new ServiceUnavailableException("Unable to reserve AI comparison");
    const reservation = (data as DataRow[] | null)?.[0];
    if (!reservation) throw new ServiceUnavailableException("Unable to reserve AI comparison");
    const status = String(reservation.comparison_status);
    const quotaRemaining = Number(reservation.quota_remaining);
    if (reservation.reservation_outcome === "quota_exhausted") {
      throw new HttpException("Daily AI analysis quota reached", HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.dispatchOutboxSafely();
    return aiComparisonRequestResponseSchema.parse({
      comparisonId: reservation.comparison_id,
      quotaRemaining,
      status,
    });
  }

  async getComparison(comparisonId: string, principal: AuthPrincipal) {
    const { data, error } = await this.userData
      .getClient(principal)
      .from("ai_comparisons")
      .select("*")
      .eq("id", comparisonId)
      .maybeSingle();
    if (error) throw new ServiceUnavailableException("AI comparison is unavailable");
    if (!data) throw new NotFoundException("AI comparison not found");
    return aiComparisonResponseSchema.parse({
      comparisonId: data.id,
      entityType: data.entity_type,
      language: data.language,
      leftId: data.left_id,
      result: data.status === "completed" ? data.result : null,
      rightId: data.right_id,
      status: data.status,
      updatedAt: new Date(data.updated_at).toISOString(),
    });
  }

  private async processComparison(
    job: Extract<QueueJobData[typeof queueNames.aiAnalysis], { type: "compare-entities" }>,
  ): Promise<void> {
    const client = this.supabase.getClient();
    const { data: claimedRows, error: claimError } = await client.rpc("claim_ai_comparison", {
      p_comparison_id: job.comparisonId,
      p_generation_id: job.generationId,
      p_source_fingerprint: job.sourceFingerprint,
    });
    if (claimError) throw new ServiceUnavailableException("Unable to claim AI comparison");
    const claimed = (claimedRows as DataRow[] | null)?.[0];
    if (!claimed) return;
    try {
      const left =
        job.entityType === "team"
          ? footballTeamProfileSchema.parse(claimed.left_snapshot)
          : footballPlayerProfileSchema.parse(claimed.left_snapshot);
      const right =
        job.entityType === "team"
          ? footballTeamProfileSchema.parse(claimed.right_snapshot)
          : footballPlayerProfileSchema.parse(claimed.right_snapshot);
      const generation = await this.openai.compareEntities(
        job.entityType,
        left,
        right,
        job.language,
      );
      const { error } = await client
        .from("ai_comparisons")
        .update({
          error_code: null,
          input_tokens: generation.inputTokens,
          model: this.openai.model,
          output_tokens: generation.outputTokens,
          provider_response_id: generation.responseId,
          result: generation.content,
          status: "completed",
        })
        .eq("id", job.comparisonId)
        .eq("generation_id", job.generationId)
        .eq("source_fingerprint", job.sourceFingerprint);
      if (error) throw new ServiceUnavailableException("Unable to save AI comparison");
    } catch (error) {
      await client
        .from("ai_comparisons")
        .update({ error_code: "GENERATION_FAILED", status: "failed" })
        .eq("id", job.comparisonId)
        .eq("generation_id", job.generationId)
        .eq("source_fingerprint", job.sourceFingerprint);
      throw error;
    }
  }

  async recordDeadLetter(
    payload: unknown,
    metadata: AiAnalysisMetadata,
    error: unknown,
  ): Promise<void> {
    const parsed = aiAnalysisJobSchema.safeParse(payload);
    const idempotencyKey = parsed.success
      ? parsed.data.type === "analyze-match"
        ? `ai-analysis:${parsed.data.analysisId}:${parsed.data.generationId}`
        : `ai-comparison:${parsed.data.comparisonId}:${parsed.data.generationId}`
      : `invalid:${metadata.messageId}`;
    const message = error instanceof Error ? error.message : "Unknown AI analysis error";
    const { error: writeError } = await this.supabase
      .getClient()
      .rpc("record_ai_analysis_dead_letter", {
        p_delivery_count: metadata.deliveryCount,
        p_error_message: message,
        p_idempotency_key: idempotencyKey,
        p_message_id: metadata.messageId,
        p_payload: payload,
      });
    if (writeError) throw new ServiceUnavailableException("AI dead-letter evidence is unavailable");
    this.logger.warn({
      deliveryCount: metadata.deliveryCount,
      error: message,
      messageId: metadata.messageId,
      status: "dead_lettered",
      topic: metadata.topicName ?? queueNames.aiAnalysis,
    });
  }

  private async reserveMatchWithSnapshot(
    fixtureId: number,
    language: AiLanguage,
    principal: AuthPrincipal,
  ) {
    const dailyLimit = this.config.get("AI_DAILY_REQUEST_LIMIT", { infer: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: revision, error: revisionError } = await this.supabase
        .getClient()
        .from("football_fixtures")
        .select("provider_last_processed_at,updated_at")
        .eq("id", fixtureId)
        .maybeSingle();
      if (revisionError) throw new ServiceUnavailableException("Unable to read fixture revision");
      if (!revision) throw new NotFoundException("Fixture not found");
      const snapshot = await this.football.getFixture(fixtureId);
      const sourceUpdatedAt = String(revision.provider_last_processed_at ?? revision.updated_at);
      const result = await this.supabase.getClient().rpc("reserve_ai_match_analysis", {
        p_daily_limit: dailyLimit,
        p_expected_source_updated_at: sourceUpdatedAt,
        p_fixture_id: fixtureId,
        p_input_snapshot: snapshot,
        p_language: language,
        p_prompt_version: AI_MATCH_PROMPT_VERSION,
        p_user_id: principal.userId,
      });
      if (result.error?.code === "P0003" && attempt === 0) continue;
      return result;
    }
    throw new ServiceUnavailableException("Fixture changed while reserving AI analysis");
  }

  private async dispatchOutboxSafely(): Promise<void> {
    try {
      await this.outbox.dispatchPending();
    } catch (error) {
      this.logger.warn({
        error: error instanceof Error ? error.message : "Unknown AI outbox dispatch error",
        status: "outbox_pending",
      });
    }
  }
}
