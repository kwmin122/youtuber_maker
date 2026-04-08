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
