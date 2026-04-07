# Architecture Patterns

**Domain:** YouTube Shorts Automation SaaS
**Researched:** 2026-04-07

## Recommended Architecture

### Overview

Monorepo with two deployment targets: a Next.js web app (Vercel) and a worker service (Railway/Fly.io Docker container). They communicate via BullMQ/Redis. Supabase handles auth, database, and file storage.

```
[Browser]
    |
    v
[Next.js App on Vercel]
    |-- API Routes (light operations)
    |-- Server Actions (form submissions)
    |-- Remotion <Player> (video preview)
    |
    +--> [Supabase]
    |       |-- PostgreSQL (projects, scripts, jobs)
    |       |-- Auth (Google OAuth for YouTube)
    |       |-- Storage (audio samples, generated assets)
    |       |-- Realtime (job status subscriptions)
    |
    +--> [Redis (Upstash)]
    |       |-- BullMQ job queues
    |       |-- Rate limiting counters
    |       |-- API response cache
    |
    +--> [Worker Service on Railway]
            |-- BullMQ consumers
            |-- FFmpeg (video processing)
            |-- yt-dlp (subtitle download)
            |-- AI API calls (Gemini, OpenAI, Flux, Kling, Qwen3-TTS)
            |-- YouTube upload (long-running)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Next.js App | UI, auth flow, project CRUD, API key management, video preview | Supabase, Redis |
| BullMQ Queue | Job scheduling, priority, retry, DAG flows | Redis, Workers |
| Worker Service | Heavy compute: AI calls, FFmpeg, yt-dlp, YouTube upload | Redis, Supabase Storage, External APIs |
| Supabase | Data persistence, auth, file storage, real-time events | Next.js App, Worker Service |
| Redis (Upstash) | Job queue backend, caching, rate limits | Next.js App, Worker Service |

### Data Flow

**Creating a Short (end-to-end):**

1. User selects channel -> Next.js API route calls YouTube Data API -> stores channel data in Supabase
2. User triggers benchmarking -> BullMQ job created -> Worker downloads subtitles via yt-dlp -> LLM analyzes tone -> results stored in Supabase
3. User requests script -> BullMQ job -> Worker calls Gemini/OpenAI with benchmarking context -> script stored in Supabase
4. User confirms scenes -> BullMQ flow (parent job with children):
   - Child jobs: image generation (Flux), video generation (Kling), TTS (Qwen3-TTS) -- run in parallel
   - Assets uploaded to Supabase Storage
   - Parent job waits for all children
5. User triggers video composition -> BullMQ job -> Worker downloads assets from Storage -> FFmpeg composites video -> uploads final MP4 to Storage
6. User previews via Remotion Player (client-side, streams from Storage)
7. User triggers upload -> BullMQ job -> Worker uses YouTube API resumable upload -> tracks progress via Redis

**Job status updates flow:**
Worker updates job status in Supabase -> Supabase Realtime pushes to client -> UI updates in real-time

## Patterns to Follow

### Pattern 1: User-Owned API Keys

**What:** Users provide their own API keys for AI services. Keys are encrypted at rest in Supabase, decrypted only in the worker at execution time.

**When:** All AI API calls (Gemini, OpenAI, Flux, Kling, Qwen3-TTS)

**Example:**
```typescript
// Store encrypted
const encryptedKey = encrypt(userApiKey, process.env.ENCRYPTION_SECRET);
await db.insert(apiKeys).values({ userId, provider: 'gemini', encryptedKey });

