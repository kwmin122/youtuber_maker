import { describe, it, expect } from "vitest";
import { KlingClient, createKlingClient } from "@/lib/media/kling-client";

describe("KlingClient", () => {
  describe("stub mode", () => {
    const client = createKlingClient(undefined);

    it("creates a stub client when no API key is provided", () => {
      expect(client).toBeInstanceOf(KlingClient);
    });

    it("submitTask returns a stub task ID", async () => {
      const taskId = await client.submitTask({
        prompt: "test video prompt",
        duration: 5,
        aspectRatio: "9:16",
      });
      expect(taskId).toMatch(/^stub-task-/);
    });

    it("pollTask returns completed status in stub mode", async () => {
      const taskId = await client.submitTask({
        prompt: "test",
        duration: 3,
        aspectRatio: "9:16",
      });
      const result = await client.pollTask(taskId);
      expect(result.status).toBe("completed");
      expect(result.videoUrl).toContain("stub-video");
      expect(result.taskId).toBe(taskId);
    });

    it("waitForCompletion resolves immediately in stub mode", async () => {
      const taskId = await client.submitTask({
        prompt: "test",
        duration: 5,
        aspectRatio: "9:16",
      });
      const result = await client.waitForCompletion(taskId, 1, 0);
      expect(result.status).toBe("completed");
      expect(result.videoUrl).toBeTruthy();
    });

    it("supports image-to-video mode", async () => {
      const taskId = await client.submitTask({
        prompt: "camera zoom in",
        imageUrl: "https://example.com/image.png",
        duration: 3,
        aspectRatio: "9:16",
      });
      expect(taskId).toMatch(/^stub-task-/);
    });
  });

  describe("createKlingClient", () => {
    it("creates real client when API key is provided", () => {
      const client = createKlingClient("test-api-key");
      expect(client).toBeInstanceOf(KlingClient);
    });

    it("creates stub client when API key is undefined", () => {
      const client = createKlingClient(undefined);
      expect(client).toBeInstanceOf(KlingClient);
    });
  });
});
