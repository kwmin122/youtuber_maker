import { Worker } from "bullmq";
import { connection } from "./connection";
import { processJob } from "./processor";

const worker = new Worker("main-queue", processJob, {
  connection,
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
});

worker.on("completed", (job) =>
  console.log(`[Worker] Job ${job.id} completed`)
);
worker.on("failed", (job, err) =>
  console.error(`[Worker] Job ${job?.id} failed:`, err)
);
worker.on("ready", () =>
  console.log("[Worker] Ready and listening for jobs")
);

const longformWorker = new Worker("longform-queue", processJob, {
  connection,
  concurrency: 2, // longform jobs are heavy; keep parallelism low
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
});

longformWorker.on("completed", (job) =>
  console.log(`[LongformWorker] Job ${job.id} completed`)
);
longformWorker.on("failed", (job, err) =>
  console.error(`[LongformWorker] Job ${job?.id} failed:`, err)
);
longformWorker.on("ready", () =>
  console.log("[LongformWorker] Ready and listening for longform jobs")
);

process.on("SIGTERM", async () => {
  console.log("[Worker] Shutting down...");
  await Promise.all([worker.close(), longformWorker.close()]);
  process.exit(0);
});

console.log("[Worker] Starting main-queue worker...");
console.log("[Worker] Starting longform-queue worker...");
