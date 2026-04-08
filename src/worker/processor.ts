import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { handleTestJob } from "./handlers/test-job";
import { handleTranscriptCollect } from "./handlers/transcript-collect";
import { handleAnalyzeBenchmark } from "./handlers/analyze-benchmark";
import { handleGenerateScript } from "./handlers/generate-script";

export async function processJob(job: Job) {
  switch (job.name) {
    case "test":
      return handleTestJob(job, db);
    case "transcript-collect":
      return handleTranscriptCollect(job, db);
    case "analyze-benchmark":
      return handleAnalyzeBenchmark(job, db);
    case "generate-script":
      return handleGenerateScript(job, db);
    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}
