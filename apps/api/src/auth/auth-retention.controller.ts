import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { AuthRetentionService } from "./auth-retention.service";

@ApiExcludeController()
@Controller({ path: "internal/cron/auth-retention", version: "1" })
export class AuthRetentionController {
  constructor(@Inject(AuthRetentionService) private readonly retention: AuthRetentionService) {}

  @Get()
  run(@Headers("authorization") authorization?: string): Promise<unknown> {
    return this.retention.run(authorization);
  }
}
