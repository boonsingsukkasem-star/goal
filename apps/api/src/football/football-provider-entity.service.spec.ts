import { describe, expect, it, vi } from "vitest";
import { FootballProviderEntityService } from "./football-provider-entity.service";

describe("API-Football search pagination", () => {
  it("retains a complete upstream page and serves later app pages without another provider request", async () => {
    let cached: unknown = null;
    const rows = new Map<number, Record<string, unknown>>();
    const response = Array.from({ length: 89 }, (_, index) => ({
      player: { id: index + 1, name: `Player ${index + 1}` },
    }));
    const request = vi.fn().mockResolvedValue({ response, paging: { current: 1, total: 1 } });
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "store_football_catalog_page") {
        const ids = (args.p_items as typeof response).map(({ player }) => {
          const id = 1000 + player.id;
          rows.set(id, { id, display_name: player.name, image_url: null, date_of_birth: null });
          return id;
        });
        cached = {
          entity_ids: ids,
          next_page: 2,
          has_more: false,
          updated_at: new Date().toISOString(),
        };
      }
      return { data: true, error: null };
    });
    const from = vi.fn((table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: cached, error: null }),
        in: async (_key: string, ids: number[]) => ({
          data: table === "football_players" ? ids.map((id) => rows.get(id)) : [],
          error: null,
        }),
      };
      return q;
    });
    const service = new FootballProviderEntityService(
      { getClient: () => ({ from, rpc }) } as never,
      { request } as never,
    );
    const first = await service.list("player", { page: 1, perPage: 20, query: "Player" });
    const second = await service.list("player", { page: 2, perPage: 20, query: "Player" });
    const last = await service.list("player", { page: 5, perPage: 20, query: "Player" });
    expect(first.data.map((row) => row.id)).toEqual(Array.from({ length: 20 }, (_, i) => 1001 + i));
    expect(second.data[0]?.id).toBe(1021);
    expect(last.data).toHaveLength(9);
    expect(last.hasMore).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "store_football_catalog_page",
      expect.objectContaining({ p_items: response }),
    );
  });
});
