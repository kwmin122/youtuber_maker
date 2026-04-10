# Phase 7: Long-form to Shorts Clipping — Assumptions Analysis

**Gathered:** 2026-04-10
**Status:** Pre-planning (awaiting user confirmation on risky items)
**Requirement:** CORE-07

---

## Safe Assumptions (derived from code, low risk)

### SA-01: FFmpeg is already available and invoked via spawn
- **Evidence:** `src/lib/video/ffmpeg-export.ts:1` imports `spawn` from `child_process`; `src/lib/video/ffmpeg-filter-graph.ts` builds filter chains; CLAUDE.md forbids fluent-ffmpeg.
- **Implication:** 9:16 clipping (crop + scale + re-encode) can reuse the same spawn pattern. No new binary decision needed for cutting/cropping.

### SA-02: Caption fetch for YouTube URLs uses `youtube-transcript`
- **Evidence:** `src/lib/youtube/transcript.ts` wraps `YoutubeTranscript.fetchTranscript`; `package.json` pins `youtube-transcript ^1.3.0`; priority ko → en → auto (D-08 inherited from Phase 2).
- **Implication:** Long-form caption ingestion path is already solved for YouTube URLs. Reuse `fetchTranscript(videoId)` unchanged for highlight detection input.

### SA-03: BullMQ + Railway worker is the correct execution surface
- **Evidence:** `src/worker/processor.ts` dispatches 13 job types; `src/app/api/jobs/route.ts` enqueues via `getQueue().add(type, ...)`; CLAUDE.md: "Two-tier architecture: Vercel(웹) + Railway(워커) — 서버리스 타임아웃 회피".
- **Implication:** All long-form work (download, analyze, clip) must live in `src/worker/handlers/`, not API routes.

### SA-04: New job types must be registered in two places
- **Evidence:** `src/app/api/jobs/route.ts:10-23` `ALLOWED_JOB_TYPES` const and `src/worker/processor.ts:18-48` switch. Both are hardcoded.
- **Implication:** Any new `longform-*` job types need mirrored entries in both files or the API rejects and the worker throws "Unknown job type".

### SA-05: `scenes` table keys on `scriptId`, not `projectId`
- **Evidence:** `src/lib/db/schema.ts:256-281` — `scenes.scriptId` NOT NULL references `scripts.id`.
- **Implication:** Injecting clipped segments as scenes requires either (a) creating a synthetic `scripts` row per long-form project or (b) altering the schema to make `scriptId` nullable / add `projectId` FK. See RA-04.

### SA-06: Supabase Storage path convention includes `sceneId`
- **Evidence:** `src/lib/media/storage.ts:19` — `${userId}/${projectId}/${sceneId}/${filename}` in the `media` bucket.
- **Implication:** Uploaded long-form files need a path that doesn't yet have a sceneId. A separate convention (e.g., `longform-sources/{userId}/{projectId}/source.mp4`) or new bucket is needed. Matches voice-samples precedent.

### SA-07: BYOK AI client factory already exists and returns an `AIProvider` interface
- **Evidence:** `src/lib/ai/get-user-ai-client.ts`, `src/lib/ai/gemini.ts` (`gemini-2.0-flash`), `src/lib/ai/openai.ts`. `generateText(prompt, { jsonMode, systemInstruction, temperature })` is the only call surface.
- **Implication:** Highlight detection prompt should target this narrow interface, not raw provider SDKs. Reuse `viral-scorer.ts` pattern (`src/lib/distribution/viral-scorer.ts`).

### SA-08: Current Gemini model is `gemini-2.0-flash` (hardcoded)
- **Evidence:** `src/lib/ai/gemini.ts:10` — `model: "gemini-2.0-flash"`. No model parameter exposed.
- **Implication:** "Gemini 1.5 Pro long context" mentioned in the phase brief does NOT exist in this codebase yet. Either (a) accept Flash's ~1M token window (sufficient for most transcripts) or (b) extend the provider interface. See RC-03.

### SA-09: Viral scoring module exists and is AI-prompt based (not acoustic)
- **Evidence:** `src/lib/distribution/viral-scorer.ts` — 4-dim breakdown (hookStrength, emotionalTrigger, trendFit, titleClickability) via `provider.generateText`. Takes title + script text, not audio.
- **Implication:** Existing scorer operates on text only — NOT on audio loudness / speaker energy / scene cuts. Reusable for rating candidate segments AFTER transcript slicing, but does NOT provide audio-based highlight detection.

