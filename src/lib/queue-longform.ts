import { Queue } from "bullmq";

let longformQueue: Queue | null = null;

/**
 * Dedicated BullMQ queue for longform jobs (download / analyze / clip).
 * Separated from main-queue to prevent long-running clip jobs from starving
 * short v1 jobs and to allow independent concurrency tuning on Railway.
 */
export function getLongformQueue(): Queue {
  if (!longformQueue) {
    longformQueue = new Queue("longform-queue", {
      connection: {
        url: process.env.REDIS_URL,
        maxRetriesPerRequest: null,
      },
      defaultJobOptions: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return longformQueue;
}
