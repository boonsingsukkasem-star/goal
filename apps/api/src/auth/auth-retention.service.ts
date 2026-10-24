import { createHash, timingSafeEqual } from "node:crypto";

import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Environment } from "../config/environment";
import { SupabaseAdminService } from "./supabase-admin.service";

function secureStringEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

@Injectable()
export class AuthRetentionService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
  ) {}

  async run(authorization?: string): Promise<unknown> {
    const secret = this.config.get("CRON_SECRET", { infer: true });
    if (!secret || !authorization || !secureStringEqual(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException("Invalid cron authorization");
    }

    const scheduledFor = new Date();
    scheduledFor.setUTCHours(0, 0, 0, 0);
    const { data, error } = await this.supabase
      .getClient()
      .rpc("run_auth_retention", { p_scheduled_for: scheduledFor.toISOString() });
    if (error) throw new ServiceUnavailableException("Auth retention cleanup is unavailable");
    if (data && typeof data === "object" && "status" in data && data.status === "failed") {
      throw new ServiceUnavailableException("Auth retention cleanup failed");
    }
    return data;
  }
}
