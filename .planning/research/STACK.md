# Technology Stack

**Project:** YouTuber Min -- AI YouTube Shorts Factory
**Researched:** 2026-04-07

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Next.js | 16.x | Full-stack framework | Dominant React meta-framework in 2026. App Router + Server Actions eliminate need for separate API server. Largest ecosystem, most hiring docs, best Vercel deployment story. 1-person team needs maximum leverage from one framework. | HIGH |
| React | 19.x | UI library | Bundled with Next.js 16. Server Components reduce client bundle. Remotion (video preview) requires React. | HIGH |
| TypeScript | 5.x | Type safety | Non-negotiable for a solo dev maintaining a complex pipeline. Catches errors at compile time. | HIGH |

### UI Layer

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | v4 | Styling | OKLCh color tokens, faster builds. shadcn/ui requires it. | HIGH |
| shadcn/ui (CLI v4) | Latest | Component library | Copy-paste components on Radix UI primitives. Full ownership, no dependency lock-in. Dashboard/form-heavy SaaS is its sweet spot. | HIGH |
| Framer Motion | 12.x | Animations | Smooth transitions for the 4-step pipeline UI. Lightweight, React-native integration. | MEDIUM |
| Recharts | 3.x | Dashboard charts | Performance dashboard (views, likes, subscribers). Works well with shadcn/ui. | MEDIUM |

### Database & ORM

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Supabase (PostgreSQL) | Latest | Primary database + Auth + Storage | Free tier (500MB DB, 1GB storage). Built-in auth (OAuth for Google/YouTube login), Row Level Security for multi-tenancy, real-time subscriptions for job status updates, file storage for audio/video assets. One service replaces 3-4 separate tools. | HIGH |
| Drizzle ORM | 0.39+ | Database ORM | ~7.4KB gzipped, zero runtime deps. SQL-like TypeScript API gives explicit control over queries. 20-25% faster than Prisma for simple queries. Better cold starts on serverless. Crossed Prisma in weekly downloads in late 2025. | HIGH |

### Job Queue & Background Processing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| BullMQ | 5.71+ | Job queue | Redis-backed, battle-tested for video processing pipelines. Flow producers enable DAG-style job dependencies (script -> scenes -> TTS -> video). Rate limiting prevents API quota exhaustion. Priority queues for paid users. | HIGH |
| Redis (Upstash) | 7.x | Queue backend + caching | Upstash offers serverless Redis with free tier (10K commands/day). Scales pay-per-use. Separate from Supabase to avoid eviction conflicts. | HIGH |

### Video Processing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| FFmpeg (system binary) | 7.x | Core video engine | Industry standard. Silence removal, subtitle burn-in, transitions, audio mixing, final encoding to 1080x1920 9:16. | HIGH |
| ffmpeg-static | 5.x | FFmpeg binary bundling | Bundles precompiled FFmpeg per platform. No global install needed. Works in Docker/serverless. | HIGH |
| Direct child_process.spawn | Node.js built-in | FFmpeg execution | fluent-ffmpeg is DEAD (unmaintained, broken with recent FFmpeg). mediaforge is too new (LOW confidence). Direct spawn with typed command builders is safer and gives full control. | HIGH |
| Remotion | 4.x | Video preview in browser | React-based video composition. Use <Player> for in-browser preview of scenes before final render. Free for teams <=3 people (solo dev qualifies). Server-side rendering via Remotion Lambda for final output. | MEDIUM |

### AI APIs (User-Provided Keys)

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| Google Gemini API | Script generation, benchmarking analysis, SEO optimization | Users get $300 free credits. Best Korean language understanding. Flash model is cheapest for bulk analysis. | HIGH |
| OpenAI API | Alternative script generation, GPT Image for thumbnails | GPT Image 1 Mini at $0.005/image is cheapest option. Users may prefer GPT over Gemini. | HIGH |
| Flux 2 (via fal.ai/Replicate) | Scene image generation | Flux 2 Pro tied for quality crown at $0.055/image. Flux 2 Schnell at $0.015 for fast drafts. API-first, no subscription needed. | HIGH |
| Kling 3.0 API (via fal.ai) | AI video generation | Cheapest per-second at $0.029/s. 66 free credits daily. Best value for short clips. | HIGH |
| Seedance 2.0 API | Alternative video generation | $0.022/s, cheapest overall. 12 input types. Good fallback when Kling is slow. | MEDIUM |
| Qwen3-TTS (Alibaba Cloud API) | Voice cloning + TTS | 3-second voice cloning. Korean supported. $0.01 per clone instance. Apache 2.0 for self-hosting later. Model: qwen3-tts-vc-2026-01-22. | HIGH |

### YouTube & Data Collection

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| YouTube Data API v3 | v3 | Channel analysis, video upload, metadata | Official Google API. videos.insert for uploads, #Shorts in title for classification. OAuth 2.0 required for user uploads. | HIGH |
| yt-dlp (via ytdlp-nodejs) | 2026.x | Subtitle/transcript download | Active development through April 2026. Node.js wrapper (ytdlp-nodejs) provides type-safe interface. Supports SRT/ASS subtitle formats. | HIGH |
| googleapis npm | Latest | YouTube API client | Official Google Node.js client. Handles OAuth refresh, resumable uploads. | HIGH |

