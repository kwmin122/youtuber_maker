import type {
  AvatarLipsyncProvider,
  AvatarLipsyncSubmitRequest,
  AvatarLipsyncTask,
  AvatarLibraryEntry,
} from "./provider";

const HEYGEN_API_BASE = "https://api.heygen.com";

export interface HeyGenClientConfig {
  apiKey: string;
  useStub?: boolean;
}

export class HeyGenClient implements AvatarLipsyncProvider {
  readonly name = "heygen" as const;
  private apiKey: string;
  private useStub: boolean;

  constructor(config: HeyGenClientConfig) {
    this.apiKey = config.apiKey;
    this.useStub = config.useStub ?? !config.apiKey;
  }

  async listAvatars(): Promise<AvatarLibraryEntry[]> {
    if (this.useStub) return stubLibrary();
    const res = await fetch(`${HEYGEN_API_BASE}/v2/avatars`, {
      headers: { "X-Api-Key": this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`HeyGen listAvatars failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      data: {
        avatars: Array<{
          avatar_id: string;
          avatar_name?: string;
          preview_image_url: string;
          gender?: string;
          age_group?: string;
          style?: string;
          default_voice_id?: string;
        }>;
      };
    };
    return data.data.avatars.map((a) => ({
      providerAvatarId: a.avatar_id,
      previewImageUrl: a.preview_image_url,
      gender: mapGender(a.gender),
      ageGroup: mapAge(a.age_group),
      style: mapStyle(a.style),
      voiceIdHint: a.default_voice_id,
    }));
  }

  async generateLipsyncJob(req: AvatarLipsyncSubmitRequest): Promise<string> {
    if (this.useStub) return `stub-heygen-${Date.now()}`;
    if (!req.avatarId && !req.referenceImageUrl) {
      throw new Error("HeyGen: avatarId or referenceImageUrl required");
    }
    const body = {
      video_inputs: [
        {
          character: req.avatarId
            ? { type: "avatar", avatar_id: req.avatarId, avatar_style: "normal" }
            : { type: "talking_photo", talking_photo_url: req.referenceImageUrl },
          voice: { type: "audio", audio_url: req.audioUrl },
        },
      ],
      dimension: {
        width: req.width ?? 1080,
        height: req.height ?? 1920,
      },
    };
    const res = await fetch(`${HEYGEN_API_BASE}/v2/video/generate`, {
      method: "POST",
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`HeyGen generate failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { data: { video_id: string } };
    return data.data.video_id;
  }

  async pollJobStatus(taskId: string): Promise<AvatarLipsyncTask> {
    if (this.useStub) {
      return { taskId, status: "completed", videoUrl: `https://placeholder.example.com/heygen-${taskId}.mp4` };
    }
    const res = await fetch(
      `${HEYGEN_API_BASE}/v1/video_status.get?video_id=${encodeURIComponent(taskId)}`,
      { headers: { "X-Api-Key": this.apiKey } }
    );
    if (!res.ok) {
      throw new Error(`HeyGen poll failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      data: { status: string; video_url?: string; error?: { detail?: string } };
    };
    return {
      taskId,
      status: mapHeyGenStatus(data.data.status),
      videoUrl: data.data.video_url,
      errorMessage: data.data.error?.detail,
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
    return { taskId, status: "failed", errorMessage: `HeyGen polling timeout after ${maxAttempts} attempts` };
  }
}

function mapHeyGenStatus(s: string): AvatarLipsyncTask["status"] {
  switch (s) {
    case "pending":
    case "waiting":
      return "submitted";
    case "processing":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    default:
      return "processing";
  }
}

function mapGender(s: string | undefined): AvatarLibraryEntry["gender"] {
  if (s === "male") return "male";
  if (s === "female") return "female";
  return "neutral";
}
function mapAge(s: string | undefined): AvatarLibraryEntry["ageGroup"] {
  if (s === "youth" || s === "young") return "youth";
  if (s === "senior" || s === "old") return "senior";
  return "adult";
}
function mapStyle(s: string | undefined): AvatarLibraryEntry["style"] {
  if (s === "cartoon") return "cartoon";
  if (s === "anime") return "anime";
  if (s === "business") return "business";
  return "realistic";
}

function stubLibrary(): AvatarLibraryEntry[] {
  return [
    {
      providerAvatarId: "stub-hg-male-01",
      previewImageUrl: "https://placeholder.example.com/avatar-m1.png",
      gender: "male",
      ageGroup: "adult",
      style: "realistic",
    },
    {
      providerAvatarId: "stub-hg-female-01",
      previewImageUrl: "https://placeholder.example.com/avatar-f1.png",
      gender: "female",
      ageGroup: "adult",
      style: "realistic",
    },
  ];
}
