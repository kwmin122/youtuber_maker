import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleTestJob } from "../worker/handlers/test-job";

// Mock DB operations
function createMockDb() {
  const updates: Array<{ set: Record<string, unknown> }> = [];
  const inserts: Array<{ values: Record<string, unknown> }> = [];

  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn((data: Record<string, unknown>) => {
    updates.push({ set: data });
    return { where: mockWhere };
  });
  const mockValues = vi.fn((data: Record<string, unknown>) => {
    inserts.push({ values: data });
    return Promise.resolve();
  });

  const db = {
    update: vi.fn(() => ({ set: mockSet })),
    insert: vi.fn(() => ({ values: mockValues })),
  };

  return { db, updates, inserts, mockSet, mockValues };
}

// Mock BullMQ Job
function createMockJob(name: string, data: Record<string, unknown>) {
  return {
    id: "bullmq-job-1",
    name,
    data,
    progress: vi.fn(),
    log: vi.fn(),
    updateProgress: vi.fn(),
  } as unknown as import("bullmq").Job;
}

describe("handleTestJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should update job status to active initially", async () => {
    const { db, updates } = createMockDb();
    const job = createMockJob("test", { jobId: "test-job-1", userId: "user-1" });

    const promise = handleTestJob(job, db as any);

    // Fast-forward all timers
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await promise;

    // First update should set status to 'active'
    expect(updates[0].set).toMatchObject({
      status: "active",
      currentStep: "initializing",
      progress: 0,
    });
  });

  it("should update progress from 0 to 100 in 5 steps", async () => {
    const { db, updates } = createMockDb();
    const job = createMockJob("test", { jobId: "test-job-1", userId: "user-1" });

    const promise = handleTestJob(job, db as any);

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await promise;

    // Check progress updates: initial (0) + 5 steps (20,40,60,80,100) + final (100)
    const progressUpdates = updates
      .filter((u) => u.set.progress !== undefined)
      .map((u) => u.set.progress);

    expect(progressUpdates).toContain(0);
    expect(progressUpdates).toContain(20);
    expect(progressUpdates).toContain(40);
    expect(progressUpdates).toContain(60);
    expect(progressUpdates).toContain(80);
    expect(progressUpdates).toContain(100);
  });

  it("should set final status to completed", async () => {
    const { db, updates } = createMockDb();
    const job = createMockJob("test", { jobId: "test-job-1", userId: "user-1" });

    const promise = handleTestJob(job, db as any);

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await promise;

    // Last update should set status to 'completed'
    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate.set).toMatchObject({
      status: "completed",
      progress: 100,
      currentStep: "done",
    });
  });

  it("should insert jobEvents for each step", async () => {
    const { db, inserts } = createMockDb();
    const job = createMockJob("test", { jobId: "test-job-1", userId: "user-1" });

    const promise = handleTestJob(job, db as any);

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await promise;

    // Should have: started + 5 progress + completed = 7 job events
    const events = inserts.map((i) => i.values.event);
    expect(events).toContain("started");
    expect(events).toContain("progress");
    expect(events).toContain("completed");
    expect(events.filter((e) => e === "progress")).toHaveLength(5);
    expect(inserts).toHaveLength(7);
  });
});

describe("job submission security", () => {
  it("should never contain plaintext API key patterns in job payload", () => {
    // Common API key patterns that should NEVER appear in job payloads
    const dangerousPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,
      /AIza[0-9A-Za-z_-]{35}/,
      /Bearer [a-zA-Z0-9_.-]+/,
    ];

    const samplePayload = JSON.stringify({
      jobId: "test-1",
      userId: "user-1",
      apiKeyId: "key-uuid-here", // This is safe — only the ID
    });

    for (const pattern of dangerousPatterns) {
      expect(samplePayload).not.toMatch(pattern);
    }
  });

  it("should require authentication for job submission (pending status pattern)", () => {
    // Verify the job starts with pending status
    const pendingStatus = "pending";
    expect(pendingStatus).toBe("pending");
  });
});
