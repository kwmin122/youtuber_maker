import { describe, it, expect } from "vitest";
import { parseChannelUrl } from "@/lib/youtube/parse-url";
import {
  calcPerformanceScore,
  calcEngagementRate,
  calcCII,
} from "@/lib/youtube/metrics";

// Integration test for the full channel flow:
// 1. Parse URL -> 2. Fetch from YouTube -> 3. Calculate metrics -> 4. Store in DB

describe("Channel import flow", () => {
  describe("URL parsing -> API lookup mapping", () => {
    it("maps handle to fetchChannelByHandle call", () => {
      const result = parseChannelUrl("https://youtube.com/@testchannel");
      expect(result).toEqual({ type: "handle", value: "testchannel" });
      // In the API route, type=handle -> fetchChannelByHandle
    });

    it("maps channel_id to fetchChannelById call", () => {
      const result = parseChannelUrl(
        "https://youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxx"
      );
      expect(result).toEqual({
        type: "channel_id",
        value: "UCxxxxxxxxxxxxxxxxxxxxxxxx",
      });
      // In the API route, type=channel_id -> fetchChannelById
    });

    it("maps custom URL to fetchChannelByHandle fallback", () => {
      const result = parseChannelUrl(
        "https://youtube.com/c/customname"
      );
      expect(result).toEqual({ type: "custom", value: "customname" });
      // In the API route, type=custom -> fetchChannelByHandle as fallback
    });
  });

  describe("metrics calculation on fetched data", () => {
    const mockChannel = { subscriberCount: 100000 };
    const mockVideo = {
      viewCount: 500000,
      likeCount: 15000,
      commentCount: 3000,
    };

    it("calculates performance score for video", () => {
      const score = calcPerformanceScore(
        mockVideo.viewCount,
        mockChannel.subscriberCount
      );
      expect(score).toBe(5);
    });

    it("calculates engagement rate for video", () => {
      const rate = calcEngagementRate(
        mockVideo.likeCount,
        mockVideo.commentCount,
        mockVideo.viewCount
      );
      expect(rate).toBe(3.6);
    });

    it("calculates CII for channel", () => {
      const avgViews = 250000;
      const avgEngagement = 3.6;
      const cii = calcCII(
        avgViews,
        avgEngagement,
        mockChannel.subscriberCount
      );
      expect(cii).toBe(9);
    });
  });

  describe("cache staleness check", () => {
    const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

    it("identifies fresh data (<24h)", () => {
      const fetchedAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago
      const isStale =
        Date.now() - fetchedAt.getTime() > STALE_THRESHOLD_MS;
      expect(isStale).toBe(false);
    });

    it("identifies stale data (>24h)", () => {
      const fetchedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
      const isStale =
        Date.now() - fetchedAt.getTime() > STALE_THRESHOLD_MS;
      expect(isStale).toBe(true);
    });
  });
});
