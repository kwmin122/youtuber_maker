import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { handleTestJob } from "./handlers/test-job";

export async function processJob(job: Job) {
  switch (job.name) {
    case "test":
      return handleTestJob(job, db);
    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}
