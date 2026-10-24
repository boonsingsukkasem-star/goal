import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { footballSyncJobSchema } from "@goal-app/jobs";
import { QueueClient } from "@vercel/queue";

import { createApplication } from "../src/app-factory";
import { FootballSyncService } from "../src/football/football-sync.service";
import { ApiFootballRequestError } from "../src/football/provider/api-football.service";

let applicationPromise: Promise<INestApplication> | undefined;

async function getApplication(): Promise<INestApplication> {
  applicationPromise ??= createApplication().then(async (application) => {
    await application.init();
    return application;
  });
  return applicationPromise;
}

const queue = new QueueClient();

export default queue.handleNodeCallback(
  async (payload, metadata) => {
    const application = await getApplication();
    const sync = application.get(FootballSyncService);
    const parsed = footballSyncJobSchema.safeParse(payload);
    if (!parsed.success) {
      await sync.recordInvalidPayload(payload, metadata, parsed.error);
      return;
    }
    await sync.process(parsed.data, metadata);
  },
  {
    retry: (error, metadata) => {
      if (error instanceof ApiFootballRequestError && error.retryAfterSeconds) {
        return { afterSeconds: Math.min(error.retryAfterSeconds, 900) };
      }
      return { afterSeconds: Math.min(900, 2 ** metadata.deliveryCount * 15) };
    },
    visibilityTimeoutSeconds: 360,
  },
);