// Worker decrypts at execution time
const key = decrypt(job.data.encryptedKey, process.env.ENCRYPTION_SECRET);
const gemini = new GoogleGenerativeAI(key);
```

### Pattern 2: BullMQ Flow for Pipeline DAGs

**What:** Parent-child job dependencies for the multi-step pipeline.

**When:** Scene generation (parallel image + TTS), video composition (depends on all assets)

**Example:**
```typescript
const flow = new FlowProducer({ connection: redis });
await flow.add({
  name: 'compose-video',
  queueName: 'video',
  data: { projectId },
  children: [
    { name: 'generate-image', queueName: 'image', data: { sceneId: 1 } },
    { name: 'generate-image', queueName: 'image', data: { sceneId: 2 } },
    { name: 'generate-tts', queueName: 'tts', data: { scriptId } },
  ],
});
```

### Pattern 3: Idempotent Workers

**What:** Every job can be retried safely. Use unique asset keys, check-before-write.

**When:** All worker jobs (AI calls can timeout, FFmpeg can crash)

**Example:**
```typescript
// Check if asset already exists before generating
const existing = await supabase.storage.from('assets').list(assetPath);
if (existing.data?.length) return existing.data[0]; // skip regeneration
```

### Pattern 4: Progressive Enhancement UI

**What:** The 4-step pipeline UI lets users intervene at each step. Not a black box.

**When:** Script editing, scene reordering, voice selection, final preview

**Rationale:** Users want control. Auto-generated content needs human review. Each step is save-able and resumable.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic API Routes for Heavy Work

**What:** Running FFmpeg or AI calls inside Next.js API routes
**Why bad:** Vercel has 10s (hobby) / 60s (pro) function timeout. FFmpeg jobs take minutes. API routes will timeout.
**Instead:** Enqueue BullMQ job, return job ID, poll/subscribe for completion.

### Anti-Pattern 2: Storing Video in Database

**What:** Saving video blobs in PostgreSQL
**Why bad:** PostgreSQL is not a file system. Kills performance, inflates backup size.
**Instead:** Supabase Storage (S3-compatible). Store only the URL/path in the database.

### Anti-Pattern 3: Synchronous Pipeline

**What:** Waiting for each step to complete before starting the next in a single request
**Why bad:** End-to-end Shorts generation takes 5-15 minutes. No HTTP request should last that long.
**Instead:** Async job queue with real-time status updates via Supabase Realtime.

### Anti-Pattern 4: Hardcoded AI Provider

**What:** Tightly coupling to one AI provider (e.g., only Gemini)
**Why bad:** Users bring their own keys. APIs change, shut down (Sora is shutting down Sep 2026).
**Instead:** Provider adapter pattern. Each AI capability (text, image, video, TTS) has an interface. Providers implement the interface.

### Anti-Pattern 5: Processing Video Client-Side

**What:** Using @ffmpeg/ffmpeg (WASM) in the browser for final rendering
**Why bad:** Slow (5-10x slower than native FFmpeg), limited codecs, crashes on large files, drains user battery.
**Instead:** Server-side FFmpeg on the worker. Client-side only for lightweight preview (Remotion Player).

## Scalability Considerations

| Concern | At 10 users | At 1K users | At 10K users |
|---------|-------------|-------------|--------------|
| Worker capacity | 1 Railway container, 2 workers | 3-5 containers, auto-scale | Kubernetes with horizontal pod autoscaling |
| Redis | Upstash free tier | Upstash Pro ($10/mo) | Dedicated Redis cluster |
| Storage | Supabase free tier (1GB) | Supabase Pro (100GB) | S3 with CDN |
| Database | Supabase free tier | Supabase Pro, connection pooling | Read replicas, pgBouncer |
| AI API costs | User-borne | User-borne | User-borne (platform scales cost-free) |
| YouTube API quota | 10K units/day default | Request quota increase | Multiple projects or quota increase |

## Sources

- [BullMQ Flow Producers](https://docs.bullmq.io/guide/flows) - DAG job dependencies
- [Supabase Realtime](https://supabase.com/docs/guides/realtime) - WebSocket subscriptions
- [Vercel Function Limits](https://vercel.com/docs/functions/runtimes) - 10s/60s timeouts
- [Remotion Player Docs](https://www.remotion.dev/docs/player/player) - Client-side video preview
