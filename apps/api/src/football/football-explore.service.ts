import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import {
  footballCatalogResponseSchema,
  type FootballCatalogEntityType,
  type FootballCatalogItem,
} from "@goal-app/contracts";

import { FootballProviderEntityService } from "./football-provider-entity.service";

@Injectable()
export class FootballExploreService {
  private readonly logger = new Logger("FootballExplore");

  constructor(
    @Inject(FootballProviderEntityService)
    private readonly entities: FootballProviderEntityService,
  ) {}

  async explore(input: { limit?: number | string; q?: string; types?: string }) {
    const startedAt = performance.now();
    const query = input.q?.trim() || null;
    const limit = input.limit === undefined ? 30 : Number(input.limit);
    const requestedTypes = [...new Set((input.types ?? "league,team,player").split(","))];
    const allowedTypes = new Set<FootballCatalogEntityType>(["league", "team", "player"]);
    if (input.q !== undefined && (!query || query.length < 2 || query.length > 80)) {
      throw new BadRequestException("Search query must contain 2 to 80 characters");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException("Search limit must be between 1 and 50");
    }
    if (
      requestedTypes.length === 0 ||
      requestedTypes.some((type) => !allowedTypes.has(type as FootballCatalogEntityType))
    ) {
      throw new BadRequestException("Invalid football catalog entity type");
    }

    const types = requestedTypes as FootballCatalogEntityType[];
    const pages = await Promise.all(
      types.map((entityType) => this.entities.list(entityType, { page: 1, perPage: limit, query })),
    );
    const response = footballCatalogResponseSchema.parse({
      data: this.roundRobin(
        pages.map((page) => page.data),
        limit,
      ),
      generatedAt: new Date().toISOString(),
      query,
    });
    this.logger.log({
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      operation: "football_catalog",
      provider: "api-football",
      resultCount: response.data.length,
      types,
    });
    return response;
  }

  private roundRobin(groups: FootballCatalogItem[][], limit: number): FootballCatalogItem[] {
    const result: FootballCatalogItem[] = [];
    for (let index = 0; result.length < limit; index += 1) {
      let added = false;
      for (const group of groups) {
        const item = group[index];
        if (item && result.length < limit) {
          result.push(item);
          added = true;
        }
      }
      if (!added) break;
    }
    return result;
  }
}
