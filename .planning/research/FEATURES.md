# Feature Landscape

**Domain:** YouTube Shorts Automation SaaS (Korean Creator Market)
**Researched:** 2026-04-07
**Confidence:** MEDIUM-HIGH (based on 15+ competitor products analyzed)

## Competitor Map

Before diving into features, here is the competitive landscape segmented by function:

| Segment | Products | What They Do |
|---------|----------|--------------|
| Channel Analysis | TubeLens, vidIQ, TubeBuddy, SocialInsider | Competitor benchmarking, CII scores, keyword/subtitle extraction |
| Script Writing | Subscribr, TubeAI, Syllaby, Jasper | Tone-learning AI scripts, competitor analysis, retention optimization |
| Faceless Video Generation | AutoShorts.ai, Crayo, ShortX, ShortsFaceless, FluxNote | Topic-to-video automation, auto-posting |
| Long-to-Short Clipping | Opus Clip, Vizard, AICO, Descript, Alphacut | Extract highlights from long videos, reframe to 9:16 |
| Full Video Creation | InVideo AI, Pictory, Canva, Vrew | Script-to-video with stock footage, AI images, TTS |
| SEO/Optimization | vidIQ, TubeBuddy, quso.ai, StreamLadder | Thumbnail A/B testing, virality scoring, tag optimization |

**Key Insight:** No single product combines benchmarking-based script generation + full video production pipeline + channel analytics. This is the gap YouTuber Min targets.

---

## Table Stakes

Features users expect from any YouTube Shorts automation tool. Missing these means users leave immediately.

### TS-1: AI Script/Narration Generation

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Every competitor offers this. AutoShorts, Crayo, InVideo AI all generate scripts from topics. |
| **Complexity** | Low -- LLM API call with structured prompt |
| **What Users Expect** | Topic input -> complete narration script with hook, body, CTA structure |
| **Competitors** | AutoShorts.ai, Crayo, InVideo AI, Pictory, ShortX |
| **Notes** | Table stakes is GENERIC script generation. Benchmarking-based generation is a differentiator (see D-1). |

### TS-2: AI Image Generation (Scene-by-Scene)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Core of faceless video creation. All competitors split scripts into scenes with AI-generated visuals. |
| **Complexity** | Medium -- requires scene parsing, prompt engineering, style consistency |
| **What Users Expect** | Script auto-split into scenes, each scene gets a matching AI image |
| **Competitors** | AutoShorts.ai, Crayo, InVideo AI, Canva, Pictory |
| **Notes** | Must support style/character consistency across scenes. Users expect to choose art styles. |

### TS-3: TTS Voice Narration

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Every faceless video tool includes TTS. ElevenLabs integration is industry standard. |
| **Complexity** | Low-Medium -- API integration, voice selection UI |
| **What Users Expect** | Multiple voice options, male/female, speed control, natural-sounding Korean |
| **Competitors** | AutoShorts.ai (built-in), InVideo AI (30-sec voice clone), ElevenLabs (standalone), Crayo |
| **Notes** | Korean language TTS quality is critical for this market. Most global tools have weak Korean support. |

### TS-4: Auto-Generated Subtitles/Captions

| Aspect | Detail |
|--------|--------|
| **Why Expected** | 85%+ of Shorts are watched without sound. Captions are non-negotiable. |
| **Complexity** | Medium -- font customization, positioning, timing sync, style presets |
| **What Users Expect** | Word-by-word highlight animation, customizable fonts/colors/shadows, multiple style presets |
| **Competitors** | Every single competitor. Vizard, Opus Clip, AutoShorts, Crayo all include this. |
| **Notes** | Caption styling is a major engagement factor. Must support Korean text well (character width, line breaks). |

### TS-5: Video Assembly and Preview

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Users need to see the final product before publishing. Basic timeline/preview is minimum. |
| **Complexity** | High -- video rendering, timeline UI, real-time preview |
| **What Users Expect** | Combine narration + images + captions into final video. Preview before export. |
| **Competitors** | InVideo AI, Pictory, Crayo, ShortX |
| **Notes** | Does NOT need to be a full NLE (non-linear editor). A step-by-step wizard (4-step pipeline from PROJECT.md) is sufficient and often preferred. |

