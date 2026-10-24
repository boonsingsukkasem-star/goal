import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { notificationJobSchema } from "@goal-app/jobs";
import { QueueClient } from "@vercel/queue";

import { createApplication } from "../src/app-factory";
import { NotificationsService } from "../src/notifications/notifications.service";

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
    const service = application.get(NotificationsService);
    const parsed = notificationJobSchema.safeParse(payload);
    if (!parsed.success) {
      await service.recordDeadLetter(payload, metadata, parsed.error);
      return;
    }
    try {
      await service.process(parsed.data);
    } catch (cause) {
      if (metadata.deliveryCount < 8) throw cause;
      await service.recordDeadLetter(payload, metadata, cause);
    }
  },
  {
    retry: (_error, metadata) => ({
      afterSeconds: Math.min(900, 2 ** metadata.deliveryCount * 15),
    }),
    visibilityTimeoutSeconds: 180,
  },
);
