import type { VideoGenerationRequest, VideoGenerationTask } from "./types";

const KLING_API_BASE = "https://api.klingai.com/v1";

export interface KlingClientConfig {
  apiKey: string;
  /** If true, use stub/mock instead of real API (for development) */
  useStub?: boolean;
}

/**
 * Kling 3.0 API client for AI video generation.
 * Supports image-to-video and text-to-video modes.
 * Uses async polling: submit task -> poll until complete.
 */
export class KlingClient {
  private apiKey: string;
  private useStub: boolean;

  constructor(config: KlingClientConfig) {
    this.apiKey = config.apiKey;
    this.useStub = config.useStub ?? false;
  }

  /**
   * Submit a video generation task.
   * Returns a task ID for polling.
   */
  async submitTask(request: VideoGenerationRequest): Promise<string> {
    if (this.useStub) {
      return this.stubSubmitTask(request);
    }

    const body: Record<string, unknown> = {
      prompt: request.prompt,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      model: "kling-v3",
    };

    if (request.imageUrl) {
      body.image_url = request.imageUrl;
      body.mode = "image-to-video";
    } else {
      body.mode = "text-to-video";
    }

    const response = await fetch(`${KLING_API_BASE}/videos/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kling API submit failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { task_id: string };
    return data.task_id;
  }

  /**
   * Poll a task for completion.
   * Returns the current task status.
   */
  async pollTask(taskId: string): Promise<VideoGenerationTask> {
    if (this.useStub) {
      return this.stubPollTask(taskId);
    }

    const response = await fetch(
      `${KLING_API_BASE}/videos/generations/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kling API poll failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      task_id: string;
      status: string;
      video_url?: string;
      error?: string;
    };

    return {
      taskId: data.task_id,
      status: this.mapKlingStatus(data.status),
      videoUrl: data.video_url,
      errorMessage: data.error,
    };
  }

  /**
   * Wait for task completion with polling loop.
   * @param taskId - Task ID to poll
   * @param maxAttempts - Maximum poll attempts (default: 60)
   * @param intervalMs - Polling interval in ms (default: 10000 = 10s)
   */
  async waitForCompletion(
    taskId: string,
    maxAttempts = 60,
    intervalMs = 10_000
  ): Promise<VideoGenerationTask> {
    for (let i = 0; i < maxAttempts; i++) {
      const task = await this.pollTask(taskId);

      if (task.status === "completed" || task.status === "failed") {
        return task;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return {
      taskId,
      status: "failed",
      errorMessage: `Polling timeout after ${maxAttempts} attempts`,
    };
  }

  // ---------- Stub Methods (development/testing) ----------

  private stubSubmitTask(_request: VideoGenerationRequest): string {
    return `stub-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private stubPollTask(taskId: string): VideoGenerationTask {
    // Stub always returns completed with a placeholder
    return {
      taskId,
      status: "completed",
      videoUrl: `https://placeholder.example.com/stub-video-${taskId}.mp4`,
    };
  }

  private mapKlingStatus(
    status: string
  ): VideoGenerationTask["status"] {
    switch (status) {
      case "submitted":
      case "queued":
        return "submitted";
      case "processing":
      case "running":
        return "processing";
      case "completed":
      case "success":
        return "completed";
      case "failed":
      case "error":
        return "failed";
      default:
        return "processing";
    }
  }
}

/**
 * Create a Kling client. Uses stub mode when KLING_API_KEY is not set
 * or when explicitly requested.
 */
export function createKlingClient(
  apiKey: string | undefined
): KlingClient {
  if (!apiKey) {
    return new KlingClient({ apiKey: "", useStub: true });
  }
  return new KlingClient({ apiKey, useStub: false });
}
