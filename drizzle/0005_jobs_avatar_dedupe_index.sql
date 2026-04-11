-- Partial unique expression index: at most one pending or active
-- generate-avatar-lipsync job per (user_id, sceneId).
-- Closes the TOCTOU window in /api/jobs server-side dedupe.
-- Codex Retry-3 finding: Postgres DOES support partial unique expression
-- indexes on JSONB paths — the previous comment claiming otherwise was wrong.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_avatar_dedupe_uniq
  ON jobs (user_id, (payload->>'sceneId'))
  WHERE type = 'generate-avatar-lipsync'
    AND status IN ('pending', 'active');
