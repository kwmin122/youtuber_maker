# Phase 1: Foundation - Research

**Researched:** 2026-04-07
**Domain:** Authentication, Encryption, Queue Workers, Realtime Subscriptions, Database Schema
**Confidence:** HIGH

## Summary

Phase 1 builds the entire infrastructure backbone: authentication (better-auth + Drizzle + Supabase PostgreSQL), API key envelope encryption, BullMQ worker on Railway, Supabase Realtime for job progress, and project CRUD. The starting point is the `jabirdev/nextjs-better-auth` fork (MIT) which provides a pre-configured Next.js 16 + better-auth + Drizzle + Supabase scaffold with App Router, shadcn/ui, and TypeScript.

The critical discovery is that Supabase Realtime works with third-party auth (better-auth) JWTs, but requires explicitly calling `client.realtime.setAuth(accessToken)` with a JWT signed using the Supabase JWT secret. This was a known issue that has been resolved. RLS policies on the `jobs` table will filter real-time updates to the owning user.

Google OAuth verification for YouTube upload scope (`youtube.upload`) is classified as a restricted scope requiring verification that takes 4-8 weeks. This must be initiated in Phase 1 even though the upload feature is in Phase 6.

**Primary recommendation:** Clone `jabirdev/nextjs-better-auth`, extend with 4 new tables (api_keys, projects, jobs, job_events), implement envelope encryption as a standalone `src/lib/crypto.ts` module, and deploy a separate BullMQ worker process on Railway.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: better-auth as main auth layer. Supabase Auth NOT used. Supabase is PostgreSQL + Storage + Realtime only.
- D-02: Email + Google OAuth only. No Kakao/GitHub in Phase 1.
- D-03: YouTube OAuth is a separate connection/verification flow, not login. Apply for YouTube Data API upload scope verification in Phase 1.
- D-04: MASTER_ENCRYPTION_KEY as Vercel/Railway env var. Envelope encryption + AES-256-GCM.
- D-05: DB stores key_version, encrypted_dek, ciphertext, iv, auth_tag, provider, last4. No plaintext API keys anywhere.
- D-06: key_version and provider abstraction for future KMS migration.
- D-07: Security rules -- 32-byte min MASTER_KEY, no NEXT_PUBLIC_ prefix, worker receives api_key_id only, UI shows provider/label/last4/created_at/last_used_at only.
- D-08: jobs table + Supabase Realtime for job status. UI subscribes to user's own jobs row UPDATE.
- D-09: job_events table for audit/debugging. 30-90 day retention.
- D-10: jobs columns: status, progress(0-100), current_step, error_message, updated_at.
- D-11: projects.workflow_state stores UI state only (current_step, last_active_tab, completed_steps, last_edited_at, draft_flags).
- D-12: Phase 1 tables only: projects, jobs, api_keys, job_events (plus better-auth's user, session, account, verification).

### Claude's Discretion
- DB schema column names/types
- better-auth plugin settings (session expiry, password policy)
- queuedash access control method
- Drizzle migration strategy (push vs generate+migrate)
- Test job behavior (worker infra verification)

### Deferred Ideas (OUT OF SCOPE)
- Kakao/GitHub social login -- post Phase 1
- AWS/GCP KMS -- scale phase
- job_events auto-cleanup cron -- operational stability phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Email/social login for signup/auth | better-auth with emailAndPassword + Google socialProvider, Drizzle adapter to Supabase PostgreSQL |
| INFRA-02 | User can safely register/manage AI API keys (Gemini, OpenAI etc) | Envelope encryption module + api_keys table with CRUD API routes |
| INFRA-03 | API keys encrypted server-side, never exposed to client | AES-256-GCM envelope encryption, worker decrypts at runtime via api_key_id |
| INFRA-04 | Long-running tasks run on background worker with real-time progress | BullMQ on Railway + Supabase Realtime row subscription on jobs table |
| UX-02 | Save/load projects to resume work | projects table with workflow_state JSONB, CRUD API routes |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.2 | App Router framework | Project decision, fork uses Next.js 16 |
| react | 19.2.4 | UI library | Bundled with Next.js 16 |
| typescript | 6.0.2 | Type safety | Project convention |
| better-auth | 1.6.0 | Authentication layer | Project decision (D-01), fork provides config |
| drizzle-orm | 0.45.2 | Type-safe ORM | Project decision, fork provides setup |
| drizzle-kit | 0.31.10 | Migration tooling | Paired with drizzle-orm |
| @supabase/supabase-js | 2.102.1 | Supabase client (Realtime, Storage) | Project decision for Realtime subscriptions |
| bullmq | 5.73.0 | Job queue | Project decision (D-08), Railway worker |
| ioredis | 5.10.1 | Redis client for BullMQ | Required by BullMQ |
| tailwindcss | 4.2.2 | Styling | Project convention |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @queuedash/api | 3.17.0 | BullMQ dashboard API | Admin monitoring of queues |
| @queuedash/ui | 3.17.0 | BullMQ dashboard UI | Admin monitoring page |
| @t3-oss/env-nextjs | latest | Env var validation | Type-safe env access |
| zod | latest | Schema validation | API input validation, env schemas |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| queuedash (self-hosted) | bull-board | bull-board has more stars but queuedash has native Next.js App Router integration and is project decision |
| Drizzle push | Drizzle generate+migrate | push is faster for dev, generate+migrate is safer for prod. Recommend push for dev, generate+migrate for deployment |

**Installation:**
```bash
# After cloning nextjs-better-auth fork
npm install bullmq ioredis @queuedash/api @queuedash/ui @supabase/supabase-js @t3-oss/env-nextjs zod
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (auth)/                  # Auth pages (login, signup)
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/             # Authenticated pages
│   │   ├── layout.tsx           # Auth guard layout
│   │   ├── projects/
│   │   │   ├── page.tsx         # Project list
│   │   │   └── [id]/page.tsx    # Project detail
│   │   └── settings/
│   │       ├── page.tsx         # Settings overview
│   │       └── api-keys/page.tsx # API key management
│   ├── admin/
│   │   └── queuedash/
│   │       └── [[...slug]]/page.tsx  # QueueDash UI
│   ├── api/
│   │   ├── auth/[...all]/route.ts    # better-auth handler (from fork)
│   │   ├── queuedash/[...trpc]/route.ts  # QueueDash API
│   │   ├── api-keys/route.ts         # API key CRUD
│   │   ├── projects/route.ts         # Project CRUD
│   │   └── jobs/route.ts             # Job submission
│   └── layout.tsx
├── lib/
│   ├── auth.ts                  # better-auth server config (from fork)
│   ├── auth-client.ts           # better-auth client (from fork)
│   ├── db/
│   │   ├── index.ts             # Drizzle client (from fork)
│   │   └── schema.ts            # Drizzle schema (extend fork)
│   ├── crypto.ts                # Envelope encryption module
│   ├── supabase.ts              # Supabase client (Realtime only)
│   └── queue.ts                 # BullMQ queue instance
├── hooks/
│   ├── use-session.ts           # Auth session hook
│   └── use-job-status.ts        # Supabase Realtime subscription hook
├── components/
│   ├── ui/                      # shadcn/ui components
│   ├── api-key-form.tsx         # API key registration form
│   ├── api-key-list.tsx         # API key list (masked)
│   ├── project-list.tsx         # Project list
│   └── job-progress.tsx         # Real-time job progress
└── worker/
    ├── index.ts                 # Worker entry point (Railway)
    ├── processor.ts             # Job processor
    └── handlers/
        └── test-job.ts          # Test job handler
```

### Pattern 1: Envelope Encryption (AES-256-GCM)
**What:** Two-layer encryption where a random DEK encrypts the actual data, and the MASTER_KEY encrypts the DEK.
**When to use:** Every API key encrypt/decrypt operation.
**Example:**
```typescript
// Source: Node.js crypto docs + envelope encryption pattern
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96 bits for GCM
const KEY_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16;

interface EncryptedPayload {
  keyVersion: number;
  encryptedDek: Buffer;  // DEK encrypted with MASTER_KEY
  dekIv: Buffer;
  dekAuthTag: Buffer;
  ciphertext: Buffer;    // API key encrypted with DEK
  dataIv: Buffer;
  dataAuthTag: Buffer;
}

export function encrypt(plaintext: string, masterKey: Buffer): EncryptedPayload {
  // 1. Generate random DEK
  const dek = randomBytes(KEY_LENGTH);
  
  // 2. Encrypt plaintext with DEK
  const dataIv = randomBytes(IV_LENGTH);
  const dataCipher = createCipheriv(ALGORITHM, dek, dataIv);
  const ciphertext = Buffer.concat([dataCipher.update(plaintext, 'utf8'), dataCipher.final()]);
  const dataAuthTag = dataCipher.getAuthTag();
  
  // 3. Encrypt DEK with MASTER_KEY
  const dekIv = randomBytes(IV_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, masterKey, dekIv);
  const encryptedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();
  
  // Zero out DEK from memory
  dek.fill(0);
  
  return { keyVersion: 1, encryptedDek, dekIv, dekAuthTag, ciphertext, dataIv, dataAuthTag };
}

export function decrypt(payload: EncryptedPayload, masterKey: Buffer): string {
  // 1. Decrypt DEK with MASTER_KEY
  const dekDecipher = createDecipheriv(ALGORITHM, masterKey, payload.dekIv);
  dekDecipher.setAuthTag(payload.dekAuthTag);
  const dek = Buffer.concat([dekDecipher.update(payload.encryptedDek), dekDecipher.final()]);
  
  // 2. Decrypt ciphertext with DEK
  const dataDecipher = createDecipheriv(ALGORITHM, dek, payload.dataIv);
  dataDecipher.setAuthTag(payload.dataAuthTag);
  const plaintext = Buffer.concat([dataDecipher.update(payload.ciphertext), dataDecipher.final()]);
  
  // Zero out DEK from memory
  dek.fill(0);
  
  return plaintext.toString('utf8');
}
```

### Pattern 2: Supabase Realtime with better-auth JWT
**What:** Subscribe to job status changes using Supabase Realtime with a custom JWT.
**When to use:** Client-side job progress tracking.
**Example:**
```typescript
// Source: Supabase Realtime docs + GitHub discussion #28483
import { createClient } from '@supabase/supabase-js';

// Create Supabase client for Realtime only (no Supabase Auth)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// After better-auth login, sign a JWT with Supabase JWT secret
// containing the user's ID, then set it for Realtime:
supabase.realtime.setAuth(supabaseJwt);

// Subscribe to user's job updates
const channel = supabase
  .channel('job-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'jobs',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    // Handle job status update
    console.log('Job update:', payload.new);
  })
  .subscribe();
```

### Pattern 3: BullMQ Worker (Railway separate process)
**What:** A standalone Node.js process that consumes jobs from Redis.
**When to use:** Long-running tasks (AI generation, rendering, uploads).
**Example:**
```typescript
// worker/index.ts - Entry point for Railway
import { Worker } from 'bullmq';
import { connection } from './connection';
import { processJob } from './processor';

const worker = new Worker('main-queue', processJob, {
  connection,
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
});

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err));

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
```

### Pattern 4: QueueDash Next.js App Router Integration
**What:** Embed BullMQ dashboard in admin route.
**When to use:** Admin monitoring.
**Example:**
```typescript
// app/api/queuedash/[...trpc]/route.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@queuedash/api';
import { Queue } from 'bullmq';

const queue = new Queue('main-queue', {
  connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) }
});

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/queuedash',
    req,
    router: appRouter,
    createContext: () => ({
      queues: [{ queue, displayName: 'Main Queue', type: 'bullmq' as const }],
    }),
  });

export { handler as GET, handler as POST };
```

### Anti-Patterns to Avoid
- **Storing plaintext API keys anywhere:** Not in DB, logs, error messages, analytics, or job payloads. Worker receives `api_key_id` only.
- **Using Supabase Auth alongside better-auth:** Two sources of truth for user identity causes conflicts. Use Supabase only for PostgreSQL/Storage/Realtime.
- **Running BullMQ worker inside Next.js API routes:** Serverless functions timeout. Worker must be a separate long-running process on Railway.
- **Subscribing to Realtime without RLS:** Without RLS policies, users can see other users' job updates. Always enable RLS on jobs table.
- **Using `NEXT_PUBLIC_` prefix for secrets:** MASTER_ENCRYPTION_KEY, REDIS_URL, DATABASE_URL must never have this prefix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authentication | Custom auth system | better-auth (already decided) | Session management, CSRF, token refresh are complex |
| Encryption | Custom crypto primitives | Node.js `crypto` with AES-256-GCM | Well-tested, constant-time operations, auth tags |
| Job queuing | Custom polling/cron | BullMQ | Retry logic, priority, rate limiting, dead letter queues |
| Queue monitoring | Custom dashboard | queuedash | Pre-built UI, job inspection, retry/remove |
| Realtime updates | WebSocket server | Supabase Realtime | Handles reconnection, RLS filtering, scales with Supabase |
| Schema migrations | Raw SQL files | Drizzle Kit | Type-safe, diffable, rollback support |
| Form validation | Manual parsing | zod schemas | Type inference, composable, reusable |

## Common Pitfalls

### Pitfall 1: Supabase Realtime JWT Mismatch
**What goes wrong:** Realtime subscriptions receive no events because RLS policies reject the anonymous role.
**Why it happens:** When using better-auth (not Supabase Auth), the Supabase client has no auth token by default.
**How to avoid:** After better-auth login, generate a JWT signed with `SUPABASE_JWT_SECRET` containing `{ sub: userId, role: 'authenticated' }` and call `supabase.realtime.setAuth(jwt)`.
**Warning signs:** Realtime channel status shows `SUBSCRIBED` but no events arrive; works when RLS is disabled.

### Pitfall 2: IV Reuse in GCM
**What goes wrong:** Security completely broken -- attacker can recover plaintext.
**Why it happens:** Reusing IV with the same key in AES-GCM.
**How to avoid:** Always generate a fresh random IV (`crypto.randomBytes(12)`) per encryption operation. Since we use envelope encryption with a unique DEK per API key, IV reuse risk is minimal.
**Warning signs:** Static IV values, deterministic IV generation.

### Pitfall 3: BullMQ Connection Pooling on Serverless
**What goes wrong:** Redis connection exhaustion on Vercel due to cold starts creating new connections.
**Why it happens:** Each serverless invocation creates a new Redis connection.
**How to avoid:** Use a singleton pattern for the Queue instance in Next.js API routes. Only the Worker (on Railway, persistent process) maintains long-lived connections. For the web side, create Queue instances sparingly with `maxRetriesPerRequest: null`.
**Warning signs:** Redis `maxclients` errors, connection timeouts.

### Pitfall 4: Drizzle Schema Drift
**What goes wrong:** better-auth generates its own tables (user, session, account, verification) which may conflict with custom schema definitions.
**Why it happens:** Running `npx auth@latest generate` overwrites schema file.
**How to avoid:** Run `npx auth@latest generate` first, then manually add custom tables (api_keys, projects, jobs, job_events) in the same schema file. Use `drizzle-kit push` for dev, `drizzle-kit generate` + `drizzle-kit migrate` for production.
**Warning signs:** Duplicate table definitions, migration conflicts.

### Pitfall 5: Google OAuth Verification Delays
**What goes wrong:** YouTube upload scope is a restricted scope; verification can take 4-8 weeks and may require a security assessment.
**Why it happens:** Google requires app review for restricted scopes like `youtube.upload`.
**How to avoid:** Submit verification request in Phase 1 immediately. Prepare: privacy policy URL, demo video, detailed scope justification. Use test users (up to 100) during verification period.
**Warning signs:** Stuck in "Verification pending" status; missing required documentation.

## Code Examples

### Drizzle Schema for Phase 1 Tables
```typescript
// Source: Drizzle ORM docs + better-auth schema requirements
import { pgTable, text, timestamp, integer, jsonb, boolean, uuid } from 'drizzle-orm/pg-core';

// better-auth generates: user, session, account, verification tables
// Custom tables below:

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),          // 'gemini', 'openai', 'kling', etc.
  label: text('label'),                           // user-defined label
  last4: text('last4').notNull(),                 // last 4 chars of key
  keyVersion: integer('key_version').notNull().default(1),
  encryptedDek: text('encrypted_dek').notNull(),  // base64
  dekIv: text('dek_iv').notNull(),                // base64
  dekAuthTag: text('dek_auth_tag').notNull(),      // base64
  ciphertext: text('ciphertext').notNull(),        // base64
  dataIv: text('data_iv').notNull(),               // base64
  dataAuthTag: text('data_auth_tag').notNull(),     // base64
  revokedAt: timestamp('revoked_at'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  workflowState: jsonb('workflow_state').$type<{
    currentStep: number;
    lastActiveTab: string;
    completedSteps: number[];
    lastEditedAt: string;
    draftFlags: Record<string, boolean>;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  type: text('type').notNull(),                     // 'test', 'generate-script', etc.
  status: text('status').notNull().default('pending'), // pending, active, completed, failed
  progress: integer('progress').notNull().default(0),  // 0-100
  currentStep: text('current_step'),
  errorMessage: text('error_message'),
  payload: jsonb('payload'),                        // job-specific data (NO plaintext API keys)
  result: jsonb('result'),                          // job output
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const jobEvents = pgTable('job_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),                   // 'started', 'progress', 'completed', 'failed'
  data: jsonb('data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### RLS Policy for Jobs Table (Supabase SQL)
```sql
-- Enable RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT
  USING (user_id = auth.uid()::text);

-- Note: For better-auth, auth.uid() won't work directly.
-- Use a custom function that extracts user_id from the JWT:
CREATE OR REPLACE FUNCTION get_user_id()
RETURNS text AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->>'sub';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT
  USING (user_id = get_user_id());
```

### Supabase JWT Generation (Server-Side)
```typescript
// Generate a Supabase-compatible JWT for Realtime subscriptions
import { SignJWT } from 'jose';

export async function generateSupabaseJwt(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
  
  return new SignJWT({
    sub: userId,
    role: 'authenticated',
    iss: 'youtuber-min',
    aud: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}
```

### React Hook for Job Status
```typescript
// hooks/use-job-status.ts
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type JobStatus = {
  id: string;
  status: string;
  progress: number;
  currentStep: string | null;
  errorMessage: string | null;
};

export function useJobStatus(jobId: string, supabaseJwt: string) {
  const [job, setJob] = useState<JobStatus | null>(null);

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.realtime.setAuth(supabaseJwt);

    const channel = supabase
      .channel(`job-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`
      }, (payload) => {
        setJob(payload.new as JobStatus);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId, supabaseJwt]);

  return job;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NextAuth.js | better-auth | 2024-2025 | Simpler config, built-in Drizzle adapter, social providers |
| Prisma | Drizzle ORM | 2024-2025 | Better TypeScript inference, lighter, faster migrations |
| Socket.io for realtime | Supabase Realtime | 2024+ | No server management, RLS-integrated, scales automatically |
| Bull (v4) | BullMQ (v5) | 2023+ | Better TypeScript support, flow system, improved reliability |

**Deprecated/outdated:**
- `fluent-ffmpeg`: Maintenance stopped, FFmpeg 7.x incompatible (project decision: use FFmpeg spawn directly)
- NextAuth v4: Replaced by Auth.js v5, but better-auth is the chosen alternative
- Supabase Auth in this project: Explicitly not used (D-01)

## Open Questions

1. **Supabase JWT Secret for Realtime**
   - What we know: Supabase provides a JWT secret in project settings. Custom JWTs signed with this secret work with Realtime + RLS.
   - What's unclear: Whether better-auth can be configured to sign JWTs with Supabase's secret directly, or if a separate JWT must be generated server-side after better-auth login.
   - Recommendation: Generate a separate Supabase JWT via API route after better-auth login. Store in client state (not localStorage). Refresh before expiry.

2. **queuedash Access Control**
   - What we know: queuedash provides a UI embeddable in Next.js routes.
   - What's unclear: Whether queuedash has built-in auth or if we need to protect the route.
   - Recommendation: Protect `/admin/queuedash` with a middleware check for admin role. For MVP, check if user email matches an allowlist env var.

3. **Worker Database Access**
   - What we know: Worker on Railway needs to update jobs table and read api_keys for decryption.
   - What's unclear: Whether worker should use Drizzle directly to Supabase PostgreSQL or go through an API.
   - Recommendation: Worker uses Drizzle directly to Supabase PostgreSQL (connection string via env var). This avoids circular dependency and is simpler. Worker writes job status updates which trigger Supabase Realtime.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | Yes | 22.16.0 | -- |
| Bun | Package manager (fork uses bun) | Yes | 1.3.11 | npm also works |
| Redis | BullMQ local dev | Yes | 8.6.1 | Docker redis if needed |
| Docker | Optional containerization | Yes | 28.5.2 | Not required for dev |
| Supabase (cloud) | PostgreSQL + Realtime | External service | -- | Create project at supabase.com |
| Redis (Railway) | BullMQ production | External service | -- | Provision on Railway |
| Google Cloud Console | OAuth credentials | External service | -- | Required for Google login |

**Missing dependencies with no fallback:** None -- all local tools available.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (Next.js 16 standard) |
| Config file | `vitest.config.ts` (Wave 0 -- create) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Email signup + Google OAuth sign-in | integration | `npx vitest run src/__tests__/auth.test.ts -t "auth"` | No -- Wave 0 |
| INFRA-02 | API key CRUD (register, list, delete) | integration | `npx vitest run src/__tests__/api-keys.test.ts` | No -- Wave 0 |
| INFRA-03 | Encryption roundtrip (encrypt then decrypt equals original) | unit | `npx vitest run src/__tests__/crypto.test.ts` | No -- Wave 0 |
| INFRA-04 | Job submission, worker pickup, status update via Realtime | integration | `npx vitest run src/__tests__/jobs.test.ts` | No -- Wave 0 |
| UX-02 | Project CRUD (create, list, get, update, delete) | integration | `npx vitest run src/__tests__/projects.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/sunco:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- Vitest configuration
- [ ] `src/__tests__/crypto.test.ts` -- envelope encryption roundtrip
- [ ] `src/__tests__/api-keys.test.ts` -- API key CRUD
- [ ] `src/__tests__/projects.test.ts` -- project CRUD
- [ ] `src/__tests__/auth.test.ts` -- auth flow tests
- [ ] `src/__tests__/jobs.test.ts` -- job submission + worker tests
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react`

## Sources

### Primary (HIGH confidence)
- [better-auth Drizzle adapter docs](https://better-auth.com/docs/adapters/drizzle) -- schema generation, adapter config
- [better-auth Google OAuth docs](https://better-auth.com/docs/authentication/google) -- social provider setup, refresh tokens
- [Node.js crypto API](https://nodejs.org/api/crypto.html) -- AES-256-GCM implementation
- [Supabase Realtime Authorization docs](https://supabase.com/docs/guides/realtime/authorization) -- RLS with Realtime
- [Drizzle ORM + Supabase tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase) -- connection setup
- [BullMQ docs](https://docs.bullmq.io/) -- worker configuration, job events

### Secondary (MEDIUM confidence)
- [jabirdev/nextjs-better-auth](https://github.com/jabirdev/nextjs-better-auth) -- fork structure, 97 stars
- [Supabase GitHub Discussion #28483](https://github.com/orgs/supabase/discussions/28483) -- Realtime with custom JWTs (resolved)
- [queuedash GitHub](https://github.com/alexbudure/queuedash) -- Next.js App Router integration
- [Google OAuth restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) -- timeline 4-8 weeks

### Tertiary (LOW confidence)
- queuedash cloud vs self-hosted split unclear -- v3.17.0 packages exist on npm but documentation seems to push toward cloud SaaS. Self-hosted @queuedash/api + @queuedash/ui approach should work based on GitHub README.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified on npm with current versions
- Architecture: HIGH -- patterns from official docs, fork provides starting structure
- Encryption: HIGH -- Node.js crypto is well-documented, envelope encryption is standard pattern
- Realtime integration: MEDIUM -- Supabase Realtime with custom JWTs works but requires careful JWT setup
- Pitfalls: HIGH -- based on official docs and community discussions

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days -- stable stack, no fast-moving dependencies)
