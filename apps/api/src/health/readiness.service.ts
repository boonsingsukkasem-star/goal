import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import { SupabaseAdminService } from "../auth/supabase-admin.service";

@Injectable()
export class ReadinessService {
  constructor(@Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService) {}

  async assertReady(): Promise<void> {
    if (!this.supabase.isConfigured) return;

    const client = this.supabase.getClient();
    const { error } = await client
      .from("profiles")
      .select("user_id", { count: "exact", head: true });
    if (error) {
      throw new ServiceUnavailableException("Database dependency is unavailable");
    }

    const { data: liveFixtures, error: freshnessError } = await client
      .from("football_fixtures")
      .select("updated_at")
      .eq("is_live", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (freshnessError) {
      throw new ServiceUnavailableException("Football freshness dependency is unavailable");
    }
    const latest = liveFixtures?.[0]?.updated_at;
    if (latest && Date.now() - new Date(latest).getTime() > 60_000) {
      throw new ServiceUnavailableException("Live football data is stale");
    }
  }
}
