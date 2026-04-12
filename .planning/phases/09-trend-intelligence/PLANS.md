# Phase 9: Trend Intelligence — Plan Index

**Phase**: 9 — Trend Intelligence
**Requirements**: DATA-02 (실시간 트렌드 — near-real-time 6h refresh), DATA-04 (미개척 키워드 탐지)
**Status**: Plans drafted, ready for execution
**Context**: `./CONTEXT.md` (8 resolved decisions R-01 through R-08)
**Depends on**: v1 Phase 2 (Channel Intelligence), Phase 8 IDOR/contract patterns

## Goal

실시간(6시간 주기) 트렌드 데이터를 YouTube Trending API로 수집하고(선택적 Google Trends 비-치명적 보조), 카테고리별 상위 20 트렌드를 `/trends` 대시보드에 노출한다. 사용자가 벤치마크 중인 채널이 다루지 않는 "미개척 키워드"를 3-티어 알고리즘(Tier 1 결정론적 set-diff, Tier 2 백그라운드 Gemini rationale precompute, Tier 3 온디맨드 fallback)으로 탐지하고, `TopicPicker`에 트렌드 배지로 통합하여 script generation 플로우에서 클릭 한 번으로 활용할 수 있게 한다.

## Design Decisions (from CONTEXT.md R-01~R-08)

- **R-01**: YouTube primary + Google Trends feature-flag non-fatal enrichment
- **R-02**: Vercel Cron (BullMQ JobScheduler 금지)
- **R-03**: `region_code` 컬럼 저장, UI는 `'KR'` 하드코딩
- **R-04**: 별도 `trend_ingestion_runs` 감사 테이블. **Option (b)**: 트렌드 ingestion은 `jobs` DB 테이블에 쓰지 않고 BullMQ 큐에 직접 enqueue + `trend_ingestion_runs`로만 추적. `jobs.userId NOT NULL` 제약 불변.
- **R-05**: 3-티어 gap detection (set-diff → background precompute → on-demand)
- **R-06**: Time-series snapshots + 30일 retention
- **R-07**: 확장된 out-of-scope 목록
- **R-08**: 6시간 cadence + manual refresh + stale banner

## Plan List

| # | Plan | Wave | Depends on | Blast radius | Summary |
|---|------|------|------------|--------------|---------|
| 09-01 | Schema + env + queue foundation | 1 | — | low-medium | Drizzle migration (`trend_snapshots`, `trend_gap_analyses`, `trend_ingestion_runs`), hand-written RLS, `env.ts` adds `CRON_SECRET` + `GOOGLE_TRENDS_ENABLED`, new BullMQ queue name additions (`ingest-trends`, `precompute-gap-rationales` in ALLOWED_JOB_TYPES), processor switch stubs, shared `src/lib/ai/types.ts` canonical `TopicRecommendation` export. |
| 09-02 | YouTube trending client + Google Trends flag + ingestion handler | 2 | 09-01 | medium | Extends `src/lib/youtube/client.ts` with `getTrendingVideos`, new `src/lib/trends/google-trends-client.ts` (feature-flag dynamic import), new `src/worker/handlers/ingest-trends.ts` (10 KR categories, dedupe via ON CONFLICT, 30-day cleanup, chains `precompute-gap-rationales` per active user), new `src/worker/handlers/precompute-gap-rationales.ts` (BYOK Gemini via `getUserAIClient`, Korean JSON prompt, writes `rationale_cache`), unit tests. |
| 09-03 | Vercel Cron route + manual refresh API + ingestion run tracking | 3 | 09-01, 09-02 | medium | `src/app/api/cron/trend-ingest/route.ts` (x-cron-secret validated, creates `trend_ingestion_runs`, enqueues BullMQ bypassing `jobs` table), `vercel.json` schedule entry, `src/app/api/trends/refresh/route.ts` (session-gated, rate-limited 1/min/user, source='manual-admin'), rate-limit helper + tests. |
| 09-04 | Gap detection — set-diff lib + Tier 1/3 API routes | 2 | 09-01 | medium | `src/lib/trends/setdiff.ts` (deterministic Korean-aware tokenizer + set-diff + channel-set hash), `src/app/api/trends/gap/route.ts` GET (IDOR-checked, Tier 1 cached set-diff), `src/app/api/trends/gap/rationale/route.ts` POST (Tier 3 on-demand Gemini via BYOK), cache helpers, IDOR + happy-path + cache-hit tests. |
| 09-05 | UI — `/trends` dashboard + TopicPicker badge + sidebar link + analyze-benchmark enrichment | 4 | 09-01, 09-02, 09-03, 09-04 | medium-high | `src/app/(dashboard)/trends/page.tsx` (server component loads latest snapshots + last run), `src/components/trends/trend-dashboard.tsx` (client: tabs, list, manual refresh, stale banner), `src/components/trends/gap-panel.tsx` (per-project gap keywords + rationale modal), sidebar update, `TopicRecommendation` type extension with `trendBadge`, `src/components/project/topic-picker.tsx` renders badge, `src/worker/handlers/analyze-benchmark.ts` enriches topic recs with latest trend snapshot cross-reference, RTL tests for dashboard + gap panel + stale banner + badge. |

