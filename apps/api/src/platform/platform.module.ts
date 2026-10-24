import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RuntimeCacheService } from "./cache/runtime-cache.service";
import { AiOutboxService } from "./queue/ai-outbox.service";
import { VercelQueuePublisher } from "./queue/vercel-queue.publisher";

@Module({
  exports: [AiOutboxService, RuntimeCacheService, VercelQueuePublisher],
  imports: [AuthModule],
  providers: [AiOutboxService, RuntimeCacheService, VercelQueuePublisher],
})
export class PlatformModule {}