### SA-10: URL parser covers channels, NOT individual videos
- **Evidence:** `src/lib/youtube/parse-url.ts` — `parseChannelUrl` only extracts channel_id / handle / custom. No `/watch?v=` or `youtu.be/<id>` video extraction.
- **Implication:** A new `parseVideoUrl` helper is required (or extend the existing file). Low effort but must be in scope.

---

## Risky Assumptions (need user confirmation)

### RA-01: Long-form source download uses `yt-dlp` binary via spawn
- **Evidence against it existing:** `package.json` has no yt-dlp / youtube-dl-exec / ytdl-core dependency; `Grep yt-dlp` across `src/` returns 0 hits; no binary install in repo.
- **Risk:** HIGH
- **If wrong:** Without a downloader, the worker cannot materialize pixels for clipping — only transcript-based "virtual clip" metadata is possible, which breaks success criterion #3 (scene assembly needs actual video files).
- **Why risky:** yt-dlp is a Python binary. Railway containers need explicit install (apt + pip). License-compliant npm wrappers exist (`youtube-dl-exec`, `@distube/ytdl-core`) but each has trade-offs: wrapper adds Node dependency, native binary requires Docker changes.
- **Proposed approach:** Install `yt-dlp` in Railway worker Docker image + wrap with `spawn()` (matches FFmpeg pattern). Alternatives: `@distube/ytdl-core` (pure Node, fragile vs. YouTube updates) or require users to upload files directly (breaks URL-input criterion).

### RA-02: Railway worker has enough disk and memory for multi-hundred-MB video files
- **Evidence:** `src/lib/video/ffmpeg-export.ts:41` uses `mkdtemp(join(tmpdir(), "export-"))`. No current job downloads >~30 MB (scene images + short videos).
- **Risk:** HIGH
- **If wrong:** 30-minute 1080p video ≈ 150-500 MB. Railway default containers can OOM or run out of ephemeral disk mid-download, leaving orphan temp files.
- **Proposed approach:** (a) Stream-download to disk (not memory) via yt-dlp directly to file, (b) delete source immediately after clipping, (c) cap source resolution at 720p for download, (d) add disk-space preflight + explicit temp cleanup in `finally` block.

### RA-03: Highlight detection is transcript-only (no audio/vision analysis in v1)
- **Evidence:** Existing AI provider interface only has `generateText`. No audio embedding, no vision, no scene-change detection helpers in codebase.
- **Risk:** MEDIUM
- **If wrong:** Pure text-based highlight detection misses visual cues (laughter, reaction shots, dramatic cuts). Quality of "viral segments" may be disappointing vs. tools like Opus Clip / Vizard.
- **Proposed approach for v1:** Transcript-only. Use Gemini to return JSON array of `[startMs, endMs, reason, hookScore, emotionalScore, informationDensity]`. Defer audio/vision to v2. User confirms this is acceptable MVP quality.

### RA-04: Clipped segments inject into existing scenes table via synthetic script row
- **Evidence:** `scenes.scriptId` is NOT NULL (`schema.ts:258`). Schema currently assumes scenes ← scripts ← projects.
- **Risk:** MEDIUM
- **If wrong:** Forcing synthetic scripts pollutes Phase 3 analytics, and the Phase 4 scene-card UI may show "이 장면을 재생성" buttons that make no sense for longform clips.
- **Proposed approach:** Create one `scripts` row per longform project with `content = fullTranscript`, `variant = 'longform'`, `hookType = 'n/a'`. scene_index maps to clip order. narration = clip transcript text. imagePrompt/videoPrompt = empty strings. mediaAssets.url = Supabase URL of the clipped MP4. Flag longform projects in `projects.workflowState.projectType = 'longform'` so UI can branch.
- **Alternative:** Extend `scenes` schema: make `scriptId` nullable, add `sourceType` enum ('script'|'longform'), add `sourceClipStartMs`/`sourceClipEndMs` columns. Cleaner but more DB churn.

### RA-05: 9:16 crop uses static center-crop (no face/subject tracking)
- **Evidence:** No face-detection / vision code present (no opencv, no mediapipe, no roboflow).
- **Risk:** MEDIUM
- **If wrong:** Center-crop on 16:9 lectures loses on-screen text/faces on the sides → viewer complaints.
- **Proposed approach v1:** Static crop with user-selectable focus point (left / center / right). Offer 3 crop presets per clip in the UI. Defer auto-reframe to a later phase.