## Wave Execution

```
Wave 1: [09-01]                             // foundation — schema, env, queue names, shared types
Wave 2: [09-02, 09-04]                      // parallel: ingestion handlers + gap detection APIs (independent)
Wave 3: [09-03]                             // cron route + manual refresh (needs ingest-trends handler)
Wave 4: [09-05]                             // UI consumes everything
```

Within a wave, plans may run in parallel on separate agents. Wave boundaries are hard — a later wave may only start after every plan in the earlier wave has passed its acceptance criteria.

## Cross-Cutting Rules (apply to every plan in this phase)

These rules encode the Phase 7+8 retry learnings plus Phase 9 specific constraints. Violations block merge.

1. **CAS status updates use `.returning().length`, never `.rowCount`.** postgres-js never populates `rowCount` on UPDATE. Every compare-and-swap status transition in a handler MUST select back with `.returning({ id: table.id })` and check `.length > 0`. See `src/worker/handlers/longform-clip.ts` for the canonical pattern. Applies to `trend_ingestion_runs` status updates.
2. **IDOR defense-in-depth: every new route that takes a `projectId`/`channelId`/`sceneId` does an ownership join before any write or sensitive read.** Mirror `src/app/api/jobs/route.ts:57-88` pattern. Applies to `/api/trends/gap`, `/api/trends/gap/rationale`, `/api/trends/refresh` (the last is rate-limited, not projectId-scoped, but still session-gated).
3. **Service-role Supabase only for server-side writes.** Phase 9 has no new Storage buckets, so this rule appears for completeness — any future helper touching Storage MUST use `getServiceRoleClient()`.
4. **No new Storage buckets.** Phase 9 works entirely in Postgres + BullMQ + in-memory caches.
5. **No large file I/O.** Trend data is small JSON; no streaming concerns. Do not introduce `createReadStream` patterns.
6. **`createSignedUploadUrl({upsert:true})`** — N/A this phase.
7. **Idempotency before side effects.** Specifically: `ingest-trends` handler MUST use `INSERT ... ON CONFLICT DO NOTHING` on the `(recorded_at::date, category_id, region_code, keyword, source)` unique constraint. The same handler retried by BullMQ must not double-insert.
8. **Real-ffmpeg integration test for filter graph changes** — N/A this phase (no ffmpeg work).
9. **Korean JSON prompts for all Gemini calls.** Mirror `src/lib/ai/prompts.ts:12` `"Always respond in Korean"` hardcoding. Applies to `precompute-gap-rationales` handler and the Tier 3 on-demand prompt in `/api/trends/gap/rationale`.
10. **BYOK Gemini via `getUserAIClient(userId)`** — no direct Gemini instantiation. Every Gemini call in this phase resolves the provider from `api_keys` via `getUserAIClient`, never via env.
11. **Cron route secret validation.** `/api/cron/trend-ingest` MUST verify `x-cron-secret` header against `env.CRON_SECRET` and return 401 on mismatch. No exceptions, no env fallback.
12. **Google Trends is non-fatal.** Every `google-trends-api` call MUST be wrapped in try/catch that logs, sets `partial: true` on the ingestion run, and continues. A Google Trends failure NEVER fails the whole ingestion run. Document the caught exception types in comments.
13. **Feature-flag `GOOGLE_TRENDS_ENABLED`.** Gate ALL `google-trends-api` code paths. When disabled, the import must not execute — use a dynamic `await import("google-trends-api")` inside the try/catch block that fires only when the flag is true. Static `import ... from "google-trends-api"` at the top of any file is forbidden.
14. **`jobs.userId NOT NULL` contract is preserved.** No migration weakens it. Cron runs track via `trend_ingestion_runs`, NOT the `jobs` table. The cron route enqueues ingestion directly into BullMQ without writing a `jobs` row (Option (b) from CONTEXT.md R-04 design note). Per-user `precompute-gap-rationales` IS written to the `jobs` table because it has a real `userId`.
15. **30-day retention cleanup runs at the END of every ingestion job.** `DELETE FROM trend_snapshots WHERE recorded_at < NOW() - INTERVAL '30 days'`. If the delete fails, log but do not fail the whole run. Retention is a best-effort maintenance step.
16. **Rate-limit manual refresh: 1 request per minute per user.** In-memory Map-based limiter is acceptable for Phase 9; Redis-based Option B documented for Phase 12 scaling. Key is `session.user.id`, window is 60 seconds, stale entries pruned lazily on each request.
17. **Set-diff tokenization is deterministic and language-aware.** Use a simple Korean-aware tokenizer: regex `/[\p{L}\p{N}]+/gu` + Hangul-normalized lowercase, with an explicit stop-word list of ~20 Korean particles (은/는/이/가/을/를/의/에/와/과/도/만/까지/부터/에서/으로/로/이나/나/면서). Do NOT pull in a full morphological analyzer (khaiii/mecab) — document the choice in the plan.
18. **Tier 2 background precompute runs AFTER trend ingestion completes.** Triggered via job chaining in `ingest-trends` handler's final step: `for each active user with benchmark channels, enqueue precompute-gap-rationales(userId)`. NOT via a separate cron entry.
19. **Drizzle migrations via `bunx drizzle-kit generate`.** Do not hand-write SQL migrations except for RLS policies.
20. **Tests live under `src/__tests__/`** and follow the `{module-name}.test.ts` convention.
21. **All new job types must be added in two places:** `ALLOWED_JOB_TYPES` in `src/app/api/jobs/route.ts` AND the `switch` in `src/worker/processor.ts`. Note that the cron-enqueued `ingest-trends` is added to `ALLOWED_JOB_TYPES` only so the worker's type-checked switch handles it — the API route will reject `POST /api/jobs` with `type=ingest-trends` via an explicit 403 because it has no userId scope.

