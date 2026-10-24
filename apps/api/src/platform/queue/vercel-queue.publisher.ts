import { Injectable } from "@nestjs/common";
import { queueJobSchemas, type QueueJobData, type QueueName } from "@goal-app/jobs";
import { send, type SendResult } from "@vercel/queue";
import { z } from "zod";

const maximumRetentionSeconds = 7 * 24 * 60 * 60;

const publishOptionsSchema = z
  .object({
    delaySeconds: z.number().int().min(0).max(maximumRetentionSeconds).optional(),
    idempotencyKey: z.string().min(1).max(256),
    retentionSeconds: z
      .number()
      .int()
      .min(60)
      .max(maximumRetentionSeconds)
      .default(24 * 60 * 60),
  })
  .refine(
    ({ delaySeconds = 0, retentionSeconds }) => delaySeconds <= retentionSeconds,
    "delaySeconds cannot exceed retentionSeconds",
  );

export type PublishOptions = z.input<typeof publishOptionsSchema>;

@Injectable()
export class VercelQueuePublisher {
  async publish<Name extends QueueName>(
    topic: Name,
    payload: QueueJobData[Name],
    options: PublishOptions,
  ): Promise<SendResult> {
    const parsedPayload = queueJobSchemas[topic].parse(payload) as QueueJobData[Name];
    const parsedOptions = publishOptionsSchema.parse(options);

    return send(topic, parsedPayload, parsedOptions);
  }
}
