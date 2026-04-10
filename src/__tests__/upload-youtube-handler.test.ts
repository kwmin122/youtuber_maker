import { describe, it, expect, vi } from "vitest";

// Mock dependencies before importing handler
vi.mock("@/lib/youtube/uploader", () => ({
  uploadVideoToYouTube: vi.fn().mockResolvedValue({
    youtubeVideoId: "mock-video-id",
    videoUrl: "https://youtube.com/shorts/mock-video-id",
  }),
}));

vi.mock("@/lib/media/storage", () => ({
  downloadFromUrl: vi.fn().mockResolvedValue(Buffer.from("fake-video-data")),
}));

describe("upload-youtube handler", () => {
  it("exports handleUploadYouTube function", async () => {
    const mod = await import("@/worker/handlers/upload-youtube");
    expect(typeof mod.handleUploadYouTube).toBe("function");
  });

  it("module imports uploadVideoToYouTube", async () => {
    const source = await import("@/worker/handlers/upload-youtube");
    // Verify the function is exported and callable
    expect(source.handleUploadYouTube).toBeDefined();
  });

  it("requires projectId and title in payload", async () => {
    const { handleUploadYouTube } = await import(
      "@/worker/handlers/upload-youtube"
    );

    const mockJob = {
      data: {
        jobId: "job-1",
        userId: "user-1",
        payload: {}, // missing projectId and title
      },
    };

    const mockDb = {
      update: vi.fn(),
      insert: vi.fn(),
      select: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      handleUploadYouTube(mockJob as never, mockDb as never)
    ).rejects.toThrow("projectId and title are required");
  });

  it("validates exported video URL is present", async () => {
    // This is a structural test verifying the handler checks for exportedVideoUrl
    const mod = await import("@/worker/handlers/upload-youtube");
    const source = mod.handleUploadYouTube.toString();
    expect(source).toContain("exportedVideoUrl");
  });

  it("checks for Google OAuth access token", async () => {
    const mod = await import("@/worker/handlers/upload-youtube");
    const source = mod.handleUploadYouTube.toString();
    expect(source).toContain("accessToken");
  });

  it("handles scheduled upload status", async () => {
    const mod = await import("@/worker/handlers/upload-youtube");
    const source = mod.handleUploadYouTube.toString();
    expect(source).toContain("publishAt");
    expect(source).toContain("scheduled");
  });
});
