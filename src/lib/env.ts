import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    MASTER_ENCRYPTION_KEY: z.string().min(32),
    REDIS_URL: z.string().url(),
    SUPABASE_JWT_SECRET: z.string().min(32),
    YOUTUBE_API_KEY: z.string().min(1),
    // Phase 9
    CRON_SECRET: z.string().min(16),
    GOOGLE_TRENDS_ENABLED: z
      .string()
      .optional()
      .default("false")
      .transform((v) => v === "true" || v === "1"),
    // Phase 10
    PIXABAY_API_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    MASTER_ENCRYPTION_KEY: process.env.MASTER_ENCRYPTION_KEY,
    REDIS_URL: process.env.REDIS_URL,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    GOOGLE_TRENDS_ENABLED: process.env.GOOGLE_TRENDS_ENABLED,
    PIXABAY_API_KEY: process.env.PIXABAY_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
});
