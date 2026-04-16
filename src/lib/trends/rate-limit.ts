/**
 * Phase 9 rule 16 — per-user manual refresh rate limiter.
 *
 * Window: 60 seconds. Key: arbitrary string (typically session.user.id).
 * Storage: in-memory Map. This is acceptable for Phase 9 because
 * manual refresh is a low-traffic admin-grade action. When the app
 * scales beyond a single Vercel instance, replace this with a Redis
 * INCR + EXPIRE pattern — the interface below is intentionally a
 * single function so swapping is mechanical.
 */

const WINDOW_MS = 60 * 1000;
const lastCall = new Map<string, number>();

/**
 * Attempt to acquire a rate-limit token for the given key. Returns
 *   { allowed: true }                  — caller may proceed
 *   { allowed: false, retryAfterMs }   — caller should 429
 */
export function tryAcquireRefreshToken(
  key: string,
  now: number = Date.now()
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  // Lazy prune: if the map gets hot, sweep stale entries.
  if (lastCall.size > 1024) {
    for (const [k, ts] of lastCall) {
      if (now - ts > WINDOW_MS) lastCall.delete(k);
    }
  }

  const prev = lastCall.get(key);
  if (prev !== undefined && now - prev < WINDOW_MS) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - prev) };
  }
  lastCall.set(key, now);
  return { allowed: true };
}

/** Test-only helper to reset the in-memory map. */
export function __resetRateLimitForTest() {
  lastCall.clear();
}
