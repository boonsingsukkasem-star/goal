import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  newsArticlePageSchema,
  newsArticleSchema,
  newsEngagementResponseSchema,
  personalizedNewsResponseSchema,
  relatedNewsResponseSchema,
  type NewsArticle,
  type NewsCategory,
  type NewsLanguage,
} from "@goal-app/contracts";
import { z } from "zod";

import type { AuthPrincipal } from "../auth/auth-principal";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { SupabaseUserService } from "../auth/supabase-user.service";
import { FootballReadService } from "../football/football-read.service";
import { RuntimeCacheService } from "../platform/cache/runtime-cache.service";

type DataRow = Record<string, unknown>;
const cursorSchema = z.object({ discoveredAt: z.iso.datetime(), id: z.uuid() });

@Injectable()
export class NewsService {
  private readonly logger = new Logger("NewsRead");
  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(SupabaseUserService) private readonly userData: SupabaseUserService,
    @Inject(FootballReadService) private readonly football: FootballReadService,
    @Inject(RuntimeCacheService) private readonly cache: RuntimeCacheService,
  ) {}

  async listFeed(input: {
    category?: NewsCategory;
    cursor?: string;
    language?: NewsLanguage;
    limit?: number;
  }) {
    const language = input.language ?? "th";
    const limit = input.limit ?? 20;
    let query = this.supabase
      .getClient()
      .from("news_articles")
      .select("*")
      .eq("language", language)
      .eq("status", "published")
      .gt("expires_at", new Date().toISOString())
      .order("discovered_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (input.category) query = query.eq("category", input.category);
    if (input.cursor) {
      const cursor = this.decodeCursor(input.cursor);
      query = query.or(
        `discovered_at.lt.${cursor.discoveredAt},and(discovered_at.eq.${cursor.discoveredAt},id.lt.${cursor.id})`,
      );
    }
    const { data, error } = await query;
    if (error) this.unavailable();
    const rows = (data ?? []) as DataRow[];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const articles = await this.hydrateRows(page);
    const last = page.at(-1);
    return newsArticlePageSchema.parse({
      data: articles,
      nextCursor:
        hasMore && last ? this.encodeCursor(String(last.discovered_at), String(last.id)) : null,
    });
  }

  async getTrending(language: NewsLanguage = "th", limit = 20) {
    const key = `news:trending:${language}:${limit}`;
    const cached = await this.cache.get<unknown>(key).catch((cause: unknown) => {
      this.logger.warn({
        cache: "runtime",
        error: cause instanceof Error ? cause.message : "Unknown cache read error",
        operation: "get",
      });
      return null;
    });
    if (cached) return newsArticlePageSchema.parse(cached);
    const { data, error } = await this.supabase.getClient().rpc("get_trending_news_ids", {
      p_language: language,
      p_limit: limit,
    });
    if (error) this.unavailable();
    const articles = await this.hydrateIds(
      ((data ?? []) as DataRow[]).map((row) => String(row.article_id)),
    );
    const response = newsArticlePageSchema.parse({ data: articles, nextCursor: null });
    await this.cache.set(key, response, { tags: ["news"], ttl: 60 }).catch((cause: unknown) =>
      this.logger.warn({
        cache: "runtime",
        error: cause instanceof Error ? cause.message : "Unknown cache write error",
        operation: "set",
      }),
    );
    return response;
  }

  async getPersonalized(language: NewsLanguage, limit: number, principal: AuthPrincipal) {
    const { data, error } = await this.userData
      .getClient(principal)
      .rpc("get_my_personalized_news_ids", {
        p_language: language,
        p_limit: limit,
      });
    if (error) this.unavailable();
    const ranked = (data ?? []) as DataRow[];
    const articles = await this.hydrateIds(ranked.map((row) => String(row.article_id)));
    const articleById = new Map(articles.map((article) => [article.id, article]));
    return personalizedNewsResponseSchema.parse({
      data: ranked.flatMap((row) => {
        const article = articleById.get(String(row.article_id));
        return article ? [{ article, reasons: row.reasons }] : [];
      }),
      generatedAt: new Date().toISOString(),
    });
  }

  async getRelated(fixtureId: number, language: NewsLanguage = "th", limit = 8) {
    await this.football.getFixture(fixtureId);
    const { data, error } = await this.supabase.getClient().rpc("get_related_news_ids", {
      p_fixture_id: fixtureId,
      p_language: language,
      p_limit: limit,
    });
    if (error) this.unavailable();
    const articles = await this.hydrateIds(
      ((data ?? []) as DataRow[]).map((row) => String(row.article_id)),
    );
    return relatedNewsResponseSchema.parse({ data: articles, fixtureId });
  }

  async recordEngagement(articleId: string, principal: AuthPrincipal) {
    const { error } = await this.userData.getClient(principal).rpc("record_my_news_engagement", {
      p_article_id: articleId,
    });
    if (error?.code === "P0002") throw new NotFoundException("News article not found");
    if (error?.code === "P0001") {
      throw new HttpException("News engagement limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error) this.unavailable();
    return newsEngagementResponseSchema.parse({ recorded: true });
  }

  private async hydrateIds(ids: string[]): Promise<NewsArticle[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase
      .getClient()
      .from("news_articles")
      .select("*")
      .in("id", ids)
      .eq("status", "published")
      .gt("expires_at", new Date().toISOString());
    if (error) this.unavailable();
    const hydrated = await this.hydrateRows((data ?? []) as DataRow[]);
    const byId = new Map(hydrated.map((article) => [article.id, article]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  private async hydrateRows(rows: DataRow[]): Promise<NewsArticle[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => String(row.id));
    const client = this.supabase.getClient();
    const [sourceResult, entityResult] = await Promise.all([
      client
        .from("news_sources")
        .select("article_id,position,url,title,domain")
        .in("article_id", ids)
        .order("position", { ascending: true }),
      client
        .from("news_entity_links")
        .select("article_id,entity_type,entity_id,relevance")
        .in("article_id", ids)
        .order("relevance", { ascending: false }),
    ]);
    if (sourceResult.error || entityResult.error) this.unavailable();
    const sources = this.groupByArticle(sourceResult.data ?? []);
    const entities = this.groupByArticle(entityResult.data ?? []);
    return rows.map((row) =>
      newsArticleSchema.parse({
        category: row.category,
        confidence: Number(row.confidence),
        discoveredAt: new Date(String(row.discovered_at)).toISOString(),
        entities: (entities.get(String(row.id)) ?? []).map((entity) => ({
          entityId: Number(entity.entity_id),
          entityType: entity.entity_type,
          relevance: Number(entity.relevance),
        })),
        headline: row.headline,
        id: row.id,
        importance: Number(row.importance),
        isBreaking: row.is_breaking,
        language: row.language,
        primaryUrl: row.primary_url,
        sources: (sources.get(String(row.id)) ?? []).map((source) => ({
          domain: source.domain,
          title: source.title,
          url: source.url,
        })),
        summary: row.summary,
        summaryBullets: row.summary_bullets,
        topicKey: row.topic_key,
        updatedAt: new Date(String(row.updated_at)).toISOString(),
      }),
    );
  }

  private groupByArticle(rows: DataRow[]): Map<string, DataRow[]> {
    const grouped = new Map<string, DataRow[]>();
    for (const row of rows) {
      const id = String(row.article_id);
      grouped.set(id, [...(grouped.get(id) ?? []), row]);
    }
    return grouped;
  }

  private decodeCursor(value: string): z.infer<typeof cursorSchema> {
    try {
      return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    } catch {
      throw new BadRequestException("Invalid news cursor");
    }
  }

  private encodeCursor(discoveredAt: string, id: string): string {
    return Buffer.from(JSON.stringify({ discoveredAt, id })).toString("base64url");
  }

  private unavailable(): never {
    throw new ServiceUnavailableException("Football news is temporarily unavailable");
  }
}
