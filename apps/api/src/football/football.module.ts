import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { NotificationsModule } from "../notifications/notifications.module";
import {
  FootballCronController,
  FootballFixturesCronController,
  FootballOperationsController,
  FootballStandingsCronController,
} from "./football-cron.controller";
import { FootballCronService } from "./football-cron.service";
import { FootballComparisonCatalogService } from "./football-comparison-catalog.service";
import { FootballReadService } from "./football-read.service";
import { FootballExploreService } from "./football-explore.service";
import { FootballProviderEntityService } from "./football-provider-entity.service";
import { FootballLocalSyncService } from "./football-local-sync.service";
import { FootballSyncService } from "./football-sync.service";
import { FootballController } from "./football.controller";
import { ApiFootballService } from "./provider/api-football.service";

@Module({
  controllers: [
    FootballController,
    FootballCronController,
    FootballFixturesCronController,
    FootballOperationsController,
    FootballStandingsCronController,
  ],
  exports: [FootballProviderEntityService, FootballReadService, FootballSyncService],
  imports: [AuthModule, NotificationsModule, PlatformModule],
  providers: [
    FootballExploreService,
    FootballComparisonCatalogService,
    FootballReadService,
    FootballProviderEntityService,
    FootballSyncService,
    FootballLocalSyncService,
    FootballCronService,
    ApiFootballService,
  ],
})
export class FootballModule {}
