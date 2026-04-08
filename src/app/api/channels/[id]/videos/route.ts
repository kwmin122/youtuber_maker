import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { channels, videos } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and, desc } from "drizzle-orm";
import { fetchChannelVideos } from "@/lib/youtube/client";
import {
  calcPerformanceScore,
  calcEngagementRate,
} from "@/lib/youtube/metrics";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour minimum between force refreshes

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id: channelId } = await params;
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get("sort") || "viewCount"; // viewCount | performanceScore | publishedAt
  const forceRefresh = searchParams.get("refresh") === "true";

  // Verify channel belongs to user
  const [channel] = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.id, channelId),
        eq(channels.userId, session.user.id)
      )
    )
    .limit(1);

  if (!channel) {
    return NextResponse.json(
      { error: "Channel not found" },
      { status: 404 }
    );
  }

  // Check if we have cached videos
  const existingVideos = await db
    .select()
    .from(videos)
    .where(eq(videos.channelId, channelId))
    .limit(1);

  const now = new Date();
  const timeSinceLastFetch =
    existingVideos.length > 0
      ? now.getTime() - existingVideos[0].fetchedAt.getTime()
      : Infinity;

  // Enforce minimum interval on force refresh to prevent quota abuse
  const refreshAllowed =
    forceRefresh && timeSinceLastFetch >= MIN_REFRESH_INTERVAL_MS;

  const needsFetch =
    refreshAllowed ||
    existingVideos.length === 0 ||
    timeSinceLastFetch > STALE_THRESHOLD_MS;

  if (needsFetch) {
    try {
      const ytVideos = await fetchChannelVideos(
        channel.youtubeChannelId,
        50
      );

      // Upsert videos with calculated metrics
      for (const v of ytVideos) {
        const perfScore = calcPerformanceScore(
          v.viewCount,
          channel.subscriberCount || 0
        );
        const engRate = calcEngagementRate(
          v.likeCount,
          v.commentCount,
          v.viewCount
        );

        await db
          .insert(videos)
          .values({
            channelId,
            youtubeVideoId: v.id,
            title: v.title,
            description: v.description || null,
            thumbnailUrl: v.thumbnailUrl || null,
            publishedAt: v.publishedAt
              ? new Date(v.publishedAt)
              : null,
            duration: v.duration || null,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
            performanceScore: perfScore,
            engagementRate: engRate,
            tags: v.tags || null,
            fetchedAt: now,
          })
          .onConflictDoUpdate({
            target: [videos.channelId, videos.youtubeVideoId],
            set: {
              title: v.title,
              description: v.description || null,
              thumbnailUrl: v.thumbnailUrl || null,
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              commentCount: v.commentCount,
              performanceScore: perfScore,
              engagementRate: engRate,
              tags: v.tags || null,
              fetchedAt: now,
              updatedAt: now,
            },
          });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "YouTube API error";
      if (message.includes("quotaExceeded")) {
        return NextResponse.json(
          {
            error:
              "YouTube API daily quota exceeded. Showing cached data if available.",
          },
          { status: 429 }
        );
      }
      // If we have cached data, return that with a warning
      if (existingVideos.length > 0) {
        // Fall through to return cached data
      } else {
        return NextResponse.json(
          { error: "Failed to fetch videos", details: message },
          { status: 502 }
        );
      }
    }
  }

  // Determine sort order
  const orderFn =
    sortBy === "performanceScore"
      ? desc(videos.performanceScore)
      : sortBy === "publishedAt"
        ? desc(videos.publishedAt)
        : sortBy === "engagementRate"
          ? desc(videos.engagementRate)
          : desc(videos.viewCount);

  const channelVideos = await db
    .select()
    .from(videos)
    .where(eq(videos.channelId, channelId))
    .orderBy(orderFn)
    .limit(50);

  return NextResponse.json({
    channel: {
      id: channel.id,
      title: channel.title,
      subscriberCount: channel.subscriberCount,
      thumbnailUrl: channel.thumbnailUrl,
    },
    videos: channelVideos,
    totalCount: channelVideos.length,
  });
}
