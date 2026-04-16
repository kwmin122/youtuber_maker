CREATE TABLE "trend_gap_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid,
	"channel_set_hash" text NOT NULL,
	"latest_snapshot_date" text NOT NULL,
	"setdiff_cache" jsonb,
	"rationale_cache" jsonb,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"ttl_expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"region_code" text DEFAULT 'KR' NOT NULL,
	"category_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"partial_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_details" jsonb,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"category_id" integer NOT NULL,
	"region_code" text DEFAULT 'KR' NOT NULL,
	"keyword" text NOT NULL,
	"rank" integer NOT NULL,
	"source" text NOT NULL,
	"video_count" integer,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trend_gap_analyses" ADD CONSTRAINT "trend_gap_analyses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_gap_analyses" ADD CONSTRAINT "trend_gap_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trend_gap_analyses_user_hash_idx" ON "trend_gap_analyses" USING btree ("user_id","channel_set_hash","latest_snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "trend_snapshots_day_cat_region_kw_src_idx" ON "trend_snapshots" USING btree (("recorded_at"::date),"category_id","region_code","keyword","source");--> statement-breakpoint
CREATE INDEX "trend_snapshots_lookup_idx" ON "trend_snapshots" USING btree ("recorded_at","category_id","region_code");