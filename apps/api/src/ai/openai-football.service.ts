import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  aiMatchAnalysisContentSchema,
  aiCompareContentSchema,
  type AiCompareContent,
  type AiLanguage,
  type AiMatchAnalysisContent,
  type FootballFixtureDetail,
} from "@goal-app/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import type { Environment } from "../config/environment";

@Injectable()
export class OpenAiFootballService {
  private readonly client: OpenAI | null;
  readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    const apiKey = config.get("OPENAI_API_KEY", { infer: true });
    this.model = config.get("OPENAI_MODEL", { infer: true });
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          maxRetries: 0,
          timeout: config.get("OPENAI_TIMEOUT_MS", { infer: true }),
        })
      : null;
  }

  async analyzeMatch(
    fixture: FootballFixtureDetail,
    language: AiLanguage,
  ): Promise<{
    content: AiMatchAnalysisContent;
    inputTokens: number;
    outputTokens: number;
    responseId: string;
  }> {
    if (!this.client) throw new ServiceUnavailableException("AI analysis is not configured");

    const response = await this.client.responses.parse({
      input: JSON.stringify(this.promptInput(fixture)),
      instructions: [
        "You are GOAL's evidence-grounded football analyst.",
        "Use only the canonical match facts in the input. Never invent statistics or player actions.",
        "If evidence is sparse, lower confidence and explicitly say what cannot be concluded.",
        `Write all reader-facing text in ${language === "th" ? "Thai" : "English"}.`,
        "Momentum must cite event timing and may explain the supplied GOAL attacking-activity trend (a heuristic, not a probability); ratings must be explainable from listed events and lineup data.",
        "Never invent xG or turn attacking-activity scores into goal probabilities. If xG is absent, explain only the supplied shots, events and other statistics.",
        "Return exactly the requested structured output.",
      ].join(" "),
      model: this.model,
      reasoning: { effort: "low" },
      store: false,
      text: {
        format: zodTextFormat(aiMatchAnalysisContentSchema, "football_match_analysis"),
        verbosity: "medium",
      },
    });

    if (!response.output_parsed) {
      throw new ServiceUnavailableException("AI analysis returned no structured result");
    }
    return {
      content: aiMatchAnalysisContentSchema.parse(response.output_parsed),
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      responseId: response.id,
    };
  }

  async compareEntities(
    entityType: "team" | "player",
    left: unknown,
    right: unknown,
    language: AiLanguage,
  ): Promise<{
    content: AiCompareContent;
    inputTokens: number;
    outputTokens: number;
    responseId: string;
  }> {
    if (!this.client) throw new ServiceUnavailableException("AI comparison is not configured");
    const response = await this.client.responses.parse({
      input: JSON.stringify({ entityType, left, right }),
      instructions: [
        "You are GOAL's evidence-grounded football comparison analyst.",
        "Use only the canonical profile and fixture facts in the input; never invent statistics.",
        "Compare the left entity with the right entity across useful football dimensions.",
        `Write all reader-facing text in ${language === "th" ? "Thai" : "English"}.`,
        "Use caveats and lower confidence when the available evidence is sparse.",
        "Return exactly the requested structured output.",
      ].join(" "),
      model: this.model,
      reasoning: { effort: "low" },
      store: false,
      text: {
        format: zodTextFormat(aiCompareContentSchema, "football_entity_comparison"),
        verbosity: "medium",
      },
    });
    if (!response.output_parsed) {
      throw new ServiceUnavailableException("AI comparison returned no structured result");
    }
    return {
      content: aiCompareContentSchema.parse(response.output_parsed),
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      responseId: response.id,
    };
  }

  private promptInput(fixture: FootballFixtureDetail): object {
    return {
      fixtureId: fixture.id,
      name: fixture.name,
      startsAt: fixture.startsAt,
      state: fixture.state,
      score: { away: fixture.awayScore, home: fixture.homeScore },
      participants: fixture.participants,
      formations: fixture.formations,
      events: fixture.events,
      lineups: fixture.lineups,
      momentum: fixture.momentum,
      resultInfo: fixture.resultInfo,
      scores: fixture.scores,
      statistics: fixture.statistics,
    };
  }
}
