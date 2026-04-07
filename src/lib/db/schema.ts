import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
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
