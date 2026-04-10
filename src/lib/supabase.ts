import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser / anon-key Supabase client.
 *
 * Used from client components and from server paths that should be
 * subject to RLS. In the Phase 7 architecture, Better Auth owns the
 * session (not Supabase Auth), so `auth.uid()` is always NULL in
 * this context, and RLS policies that reference `auth.uid()` will
 * deny by default.
 *
 * Do NOT use this for worker / API-route storage operations — use
 * `getServiceRoleClient()` below so RLS stays as defense in depth
 * while Better Auth is the primary access-control check in code.
 */
export function createSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Server-side service-role Supabase client.
 *
 * Uses `SUPABASE_SERVICE_ROLE_KEY` (NEVER expose to the browser).
 * Bypasses RLS entirely, so the caller MUST have already enforced
 * `session.user.id` ownership on the underlying resource before
 * invoking any storage operation through this client.
 *
 * Phase 7 retry 2, Codex CRITICAL-4 — Better Auth sessions are not
 * Supabase Auth JWTs, so RLS policies based on `auth.uid()` always
 * deny from the anon client. Worker handlers and API routes that do
 * storage uploads / downloads must use this client; API route
 * handlers above them must enforce ownership via Drizzle queries
 * against Better Auth's `session.user.id`.
 *
 * The client is cached in module scope so repeated calls in the
 * same worker process reuse the same HTTP keep-alive pool.
 */
let serviceRoleClient: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (serviceRoleClient) return serviceRoleClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      "getServiceRoleClient: NEXT_PUBLIC_SUPABASE_URL is not set"
    );
  }
  if (!serviceKey) {
    throw new Error(
      "getServiceRoleClient: SUPABASE_SERVICE_ROLE_KEY is not set — required for worker / API storage ops"
    );
  }

  serviceRoleClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return serviceRoleClient;
}

/**
 * Test-only hook: reset the cached service-role client so a fresh
 * one is created on the next `getServiceRoleClient()` call. Exported
 * purely for unit tests.
 */
export function __resetServiceRoleClientForTests(): void {
  serviceRoleClient = null;
}
