import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Environment } from "../config/environment";

@Injectable()
export class SupabaseAdminService {
  private readonly client: SupabaseClient | null;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    const url = config.get("SUPABASE_URL", { infer: true });
    const elevatedKey = config.get("SUPABASE_SECRET_KEY", { infer: true });
    this.client =
      url && elevatedKey
        ? createClient(url, elevatedKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new ServiceUnavailableException("Authentication service is not configured");
    }
    return this.client;
  }
}