### RA-06: Upload path for user-uploaded files goes through Supabase Storage first
- **Evidence:** All existing media flows use `storage.ts:uploadMedia` before worker processing. No direct streaming upload to worker.
- **Risk:** MEDIUM
- **If wrong:** Next.js App Router has ~4.5 MB default body limit. Uploading a 500 MB video directly to an API route will fail. Supabase has a 50 MB default per-file cap on free tier unless resumable uploads are used.
- **Proposed approach:** Use Supabase Storage resumable upload (tus protocol) directly from the browser with a signed URL, then enqueue `longform-download` job with the storage path. For URL input, worker downloads directly to its own disk (never round-trips through Supabase).

### RA-07: UI adds a new tab "Longform" in existing project detail, NOT a new project type
- **Evidence:** `src/components/project/workflow-tabs.tsx` has 5 fixed tabs (script/scene/voice/video/distribution). `projects` table has no `projectType` column (`schema.ts:46-64`).
- **Risk:** MEDIUM
- **If wrong:** Forcing longform into the same 5-tab workflow creates broken states (script tab irrelevant, scene tab repurposed). Users expect a dedicated entry.
- **Proposed approach:** Add a 6th tab "Longform" visible only when `workflowState.projectType === 'longform'` OR a new top-level `/projects/new?type=longform` flow. Either way, add `workflowState.projectType: 'shorts' | 'longform'` discriminator. User decides: new tab vs. new project type.

---

## Technical Constraints

### TC-01: FFmpeg binary version on Railway
- FFmpeg 7.x only (CLAUDE.md: "fluent-ffmpeg… FFmpeg 7.x 호환 불가"). Crop filter syntax: `crop=ih*9/16:ih,scale=1080:1920`. Confirm the Railway base image ships ffmpeg ≥ 7.

### TC-02: Gemini 2.0 Flash context window
- Current hardcoded model. Context is ~1M tokens per Gemini docs — sufficient for ~2-3 hour transcripts. However the `generateText` wrapper caps `maxOutputTokens` at 4096 default (`gemini.ts:13`). Highlight JSON for 10 candidates × 6 fields fits, but we should verify and explicitly set `maxTokens: 8192` in the highlight call.

### TC-03: BYOK model selection is NOT user-configurable
- `get-user-ai-client.ts` picks provider by checking which keys the user has, but the model string is hardcoded. If a user has only OpenAI, `gpt-4o-mini` (or whatever is set in `openai.ts`) is used. Verify OpenAI path supports long context or fall back to chunked sliding window.

### TC-04: Railway worker timeouts and disk quotas
- No evidence of BullMQ job timeout config in `src/lib/queue.ts` or `src/worker/index.ts` read here. Default BullMQ has no timeout, but Railway container memory is the real limit. A 1-hour long-form analyze+clip pipeline needs explicit long-running job handling.

### TC-05: `tmpdir()` ephemeral cleanup
- `ffmpeg-export.ts` uses try/finally with `rm` but any long-form handler must do the same. Orphaned multi-GB files will kill the worker.

### TC-06: No vision/audio ML dependencies installed
- No onnxruntime-node, no @tensorflow/tfjs-node, no opencv. Audio-based highlight detection would require new deps and binary size. Defer.

### TC-07: No ffprobe helper yet
- Need video duration/resolution before clipping. Either add `ffprobe` spawn helper or parse ffmpeg stderr. Trivial but missing.

---

## Integration Points (how CORE-07 output plugs into v1 pipeline)

### IP-01: Longform clip → Phase 4 scene row → Phase 5 export pipeline
- After clipping, insert `scenes` row (narration = transcript slice, duration = clip length), insert `media_assets` row (type='video', url=clipped MP4 in Supabase, provider='longform-clip', status='completed'). Phase 5's `handleExportVideo` should then treat longform scenes identically to AI-generated ones.
- **Gotcha:** `media_assets.provider` currently expects `'openai-dalle3' | 'kling' | 'openai-tts' | 'qwen3-tts'` (schema comment, `schema.ts:291`). Add `'longform-clip'` as allowed provider string and audit any switch statements.

### IP-02: Longform → existing Phase 6 distribution
- Once scenes exist and `export-video` produces MP4, Phase 6 `upload-youtube` + `generate-seo` + `generate-thumbnail` jobs work unchanged. No integration work required.

### IP-03: `projects.workflowState` drives UI routing
- `projects.workflowState.currentStep` and `completedSteps` are already jsonb. Add `projectType: 'shorts' | 'longform'` and `longformSourceUrl`, `longformSourceStoragePath` fields inside `workflowState` to avoid schema migration. Reserve migration for v2 if it becomes load-bearing.

