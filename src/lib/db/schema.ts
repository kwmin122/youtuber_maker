import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  bigint,
  real,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Re-export better-auth tables from the fork's schema
export { user } from "@/db/schema/auth/user";
export { session } from "@/db/schema/auth/session";
export { account } from "@/db/schema/auth/account";
export { verification } from "@/db/schema/auth/verification";

// Import user for FK references
import { user } from "@/db/schema/auth/user";

// ---------- Custom Phase 1 Tables ----------

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'gemini', 'openai', 'kling', etc.
  label: text("label"), // user-defined label
  last4: text("last4").notNull(), // last 4 chars of key
  keyVersion: integer("key_version").notNull().default(1),
  encryptedDek: text("encrypted_dek").notNull(), // base64
  dekIv: text("dek_iv").notNull(), // base64
  dekAuthTag: text("dek_auth_tag").notNull(), // base64
  ciphertext: text("ciphertext").notNull(), // base64
  dataIv: text("data_iv").notNull(), // base64
  dataAuthTag: text("data_auth_tag").notNull(), // base64
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  workflowState: jsonb("workflow_state").$type<{
    currentStep: number;
    lastActiveTab: string;
    completedSteps: number[];
    lastEditedAt: string;
    draftFlags: Record<string, boolean>;
  }>(),
  exportedVideoUrl: text("exported_video_url"), // Supabase Storage public URL
  exportedAt: timestamp("exported_at"), // when last export completed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(), // 'test', 'generate-script', etc.
  status: text("status").notNull().default("pending"), // pending, active, completed, failed
  progress: integer("progress").notNull().default(0), // 0-100
  currentStep: text("current_step"),
  errorMessage: text("error_message"),
  payload: jsonb("payload"), // job-specific data (NO plaintext API keys)
  result: jsonb("result"), // job output
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobEvents = pgTable("job_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  event: text("event").notNull(), // 'started', 'progress', 'completed', 'failed'
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Phase 2 Tables ----------

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  youtubeChannelId: text("youtube_channel_id").notNull(),
  title: text("title").notNull(),
  handle: text("handle"),                      // @handle
  customUrl: text("custom_url"),                // /c/customname
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  bannerUrl: text("banner_url"),
  subscriberCount: bigint("subscriber_count", { mode: "number" }),
  videoCount: bigint("video_count", { mode: "number" }),
  viewCount: bigint("view_count", { mode: "number" }),
  country: text("country"),
  publishedAt: timestamp("published_at"),       // channel creation date
  fetchedAt: timestamp("fetched_at").notNull(), // for cache staleness check (D-03)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("channels_user_yt_id_idx").on(table.userId, table.youtubeChannelId),
]);

export const videos = pgTable("videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  youtubeVideoId: text("youtube_video_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  publishedAt: timestamp("published_at"),
  duration: text("duration"),                   // ISO 8601 duration (PT1M30S)
  viewCount: bigint("view_count", { mode: "number" }).default(0),
  likeCount: bigint("like_count", { mode: "number" }).default(0),
  commentCount: bigint("comment_count", { mode: "number" }).default(0),
  performanceScore: real("performance_score"),   // viewCount / subscriberCount (D-04)
  engagementRate: real("engagement_rate"),        // (likes+comments)/views*100 (D-06)
  tags: jsonb("tags").$type<string[]>(),
  fetchedAt: timestamp("fetched_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("videos_channel_yt_id_idx").on(table.channelId, table.youtubeVideoId),
]);

export const transcripts = pgTable("transcripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  language: text("language").notNull(),          // 'ko', 'en', 'auto', etc.
  source: text("source").notNull(),              // 'youtube-transcript' | 'google-stt'
  segments: jsonb("segments").$type<Array<{
    text: string;
    offset: number;   // ms
    duration: number;  // ms
  }>>().notNull(),
  fullText: text("full_text").notNull(),          // denormalized for Phase 3 AI (D-10)
  fetchedAt: timestamp("fetched_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("transcripts_video_id_idx").on(table.videoId),
]);

export const projectChannels = pgTable("project_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("project_channels_unique_idx").on(table.projectId, table.channelId),
]);

// ---------- Phase 3 Tables ----------

