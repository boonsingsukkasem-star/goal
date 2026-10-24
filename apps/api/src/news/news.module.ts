import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { FootballModule } from "../football/football.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PlatformModule } from "../platform/platform.module";
import { NewsCronController } from "./news-cron.controller";
import { NewsCronService } from "./news-cron.service";
import { NewsIngestionService } from "./news-ingestion.service";
import { NewsController } from "./news.controller";
import { NewsService } from "./news.service";
import { OpenAiNewsService } from "./openai-news.service";

@Module({
  controllers: [NewsController, NewsCronController],
  exports: [NewsIngestionService, NewsService],
  imports: [AuthModule, FootballModule, NotificationsModule, PlatformModule],
  providers: [NewsService, NewsCronService, NewsIngestionService, OpenAiNewsService],
})
export class NewsModule {}
