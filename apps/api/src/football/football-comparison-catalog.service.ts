import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { footballComparisonOptionsResponseSchema } from "@goal-app/contracts";

import { FootballProviderEntityService } from "./football-provider-entity.service";

@Injectable()
export class FootballComparisonCatalogService {
  constructor(
    @Inject(FootballProviderEntityService)
    private readonly entities: FootballProviderEntityService,
  ) {}

  async list(input: {
    entityType?: string;
    page?: number | string;
    perPage?: number | string;
    q?: string;
  }) {
    const entityType = input.entityType ?? "player";
    const page = input.page === undefined ? 1 : Number(input.page);
    const perPage = input.perPage === undefined ? 20 : Number(input.perPage);
    const query = input.q?.trim() || null;
    if (entityType !== "player" && entityType !== "team") {
      throw new BadRequestException("Comparison entity type must be player or team");
    }
    if (!Number.isInteger(page) || page < 1 || page > 2_000) {
      throw new BadRequestException("Comparison catalog page must be between 1 and 2000");
    }
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 50) {
      throw new BadRequestException("Comparison catalog page size must be between 1 and 50");
    }
    if (input.q !== undefined && (!query || query.length < 2 || query.length > 80)) {
      throw new BadRequestException("Search query must contain 2 to 80 characters");
    }

    const result = await this.entities.list(entityType, { page, perPage, query });
    return footballComparisonOptionsResponseSchema.parse({
      data: result.data,
      generatedAt: new Date().toISOString(),
      hasMore: result.hasMore,
      page,
      perPage,
      query,
    });
  }
}
