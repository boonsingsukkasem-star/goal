import { createHash } from "node:crypto";

import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NewsCategory, NewsLanguage } from "@goal-app/contracts";
import type { QueueJobData } from "@goal-app/jobs";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { Environment } from "../config/environment";

type NewsJob = QueueJobData["news-ingestion"];

const storySchema = z.object({
  category: z.enum(["breaking", "injury", "lineup", "match", "transfer", "interview", "general"]),
  confidence: z.number().min(0).max(1),
  headline: z.string().min(1).max(240),
  importance: z.number().int().min(0).max(100),
  isBreaking: z.boolean(),
  sourceIndexes: z.array(z.number().int().nonnegative()).min(1).max(10),
  summary: z.string().min(1).max(1200),
  summaryBullets: z.array(z.string().min(1).max(300)).min(1).max(5),
});

const digestSchema = z.object({ stories: z.array(storySchema).max(5) });

interface SearchSource {
  domain: string;
  title: string;
  url: string;
}

export interface IngestedNewsArticle {
  category: NewsCategory;
  confidence: number;
  discoveredAt: string;
  entities: Array<{
    entityId: number;
    entityType: "team" | "player" | "league";
    relevance: number;
  }>;
  headline: string;
  importance: number;
  inputTokens: number;
  isBreaking: boolean;
  language: NewsLanguage;
  model: string;
  outputTokens: number;
  primaryUrl: string;
  searchResponseId: string;
  sourceFingerprint: string;
  sources: Array<SearchSource & { position: number }>;
  summary: string;
  summaryBullets: string[];
  summaryResponseId: string;
  topicKey: string;
}

