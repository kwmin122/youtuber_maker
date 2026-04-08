import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { handleTestJob } from "./handlers/test-job";
import { handleTranscriptCollect } from "./handlers/transcript-collect";
import { handleAnalyzeBenchmark } from "./handlers/analyze-benchmark";
import { handleGenerateScript } from "./handlers/generate-script";
import { handleSplitScenes } from "./handlers/split-scenes";
import { handleGenerateImage } from "./handlers/generate-image";
import { handleGenerateVideo } from "./handlers/generate-video";

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
    case "split-scenes":
      return handleSplitScenes(job, db);
    case "generate-image":
      return handleGenerateImage(job, db);
    case "generate-video":
      return handleGenerateVideo(job, db);
    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}
