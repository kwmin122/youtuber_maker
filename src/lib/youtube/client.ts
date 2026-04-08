import { google, youtube_v3 } from "googleapis";
import { env } from "@/lib/env";
import type {
  YouTubeChannelData,
  YouTubeVideoData,
  ChannelSearchResult,
} from "./types";

let youtubeClient: youtube_v3.Youtube | null = null;

function getYouTube(): youtube_v3.Youtube {
  if (!youtubeClient) {
    youtubeClient = google.youtube({
      version: "v3",
      auth: env.YOUTUBE_API_KEY,
    });
  }
  return youtubeClient;
}

/**
 * Fetch channel details by YouTube channel ID.
 * Cost: 1 unit per call (channels.list).
 */
export async function fetchChannelById(
  channelId: string
): Promise<YouTubeChannelData | null> {
  const yt = getYouTube();
  const res = await yt.channels.list({
    part: ["snippet", "statistics", "brandingSettings"],
    id: [channelId],
  });
  const item = res.data.items?.[0];
  if (!item) return null;

  return mapChannelItem(item);
}

/**
 * Fetch channel details by handle (e.g. @handle).
 * Cost: 1 unit per call (channels.list with forHandle).
 */
export async function fetchChannelByHandle(
  handle: string
): Promise<YouTubeChannelData | null> {
  const yt = getYouTube();
  const res = await yt.channels.list({
    part: ["snippet", "statistics", "brandingSettings"],
    forHandle: handle,
  });
  const item = res.data.items?.[0];
  if (!item) return null;

  return mapChannelItem(item);
}

/**
 * Search channels by keyword.
 * Cost: 100 units per call (search.list). Use sparingly.
 */
export async function searchChannels(
  query: string,
  maxResults: number = 10
): Promise<ChannelSearchResult[]> {
  const yt = getYouTube();
  const res = await yt.search.list({
    part: ["snippet"],
    q: query,
    type: ["channel"],
    maxResults,
    order: "relevance",
  });

  const channelIds = (res.data.items || [])
    .map((item) => item.snippet?.channelId)
    .filter((id): id is string => !!id);

  if (channelIds.length === 0) return [];

  // Fetch full channel details for subscriber counts (search.list doesn't include statistics)
  const channelsRes = await yt.channels.list({
    part: ["snippet", "statistics"],
    id: channelIds,
  });

  return (channelsRes.data.items || []).map((item) => ({
    channelId: item.id!,
    title: item.snippet?.title || "",
    description: item.snippet?.description || undefined,
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      undefined,
    subscriberCount: parseInt(
      item.statistics?.subscriberCount || "0",
      10
    ),
  }));
}

/**
 * Fetch recent videos for a channel via search.list (by date) then enrich via videos.list.
 * Step 1: search.list (100 units) to get video IDs
 * Step 2: videos.list in batches of 50 (1 unit per batch) to get statistics+duration
 */
export async function fetchChannelVideos(
  channelId: string,
  maxResults: number = 50
): Promise<YouTubeVideoData[]> {
  const yt = getYouTube();

  // Step 1: Get video IDs via search
  const searchRes = await yt.search.list({
    part: ["id"],
    channelId,
    type: ["video"],
    order: "date",
    maxResults: Math.min(maxResults, 50),
  });

  const videoIds = (searchRes.data.items || [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => !!id);

  if (videoIds.length === 0) return [];

  return fetchVideosByIds(videoIds);
}

/**
 * Fetch video details by IDs in batches of 50.
 * Cost: 1 unit per batch of up to 50 IDs (videos.list). (D-13)
 */
export async function fetchVideosByIds(
  videoIds: string[]
): Promise<YouTubeVideoData[]> {
  const yt = getYouTube();
  const results: YouTubeVideoData[] = [];

  // Batch in groups of 50 (D-13)
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await yt.videos.list({
      part: ["snippet", "statistics", "contentDetails"],
      id: batch,
    });

    for (const item of res.data.items || []) {
      results.push({
        id: item.id!,
        channelId: item.snippet?.channelId || "",
        title: item.snippet?.title || "",
        description: item.snippet?.description || undefined,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          undefined,
        publishedAt: item.snippet?.publishedAt || undefined,
        duration: item.contentDetails?.duration || undefined,
        viewCount: parseInt(
          item.statistics?.viewCount || "0",
          10
        ),
        likeCount: parseInt(
          item.statistics?.likeCount || "0",
          10
        ),
        commentCount: parseInt(
          item.statistics?.commentCount || "0",
          10
        ),
        tags: item.snippet?.tags || undefined,
      });
    }
  }

  return results;
}

/** Map a YouTube API channel item to our internal type. */
function mapChannelItem(
  item: youtube_v3.Schema$Channel
): YouTubeChannelData {
  return {
    id: item.id!,
    title: item.snippet?.title || "",
    handle: item.snippet?.customUrl?.startsWith("@")
      ? item.snippet.customUrl.slice(1)
      : undefined,
    customUrl: item.snippet?.customUrl || undefined,
    description: item.snippet?.description || undefined,
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      undefined,
    bannerUrl:
      item.brandingSettings?.image?.bannerExternalUrl || undefined,
    subscriberCount: parseInt(
      item.statistics?.subscriberCount || "0",
      10
    ),
    videoCount: parseInt(item.statistics?.videoCount || "0", 10),
    viewCount: parseInt(item.statistics?.viewCount || "0", 10),
    country: item.snippet?.country || undefined,
    publishedAt: item.snippet?.publishedAt || undefined,
  };
}
