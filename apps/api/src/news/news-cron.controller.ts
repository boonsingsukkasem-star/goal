import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { NewsCronService } from "./news-cron.service";

@ApiExcludeController()
@Controller({ path: "internal/cron/news", version: "1" })
export class NewsCronController {
  constructor(@Inject(NewsCronService) private readonly cron: NewsCronService) {}

  @Get()
  run(@Headers("authorization") authorization?: string) {
    return this.cron.enqueue(authorization);
  }
}
