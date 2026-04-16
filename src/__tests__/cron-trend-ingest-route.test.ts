/**
 * Phase 9 plan 09-03 — unit tests for GET /api/cron/trend-ingest
 *
 * POST was removed (attack-surface reduction). All tests use GET.
 * Covers: secret validation (missing, wrong, correct), Authorization: Bearer form.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mock modules BEFORE importing the route ---

const queueAdd = vi.fn();
vi.mock("@/lib/queue", () => ({
  getQueue: () => ({ add: queueAdd }),
}));

vi.mock("@/lib/env", () => ({
  env: { CRON_SECRET: "test-cron-secret-abcdef123456" },
}));

// Mock DB: insert().values().returning() returns a row with a generated id
vi.mock("@/lib/db", () => {
  const insertChain = {
    values: vi.fn(() => insertChain),
    returning: vi.fn(async () => [{ id: "run-uuid-1234" }]),
  };
  return {
    db: {
      insert: vi.fn(() => insertChain),
    },
  };
});

// Mock drizzle schema — route only uses trendIngestionRuns.id
vi.mock("@/lib/db/schema", () => ({
  trendIngestionRuns: { id: "id" },
}));

// Import AFTER mocks so the module picks up env.CRON_SECRET
import { GET } from "@/app/api/cron/trend-ingest/route";

async function callGet(headers: Record<string, string> = {}) {
  const req = new NextRequest("http://localhost/api/cron/trend-ingest", {
    method: "GET",
    headers,
  });
  return GET(req);
}

describe("GET /api/cron/trend-ingest", () => {
  beforeEach(() => {
    queueAdd.mockReset();
  });

  it("401 when x-cron-secret header is missing", async () => {
    const res = await callGet({});
    expect(res.status).toBe(401);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("401 when x-cron-secret header is wrong", async () => {
    const res = await callGet({ "x-cron-secret": "wrong" });
    expect(res.status).toBe(401);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("202 when x-cron-secret matches, inserts run row, enqueues BullMQ", async () => {
    const res = await callGet({ "x-cron-secret": "test-cron-secret-abcdef123456" });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ source: "vercel-cron" });
    expect(typeof body.ingestionRunId).toBe("string");

    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      "ingest-trends",
      expect.objectContaining({
        payload: expect.objectContaining({
          ingestionRunId: body.ingestionRunId,
          regionCode: "KR",
        }),
      })
    );
  });

  it("accepts Authorization: Bearer header form", async () => {
    const res = await callGet({ authorization: "Bearer test-cron-secret-abcdef123456" });
    expect(res.status).toBe(202);
  });
});
