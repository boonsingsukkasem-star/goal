import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getCache, type RuntimeCache } from "@vercel/functions";

import type { Environment } from "../../config/environment";

export interface RuntimeCacheSetOptions {
  name?: string;
  tags?: string[];
  ttl?: number;
}

@Injectable()
export class RuntimeCacheService {
  private readonly cache: RuntimeCache;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    this.cache = getCache({
      namespace: `goal:${config.get("APP_ENV", { infer: true })}:api`,
    });
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(key);
  }

  async expireTag(tags: string | string[]): Promise<void> {
    await this.cache.expireTag(tags);
  }

  async get<Value>(key: string): Promise<Value | null> {
    return (await this.cache.get(key)) as Value | null;
  }

  async set<Value>(key: string, value: Value, options?: RuntimeCacheSetOptions): Promise<void> {
    await this.cache.set(key, value, options);
  }
}
