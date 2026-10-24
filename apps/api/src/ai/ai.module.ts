import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { FootballModule } from "../football/football.module";
import { PlatformModule } from "../platform/platform.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AiAnalysisService } from "./ai-analysis.service";
import { AiController } from "./ai.controller";
import { AiCompareController } from "./ai-compare.controller";
import { AiOutboxController } from "./ai-outbox.controller";
import { OpenAiFootballService } from "./openai-football.service";

@Module({
  controllers: [AiController, AiCompareController, AiOutboxController],
  exports: [AiAnalysisService],
  imports: [AuthModule, FootballModule, NotificationsModule, PlatformModule],
  providers: [AiAnalysisService, OpenAiFootballService],
})
export class AiModule {}
