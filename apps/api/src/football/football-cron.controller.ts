import { Body, Controller, Get, Headers, Inject, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { FootballCronService } from "./football-cron.service";

@ApiExcludeController()
@Controller({ path: "internal/cron/football-live", version: "1" })
export class FootballCronController {
  constructor(@Inject(FootballCronService) private readonly cron: FootballCronService) {}

  @Get()
  run(@Headers("authorization") authorization?: string) {
    return this.cron.enqueueLiveSync(authorization);
  }
}

@ApiExcludeController()
@Controller({ path: "internal/cron/football-fixtures", version: "1" })
export class FootballFixturesCronController {
  constructor(@Inject(FootballCronService) private readonly cron: FootballCronService) {}

  @Get()
  run(@Headers("authorization") authorization?: string) {
    return this.cron.enqueueDailyFixtureWindow(authorization);
  }
}

@ApiExcludeController()
@Controller({ path: "internal/cron/football-standings", version: "1" })
export class FootballStandingsCronController {
  constructor(@Inject(FootballCronService) private readonly cron: FootballCronService) {}

  @Get()
  run(@Headers("authorization") authorization?: string) {
    return this.cron.enqueueCurrentStandings(authorization);
  }
}

@ApiExcludeController()
@Controller({ path: "internal/football", version: "1" })
export class FootballOperationsController {
  constructor(@Inject(FootballCronService) private readonly cron: FootballCronService) {}

  @Post("sync-window")
  enqueueWindow(
    @Body() body: { endDate?: string; startDate?: string },
    @Headers("authorization") authorization?: string,
  ) {
    return this.cron.enqueueFixtureWindow(body.startDate ?? "", body.endDate ?? "", authorization);
  }
}
