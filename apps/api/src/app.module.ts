import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { AuthModule } from "./auth/auth.module";
import { validateEnvironment } from "./config/environment";
import { HealthController } from "./health/health.controller";
import { FootballModule } from "./football/football.module";
import { ReadinessService } from "./health/readiness.service";
import { PlatformModule } from "./platform/platform.module";
import { AiModule } from "./ai/ai.module";
import { CommunityModule } from "./community/community.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { NewsModule } from "./news/news.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      expandVariables: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AuthModule,
    AiModule,
    CommunityModule,
    FootballModule,
    NotificationsModule,
    NewsModule,
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
