import { describe, it, expect } from "vitest";
import { HeyGenClient } from "@/lib/avatar/heygen-client";
import { DIDClient } from "@/lib/avatar/did-client";

describe("HeyGenClient (stub mode)", () => {
  const client = new HeyGenClient({ apiKey: "" });

  it("auto-engages stub mode when apiKey is empty", async () => {
    const lib = await client.listAvatars();
    expect(lib.length).toBeGreaterThan(0);
  });

  it("returns a stub task id and completes immediately", async () => {
    const taskId = await client.generateLipsyncJob({
      avatarId: "stub-avatar",
      audioUrl: "https://example.com/a.mp3",
    });
    expect(taskId).toMatch(/^stub-heygen-/);
    const task = await client.pollJobStatus(taskId);
    expect(task.status).toBe("completed");
    expect(task.videoUrl).toBeTruthy();
  });

  it("throws when neither avatarId nor referenceImageUrl is provided (real mode)", async () => {
    const real = new HeyGenClient({ apiKey: "fake-key" });
    await expect(
      real.generateLipsyncJob({ audioUrl: "https://example.com/a.mp3" })
    ).rejects.toThrow(/avatarId or referenceImageUrl/);
  });
});

describe("DIDClient (stub mode)", () => {
  const client = new DIDClient({ apiKey: "" });

  it("auto-engages stub mode when apiKey is empty", async () => {
    const lib = await client.listAvatars();
    expect(lib.length).toBeGreaterThan(0);
  });

  it("returns a stub task id and completes immediately", async () => {
    const taskId = await client.generateLipsyncJob({
      referenceImageUrl: "https://example.com/img.png",
      audioUrl: "https://example.com/a.mp3",
    });
    expect(taskId).toMatch(/^stub-did-/);
    const task = await client.pollJobStatus(taskId);
    expect(task.status).toBe("completed");
  });
});
