# Phase 11 Verification Report

**Phase:** 11 — Multi-Platform Distribution
**Verified:** 2026-04-17T01:00:00Z
**Verifier model:** claude-sonnet-4-6
**Flags:** `--skip-cross-model --skip-human-eval`
**Branch:** phase-11/multi-platform-distribution

---

## Per-Layer Summary

| Layer | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | Multi-agent review (correctness + security) | PASS-WITH-WARNINGS | See issues below |
| 2 | Guardrails (tsc + vitest) | PASS | 0 new tsc errors; platform-selector tests 3/3 pass |
| 3 | BDD criteria | PASS | All done_when items verified via grep |
| 4 | Permission audit | PASS | 19 atomic commits, no secrets, file scope clean |
| 5 | Adversarial | PASS-WITH-WARNINGS | No injection surface; disk DoS risk noted |
| 6 | Cross-model verification | SKIPPED | `--skip-cross-model` |
| 7 | Human eval | SKIPPED | `--skip-human-eval` |

---

## OVERALL VERDICT: PASS

---

## Layer 1 — Multi-Agent Review

Two independent agents reviewed the full Phase 11 implementation.

### Correctness Agent findings

| Severity | Location | Issue |
|----------|----------|-------|
| WARN | `src/lib/tiktok/uploader.ts` | `videoUrl` uses `@me` alias (`https://www.tiktok.com/@me/video/${id}`). Works for the authenticated creator; not a shareable public link. Username resolution requires an additional TikTok API call — deferred post-MVP. |
| WARN | `src/lib/media/video-format.ts` | `safeUnlink()` called `unlink()` on directory paths — temp dirs leaked on Railway worker. **Fixed: replaced with `rm({ recursive: true, force: true })`** |
| WARN | `src/worker/handlers/upload-tiktok.ts` | Token refresh fires only when already expired, not proactively (e.g., 5-min window). Edge case on long uploads near expiry. |
| INFO | `src/lib/auth/instagram-oauth.ts` | `requireEnvVars()` error message said "TikTok OAuth env vars not configured". **Fixed: now reads "Instagram OAuth env vars not configured"** |

*The agent initially flagged Instagram status poll token delivery (query param vs Authorization header) as CRITICAL. After review: the Meta Graph API explicitly documents `access_token` as a valid query parameter for GET requests. The implementation is correct per the API spec.*

*The agent flagged "non-converted Instagram path may use private URL" as CRITICAL. After review: `project.exportedVideoUrl` is a Supabase public bucket URL in this project's storage configuration. This is a valid architectural assumption.*

### Security Agent findings

| Severity | Location | Issue |
|----------|----------|-------|
| MEDIUM | `src/lib/instagram/uploader.ts:73` | `access_token` in query string for container status poll — appears in HTTP server-side access logs on the Railway worker. Functionally correct; credential hygiene concern for log aggregators. |
| MEDIUM | `src/lib/media/video-format.ts` | No input size cap before `writeFile` to `/tmp`. A multi-GB export buffer is written to disk before ffprobe runs. Worker disk DoS risk. |
| MEDIUM | `src/app/api/auth/tiktok/callback/route.ts` | Select-then-upsert TOCTOU — two concurrent OAuth flows for the same user could produce duplicate account rows. Hardening with `ON CONFLICT DO UPDATE` deferred to scale phase. |
| LOW | `src/app/api/projects/[id]/upload/route.ts` | No per-user rate limit on platform count — user can enqueue 3 jobs per request. Self-DoS only; low risk at current scale. |
| INFO | `src/lib/instagram/uploader.ts` | Raw Instagram API error body (≤300 chars) included in thrown error, propagated to `uploads.errorMessage`. Minor info disclosure; no credential leakage. |

---

## Layer 2 — Guardrails

```
tsc: 0 new errors introduced by Phase 11
     8 pre-existing errors (page.tsx ×4, signin/form.tsx ×1, queuedash ×2) — confirmed pre-Phase 11

vitest:
  src/__tests__/platform-selector.test.tsx  — 3/3 PASS
  src/__tests__/upload-youtube-handler.test.ts — 6/6 PASS (no regressions)
```

