# Domain Pitfalls

**Domain:** YouTube Shorts Automation SaaS
**Researched:** 2026-04-07

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Running Heavy Jobs in Vercel Serverless Functions

**What goes wrong:** FFmpeg rendering, AI API calls, and YouTube uploads placed in Next.js API routes timeout after 10-60 seconds.
**Why it happens:** Developer starts with "just one API route" and it works for small files. As complexity grows, timeouts cascade.
**Consequences:** Failed video renders, corrupted uploads, frustrated users, impossible debugging.
**Prevention:** Day 1 architecture split: Next.js for UI/light API, BullMQ worker on Railway for ALL heavy work. No exceptions.
**Detection:** Any API route that takes > 5 seconds is a candidate for the worker queue.

### Pitfall 2: YouTube API Quota Exhaustion

**What goes wrong:** YouTube Data API v3 has a default quota of 10,000 units/day. A videos.insert costs 1,600 units. That's only ~6 uploads per day across ALL users.
**Why it happens:** Developers don't read quota docs until production.
**Consequences:** Users can't upload. Platform appears broken. Google quota increase requests take weeks.
**Prevention:** Apply for quota increase immediately upon project creation. Implement quota tracking per user. Cache YouTube API responses aggressively. Use YouTube Analytics API (separate quota) for dashboard data.
**Detection:** Monitor quota usage via Google Cloud Console. Alert at 50% daily usage.

### Pitfall 3: Sora API Dependency

**What goes wrong:** Building core video generation on OpenAI Sora 2.
**Why it happens:** Sora has brand recognition and developer mindshare.
**Consequences:** Sora app shuts down April 26, 2026. API shuts down September 24, 2026. Complete feature loss.
**Prevention:** Use Kling 3.0 or Seedance 2.0 as primary. Provider adapter pattern so swapping is a config change, not a rewrite.
**Detection:** Already detected. This is public knowledge.

### Pitfall 4: Storing API Keys in Plaintext

**What goes wrong:** User API keys (Gemini, OpenAI, etc.) stored unencrypted in the database.
**Why it happens:** "I'll encrypt later" mentality. Supabase RLS gives false sense of security.
**Consequences:** Single database leak exposes every user's paid API keys. Legal liability, trust destruction.
**Prevention:** Encrypt at rest with AES-256-GCM using a server-side secret. Decrypt only in worker memory at execution time. Never send decrypted keys to the client. Never log them.
**Detection:** Code review: search for any `apiKey` field without `encrypt()` wrapper.

### Pitfall 5: fluent-ffmpeg Dependency

**What goes wrong:** Using fluent-ffmpeg for video processing.
**Why it happens:** Every tutorial recommends it. It's the top npm result for "ffmpeg node".
**Consequences:** Library is DEAD. Read-only repo. Broken with FFmpeg 7.x. Bugs will never be fixed.
**Prevention:** Use direct `child_process.spawn()` with typed command builders. Or use mediaforge (newer, but less proven).
**Detection:** `npm ls fluent-ffmpeg` in your dependency tree.

## Moderate Pitfalls

### Pitfall 1: Voice Cloning Quality with Short Samples

**What goes wrong:** Qwen3-TTS claims 3-second minimum but quality is poor with < 10 seconds of reference audio.
**Prevention:** UI should request 10-20 seconds of clear audio. Show quality meter. Validate audio before cloning (no background noise, single speaker).

### Pitfall 2: FFmpeg Command Injection

**What goes wrong:** User-controlled inputs (filenames, subtitle text) injected directly into FFmpeg command strings.
**Prevention:** Never use string concatenation for FFmpeg commands. Use array-based arguments with `spawn()`. Sanitize all filenames. Use temporary directories with random names.

### Pitfall 3: Supabase Storage Limits on Free Tier

**What goes wrong:** 1GB storage fills up fast with video assets (each Shorts is 50-200MB with intermediate files).
**Prevention:** Implement aggressive cleanup of intermediate assets after final video is composed. Only keep final MP4 and source assets. Set per-user storage quotas. Plan for Supabase Pro ($25/mo, 100GB) early.

### Pitfall 4: OAuth Token Expiry for YouTube Upload

**What goes wrong:** User authenticates with Google, schedules upload for later. OAuth access token expires (1 hour). Upload fails silently.
**Prevention:** Store refresh token (not just access token). Implement token refresh before every YouTube API call. Handle refresh token revocation gracefully.

### Pitfall 5: AI API Response Format Changes

**What goes wrong:** Gemini/OpenAI change response format. Script parsing breaks.
**Prevention:** Zod schema validation on ALL AI API responses. Structured output (JSON mode) where available. Fallback parsing with retry.

### Pitfall 6: Korean Subtitle Encoding Issues

**What goes wrong:** Korean characters in SRT/ASS subtitles render as garbage in FFmpeg output.
**Prevention:** Force UTF-8 encoding throughout pipeline. Use `-charenc UTF-8` flag in FFmpeg. Test with Korean text from day 1.

## Minor Pitfalls

### Pitfall 1: Remotion License Confusion

**What goes wrong:** Assuming Remotion is fully free for commercial use.
**Prevention:** Free for teams <= 3 people. Solo dev qualifies for v1. Budget $100/mo for when team grows.

### Pitfall 2: yt-dlp Breakage from YouTube Changes

**What goes wrong:** YouTube frequently changes its frontend. yt-dlp breaks for days until patched.
**Prevention:** Pin yt-dlp version. Have fallback to YouTube Data API captions endpoint (lower quality but stable). Monitor yt-dlp GitHub releases.

### Pitfall 3: 9:16 Aspect Ratio Gotchas

**What goes wrong:** AI-generated images come in wrong aspect ratio. Stretching/cropping looks terrible.
**Prevention:** Always request 9:16 (1080x1920) from image generation APIs. Use FFmpeg pad/crop with smart centering. Preview aspect ratio before composition.

### Pitfall 4: BullMQ Memory Leaks with Large Payloads

**What goes wrong:** Passing video file contents in job data. Redis fills up.
**Prevention:** Never pass binary data in BullMQ jobs. Pass Storage URLs or file paths only. Keep job data < 1KB.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Auth + API Keys | Plaintext key storage | Encrypt from day 1, never shortcut |
| Channel Analysis | YouTube API quota | Apply for quota increase immediately |
| Subtitle Collection | yt-dlp breakage | Pin version, have API fallback |
| Script Generation | AI response format changes | Zod validation on all LLM responses |
| Image Generation | Wrong aspect ratio | Force 9:16 in all prompts |
| TTS | Poor voice clone quality | Request 10-20s audio, not 3s minimum |
| Video Composition | FFmpeg in API routes | Worker service from day 1 |
| Video Composition | fluent-ffmpeg dependency | Use spawn() directly |
| YouTube Upload | OAuth token expiry | Store + refresh tokens properly |
| Storage | Free tier limit (1GB) | Aggressive intermediate cleanup |

## Sources

- [YouTube API Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost) - videos.insert = 1600 units
- [Sora Shutdown Notice](https://klingapi.com/blog/sora-shutdown-ai-video-2026) - API closing September 2026
- [fluent-ffmpeg GitHub](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - Read-only, unmaintained
- [Qwen3-TTS Voice Cloning Docs](https://www.alibabacloud.com/help/en/model-studio/qwen-tts-voice-cloning) - 10-20s recommended
- [Remotion License](https://www.remotion.dev/docs/license) - Free for <= 3 people