### Payments

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| Stripe | Subscription billing | Industry standard for SaaS. Hosted Customer Portal for plan changes. Webhook-driven sync with Supabase. Credit system possible for pay-per-video model. | HIGH |

### DevOps & Deployment

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| Vercel | Frontend + API routes hosting | Native Next.js 16 support. Edge functions, preview deployments. Free tier generous for MVP. | HIGH |
| Railway or Fly.io | Worker server (BullMQ + FFmpeg) | Vercel can't run long FFmpeg jobs. Railway offers persistent containers with $5/mo hobby plan. Docker support. | HIGH |
| Docker | Worker containerization | Bundle FFmpeg + yt-dlp + Node.js worker. Reproducible builds. | HIGH |
| GitHub Actions | CI/CD | Free for public repos, 2000 min/mo for private. Lint, test, deploy pipeline. | HIGH |

### Supporting Libraries

| Library | Purpose | When to Use | Confidence |
|---------|---------|-------------|------------|
| Zod | Schema validation | Validate API key formats, user inputs, AI API responses. | HIGH |
| next-auth (Auth.js) v5 | OAuth (if not using Supabase Auth) | Only if Supabase Auth doesn't meet needs. Supabase Auth preferred for simplicity. | LOW |
| @tanstack/react-query | Server state management | Cache YouTube API responses, poll job status. | HIGH |
| uploadthing or Supabase Storage | File uploads | User audio samples for voice cloning, video assets. Supabase Storage preferred (already in stack). | MEDIUM |
| date-fns | Date formatting | Scheduled uploads, dashboard date displays. | HIGH |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | Next.js 16 | Nuxt 4 | Vue ecosystem smaller. React required for Remotion. |
| Framework | Next.js 16 | SvelteKit | Smaller ecosystem. Remotion not available. Solo dev needs maximum library availability. |
| Database | Supabase | PlanetScale | MySQL-based. No built-in auth/storage. $34/mo minimum (no free tier). |
| Database | Supabase | Neon | PostgreSQL but no auth/storage/realtime bundled. More pieces to integrate. |
| ORM | Drizzle | Prisma 7 | Larger bundle (cold start penalty). Generated client adds complexity. Drizzle's SQL-like syntax better for a dev who knows SQL. |
| Job Queue | BullMQ | Temporal | Overkill for v1. BullMQ covers video pipeline DAGs. Temporal adds operational complexity. |
| Video | FFmpeg direct | Remotion-only | Remotion is great for composition/preview but FFmpeg needed for low-level ops (silence removal, audio mixing). Use both. |
| Video | FFmpeg direct | fluent-ffmpeg | DEAD. Unmaintained. Broken with FFmpeg 7.x. |
| Video | FFmpeg direct | mediaforge | Too new, unproven at scale. Direct spawn is safer. |
| TTS | Qwen3-TTS | ElevenLabs | 99% more expensive. User pays per character. Qwen3 is Apache 2.0 with comparable Korean quality. |
| Image Gen | Flux 2 + GPT Image | Midjourney | No developer API. Subscription-only. Can't integrate programmatically. |
| Video Gen | Kling 3.0 | Sora 2 | Sora API shutting down September 2026. Don't build on a dying platform. |
| Video Gen | Kling 3.0 | Veo 3.1 | $0.15/s -- 5x more expensive than Kling. Quality edge doesn't justify cost for Shorts. |

## Installation

```bash
# Core framework
npx create-next-app@latest youtuber-min --typescript --tailwind --eslint --app --src-dir

# UI
npx shadcn@latest init
npm install framer-motion recharts

# Database
npm install drizzle-orm @supabase/supabase-js
npm install -D drizzle-kit

# Job Queue
npm install bullmq ioredis

# Video Processing
npm install ffmpeg-static
npm install remotion @remotion/player @remotion/cli

# AI & APIs
npm install googleapis
npm install ytdlp-nodejs
npm install zod

# Payments
npm install stripe @stripe/stripe-js

# Utilities
npm install @tanstack/react-query date-fns

# Dev dependencies
npm install -D @types/node prettier eslint-config-next
```

## Sources

- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16) - Next.js 16 is current stable (16.2.2)
- [shadcn/ui CLI v4 Changelog](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4) - March 2026 release
- [Qwen3-TTS GitHub](https://github.com/QwenLM/Qwen3-TTS) - Voice cloning model details
- [Alibaba Cloud Qwen TTS Voice Cloning API](https://www.alibabacloud.com/help/en/model-studio/qwen-tts-voice-cloning)
- [YouTube Data API v3 Reference](https://developers.google.com/youtube/v3/docs)
- [BullMQ v5.71 Documentation](https://docs.bullmq.io/)
- [Drizzle vs Prisma 2026 Comparison](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [Remotion Licensing](https://www.remotion.dev/docs/license) - Free for teams <= 3 people
- [AI Video API Pricing 2026](https://modelslab.com/blog/api/veo-3-1-vs-kling-3-sora-2-ai-video-api-cost-2026)
- [AI Image Generation API Comparison 2026](https://blog.laozhang.ai/en/posts/ai-image-generation-api-comparison-2026)
- [Sora Shutdown Notice](https://klingapi.com/blog/sora-shutdown-ai-video-2026) - API closing September 2026
- [fluent-ffmpeg GitHub (readonly)](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - No longer maintained
- [ytdlp-nodejs](https://github.com/iqbal-rashed/ytdlp-nodejs) - Node.js wrapper for yt-dlp
