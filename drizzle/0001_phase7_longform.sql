CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"transcript_ids" jsonb NOT NULL,
	"tone_analysis" jsonb NOT NULL,
	"hooking_patterns" jsonb NOT NULL,
	"structure_patterns" jsonb NOT NULL,
	"topic_recommendations" jsonb NOT NULL,
	"ai_provider" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"storage_path" text NOT NULL,
	"start_time" real DEFAULT 0 NOT NULL,
	"end_time" real,
	"volume" real DEFAULT 0.3 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "longform_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"hook_score" integer NOT NULL,
	"emotional_score" integer NOT NULL,
	"information_density" integer NOT NULL,
	"trend_score" integer NOT NULL,
	"reason" text NOT NULL,
	"title_suggestion" text,
	"transcript_snippet" text,
	"selected" boolean DEFAULT false NOT NULL,
	"child_project_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "longform_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"storage_path" text,
	"public_url" text,
	"title" text,
	"duration_seconds" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"transcript" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"storage_path" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_clip_start_ms" integer,
	"source_clip_end_ms" integer,
	"source_longform_id" uuid,
	"scene_index" integer NOT NULL,
	"narration" text NOT NULL,
	"image_prompt" text NOT NULL,
	"video_prompt" text NOT NULL,
	"duration" real,
	"subtitle_style" jsonb,
	"transition_type" text DEFAULT 'cut',
	"transition_duration" real DEFAULT 0.5,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"variant" text NOT NULL,
	"hook_type" text NOT NULL,
	"structure_type" text NOT NULL,
	"word_count" integer NOT NULL,
	"estimated_duration" integer NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"ai_provider" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thumbnails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"storage_path" text NOT NULL,
	"variant" text NOT NULL,
	"prompt" text NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"view_count" bigint DEFAULT 0,
	"like_count" bigint DEFAULT 0,
	"comment_count" bigint DEFAULT 0,
	"subscriber_delta" integer DEFAULT 0,
	"watch_time_minutes" real DEFAULT 0,
	"impressions" bigint DEFAULT 0,
	"ctr" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"platform" text DEFAULT 'youtube' NOT NULL,
	"youtube_video_id" text,
	"video_url" text,
	"title" text NOT NULL,
	"description" text,
	"tags" jsonb,
	"thumbnail_url" text,
	"privacy_status" text DEFAULT 'private' NOT NULL,
	"publish_at" timestamp,
	"uploaded_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"sample_url" text NOT NULL,
	"sample_storage_path" text NOT NULL,
	"sample_duration" real,
	"consent_recorded_at" timestamp NOT NULL,
	"provider" text DEFAULT 'openai-tts' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "parent_longform_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "exported_video_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "exported_at" timestamp;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "longform_candidates" ADD CONSTRAINT "longform_candidates_source_id_longform_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."longform_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "longform_candidates" ADD CONSTRAINT "longform_candidates_child_project_id_projects_id_fk" FOREIGN KEY ("child_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "longform_sources" ADD CONSTRAINT "longform_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_source_longform_id_longform_sources_id_fk" FOREIGN KEY ("source_longform_id") REFERENCES "public"."longform_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thumbnails" ADD CONSTRAINT "thumbnails_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_metrics" ADD CONSTRAINT "upload_metrics_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_metrics_upload_date_idx" ON "upload_metrics" USING btree ("upload_id","date");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_longform_id_longform_sources_id_fk" FOREIGN KEY ("parent_longform_id") REFERENCES "public"."longform_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_video_id_idx" ON "transcripts" USING btree ("video_id");