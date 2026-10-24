import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { configureApplication, nestApplicationOptions } from "./app-factory";
import type { Environment } from "./config/environment";
import { FootballLocalSyncService } from "./football/football-local-sync.service";

async function bootstrap() {
  const app = configureApplication(await NestFactory.create(AppModule, nestApplicationOptions));
  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  app.enableShutdownHooks();
  await app.listen(config.get("PORT", { infer: true }), "0.0.0.0");
  app.get(FootballLocalSyncService).start();
}

void bootstrap();