### TS-6: Video Export (9:16 Shorts Format)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Output must be ready-to-upload 9:16 vertical video at 1080x1920. |
| **Complexity** | Medium -- server-side rendering with FFmpeg or cloud service |
| **What Users Expect** | Download as MP4, no watermark on paid plan, fast rendering |
| **Competitors** | All competitors |
| **Notes** | Watermark on free tier is standard monetization pattern. |

### TS-7: YouTube Upload Integration

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Most competitors offer direct publishing. Manual download-then-upload feels outdated. |
| **Complexity** | Medium -- YouTube Data API v3 OAuth, title/description/tags |
| **What Users Expect** | One-click publish with auto-generated title, description, tags |
| **Competitors** | AutoShorts.ai (auto-pilot posting), InVideo AI, Crayo |
| **Notes** | YouTube API quota limits are a real constraint. Schedule posting is expected alongside. |

### TS-8: Project/History Management

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Users create many videos. They need to find, edit, and re-use past projects. |
| **Complexity** | Low -- CRUD with database |
| **What Users Expect** | List of past projects, edit/duplicate, draft status |
| **Competitors** | All SaaS competitors |
| **Notes** | Often overlooked but critical for retention. |

---

## Differentiators

Features that set YouTuber Min apart. Not all competitors have these; having them creates competitive advantage.

