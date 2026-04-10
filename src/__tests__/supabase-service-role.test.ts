/**
 * Phase 7 retry 2, Codex CRITICAL-4 — service-role client smoke test.
 *
 * Better Auth is not a Supabase Auth JWT source, so every server-side
 * storage operation that touches the now-private `longform-sources`
 * bucket must go through the service-role client. These tests verify
 * that `getServiceRoleClient` refuses to load without
 * `SUPABASE_SERVICE_ROLE_KEY`, memoizes the client, and is distinct
 * from the anon `createSupabaseClient` used in client components.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((url: string, key: string) => ({
    __mockClient: true,
    url,
    key,
    storage: { from: () => ({}) },
  })),
}));

import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseClient,
  getServiceRoleClient,
  __resetServiceRoleClientForTests,
} from "@/lib/supabase";

const ORIGINAL_ENV = { ...process.env };

describe("getServiceRoleClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetServiceRoleClientForTests();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    expect(() => getServiceRoleClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/
    );
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getServiceRoleClient()).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  it("constructs with the service-role key, NOT the anon key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const client = getServiceRoleClient();
    expect(client).toBeDefined();
    expect(createClient).toHaveBeenCalledWith(
      "https://x.supabase.co",
      "service-role-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
        }),
      })
    );
  });

  it("caches the client across repeated calls (connection reuse)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    const a = getServiceRoleClient();
    const b = getServiceRoleClient();
    expect(a).toBe(b);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("createSupabaseClient still returns an anon-key client for browser use", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    createSupabaseClient();
    expect(createClient).toHaveBeenCalledWith(
      "https://x.supabase.co",
      "anon-key"
    );
  });
});
