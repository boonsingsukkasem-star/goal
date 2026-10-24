import { z } from "zod";

const booleanFromEnvironment = z.enum(["true", "false"]).transform((value) => value === "true");
const environmentSchema = z
  .object({
    APP_ENV: z.enum(["nonprod", "prod"]).default("nonprod"),
    APP_VERSION: z.string().default("0.1.0"),
    BODY_LIMIT: z
      .string()
      .regex(/^\d+(?:kb|mb)$/i)
      .default("1mb"),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:3000,http://127.0.0.1:3000")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
          // Vercel's VERCEL_URL is a hostname without a scheme. Treat bare
          // hostnames in CORS_ORIGINS as HTTPS origins for production deploys.
          .map((origin) =>
            !origin.includes("://") && /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?$/i.test(origin)
              ? `https://${origin}`
              : origin,
          ),
      )
      .pipe(z.array(z.url()).min(1)),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    PORT: z.coerce.number().int().positive().default(4000),
    SUPABASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
    SUPABASE_PUBLISHABLE_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(20).optional(),
    ),
    SUPABASE_SECRET_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(20).optional(),
    ),
    API_FOOTBALL_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(16).optional(),
    ),
    API_FOOTBALL_LEAGUE_IDS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .map(Number),
      )
      .pipe(z.array(z.number().int().positive())),
    FOOTBALL_LIVE_INTERVAL_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
    FOOTBALL_DETAIL_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(20),
    FOOTBALL_LOCAL_AUTO_SYNC: booleanFromEnvironment.default(true),
    API_FOOTBALL_BASE_URL: z.url().default("https://v3.football.api-sports.io"),
    API_FOOTBALL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
    OPENAI_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(20).optional(),
    ),
    OPENAI_MODEL: z.string().min(1).default("gpt-5.6-sol"),
    OPENAI_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300000).default(120000),
    NEWS_ALLOWED_DOMAINS: z
      .string()
      .default(
        "bbc.com,skysports.com,reuters.com,apnews.com,espn.com,fifa.com,uefa.com,premierleague.com",
      )
      .transform((value) => [
        ...new Set(
          value
            .split(",")
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean),
        ),
      ])
      .pipe(
        z
          .array(z.string().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/))
          .min(1)
          .max(100),
      ),
    NEWS_GLOBAL_TOPICS: z
      .string()
      .default("football breaking news,football injuries,football transfers")
      .transform((value) => [
        ...new Set(
          value
            .split(",")
            .map((topic) => topic.trim())
            .filter(Boolean),
        ),
      ])
      .pipe(z.array(z.string().min(3).max(160)).min(1).max(10)),
    NEWS_INGESTION_LANGUAGES: z
      .string()
      .default("th,en")
      .transform((value) =>
        value
          .split(",")
          .map((language) => language.trim())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(z.enum(["th", "en"]))
          .min(1)
          .max(2),
      ),
    NEWS_MAX_TOPICS_PER_RUN: z.coerce.number().int().min(1).max(50).default(25),
    NEWS_SYSTEM_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),
    AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
    AI_SYSTEM_DAILY_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
    AI_AUTO_LEAGUE_IDS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map(Number),
      )
      .pipe(z.array(z.number().int().positive())),
    EXPO_PUSH_ACCESS_TOKEN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(20).optional(),
    ),
    EXPO_PUSH_BASE_URL: z.url().default("https://exp.host/--/api/v2"),
    EXPO_PUSH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
    APPLE_CLIENT_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(3).optional(),
    ),
    APPLE_TEAM_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(3).optional(),
    ),
    APPLE_KEY_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(3).optional(),
    ),
    APPLE_PRIVATE_KEY_BASE64: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    CRON_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(16).optional(),
    ),
    SWAGGER_ENABLED: booleanFromEnvironment.optional(),
    TRUST_PROXY: booleanFromEnvironment.default(false),
  })
  .superRefine((config, context) => {
    if (config.APP_ENV === "prod") {
      if (!config.CRON_SECRET) {
        context.addIssue({
          code: "custom",
          message: "Production requires CRON_SECRET for Vercel Cron endpoints",
          path: ["CRON_SECRET"],
        });
      }
      for (const key of [
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY",
        "API_FOOTBALL_API_KEY",
        "OPENAI_API_KEY",
      ] as const) {
        if (!config[key]) {
          context.addIssue({
            code: "custom",
            message: `Production requires ${key}`,
            path: [key],
          });
        }
      }

      if (
        config.SUPABASE_PUBLISHABLE_KEY &&
        !config.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")
      ) {
        context.addIssue({
          code: "custom",
          message: "Production SUPABASE_PUBLISHABLE_KEY must use the sb_publishable_ format",
          path: ["SUPABASE_PUBLISHABLE_KEY"],
        });
      }

      if (config.SUPABASE_SECRET_KEY && !config.SUPABASE_SECRET_KEY.startsWith("sb_secret_")) {
        context.addIssue({
          code: "custom",
          message: "Production SUPABASE_SECRET_KEY must use the sb_secret_ format",
          path: ["SUPABASE_SECRET_KEY"],
        });
      }

      if (config.CORS_ORIGINS.some((origin) => new URL(origin).hostname === "localhost")) {
        context.addIssue({
          code: "custom",
          message: "Production CORS origins cannot contain localhost",
          path: ["CORS_ORIGINS"],
        });
      }
    }
  })
  .transform((config) => ({
    ...config,
    SWAGGER_ENABLED: config.SWAGGER_ENABLED ?? config.APP_ENV !== "prod",
  }));

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): Environment {
  return environmentSchema.parse(config);
}
