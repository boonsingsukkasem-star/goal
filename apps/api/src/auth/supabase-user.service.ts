import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Environment } from "../config/environment";
import type { AuthPrincipal } from "./auth-principal";

@Injectable()
export class SupabaseUserService {
  private readonly publishableKey: string | null;
  private readonly url: string | null;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    this.url = config.get("SUPABASE_URL", { infer: true }) ?? null;
    this.publishableKey = config.get("SUPABASE_PUBLISHABLE_KEY", { infer: true }) ?? null;
  }

  getClient(principal: AuthPrincipal): SupabaseClient {
    if (!this.url || !this.publishableKey) {
      throw new ServiceUnavailableException("User data service is not configured");
    }

    return createClient(this.url, this.publishableKey, {
      accessToken: async () => principal.accessToken,
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}
