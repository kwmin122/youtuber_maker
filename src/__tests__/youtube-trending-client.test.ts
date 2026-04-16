import { describe, it, expect, vi, beforeEach } from "vitest";

const videosList = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    youtube: () => ({
      videos: { list: videosList },
      channels: { list: vi.fn() },
      search: { list: vi.fn() },
    }),
  },
}));

vi.mock("@/lib/env", () => ({
  env: { YOUTUBE_API_KEY: "test-key" },
}));

// Import AFTER mocks.
import { getTrendingVideos } from "@/lib/youtube/client";

describe("getTrendingVideos", () => {
  beforeEach(() => {
    videosList.mockReset();
  });

  it("maps YouTube response to TrendingVideoItem[]", async () => {
    videosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "v1",
            snippet: {
              title: "타이틀 1",
              description: "설명",
              channelTitle: "채널",
              publishedAt: "2026-04-11T00:00:00Z",
            },
            statistics: { viewCount: "12345" },
          },
        ],
      },
    });
    const result = await getTrendingVideos({
      categoryId: 24,
      regionCode: "KR",
      maxResults: 20,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      youtubeVideoId: "v1",
      title: "타이틀 1",
      channelTitle: "채널",
      viewCount: 12345,
      categoryId: 24,
    });
    expect(videosList).toHaveBeenCalledWith(
      expect.objectContaining({
        chart: "mostPopular",
        regionCode: "KR",
        videoCategoryId: "24",
        maxResults: 20,
      })
    );
  });

  it("returns [] on empty response", async () => {
    videosList.mockResolvedValueOnce({ data: { items: [] } });
    const result = await getTrendingVideos({
      categoryId: 24,
      regionCode: "KR",
    });
    expect(result).toEqual([]);
  });
});
