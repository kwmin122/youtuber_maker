// Media production types

/** A single scene parsed from AI scene-splitting output */
export interface SceneData {
  sceneIndex: number;
  narration: string;
  imagePrompt: string;
  videoPrompt: string;
  estimatedDuration: number; // seconds (3-5)
}

/** Full scene-split result from AI */
export interface SceneSplitResult {
  scenes: SceneData[];
  totalEstimatedDuration: number; // sum of all scene durations
}

/** Image generation request */
export interface ImageGenerationRequest {
  prompt: string;
  style: ImageStyle;
  size: "1024x1792"; // 9:16 vertical for Shorts
}

export type ImageStyle =
  | "realistic"
  | "anime"
  | "cartoon"
  | "3d-render"
  | "watercolor"
  | "cinematic"
  | "illustration";

/** Image generation result */
export interface ImageGenerationResult {
  url: string; // temporary URL from provider (download and store)
  revisedPrompt?: string; // DALL-E 3 may revise the prompt
}

/** Video generation request (Kling API) */
export interface VideoGenerationRequest {
  /** Image URL for image-to-video, or null for text-to-video */
  imageUrl?: string;
  prompt: string;
  duration: 3 | 5; // seconds
  aspectRatio: "9:16";
}

/** Video generation task status (Kling async polling) */
export interface VideoGenerationTask {
  taskId: string;
  status: "submitted" | "processing" | "completed" | "failed";
  videoUrl?: string; // available when completed
  errorMessage?: string;
}

/** Supabase Storage upload result */
export interface StorageUploadResult {
  storagePath: string; // e.g., "media/userId/projectId/scene-0/image.png"
  publicUrl: string;
}

/** Media asset type enum */
export type MediaAssetType = "image" | "video" | "audio";