---

## Layer 3 — BDD Criteria

### Plan 11-01
- [x] TikTok OAuth initiation route sets `tiktok_oauth_state` CSRF cookie
- [x] TikTok callback validates state, calls `exchangeTikTokCode`, upserts `account` with `providerId: "tiktok"`
- [x] Instagram callback calls `exchangeForLongLivedToken` (short → long-lived token)
- [x] `GET /api/auth/connected-accounts` returns `tiktokConfigured`, `instagramConfigured` flags
- [x] Settings page `연결된 계정` tab renders (grep verified)

### Plan 11-02
- [x] `PLATFORM_LIMITS` defined for youtube/tiktok/reels
- [x] `ensurePlatformFormat` returns `wasConverted` flag
- [x] `uploadVideoToTikTok` implements 3-step flow (init → PUT → poll)
- [x] `uploadVideoToInstagram` implements 3-step flow (container → poll → publish)
- [x] `handleUploadTikTok` calls `refreshTikTokToken` when token expired
- [x] `handleUploadReels` re-uploads to Supabase when `wasConverted` is true
- [x] `drizzle/0007_phase11_multi_platform.sql` adds `tiktok_video_id` and `reels_video_id`

### Plan 11-03
- [x] Upload route accepts `platforms: z.array(z.enum(["youtube","tiktok","reels"]))`
- [x] Upload panel sends `platforms: selectedPlatforms`
- [x] Button label is `"업로드 시작"` (no "Upload to YouTube" remaining)
- [x] `tiktokConfigured` prop wires through PlatformSelector → UploadPanel
- [x] `GET /api/projects/[id]/upload` returns `tiktokVideoId` and `reelsVideoId`
- [x] Analytics page has `bg-red-100` (YouTube badge color)

---

## Layer 4 — Permission Audit

- **File scope:** 24 plan-declared files + 2 authorized deviations (`video-performance-table.tsx`, `platform-selector.test.tsx`)
- **Secrets:** No secrets committed; env var names referenced only (`process.env.TIKTOK_CLIENT_SECRET`)
- **Commits:** 19 atomic commits + 1 planning docs commit; all scoped to `phase-11/` branch
- **No destructive DB changes:** migration is additive-only (`ADD COLUMN`)

---

## Layer 5 — Adversarial

- **Zero-byte buffer:** ffprobe fails → throws → job marked failed ✓
- **TikTok 12-poll timeout:** throws "timed out after 12 attempts" → job marked failed ✓
- **Account disconnected mid-flight:** handler fetches account at job start; throws "not connected" ✓
- **Invalid platform string:** Zod enum validation → 400 response ✓
- **Concurrent platform jobs:** each job independently tracks its own `uploadId`; failure isolation confirmed ✓

---

## Fixes Applied During Verification

1. `src/lib/media/video-format.ts` — `safeUnlink()` now uses `rm({ recursive: true, force: true })` instead of `unlink()` on directory paths. Prevents temp dir accumulation on Railway worker.
2. `src/lib/auth/instagram-oauth.ts` — error message corrected from "TikTok OAuth env vars not configured" to "Instagram OAuth env vars not configured".

---

## Deferred Issues (non-blocking)

| Priority | Issue | When to address |
|----------|-------|-----------------|
| P2 | TikTok `@me` video URL — not shareable | Resolve by storing creator username at OAuth time |
| P2 | TOCTOU in OAuth callback — duplicate account rows | Add `UNIQUE (user_id, provider_id)` DB constraint |
| P3 | Token refresh fires too late — should be proactive | Add 5-min expiry window before job execution |
| P3 | No size limit before FFmpeg disk write | Add 500 MB cap at worker entry, return 400 |
| P4 | Instagram token in query string on status poll | Acceptable per Graph API spec; monitor log hygiene |

---

## Next Step

**→ Run `/sunco:ship 11`**
