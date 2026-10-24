import "reflect-metadata";

import { ConfigService } from "@nestjs/config";

import { createApplication } from "./app-factory";
import { FootballLocalSyncService } from "./football/football-local-sync.service";
import type { Environment } from "./config/environment";

async function bootstrap() {
  const app = await createApplication();
  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  app.enableShutdownHooks();
  await app.listen(config.get("PORT", { infer: true }), "0.0.0.0");
  app.get(FootballLocalSyncService).start();
}

void bootstrap();