### IP-04: Job progress reporting uses existing `jobEvents` table
- `jobEvents.event` and `jobEvents.data` are free-form. Realtime subscribers (Supabase Realtime) already reactive. New `longform-*` jobs must emit `progress` events with the same shape (percent 0-100, currentStep string) so the existing `JobProgress` component (`src/components/job-progress.tsx`) renders them without changes.

### IP-05: `api_keys` for yt-dlp? No — yt-dlp is unauthenticated
- yt-dlp does not require user BYOK. Unlike Gemini/OpenAI, the download step needs no encrypted key retrieval. Only the highlight-analyze step hits the AI provider and needs `getUserAIClient(userId)`.

---

## Open Questions (ambiguous scope decisions)

### OQ-01: What counts as "long-form"? Minimum/maximum duration?
- Phase brief says "긴 YouTube 영상" but does not define. Is 3 minutes enough to trigger longform flow? What about 4-hour podcasts? Decision affects transcript chunking strategy and download timeouts.
- **Suggestion:** Min 3 min, max 2 hours for v1. Reject outside range with friendly error.

### OQ-02: File upload max size and formats?
- Supabase Storage has per-plan caps (Free: 50 MB, Pro: 50 GB). Formats: mp4 only? mov? mkv? webm?
- **Suggestion:** mp4/mov, max 2 GB (Pro tier), reject others with client-side validation.

### OQ-03: User picks clips manually or one-click auto-clip all 5-10?
- Success criterion #3 says "사용자가 선택한 구간" (user-selected) but #1 says "5~10개 자동 탐지" (auto-detected). Does the user choose from candidates, or does the system auto-clip all and let the user delete?
- **Suggestion:** Auto-detect 5-10 → UI shows candidates with scores → user checks boxes → batch clip-and-inject.

### OQ-04: Does each clipped segment become its OWN project or a single project with N scenes?
- Each shorts clip is typically uploaded as a separate YouTube Short. If they're scenes in one project, Phase 6 exports ONE video. If they're separate projects, Phase 6 uploads N shorts.
- **Suggestion:** One longform source → N child projects (one per chosen clip). Parent project tracks source URL; child projects inherit via `workflowState.parentProjectId`. This unlocks per-clip SEO/thumbnail/schedule.
- **Counter:** Adds cross-project relations not in current schema. Alternative: one project, N scenes, user picks one as "primary" for upload, repeats the export cycle. Simpler but worse UX.

