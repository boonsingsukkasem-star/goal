import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Environment } from "../config/environment";

@Injectable()
export class SupabasePublicService {
  private readonly client: SupabaseClient | null;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    const url = config.get("SUPABASE_URL", { infer: true });
    const publishableKey = config.get("SUPABASE_PUBLISHABLE_KEY", { infer: true });
    this.client =
      url && publishableKey
        ? createClient(url, publishableKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new ServiceUnavailableException("Public football data service is not configured");
    }
    return this.client;
  }
}
