import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { channels, videos, transcripts } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and } from "drizzle-orm";

type Params = {
  params: Promise<{ id: string; videoId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: channelId, videoId } = await params;

  // Verify channel belongs to user
  const [channel] = await db
    .select({ id: channels.id })
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

  // Get video
  const [video] = await db
    .select()
    .from(videos)
    .where(
      and(
        eq(videos.id, videoId),
        eq(videos.channelId, channelId)
      )
    )
    .limit(1);

  if (!video) {
    return NextResponse.json(
      { error: "Video not found" },
      { status: 404 }
    );
  }

  // Get transcript
  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.videoId, videoId))
    .limit(1);

  if (!transcript) {
    return NextResponse.json(
      {
        video: {
          id: video.id,
          title: video.title,
          youtubeVideoId: video.youtubeVideoId,
        },
        transcript: null,
        message: "No transcript collected yet",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    video: {
      id: video.id,
      title: video.title,
      youtubeVideoId: video.youtubeVideoId,
      thumbnailUrl: video.thumbnailUrl,
      viewCount: video.viewCount,
      duration: video.duration,
    },
    transcript: {
      id: transcript.id,
      language: transcript.language,
      source: transcript.source,
      segments: transcript.segments,
      fullText: transcript.fullText,
      fetchedAt: transcript.fetchedAt,
    },
  });
}
