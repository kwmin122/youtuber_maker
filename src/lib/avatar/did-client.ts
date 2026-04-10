import type {
  AvatarLipsyncProvider,
  AvatarLipsyncSubmitRequest,
  AvatarLipsyncTask,
  AvatarLibraryEntry,
} from "./provider";

const DID_API_BASE = "https://api.d-id.com";

export interface DIDClientConfig {
  apiKey: string;
  useStub?: boolean;
}

export class DIDClient implements AvatarLipsyncProvider {
  readonly name = "did" as const;
  private authHeader: string;
  private useStub: boolean;

  constructor(config: DIDClientConfig) {
    this.authHeader = `Basic ${Buffer.from(`${config.apiKey}:`).toString("base64")}`;
    this.useStub = config.useStub ?? !config.apiKey;
  }

  async listAvatars(): Promise<AvatarLibraryEntry[]> {
    if (this.useStub) return didStubLibrary();
    const res = await fetch(`${DID_API_BASE}/clips/presenters?limit=100`, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new Error(`D-ID listAvatars failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      presenters: Array<{
        presenter_id: string;
        name?: string;
        gender?: string;
        image_url: string;
      }>;
    };
    return data.presenters.map((p) => ({
      providerAvatarId: p.presenter_id,
      previewImageUrl: p.image_url,
      gender: p.gender === "male" ? "male" : p.gender === "female" ? "female" : "neutral",
      ageGroup: "adult",
      style: "realistic",
    }));
  }

  async generateLipsyncJob(req: AvatarLipsyncSubmitRequest): Promise<string> {
    if (this.useStub) return `stub-did-${Date.now()}`;
    // D-ID requires an image URL. For curated presets we store the
    // image_url in avatar_presets.previewImageUrl; Plan 08-04 passes
    // that through as referenceImageUrl for D-ID requests. For user
    // uploads we pass the signed URL of the reference photo directly.
    const sourceUrl = req.referenceImageUrl;
    if (!sourceUrl) {
      throw new Error("D-ID: referenceImageUrl required (use preset previewImageUrl or uploaded photo)");
    }
    const body = {
      source_url: sourceUrl,
      script: { type: "audio", audio_url: req.audioUrl },
      config: { result_format: "mp4" },
    };
    const res = await fetch(`${DID_API_BASE}/talks`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`D-ID generate failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async pollJobStatus(taskId: string): Promise<AvatarLipsyncTask> {
    if (this.useStub) {
      return { taskId, status: "completed", videoUrl: `https://placeholder.example.com/did-${taskId}.mp4` };
    }
    const res = await fetch(`${DID_API_BASE}/talks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new Error(`D-ID poll failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      id: string;
      status: string;
      result_url?: string;
      error?: { description?: string };
    };
    return {
      taskId,
      status: mapDidStatus(data.status),
      videoUrl: data.result_url,
      errorMessage: data.error?.description,
    };
  }

  async waitForCompletion(
    taskId: string,
    opts: { maxAttempts?: number; intervalMs?: number } = {}
  ): Promise<AvatarLipsyncTask> {
    const maxAttempts = opts.maxAttempts ?? 60;
    const intervalMs = opts.intervalMs ?? 5_000;
    for (let i = 0; i < maxAttempts; i++) {
      const task = await this.pollJobStatus(taskId);
      if (task.status === "completed" || task.status === "failed") return task;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { taskId, status: "failed", errorMessage: `D-ID polling timeout after ${maxAttempts} attempts` };
  }
}

function mapDidStatus(s: string): AvatarLipsyncTask["status"] {
  switch (s) {
    case "created":
      return "submitted";
    case "started":
      return "processing";
    case "done":
      return "completed";
    case "error":
    case "rejected":
      return "failed";
    default:
      return "processing";
  }
}

function didStubLibrary(): AvatarLibraryEntry[] {
  return [
    {
      providerAvatarId: "stub-did-p01",
      previewImageUrl: "https://placeholder.example.com/did-p01.png",
      gender: "female",
      ageGroup: "adult",
      style: "realistic",
    },
  ];
}
