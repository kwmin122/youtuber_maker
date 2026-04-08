"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TranscriptViewer } from "@/components/transcript-viewer";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ExternalLink } from "lucide-react";

type TranscriptSegment = {
  text: string;
  offset: number;
  duration: number;
};

type VideoData = {
  video: {
    id: string;
    title: string;
    youtubeVideoId: string;
    thumbnailUrl?: string;
    viewCount?: number;
    duration?: string;
  };
  transcript: {
    id: string;
    language: string;
    source: string;
    segments: TranscriptSegment[];
    fullText: string;
    fetchedAt: string;
  } | null;
  message?: string;
};

export default function VideoDetailPage() {
  const params = useParams();
  const channelId = params.id as string;
  const videoId = params.videoId as string;

  const [data, setData] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(
      `/api/channels/${channelId}/videos/${videoId}/transcript`
    )
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [channelId, videoId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.video) {
    return (
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <p className="text-muted-foreground">
          영상을 찾을 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/channels/${channelId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold flex-1 truncate">
          {data.video.title}
        </h1>
        <a
          href={`https://www.youtube.com/watch?v=${data.video.youtubeVideoId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm">
            <ExternalLink className="h-3 w-3 mr-1.5" />
            YouTube에서 보기
          </Button>
        </a>
      </div>

      {data.video.thumbnailUrl && (
        <div className="aspect-video max-w-md rounded-lg overflow-hidden">
          <img
            src={data.video.thumbnailUrl}
            alt={data.video.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex gap-4 text-sm text-muted-foreground">
        {data.video.viewCount !== undefined && (
          <span>
            조회수 {data.video.viewCount.toLocaleString()}회
          </span>
        )}
        {data.video.duration && (
          <span>길이: {data.video.duration}</span>
        )}
      </div>

      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">자막</h2>
        {data.transcript ? (
          <TranscriptViewer
            segments={data.transcript.segments}
            fullText={data.transcript.fullText}
            language={data.transcript.language}
            source={data.transcript.source}
          />
        ) : (
          <div className="text-muted-foreground text-sm rounded-lg border p-6 text-center">
            <p>아직 수집된 자막이 없습니다.</p>
            <p className="mt-1">
              채널 페이지에서 자막 수집을 실행하세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
