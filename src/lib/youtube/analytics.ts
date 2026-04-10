import { google, Auth } from "googleapis";
import type { MetricsSnapshot } from "@/lib/distribution/types";

/**
 * Fetch per-video daily metrics from YouTube Analytics API.
 *
 * Requires: yt-analytics.readonly OAuth scope on the user's Google account.
 * Note: YouTube Analytics data may not be available for videos uploaded < 48 hours ago.
 *
 * @param params - Access token, video ID, and date range.
 * @returns Array of daily metrics snapshots. Empty array if no data available.
 */
export async function fetchVideoMetrics(params: {
  accessToken: string;
  youtubeVideoId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<MetricsSnapshot[]> {
  const oauth2Client = new Auth.OAuth2Client();
  oauth2Client.setCredentials({ access_token: params.accessToken });

  const ytAnalytics = google.youtubeAnalytics({
    version: "v2",
    auth: oauth2Client,
  });

  try {
    const res = await ytAnalytics.reports.query({
      ids: "channel==MINE",
      startDate: params.startDate,
      endDate: params.endDate,
      metrics:
        "views,likes,comments,subscribersGained,subscribersLost,estimatedMinutesWatched,impressions,impressionClickThroughRate",
      dimensions: "day",
      filters: `video==${params.youtubeVideoId}`,
      sort: "day",
    });

    const rows = res.data.rows;
    if (!rows || rows.length === 0) {
      console.warn(
        `No analytics data for video ${params.youtubeVideoId}. ` +
          "Video may be too new (< 48 hours) for analytics data."
      );
      return [];
    }

    // Each row: [date, views, likes, comments, subsGained, subsLost, watchTime, impressions, ctr]
    return rows.map((row) => {
      const [
        date,
        views,
        likes,
        comments,
        subsGained,
        subsLost,
        watchTime,
        impressions,
        ctr,
      ] = row as [
        string,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];

      const subscriberDelta =
        (typeof subsGained === "number" ? subsGained : 0) -
        (typeof subsLost === "number" ? subsLost : 0);

      return {
        date: String(date),
        viewCount: Number(views) || 0,
        likeCount: Number(likes) || 0,
        commentCount: Number(comments) || 0,
        subscriberDelta,
        watchTimeMinutes: Number(watchTime) || 0,
        impressions: Number(impressions) || 0,
        ctr: Number(ctr) || 0,
      };
    });
  } catch (error) {
    console.warn(
      `Failed to fetch analytics for video ${params.youtubeVideoId}:`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Fetch basic video statistics from YouTube Data API v3.
 * This is faster and more reliable than Analytics API for quick stats.
 *
 * Uses the Data API (not Analytics API), so no special scope required
 * beyond the user's OAuth access token.
 *
 * @param params - Access token and YouTube video ID.
 * @returns Basic view, like, comment counts.
 */
export async function fetchVideoBasicStats(params: {
  accessToken: string;
  youtubeVideoId: string;
}): Promise<{
  viewCount: number;
  likeCount: number;
  commentCount: number;
}> {
  const oauth2Client = new Auth.OAuth2Client();
  oauth2Client.setCredentials({ access_token: params.accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const res = await youtube.videos.list({
    part: ["statistics"],
    id: [params.youtubeVideoId],
  });

  const item = res.data.items?.[0];
  if (!item?.statistics) {
    throw new Error(
      `Video ${params.youtubeVideoId} not found or statistics unavailable`
    );
  }

  return {
    viewCount: parseInt(item.statistics.viewCount || "0", 10),
    likeCount: parseInt(item.statistics.likeCount || "0", 10),
    commentCount: parseInt(item.statistics.commentCount || "0", 10),
  };
}
