import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  footballCatalogItemSchema,
  type FootballCatalogEntityType,
  type FootballCatalogItem,
} from "@goal-app/contracts";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { ApiFootballService } from "./provider/api-football.service";

type Row = Record<string, unknown>;
const tables = {
  league: "football_leagues",
  team: "football_teams",
  player: "football_players",
} as const;
export interface FootballProviderEntityPage {
  data: FootballCatalogItem[];
  hasMore: boolean;
  message: string | null;
}

/** Catalog and routes expose GOAL IDs. Provider IDs never escape the ingestion boundary. */
@Injectable()
export class FootballProviderEntityService {
  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(ApiFootballService) private readonly provider: ApiFootballService,
  ) {}

  async list(
    kind: FootballCatalogEntityType,
    input: { page: number; perPage: number; query: string | null },
  ): Promise<FootballProviderEntityPage> {
    if (input.query && input.query.length >= 3) return this.search(kind, input);
    const client = this.supabase.getClient();
    const field = kind === "player" ? "display_name" : "name";
    let query = client
      .from(tables[kind])
      .select("*")
      .not("api_football_id", "is", null)
      .order(field)
      .order("id");
    if (input.query) query = query.ilike(field, `%${input.query.replace(/[\\%_]/g, "\\$&")}%`);
    const start = (input.page - 1) * input.perPage;
    const result = await query.range(start, start + input.perPage);
    if (result.error) throw new ServiceUnavailableException("Football catalog is unavailable");
    return {
      data: (result.data ?? []).slice(0, input.perPage).map((row) => this.map(kind, row)),
      hasMore: (result.data?.length ?? 0) > input.perPage,
      message: null,
    };
  }
  private async search(
    kind: FootballCatalogEntityType,
    input: { page: number; perPage: number; query: string | null },
  ): Promise<FootballProviderEntityPage> {
    const client = this.supabase.getClient();
    const key = createHash("sha256")
      .update(`${kind}:${input.query!.trim().toLocaleLowerCase("en")}`)
      .digest("hex");
    type SearchPage = {
      entity_ids: number[];
      next_page: number;
      has_more: boolean;
      updated_at: string;
    };
    const read = async () => {
      const { data, error } = await client
        .from("football_catalog_searches")
        .select("entity_ids,next_page,has_more,updated_at")
        .eq("cache_key", key)
        .maybeSingle();
      if (error) throw new ServiceUnavailableException("Football search cache is unavailable");
      return data as SearchPage | null;
    };
    let cached = await read();
    const start = (input.page - 1) * input.perPage;
    const expired =
      input.page === 1 && cached && Date.now() - Date.parse(cached.updated_at) > 300_000;
    if (
      !cached ||
      expired ||
      (cached.has_more && cached.entity_ids.length < start + input.perPage)
    ) {
      const owner = randomUUID();
      const { data: acquired, error } = await client.rpc("try_acquire_cron_lock", {
        p_lock_key: `api-football:search:${key}`,
        p_owner_token: owner,
        p_ttl_seconds: 30,
      });
      if (error) throw new ServiceUnavailableException("Football search is unavailable");
      if (acquired) {
        try {
          // Recheck after acquiring the shared lease to avoid repeating an already completed page.
          cached = await read();
          const refresh =
            input.page === 1 && cached && Date.now() - Date.parse(cached.updated_at) > 300_000;
          if (
            !cached ||
            refresh ||
            (cached.has_more && cached.entity_ids.length < start + input.perPage)
          ) {
            if (start > (cached?.entity_ids.length ?? 0))
              throw new BadRequestException("Load the preceding search page first");
            const page = !cached || refresh ? 1 : cached.next_page;
            const path =
              kind === "player" ? "players/profiles" : kind === "team" ? "teams" : "leagues";
            const result = await this.provider.request(path, {
              search: input.query!,
              ...(kind === "player" ? { page } : {}),
            });
            const more =
              kind === "player" && (result.paging?.current ?? 1) < (result.paging?.total ?? 1);
            const saved = await client.rpc("store_football_catalog_page", {
              p_key: key,
              p_kind: kind,
              p_page: page,
              p_more: more,
              p_items: result.response,
            });
            if (saved.error)
              throw new ServiceUnavailableException("Football search could not be saved");
            cached = await read();
          }
        } finally {
          await client.rpc("release_cron_lock", {
            p_lock_key: `api-football:search:${key}`,
            p_owner_token: owner,
          });
        }
      }
    }
    if (!cached)
      throw new ServiceUnavailableException("Football search is refreshing; retry shortly");
    const ids = cached.entity_ids.slice(start, start + input.perPage);
    const items = await this.getMany(ids.map((entityId) => ({ entityId, entityType: kind })));
    return {
      data: ids.flatMap((id) => {
        const item = items.get(`${kind}:${id}`);
        return item ? [item] : [];
      }),
      hasMore: cached.has_more || cached.entity_ids.length > start + input.perPage,
      message: null,
    };
  }

  async get(kind: FootballCatalogEntityType, id: number): Promise<FootballCatalogItem> {
    const { data, error } = await this.supabase
      .getClient()
      .from(tables[kind])
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ServiceUnavailableException("Football catalog is unavailable");
    if (!data) throw new NotFoundException("Football entity not found");
    return this.map(kind, data);
  }
  async getMany(references: Array<{ entityId: number; entityType: FootballCatalogEntityType }>) {
    const output = new Map<string, FootballCatalogItem>();
    for (const kind of ["league", "team", "player"] as const) {
      const ids = [
        ...new Set(references.filter((r) => r.entityType === kind).map((r) => r.entityId)),
      ];
      if (!ids.length) continue;
      const { data, error } = await this.supabase
        .getClient()
        .from(tables[kind])
        .select("*")
        .in("id", ids);
      if (error) throw new ServiceUnavailableException("Football catalog is unavailable");
      for (const row of data ?? []) output.set(`${kind}:${row.id}`, this.map(kind, row));
    }
    return output;
  }
  private map(kind: FootballCatalogEntityType, row: Row) {
    return footballCatalogItemSchema.parse({
      entityType: kind,
      id: Number(row.id),
      imageUrl: row.image_url ?? null,
      ...(kind === "player"
        ? { displayName: row.display_name, dateOfBirth: row.date_of_birth ?? null }
        : { name: row.name, shortCode: row.short_code ?? null }),
      ...(kind === "team" ? { founded: row.founded ?? null } : {}),
      ...(kind === "league" ? { type: row.type ?? null } : {}),
    });
  }
}
