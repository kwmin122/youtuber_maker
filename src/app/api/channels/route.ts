import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { channels } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and, desc } from "drizzle-orm";
import { parseChannelUrl } from "@/lib/youtube/parse-url";
import {
  fetchChannelById,
  fetchChannelByHandle,
} from "@/lib/youtube/client";
import type { YouTubeChannelData } from "@/lib/youtube/types";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours (D-03)

const importChannelSchema = z.object({
  url: z.string().min(1, "Channel URL is required"),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = importChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const parsedUrl = parseChannelUrl(parsed.data.url);
  if (!parsedUrl) {
    return NextResponse.json(
      { error: "Invalid YouTube channel URL or handle" },
      { status: 400 }
    );
  }

  // Resolve channel data from YouTube API
  let channelData: YouTubeChannelData | null = null;

  try {
    switch (parsedUrl.type) {
      case "channel_id":
        channelData = await fetchChannelById(parsedUrl.value);
        break;
      case "handle":
        channelData = await fetchChannelByHandle(parsedUrl.value);
        break;
      case "custom":
        channelData = await fetchChannelByHandle(parsedUrl.value);
        break;
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "YouTube API error";
    return NextResponse.json(
      { error: "Failed to fetch channel from YouTube", details: message },
      { status: 502 }
    );
  }

  if (!channelData) {
    return NextResponse.json(
      { error: "Channel not found on YouTube" },
      { status: 404 }
    );
  }

  // Check if channel already exists for this user
  const existing = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.userId, session.user.id),
        eq(channels.youtubeChannelId, channelData.id)
      )
    )
    .limit(1);

  const now = new Date();

  if (existing.length > 0) {
    const record = existing[0];
    const isStale =
      now.getTime() - record.fetchedAt.getTime() > STALE_THRESHOLD_MS;

    if (isStale) {
      // Refresh stale data
      const [updated] = await db
        .update(channels)
        .set({
          title: channelData.title,
          handle: channelData.handle || null,
          customUrl: channelData.customUrl || null,
          description: channelData.description || null,
          thumbnailUrl: channelData.thumbnailUrl || null,
          bannerUrl: channelData.bannerUrl || null,
          subscriberCount: channelData.subscriberCount,
          videoCount: channelData.videoCount,
          viewCount: channelData.viewCount,
          country: channelData.country || null,
          fetchedAt: now,
          updatedAt: now,
        })
        .where(eq(channels.id, record.id))
        .returning();

      return NextResponse.json(updated, { status: 200 });
    }

    return NextResponse.json(record, { status: 200 });
  }

  // Insert new channel
  const [created] = await db
    .insert(channels)
    .values({
      userId: session.user.id,
      youtubeChannelId: channelData.id,
      title: channelData.title,
      handle: channelData.handle || null,
      customUrl: channelData.customUrl || null,
      description: channelData.description || null,
      thumbnailUrl: channelData.thumbnailUrl || null,
      bannerUrl: channelData.bannerUrl || null,
      subscriberCount: channelData.subscriberCount,
      videoCount: channelData.videoCount,
      viewCount: channelData.viewCount,
      country: channelData.country || null,
      publishedAt: channelData.publishedAt
        ? new Date(channelData.publishedAt)
        : null,
      fetchedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get("sort") || "createdAt";

  const orderFn =
    sortBy === "subscriberCount"
      ? desc(channels.subscriberCount)
      : sortBy === "viewCount"
        ? desc(channels.viewCount)
        : desc(channels.createdAt);

  const userChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.userId, session.user.id))
    .orderBy(orderFn)
    .limit(100);

  return NextResponse.json(userChannels);
}
