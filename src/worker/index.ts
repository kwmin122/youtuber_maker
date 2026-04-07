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

process.on("SIGTERM", async () => {
  console.log("[Worker] Shutting down...");
  await worker.close();
  process.exit(0);
});

console.log("[Worker] Starting main-queue worker...");
