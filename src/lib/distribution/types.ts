// Distribution & analytics types

/** Upload platform enum */
export type UploadPlatform = "youtube" | "tiktok" | "reels";

/** Upload privacy status */
export type PrivacyStatus = "private" | "unlisted" | "public";

/** Upload status lifecycle */
export type UploadStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "failed"
  | "scheduled";

/** YouTube upload request */
export interface YouTubeUploadRequest {
  projectId: string;
  userId: string;
  videoFilePath: string; // local file path or Supabase Storage URL
  title: string;
  description: string;
  tags: string[];
  thumbnailUrl?: string;
  privacyStatus: PrivacyStatus;
  publishAt?: string; // ISO 8601 datetime for scheduled upload
  categoryId?: string; // YouTube category (default: "22" = People & Blogs)
}

/** YouTube upload result */
export interface YouTubeUploadResult {
  youtubeVideoId: string;
  videoUrl: string; // https://youtube.com/shorts/{id}
  status: string; // YouTube processing status
}

/** YouTube upload progress */
export interface UploadProgress {
  phase: "preparing" | "uploading" | "processing" | "thumbnail" | "complete";
  percent: number; // 0-100
  message?: string;
}

/** SEO generation request */
export interface SEOGenerationRequest {
  projectId: string;
  scriptContent: string; // full script text
  channelNiche?: string; // channel topic/niche for context
  targetAudience?: string;
  language: string; // 'ko' | 'en'
}

/** SEO generation result */
export interface SEOResult {
  title: string; // optimized title (max 100 chars)
  description: string; // optimized description (max 5000 chars)
  hashtags: string[]; // 5-15 hashtags
  tags: string[]; // YouTube tags (up to 500 chars total)
  titleVariants: string[]; // 2-3 alternative titles for A/B
}

/** Thumbnail generation request */
export interface ThumbnailGenerationRequest {
  projectId: string;
  scriptContent: string;
  title: string;
  style?: string; // 'vibrant' | 'minimal' | 'dramatic' | 'text-heavy'
  variantCount: number; // 2-3
}

/** Thumbnail result per variant */
export interface ThumbnailResult {
  variant: string; // 'A' | 'B' | 'C'
  url: string; // temporary DALL-E URL
  prompt: string; // prompt used
  revisedPrompt?: string; // DALL-E's revised prompt
}

/** Viral score request */
export interface ViralScoreRequest {
  scriptContent: string;
  title: string;
  description?: string;
  hashtags?: string[];
  thumbnailUrl?: string;
  channelNiche?: string;
}

/** Viral score result */
export interface ViralScoreResult {
  score: number; // 0-100
  breakdown: {
    hookStrength: number; // 0-25 -- hook power
    emotionalTrigger: number; // 0-25 -- emotional resonance
    trendFit: number; // 0-25 -- trend alignment
    titleClickability: number; // 0-25 -- title CTR power
  };
  suggestions: string[]; // improvement tips
  verdict: "viral" | "promising" | "average" | "weak";
}

/** Metrics fetch result from YouTube Analytics API */
export interface MetricsSnapshot {
  date: string; // ISO date
  viewCount: number;
  likeCount: number;
  commentCount: number;
  subscriberDelta: number;
  watchTimeMinutes: number;
  impressions: number;
  ctr: number;
}
