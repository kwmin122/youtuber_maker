CREATE TABLE "avatar_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"public_url" text NOT NULL,
	"image_hash" text NOT NULL,
	"consent_recorded_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatar_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"provider" text NOT NULL,
	"provider_avatar_id" text NOT NULL,
	"gender" text NOT NULL,
	"age_group" text NOT NULL,
	"style" text NOT NULL,
	"preview_image_url" text NOT NULL,
	"voice_id_hint" text,
	"source" text DEFAULT 'library' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "default_avatar_preset_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "avatar_preset_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "avatar_layout" jsonb;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "avatar_video_url" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "avatar_provider_task_id" text;--> statement-breakpoint
ALTER TABLE "avatar_assets" ADD CONSTRAINT "avatar_assets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_presets" ADD CONSTRAINT "avatar_presets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "avatar_assets_user_hash_idx" ON "avatar_assets" USING btree ("user_id","image_hash");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_avatar_preset_id_avatar_presets_id_fk" FOREIGN KEY ("default_avatar_preset_id") REFERENCES "public"."avatar_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_avatar_preset_id_avatar_presets_id_fk" FOREIGN KEY ("avatar_preset_id") REFERENCES "public"."avatar_presets"("id") ON DELETE set null ON UPDATE no action;