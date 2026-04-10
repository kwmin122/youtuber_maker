import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { handleTestJob } from "./handlers/test-job";
import { handleTranscriptCollect } from "./handlers/transcript-collect";
import { handleAnalyzeBenchmark } from "./handlers/analyze-benchmark";
import { handleGenerateScript } from "./handlers/generate-script";
import { handleSplitScenes } from "./handlers/split-scenes";
import { handleGenerateImage } from "./handlers/generate-image";
import { handleGenerateVideo } from "./handlers/generate-video";
import { handleGenerateTTS } from "./handlers/generate-tts";
import { handleExportVideo } from "./handlers/export-video";
import { handleUploadYouTube } from "./handlers/upload-youtube";
import { handleGenerateSEO } from "./handlers/generate-seo";
import { handleGenerateThumbnail } from "./handlers/generate-thumbnail";
import { handleFetchMetrics } from "./handlers/fetch-metrics";
import { handleLongformDownload } from "./handlers/longform-download";
import { handleLongformAnalyze } from "./handlers/longform-analyze";
import { handleLongformClip } from "./handlers/longform-clip";

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
    case "generate-tts":
      return handleGenerateTTS(job, db);
    case "export-video":
      return handleExportVideo(job, db);
    case "upload-youtube":
      return handleUploadYouTube(job, db);
    case "generate-seo":
      return handleGenerateSEO(job, db);
    case "generate-thumbnail":
      return handleGenerateThumbnail(job, db);
    case "fetch-metrics":
      return handleFetchMetrics(job, db);
    case "longform-download":
      return handleLongformDownload(job, db);
    case "longform-analyze":
      return handleLongformAnalyze(job, db);
    case "longform-clip":
      return handleLongformClip(job, db);
    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}
