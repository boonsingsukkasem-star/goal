import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { AiOutboxService } from "../platform/queue/ai-outbox.service";

@ApiExcludeController()
@Controller({ path: "internal/cron/ai-outbox", version: "1" })
export class AiOutboxController {
  constructor(@Inject(AiOutboxService) private readonly outbox: AiOutboxService) {}

  @Get()
  run(@Headers("authorization") authorization?: string) {
    return this.outbox.dispatchCron(authorization);
  }
}
