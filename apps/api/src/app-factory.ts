import {
  ConsoleLogger,
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/http/api-exception.filter";
import { HttpLoggingInterceptor } from "./common/http/http-logging.interceptor";
import { contractOpenApiSchemas } from "./common/openapi/contract-schemas";
import type { Environment } from "./config/environment";

const logLevels = {
  debug: ["fatal", "error", "warn", "log", "debug"],
  error: ["fatal", "error"],
  info: ["fatal", "error", "warn", "log"],
  warn: ["fatal", "error", "warn"],
} as const;

export function createOpenApiDocument(app: INestApplication, version: string) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Goal API")
    .setDescription("Football data, AI companion, community, news, and notifications API")
    .setVersion(version)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  document.openapi = "3.1.0";
  document.components ??= {};
  document.components.schemas = {
    ...(document.components.schemas ?? {}),
    ...contractOpenApiSchemas,
  };
  return document;
}

export const nestApplicationOptions = {
  abortOnError: false,
  bodyParser: false,
  bufferLogs: true,
} as const;

export function configureApplication(app: INestApplication): INestApplication {
  const config = app.get<ConfigService<Environment, true>>(ConfigService);

  app.useLogger(
    new ConsoleLogger({
      colors: config.get("APP_ENV", { infer: true }) === "nonprod",
      compact: true,
      json: true,
      logLevels: [...logLevels[config.get("LOG_LEVEL", { infer: true })]],
    }),
  );

  if (config.get("TRUST_PROXY", { infer: true })) {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(json({ limit: config.get("BODY_LIMIT", { infer: true }) }));
  app.use(urlencoded({ extended: true, limit: config.get("BODY_LIMIT", { infer: true }) }));
  app.enableCors({
    credentials: true,
    origin: config.get("CORS_ORIGINS", { infer: true }),
  });
  app.enableShutdownHooks();
  app.enableVersioning({ defaultVersion: "1", type: VersioningType.URI });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new HttpLoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  if (config.get("SWAGGER_ENABLED", { infer: true })) {
    SwaggerModule.setup(
      "docs",
      app,
      createOpenApiDocument(app, config.get("APP_VERSION", { infer: true })),
    );
  }

  return app;
}

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, nestApplicationOptions);
  return configureApplication(app);
}
