# Research Summary: YouTuber Min -- AI YouTube Shorts Factory

**Domain:** YouTube Shorts Automation SaaS (Korean Creator Market)
**Researched:** 2026-04-07
**Overall confidence:** HIGH

## Executive Summary

The YouTube Shorts automation space in 2026 is fragmented across multiple tool categories -- channel analysis (TubeLens, vidIQ), script generation (Subscribr, TubeAI), faceless video creation (AutoShorts.ai, Crayo), and full video editors (InVideo AI, Pictory). No single product combines benchmarking-based script generation with end-to-end video production and YouTube upload. This gap is YouTuber Min's core opportunity.

The technical stack for building this is mature and well-understood. Next.js 16 with App Router dominates the SaaS framework landscape. The critical architectural decision is splitting the application into a lightweight web frontend (Vercel) and a heavy worker service (Railway/Docker) connected via BullMQ, because Vercel's 10-60 second function timeouts cannot handle FFmpeg rendering, AI API calls, or YouTube uploads.

The AI API ecosystem has stabilized with clear winners: Gemini/OpenAI for text, Flux 2 for images ($0.015-0.055/image), Kling 3.0 for video ($0.029/s -- cheapest), and Qwen3-TTS for Korean voice cloning (Apache 2.0, 3-second sample). A critical finding is that OpenAI's Sora is shutting down (API closing September 2026), so building on it would be a fatal mistake. The user-owned API key model eliminates platform AI costs entirely, making unit economics extremely favorable.

The biggest technical risks are YouTube API quota limits (only ~6 uploads/day on default quota), fluent-ffmpeg being dead (unmaintained, broken with FFmpeg 7.x), and voice cloning quality requiring 10-20 seconds of reference audio despite 3-second minimums. All are manageable with early planning.

## Key Findings

**Stack:** Next.js 16 + Supabase + BullMQ/Redis + FFmpeg worker on Railway. User-owned API keys for AI services.
**Architecture:** Two-tier: Vercel (web) + Railway (worker). BullMQ DAG flows for pipeline orchestration. Supabase Realtime for job status.
**Critical pitfall:** YouTube API quota (1,600 units per upload, 10K/day default). Apply for increase on day 1.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation** - Auth, API key management, database schema, worker infrastructure
   - Addresses: TS-8 (project management), API key encryption
   - Avoids: Plaintext key storage pitfall
   - Rationale: Everything depends on this. Worker split must be day 1.

2. **Channel Intelligence** - YouTube channel search, subtitle extraction, benchmarking analysis
   - Addresses: D-1 (core differentiator), D-2 (channel analysis)
   - Avoids: YouTube API quota issues (apply for increase here)
   - Rationale: This is the product's reason to exist. Must be validated first.

3. **Script Pipeline** - AI script generation with benchmarking context, scene breakdown, A/B variants
   - Addresses: TS-1 (script generation), D-1 (benchmarking-based scripts)
   - Avoids: AI response format changes (Zod validation)
   - Rationale: Core value proposition. Depends on Phase 2 data.

4. **Media Generation** - AI images, TTS voice cloning, silence removal
   - Addresses: TS-2 (images), TS-3 (TTS), TS-4 (subtitles)
   - Avoids: Voice clone quality issues (10-20s audio request), 9:16 aspect ratio gotchas
   - Rationale: Parallel generation via BullMQ flows. Depends on scene breakdown.

5. **Video Assembly** - FFmpeg composition, Remotion preview, export
   - Addresses: TS-5 (preview), TS-6 (export)
   - Avoids: fluent-ffmpeg trap (use spawn directly), client-side FFmpeg anti-pattern
   - Rationale: Combines all assets. Heavy compute on worker only.

6. **Distribution & Analytics** - YouTube upload, SEO, scheduling, performance dashboard
   - Addresses: TS-7 (upload), D-6 (SEO), D-7 (scheduling), D-8 (dashboard)
   - Avoids: OAuth token expiry, quota exhaustion
   - Rationale: Last mile. Product is usable after Phase 5; this adds automation.

**Phase ordering rationale:**
- Each phase depends on the previous (can't generate scripts without benchmarking data, can't compose video without media assets)
- Foundation + Worker split MUST be first to avoid the #1 pitfall (Vercel timeouts)
- Benchmarking analysis before script generation because it's the core differentiator
- Distribution is last because users can manually upload until it's built

**Research flags for phases:**
- Phase 2: Needs deeper research on YouTube API quota increase process and timeline
- Phase 4: Needs deeper research on Qwen3-TTS local vs cloud deployment tradeoffs
- Phase 5: Needs deeper research on Remotion vs pure FFmpeg for final composition
- Phase 6: Standard patterns, unlikely to need additional research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Next.js 16, Supabase, BullMQ are all verified current and well-documented |
| Features | MEDIUM-HIGH | Competitor landscape well-mapped. Korean market specifics need validation. |
| Architecture | HIGH | Two-tier (web + worker) is standard for media processing SaaS |
| Pitfalls | HIGH | YouTube quota, fluent-ffmpeg death, Sora shutdown all verified with official sources |
| AI APIs | MEDIUM | Pricing verified but APIs change fast. Kling/Flux versions may shift. |
| TTS (Qwen3) | MEDIUM | Official docs verified. Real-world Korean quality needs hands-on testing. |

## Gaps to Address

- YouTube API quota increase process: How long does approval take? What justification is needed?
- Qwen3-TTS self-hosting feasibility: Can it run on Railway's GPU instances? Or must use Alibaba Cloud API?
- Korean TTS quality comparison: Qwen3-TTS vs CLOVA (Naver) vs Google Cloud TTS for Korean naturalness
- Remotion Lambda costs at scale: What does server-side rendering cost per video?
- AI video generation quality for Shorts: Is Kling 3.0 quality sufficient for 60s vertical videos?
- Multi-platform (TikTok/Reels) API availability: Worth including in v1 scope?