## Phase Exit Criteria

- [ ] Vercel Cron fires every 6 hours, writes a `trend_ingestion_runs` row, and enqueues a BullMQ `ingest-trends` job (no `jobs` DB row).
- [ ] `ingest-trends` handler inserts snapshots for ≥10 KR categories, idempotent via `ON CONFLICT DO NOTHING`, and runs 30-day cleanup at the end.
- [ ] Google Trends path is gated by `GOOGLE_TRENDS_ENABLED`. Flag off → no dynamic import. Flag on + failure → `partial: true`, ingestion still succeeds.
- [ ] `/trends` dashboard renders latest 20 trends per category, stale banner turns red when last successful run >8h ago, manual refresh button enqueues an `ingest-trends` run (rate-limited 1/min/user).
- [ ] `GET /api/trends/gap?projectId=X` returns Tier 1 set-diff (cached or fresh) for the project's benchmark channels.
- [ ] `POST /api/trends/gap/rationale` returns cached rationale or fires on-demand Gemini via BYOK, writes to `rationale_cache`.
- [ ] `precompute-gap-rationales` runs after every ingestion for every active user with benchmark channels.
- [ ] `TopicPicker` displays `trendBadge` pill next to `viralBadge` when a topic title overlaps with a trend snapshot keyword.
- [ ] `analyze-benchmark` handler enriches `topicRecommendations` with `trendBadge` by cross-referencing the latest `trend_snapshots` in the same category.
- [ ] IDOR tests: cross-user `projectId` on `/api/trends/gap` → 403. Cross-user `projectId` on `/api/trends/gap/rationale` → 403.
- [ ] Rate-limit test: second `/api/trends/refresh` within 60s → 429.
- [ ] Cron secret test: missing/invalid `x-cron-secret` → 401.
- [ ] `bun run test` exits clean. Target: 460+ tests (baseline 436 + 2 skipped, expect +25 to +35 new tests).
- [ ] `bunx tsc --noEmit` clean, `bun run lint` clean.
- [ ] Codex cold review passes.