### OQ-05: Viral scoring — reuse existing `viral-scorer.ts` or new module?
- `viral-scorer.ts` takes `title + scriptContent + description`. Candidate segments have no title yet. Either (a) reuse it by treating each segment as a mini-script (score is about the segment's hook potential), or (b) write a new `highlight-scorer.ts` that returns per-segment scores during detection (one AI call instead of N).
- **Suggestion:** (b) Single highlight-detect call returns segments with scores in one JSON response. Reuse `viral-scorer.ts` later if the user wants to re-score a specific chosen clip.

### OQ-06: New Drizzle tables or extend existing?
- Options: (1) `longform_sources` table (sourceUrl, storagePath, duration, transcriptId, status, projectId FK) + `longform_candidates` table (sourceId, startMs, endMs, score, reason, isSelected). (2) No new tables — stash everything in `projects.workflowState` jsonb + `jobs.result`.
- **Suggestion:** (1) for queryability and re-detection without re-download. `longform_sources` is 1:1 with project, `longform_candidates` is 1:N.

### OQ-07: Transcript storage for longform — reuse `transcripts` table or inline?
- `transcripts` table (`schema.ts:145-162`) FK's to `videos`, which is Phase 2 channel-benchmark videos. A longform source is not necessarily a benchmarked video.
- **Suggestion:** Inline the transcript in `longform_sources.transcript` jsonb column. Avoids awkward FK to Phase 2 videos.

### OQ-08: How many simultaneous longform jobs per user?
- Disk-heavy jobs need concurrency limits. BullMQ supports per-queue concurrency but current queue config unread here.
- **Suggestion:** 1 concurrent longform download per user; other queues unaffected.

### OQ-09: What happens if transcript is missing for a YouTube URL?
- `fetchTranscript` returns null (e.g., private videos, disabled captions). STT fallback is stubbed (`transcript.ts:88 fetchTranscriptViaStt` TODO).
- **Suggestion v1:** Fail fast with clear error. Don't attempt STT. User can re-try with a different video or switch to file upload with user-provided transcript.

### OQ-10: "오디오 분석" in success criterion #1 — what does it mean exactly?
- Phase brief says "자막 + 오디오 분석". If we're transcript-only (RA-03), we need user to agree to downscope this phrase. Otherwise we need waveform analysis, which requires new deps and adds scope.
- **Suggestion:** Clarify with user. Propose deferring audio analysis to a later phase.

---

## Conflicts with Prior Phase Decisions

- **C-01 (Phase 4 D-22 job types):** Phase 4 introduced 4 job types (split-scenes, generate-image, generate-video, generate-tts). Phase 7 will add 3 more (longform-download, longform-analyze, longform-clip). `ALLOWED_JOB_TYPES` list will grow to 16. No actual conflict, just bookkeeping.
- **C-02 (Phase 5 D-13 export-video):** Phase 5 assumes scene media comes from AI (DALL-E / Kling) via `media_assets.provider`. Longform-clipped MP4 must be an allowed provider value or the export handler may filter them out. Audit `handleExportVideo` for provider-based filtering.
- **C-03 (Phase 4 D-18 scenes schema):** Phase 4 made `scenes.scriptId` NOT NULL assuming all scenes come from scripts. See RA-04 — this is the main schema tension.
- **C-04 (Phase 2 D-08 transcript lang priority):** Phase 2 set ko → en → auto for channel benchmarking. Longform inherits this automatically via `fetchTranscript`. No conflict.

---

## Implicit Assumptions (often missed)

- **IA-01:** Railway Docker image will be extended with `yt-dlp` (apt or pip install). This is a deployment/infra change outside Phase 7 code scope but blocks delivery.
- **IA-02:** Node.js version supports `child_process.spawn` streaming (it does, since Node 0.x — but Bun lockfile is present, so worker may run on Bun. Verify `bun.lock` means dev-only or production.)
- **IA-03:** `bun.lock` exists at repo root but `package.json` scripts use `tsx src/worker/index.ts`. Assume worker runtime is Node on Railway, Bun only for local dev.
- **IA-04:** Supabase Storage public URLs work for yt-dlp's output (public bucket or signed URLs). `storage.ts:getPublicUrl` uses public — confirm media bucket policy.
- **IA-05:** `youtube-transcript` package still functions against 2026 YouTube (InnerTube timedtext). Package is unmaintained-ish; may break. No fallback in Phase 7 beyond Phase 2's planned STT stub.
- **IA-06:** User has consented to downloading third-party YouTube content. This is a legal assumption, not technical. ToS compliance is the user's responsibility but should be surfaced as a checkbox in the UI.
- **IA-07:** Operating system of Railway worker is Linux (yt-dlp ELF binary). macOS dev env needs `brew install yt-dlp` separately.
- **IA-08:** FFmpeg on Railway supports libx264 + aac encoders (not all minimal ffmpeg builds do). Current export-video works, so assume yes — but confirm.

---

## Needs External Research

- **ER-01:** yt-dlp vs `@distube/ytdl-core` maintenance & YouTube bot-detection resilience in 2026. yt-dlp updates weekly; ytdl-core has historical breakage.
- **ER-02:** Gemini 2.0 Flash vs 2.5 Pro for long-transcript comprehension quality on Korean content. Phase brief hints at "1.5 Pro" — clarify desired model.
- **ER-03:** Supabase Storage resumable upload (tus) client library compatibility with Next.js 16 / React 19.
- **ER-04:** Auto-reframe / smart-crop open-source options (e.g., Google AutoFlip) if user rejects static center-crop (RA-05).
- **ER-05:** Railway container disk quota per plan — is 5 GB ephemeral enough for worst-case 2-hour source + intermediate clips + encoded outputs?
- **ER-06:** Legal/ToS posture of Opus Clip / Vizard for downloading third-party YouTube videos, as a template for our disclaimer.

---

*Phase: 07-longform-shorts*
*Assumptions gathered: 2026-04-10*
*Files read: 15+ (schema.ts, processor.ts, jobs route, parse-url.ts, transcript.ts, viral-scorer.ts, ffmpeg-export.ts, storage.ts, gemini.ts, split-scenes handler, workflow-tabs.tsx, package.json, env.example, ROADMAP.md, REQUIREMENTS.md, 04-CONTEXT.md, 05-CONTEXT.md)*