### D-1: Benchmarking-Based Script Generation (CORE DIFFERENTIATOR)

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Instead of generic AI scripts, analyze successful channels' tone/hooks/structure and generate scripts that replicate what works. No competitor combines channel analysis + script generation in one flow. |
| **Complexity** | High -- subtitle extraction, tone analysis, structural pattern recognition, prompt engineering |
| **How It Works** | 1) User selects benchmark channels -> 2) System extracts subtitles/structure -> 3) AI analyzes hook patterns, tone, pacing -> 4) Generates scripts matching that "feel" |
| **Closest Competitors** | Subscribr (learns YOUR tone, not competitors'), TubeAI (learns YOUR channel), TubeLens (analysis only, no generation) |
| **Why Differentiated** | Subscribr/TubeAI learn from YOUR existing content. YouTuber Min learns from SUCCESSFUL channels you want to emulate. This is "study the winners" vs "be more like yourself." |
| **Notes** | This is the product's reason to exist. Must be excellent. Phase 1 priority. |

### D-2: Channel Search and Analysis Engine

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Find channels worth benchmarking using data (CII, engagement rate, growth velocity). Like TubeLens but integrated into the creation pipeline. |
| **Complexity** | Medium -- YouTube Data API, metrics calculation, ranking algorithms |
| **How It Works** | Search by keyword/niche -> see channels ranked by performance metrics -> select as benchmark targets |
| **Closest Competitors** | TubeLens (standalone Windows app + web lite version), vidIQ (browser extension), TubeBuddy (browser extension) |
| **Why Differentiated** | Competitors are standalone analysis tools. YouTuber Min integrates analysis directly into the creation workflow. Analysis -> Script -> Video in one platform. |
| **Notes** | CII (Content Impact Index) = (views / subscriber_count) metric. TubeLens charges separately for this. |

### D-3: Voice Cloning from 3-Second Sample

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Clone a voice from just 3 seconds of audio. InVideo AI requires 30 seconds. ElevenLabs requires 60+ seconds. This is a significant UX improvement. |
| **Complexity** | High -- Qwen3-TTS integration, voice embedding, quality assurance |
| **How It Works** | User uploads 3-second voice sample -> system creates voice profile -> all narrations use cloned voice |
| **Closest Competitors** | InVideo AI (30-sec clone, $25+/mo), ElevenLabs (60-sec clone, $5+/mo) |
| **Why Differentiated** | 10x shorter sample requirement. Self-hosted Qwen3-TTS (Apache 2.0) eliminates per-character API costs. Korean-optimized. |
| **Notes** | Quality must be validated. 3-second clone quality may be lower than 30-second clone. Need A/B comparison during development. |

### D-4: AI Video Generation (Scene-Level Motion)

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Beyond static images -- generate short video clips per scene using Kling/Veo/Sora APIs. Dramatic quality uplift over slideshow-style Shorts. |
| **Complexity** | High -- multi-model API integration, async rendering, cost management |
| **How It Works** | Each scene gets both image and video generation options. User picks per-scene. |
| **Closest Competitors** | InVideo AI (Sora 2 + Veo 3.1 + Kling 3.0 built-in), ElevenLabs Video |
| **Why Differentiated** | BYOK (Bring Your Own Key) model. User uses their own API keys, avoiding SaaS markup. Gemini's $300 free credit makes this essentially free to start. |
| **Notes** | Video generation is expensive and slow. Must be optional per-scene, not mandatory. Image-only should remain the fast default. |

### D-5: BYOK (Bring Your Own API Key) Cost Model

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Users provide their own API keys (Gemini, OpenAI, Kling, etc.) instead of paying SaaS markup. Gemini offers $300 free credit. This makes the tool nearly free to use. |
| **Complexity** | Medium -- key management, multi-provider abstraction, usage tracking |
| **How It Works** | Settings page for API keys. System routes requests through user's keys. Dashboard shows API usage/cost. |
| **Closest Competitors** | Most SaaS tools charge per-video or subscription (AutoShorts $19-69/mo, InVideo $25-60/mo). Few offer BYOK. |
| **Why Differentiated** | Dramatically lower cost for users. Particularly powerful with Gemini's free tier. |
| **Notes** | Must clearly display estimated costs per video. Key security (encryption at rest) is critical. |

### D-6: Viral Score Prediction

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Score a script/title/thumbnail before publishing. Predict potential virality based on benchmark data. |
| **Complexity** | Medium-High -- requires training data from benchmarking, pattern matching |
| **How It Works** | AI scores hook strength, title CTR prediction, structural similarity to viral videos |
| **Closest Competitors** | quso.ai (AI Virality Score), StreamLadder (AI Virality Score), Opus Clip (clip ranking), TubeBuddy (CTR prediction) |
| **Why Differentiated** | Competitors score generic content. YouTuber Min scores against YOUR benchmark channels' patterns specifically. |
| **Notes** | Defer to Phase 2+. Requires accumulated benchmark data to be meaningful. |

### D-7: Trend Keyword Analysis

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Real-time trending keywords and hashtags in the user's niche. Inform topic selection. |
| **Complexity** | Medium -- YouTube trending API, keyword aggregation, niche filtering |
| **How It Works** | Dashboard showing trending topics in selected niches. Suggested topics based on trend + benchmark intersection. |
| **Closest Competitors** | vidIQ (trending topics), TubeBuddy (keyword explorer), Subscribr (outlier detection) |
| **Why Differentiated** | Integrated into script generation flow. Not a separate tool but a step in the pipeline. |
| **Notes** | YouTube API provides limited trending data. May need to supplement with Google Trends API. |

### D-8: Performance Dashboard

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Track uploaded Shorts performance (views, likes, subscribers gained) to close the feedback loop. |
| **Complexity** | Medium -- YouTube Analytics API, data visualization |
| **How It Works** | After uploading, track each Short's performance. Compare against benchmark targets. |
| **Closest Competitors** | vidIQ, TubeBuddy, YouTube Studio (built-in) |
| **Why Differentiated** | Connected to benchmark data. "Your Short got 2x the views of the benchmark average" is more meaningful than raw numbers. |
| **Notes** | Phase 3+. Requires YouTube Analytics API access (separate from Data API). |

### D-9: Script A/B Variants

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Generate multiple script versions from the same benchmarking data. Compare hooks, structures, tones side by side. |
| **Complexity** | Low -- same LLM call with temperature/prompt variation |
| **How It Works** | "Generate 3 variants" button. Side-by-side comparison UI. |
| **Closest Competitors** | No direct competitor does script A/B at generation time |
| **Why Differentiated** | Most tools generate one script. Offering variants lets creators pick the best hook. |

---

## Anti-Features

Features to deliberately NOT build. Including reasoning.

### AF-1: Long-Form to Shorts Clipping

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Completely different product category. Opus Clip, Vizard, AICO own this space. Requires video analysis AI, speaker tracking, highlight detection -- none of which relates to benchmarking-based script generation. |
| **What to Do Instead** | Focus on original content creation from scripts. If users want clipping, recommend Opus Clip or AICO. Consider v2 integration. |
| **Competitors Already There** | Opus Clip ($9+/mo), Vizard (free tier), AICO ($5-16/mo), Descript ($24/mo) |

### AF-2: AI Avatar / Lip-Sync

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Technology still maturing rapidly (HeyGen, Synthesia). Extremely GPU-intensive. Not relevant for faceless content which is the target use case. |
| **What to Do Instead** | Target faceless content creators explicitly. Avatars are for corporate/explainer content, not Shorts virality. |
| **Competitors Already There** | HeyGen ($29/mo), Synthesia ($29/mo), AI Studios ($29/mo) |

### AF-3: Full Non-Linear Video Editor

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Building a video editor is a multi-year, multi-team effort. CapCut, DaVinci Resolve, Premiere Pro exist. Users don't want another editor; they want automation. |
| **What to Do Instead** | Step-by-step wizard UI (script -> scenes -> voice -> final video). Minimal editing controls (reorder scenes, adjust timing). Export to CapCut if users want fine editing. |

### AF-4: Mobile Native App

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | 1-person team. Mobile development doubles effort. Video editing UX is poor on mobile. Target users (serious creators) work on desktop. |
| **What to Do Instead** | Responsive web app. Preview-only on mobile is fine. All creation on desktop web. |

### AF-5: Self-Hosted AI Models (Training from Scratch)

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | External APIs (Gemini, OpenAI, Kling) are superior and constantly improving. Training custom models requires massive compute and data. BYOK model makes this unnecessary. |
| **What to Do Instead** | BYOK for all AI. Exception: Qwen3-TTS for voice cloning (self-hosted, Apache 2.0, justified by 99% cost savings over ElevenLabs). |

### AF-6: Multi-Platform Simultaneous Posting (v1)

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | TikTok and Instagram APIs have restrictive access policies. YouTube alone is complex enough for v1. Adding platforms triples OAuth/API complexity. |
| **What to Do Instead** | Export video file that users can manually upload to TikTok/Instagram. Add multi-platform in v2 once YouTube flow is proven. |

### AF-7: Background Music AI Generation

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Music generation (Suno, Udio) is impressive but adds significant complexity. Most Shorts creators use a small set of trending sounds. Not core to the value proposition. |
| **What to Do Instead** | Provide a curated library of royalty-free background tracks and SFX. Let users upload their own audio. AI music generation is a v2 feature. |

### AF-8: Real-Time Collaborative Editing

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Target user is solo creator. Collaboration adds massive complexity (CRDT, conflict resolution, permissions). |
| **What to Do Instead** | Single-user editing with project saves. |

### AF-9: Multi-Language UI (v1)

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | v1 targets Korean creators. English UI adds translation burden for a 1-person team. |
| **What to Do Instead** | Korean-only UI for v1. Use i18n framework from the start so v2 English support is easy to add. |

---

## Feature Dependencies

```
Channel Search (D-2) --> Benchmarking Analysis (D-1) --> Script Generation (TS-1)
                                                              |
                                                              v
                                                    Scene Parsing (TS-2)
                                                         |         |
                                                         v         v
                                                  Image Gen    Video Gen (D-4)
                                                         |         |
                                                         v         v
                                                    TTS Voice (TS-3)
                                                         |
                                                         v
                                                  Subtitle Gen (TS-4)
                                                         |
                                                         v
                                                  Video Assembly (TS-5)
                                                         |
                                                         v
                                                  Export (TS-6) --> YouTube Upload (TS-7)
                                                                        |
                                                                        v
                                                               Performance Dashboard (D-8)

Voice Cloning (D-3) --> feeds into --> TTS Voice (TS-3)
Trend Keywords (D-7) --> feeds into --> Topic Selection (before D-1)
Viral Score (D-6) --> uses data from --> Benchmarking Analysis (D-1)
BYOK (D-5) --> required by --> Image Gen, Video Gen, Script Gen (all AI calls)
Project Management (TS-8) --> wraps around --> entire pipeline
```

## MVP Recommendation

### Must Have (Phase 1 -- Core Pipeline)

1. **D-5: BYOK API Key Management** -- cost model must work from day 1
2. **D-2: Channel Search & Analysis** -- the entry point. Users discover channels to benchmark.
3. **D-1: Benchmarking-Based Script Generation** -- the CORE value. This is why users choose this over competitors.
4. **TS-1: AI Script Generation** -- outputs of benchmarking must produce usable scripts.
5. **TS-2: AI Image Generation** -- scripts need visuals. Scene-by-scene image generation.
6. **TS-3: TTS Voice Narration** -- basic multi-voice TTS (no cloning yet).
7. **TS-4: Auto Subtitles** -- non-negotiable for Shorts engagement.
8. **TS-5: Video Assembly + Preview** -- combine everything into viewable video.
9. **TS-6: Video Export** -- downloadable MP4 in 9:16.
10. **TS-8: Project Management** -- basic save/load/list projects.

### Defer to Phase 2

- **D-3: Voice Cloning** -- powerful but complex. Basic TTS is sufficient for MVP.
- **D-4: AI Video Generation** -- expensive, slow. Image-based Shorts work fine initially.
- **D-9: Script A/B Variants** -- nice UX but not core pipeline.
- **TS-7: YouTube Upload** -- users can download and upload manually for MVP.
- **D-7: Trend Keywords** -- nice-to-have, not core pipeline.

### Defer to Phase 3+

- **D-6: Viral Score Prediction** -- needs accumulated data from benchmarking usage.
- **D-8: Performance Dashboard** -- requires YouTube Analytics API, meaningful only with upload history.
- **AF-6: Multi-Platform Posting** -- after YouTube flow is proven.
- **AF-7: AI Music Generation** -- after core pipeline is solid.

---

## Pricing Landscape (Competitors)

For context on positioning:

| Product | Pricing | Model |
|---------|---------|-------|
| AutoShorts.ai | $0-69/mo | Per-video tiers (1-2x/day posting) |
| InVideo AI | $25-60/mo | Credit-based + model access tiers |
| Crayo | Free-paid | Freemium with limits |
| Pictory | $19+/mo | Tier-based |
| vidIQ | $7.50+/mo | Freemium (analysis only) |
| TubeBuddy | $19+/mo | Tier-based (analysis + optimization) |
| AICO | $5-16/mo | Minutes-based (clipping only) |
| ElevenLabs | $5-22/mo | Characters-based (voice only) |
| FluxNote | $19-49/mo | Flat rate unlimited |
| Subscribr | $19+/mo (AppSumo LTD available) | Script generation only |
| Wava AI | $19-69/mo | Video count tiers (30-150/mo) |

**YouTuber Min's BYOK model is a genuine pricing differentiator.** While competitors charge $20-70/month, BYOK with Gemini's $300 free credit means users effectively pay $0 for AI costs for months. Platform fee can be minimal ($5-10/mo) or freemium with usage limits.

---

## Sources

- [AutoShorts.ai](https://autoshorts.ai/) -- faceless video generator features and pricing (HIGH confidence)
- [InVideo AI Review 2026](https://max-productive.ai/ai-tools/invideo-ai/) -- voice cloning, multi-model video gen (MEDIUM confidence)
- [InVideo AI Pricing 2026](https://cut-the-saas.com/ai/invideo-ai-review-2026-is-it-actually-worth-it) -- detailed pricing/feature breakdown (MEDIUM confidence)
- [Shotstack: Best AI Tools for YouTube 2026](https://shotstack.io/learn/best-ai-tools-for-youtube-automation/) -- tool category breakdown (HIGH confidence)
- [VeeFly: 10 AI YouTube Automation Tools 2026](https://blog.veefly.com/tools/10-best-ai-powered-youtube-automation-tools-for-2026/) -- feature comparison (MEDIUM confidence)
- [TubeLens](https://www.tubelens.kr/) and [TubeLens Lite](https://lite.tubelens.kr/) -- channel analysis, CII scoring, subtitle extraction (HIGH confidence, directly verified)
- [Subscribr](https://subscribr.ai/) -- tone-learning script generation, competitor monitoring (MEDIUM confidence)
- [TubeAI](https://tubeai.app/youtube-script-writer) -- channel tone analysis, retention curves (MEDIUM confidence)
- [Vizard vs Opus Clip](https://vizard.ai/alternatives/opus) -- clipping tool comparison (HIGH confidence)
- [quso.ai Virality Score](https://quso.ai/products/virality-score) -- viral prediction features (MEDIUM confidence)
- [TubeBuddy Tools](https://www.tubebuddy.com/tools/thumbnail-analyzer/) -- thumbnail A/B testing, SEO (HIGH confidence)
- [AI Video API Pricing 2026](https://devtk.ai/en/blog/ai-video-generation-pricing-2026/) -- Kling/Sora/Veo pricing (MEDIUM confidence)
- [AICO](https://aico.tv/ko) -- Korean shorts clipping tool (HIGH confidence)
- [Faceless Video Comparison 2026](https://www.shortsfaceless.com/blog/2026-comparison-guide-ai-faceless-video-generator) -- ShortsFaceless vs AutoShorts vs ShortX (MEDIUM confidence)
- [Subscribr on AppSumo](https://appsumo.com/products/subscribr/) -- pricing/features (HIGH confidence)