export const analyses = pgTable("analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  /** IDs of transcripts used for this analysis */
  transcriptIds: jsonb("transcript_ids").$type<string[]>().notNull(),
  /** AI tone/style analysis result */
  toneAnalysis: jsonb("tone_analysis").$type<{
    style: string;
    sentenceEndings: string[];
    frequentExpressions: string[];
    formality: "formal" | "casual" | "mixed";
    emotionalTone: string;
  }>().notNull(),
  /** Detected hooking patterns */
  hookingPatterns: jsonb("hooking_patterns").$type<Array<{
    type: string;
    description: string;
    example: string;
    frequency: number;
  }>>().notNull(),
  /** Detected content structure patterns */
  structurePatterns: jsonb("structure_patterns").$type<Array<{
    name: string;
    sections: string[];
    sectionDurations: number[];
    frequency: number;
  }>>().notNull(),
  /** AI-recommended topics based on analysis */
  topicRecommendations: jsonb("topic_recommendations").$type<Array<{
    title: string;
    description: string;
    rationale: string;
    suggestedHookType: string;
    suggestedStructure: string;
    viralPotential: "high" | "medium" | "low";
  }>>().notNull(),
  /** Which AI provider was used */
  aiProvider: text("ai_provider").notNull(), // 'gemini' | 'openai'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scripts = pgTable("scripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  analysisId: uuid("analysis_id")
    .notNull()
    .references(() => analyses.id, { onDelete: "cascade" }),
  /** Topic title from topicRecommendations */
  title: text("title").notNull(),
  /** Full script content */
  content: text("content").notNull(),
  /** Variant identifier */
  variant: text("variant").notNull(), // 'A', 'B', 'C'
  /** Hook strategy used */
  hookType: text("hook_type").notNull(),
  /** Structure strategy used */
  structureType: text("structure_type").notNull(),
  /** Approximate word count */
  wordCount: integer("word_count").notNull(),
  /** Estimated duration in seconds */
  estimatedDuration: integer("estimated_duration").notNull(),
  /** Whether user selected this variant */
  isSelected: boolean("is_selected").notNull().default(false),
  /** Which AI provider was used */
  aiProvider: text("ai_provider").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Phase 4 Tables ----------

export const scenes = pgTable("scenes", {
  id: uuid("id").defaultRandom().primaryKey(),
  scriptId: uuid("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  sceneIndex: integer("scene_index").notNull(), // 0-based order within script
  narration: text("narration").notNull(), // TTS input text
  imagePrompt: text("image_prompt").notNull(), // prompt for image generation
  videoPrompt: text("video_prompt").notNull(), // prompt for video generation
  duration: real("duration"), // estimated duration in seconds (3-5s per scene)
  subtitleStyle: jsonb("subtitle_style").$type<{
    fontFamily: string;       // e.g., 'Noto Sans KR', 'Pretendard'
    fontSize: number;         // px (16-72)
    fontColor: string;        // hex (#FFFFFF)
    backgroundColor: string;  // hex with alpha (#00000080) or 'transparent'
    borderColor: string;      // hex (#000000)
    borderWidth: number;      // px (0-4)
    shadowColor: string;      // hex (#00000080)
    shadowOffset: number;     // px (0-4)
    position: 'top' | 'center' | 'bottom';
  }>(),
  transitionType: text("transition_type").default("cut"), // 'fade' | 'dissolve' | 'slide-left' | 'slide-right' | 'zoom-in' | 'cut'
  transitionDuration: real("transition_duration").default(0.5), // seconds (0.2-1.0)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  sceneId: uuid("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'image' | 'video' | 'audio'
  url: text("url").notNull(), // Supabase Storage public URL
  storagePath: text("storage_path").notNull(), // Supabase Storage path (for deletion)
  provider: text("provider").notNull(), // 'openai-dalle3' | 'kling' | 'openai-tts' | 'qwen3-tts'
  status: text("status").notNull().default("pending"), // 'pending' | 'generating' | 'completed' | 'failed'
  /** Provider-specific metadata (e.g., kling task ID, style, model, error details) */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const voiceProfiles = pgTable("voice_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // user-defined profile name (e.g., "내 목소리")
  sampleUrl: text("sample_url").notNull(), // Supabase Storage URL for voice sample
  sampleStoragePath: text("sample_storage_path").notNull(), // for deletion
  sampleDuration: real("sample_duration"), // duration in seconds (3-20s)
  /** Timestamp when user confirmed voice ownership consent */
  consentRecordedAt: timestamp("consent_recorded_at").notNull(),
  provider: text("provider").notNull().default("openai-tts"), // 'openai-tts' | 'qwen3-tts'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------- Phase 5 Tables ----------

export const audioTracks = pgTable("audio_tracks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'bgm' | 'sfx'
  name: text("name").notNull(), // display name (e.g., "Upbeat Lo-Fi")
  url: text("url").notNull(), // Supabase Storage public URL
  storagePath: text("storage_path").notNull(), // for deletion
  startTime: real("start_time").notNull().default(0), // seconds from video start
  endTime: real("end_time"), // null = until end of video
  volume: real("volume").notNull().default(0.3), // 0.0-1.0
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------- Phase 6 Tables ----------

export const uploads = pgTable("uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("youtube"), // 'youtube' | 'tiktok' | 'reels'
  youtubeVideoId: text("youtube_video_id"), // YouTube's video ID after upload
  videoUrl: text("video_url"), // full URL to the uploaded video
  title: text("title").notNull(),
  description: text("description"),
  tags: jsonb("tags").$type<string[]>(),
  thumbnailUrl: text("thumbnail_url"), // selected thumbnail URL
  privacyStatus: text("privacy_status").notNull().default("private"), // 'private' | 'unlisted' | 'public'
  publishAt: timestamp("publish_at"), // scheduled publish time (null = immediate)
  uploadedAt: timestamp("uploaded_at"), // when the upload completed
  status: text("status").notNull().default("pending"), // 'pending' | 'uploading' | 'processing' | 'completed' | 'failed' | 'scheduled'
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const uploadMetrics = pgTable("upload_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  uploadId: uuid("upload_id")
    .notNull()
    .references(() => uploads.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(), // the date of this metrics snapshot
  viewCount: bigint("view_count", { mode: "number" }).default(0),
  likeCount: bigint("like_count", { mode: "number" }).default(0),
  commentCount: bigint("comment_count", { mode: "number" }).default(0),
  subscriberDelta: integer("subscriber_delta").default(0), // change in subs attributed to this video
  watchTimeMinutes: real("watch_time_minutes").default(0),
  impressions: bigint("impressions", { mode: "number" }).default(0),
  ctr: real("ctr").default(0), // click-through rate percentage
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("upload_metrics_upload_date_idx").on(table.uploadId, table.date),
]);

export const thumbnails = pgTable("thumbnails", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(), // Supabase Storage public URL
  storagePath: text("storage_path").notNull(), // for deletion
  variant: text("variant").notNull(), // 'A' | 'B' | 'C'
  prompt: text("prompt").notNull(), // the prompt used to generate this thumbnail
  isSelected: boolean("is_selected").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