@Injectable()
export class OpenAiNewsService {
  private readonly allowedDomains: string[];
  private readonly client: OpenAI | null;
  private readonly languages: NewsLanguage[];
  readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    const apiKey = config.get("OPENAI_API_KEY", { infer: true });
    this.allowedDomains = config.get("NEWS_ALLOWED_DOMAINS", { infer: true });
    this.languages = config.get("NEWS_INGESTION_LANGUAGES", { infer: true });
    this.model = config.get("OPENAI_MODEL", { infer: true });
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          maxRetries: 0,
          timeout: config.get("OPENAI_TIMEOUT_MS", { infer: true }),
        })
      : null;
  }

  async research(job: NewsJob): Promise<IngestedNewsArticle[]> {
    if (!this.client) throw new ServiceUnavailableException("News ingestion is not configured");
    const search = await this.client.responses.create({
      include: ["web_search_call.action.sources"],
      input: [
        `Current UTC time: ${new Date().toISOString()}.`,
        `Research only current football news about: ${job.query}.`,
        "Identify up to five distinct, newsworthy developments first reported or materially updated in the last 24 hours.",
        "Prefer official organizations and direct reporting. Separate confirmed facts from reports or rumors.",
        "Do not reproduce article text. Every factual development must be supported by a citation.",
      ].join("\n"),
      model: this.model,
      reasoning: { effort: "low" },
      store: false,
      tool_choice: "required",
      tools: [
        {
          filters: { allowed_domains: this.allowedDomains },
          type: "web_search",
        },
      ],
    });
    const sources = this.extractSources(search.output);
    if (sources.length === 0) {
      throw new ServiceUnavailableException("News search returned no approved citations");
    }

    const articles: IngestedNewsArticle[] = [];
    for (const language of this.languages ?? [job.language]) {
      const summary = await this.client.responses.parse({
        input: JSON.stringify({
          language,
          research: search.output_text.slice(0, 16_000),
          sources: sources.map((source, index) => ({ index, ...source })),
          topic: job.query,
        }),
        instructions: [
          "You are GOAL's football news editor.",
          "Create concise original summaries; never copy source wording or invent facts.",
          "Use only facts in the supplied research and only supplied source indexes.",
          "Each story must have at least one source. Reduce confidence for single-source or disputed claims.",
          "Set isBreaking only for major, time-sensitive and well-supported developments.",
          `Write reader-facing text in ${language === "th" ? "Thai" : "English"}.`,
          "Return distinct stories, not multiple phrasings of the same development.",
        ].join(" "),
        model: this.model,
        reasoning: { effort: "low" },
        store: false,
        text: { format: zodTextFormat(digestSchema, "football_news_digest"), verbosity: "medium" },
      });
      if (!summary.output_parsed) {
        throw new ServiceUnavailableException("News summarization returned no structured result");
      }

      const discoveredAt = new Date().toISOString();
      articles.push(
        ...summary.output_parsed.stories.flatMap((story) => {
          const storySources = [...new Set(story.sourceIndexes)]
            .flatMap((index) => (sources[index] ? [sources[index]] : []))
            .slice(0, 10);
          if (storySources.length === 0) return [];
          const positioned = storySources.map((source, index) => ({
            ...source,
            position: index + 1,
          }));
          return [
            {
              category: story.category,
              confidence: story.confidence,
              discoveredAt,
              entities:
                job.entityId && job.entityType
                  ? [{ entityId: job.entityId, entityType: job.entityType, relevance: 1 }]
                  : [],
              headline: story.headline,
              importance: story.importance,
              inputTokens: (search.usage?.input_tokens ?? 0) + (summary.usage?.input_tokens ?? 0),
              isBreaking: story.isBreaking,
              language,
              model: this.model,
              outputTokens:
                (search.usage?.output_tokens ?? 0) + (summary.usage?.output_tokens ?? 0),
              primaryUrl: positioned[0]!.url,
              searchResponseId: search.id,
              sourceFingerprint: this.fingerprint(language, positioned),
              sources: positioned,
              summary: story.summary,
              summaryBullets: story.summaryBullets,
              summaryResponseId: summary.id,
              topicKey: job.topicKey,
            },
          ];
        }),
      );
    }
    return articles;
  }

  private extractSources(output: unknown): SearchSource[] {
    const candidates: Array<{ title?: unknown; url?: unknown }> = [];
    for (const item of Array.isArray(output) ? output : []) {
      const record = item as Record<string, unknown>;
      const action = record.action as Record<string, unknown> | undefined;
      for (const source of Array.isArray(action?.sources) ? action.sources : []) {
        candidates.push(source as { title?: unknown; url?: unknown });
      }
      for (const content of Array.isArray(record.content) ? record.content : []) {
        const contentRecord = content as Record<string, unknown>;
        for (const annotation of Array.isArray(contentRecord.annotations)
          ? contentRecord.annotations
          : []) {
          const citation = annotation as Record<string, unknown>;
          if (citation.type === "url_citation") candidates.push(citation);
        }
      }
    }

    const unique = new Map<string, SearchSource>();
    for (const candidate of candidates) {
      if (typeof candidate.url !== "string") continue;
      try {
        const url = new URL(candidate.url);
        if (url.protocol !== "https:" || !this.isAllowedDomain(url.hostname)) continue;
        for (const key of [...url.searchParams.keys()]) {
          if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key)) {
            url.searchParams.delete(key);
          }
        }
        url.hash = "";
        const canonical = url.toString().slice(0, 2048);
        unique.set(canonical, {
          domain: url.hostname.toLowerCase(),
          title:
            typeof candidate.title === "string" && candidate.title.trim()
              ? candidate.title.trim().slice(0, 300)
              : url.hostname,
          url: canonical,
        });
      } catch {
        continue;
      }
    }
    return [...unique.values()].slice(0, 20);
  }

  private isAllowedDomain(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return this.allowedDomains.some(
      (domain) => normalized === domain || normalized.endsWith(`.${domain}`),
    );
  }

  private fingerprint(language: NewsLanguage, sources: Array<{ url: string }>): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          language,
          sources: sources.map((source) => source.url).sort(),
        }),
      )
      .digest("hex");
  }
}
