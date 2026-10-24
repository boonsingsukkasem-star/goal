import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { newsIngestionJobSchema } from "@goal-app/jobs";
import { QueueClient } from "@vercel/queue";

import { createApplication } from "../src/app-factory";
import { NewsIngestionService } from "../src/news/news-ingestion.service";

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
    const service = application.get(NewsIngestionService);
    const parsed = newsIngestionJobSchema.safeParse(payload);
    if (!parsed.success) {
      await service.recordDeadLetter(payload, metadata, parsed.error);
      return;
    }
    try {
      await service.process(parsed.data, metadata);
    } catch (error) {
      if (metadata.deliveryCount < 8) throw error;
      await service.recordDeadLetter(payload, metadata, error);
    }
  },
  {
    retry: (_error, metadata) => ({
      afterSeconds: Math.min(1800, 2 ** metadata.deliveryCount * 30),
    }),
    visibilityTimeoutSeconds: 360,
  },
);
