import { Queue } from "bullmq";

let queue: Queue | null = null;

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue("main-queue", {
      connection: {
        url: process.env.REDIS_URL,
        maxRetriesPerRequest: null,
      },
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      },
    });
  }
  return queue;
}
