"use client";

interface MediaAsset {
  id: string;
  type: "image" | "video" | "audio";
  url: string;
  status: string;
}

interface MediaPreviewProps {
  asset?: MediaAsset;
  type: "image" | "video" | "audio";
}

export function MediaPreview({ asset, type }: MediaPreviewProps) {
  if (!asset || asset.status === "pending" || asset.status === "generating") {
    return (
      <div className="aspect-[9/16] bg-muted rounded-md flex items-center justify-center text-xs text-muted-foreground">
        {asset?.status === "generating" ? (
          <div className="flex flex-col items-center gap-1">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>생성 중...</span>
          </div>
        ) : (
          <span>미생성</span>
        )}
      </div>
    );
  }

  if (asset.status === "failed") {
    return (
      <div className="aspect-[9/16] bg-destructive/10 rounded-md flex items-center justify-center text-xs text-destructive">
        실패
      </div>
    );
  }

  switch (type) {
    case "image":
      return (
        <img
          src={asset.url}
          alt="Scene image"
          className="aspect-[9/16] w-full rounded-md object-cover"
        />
      );
    case "video":
      return (
        <video
          src={asset.url}
          className="aspect-[9/16] w-full rounded-md object-cover"
          controls
          muted
          playsInline
        />
      );
    case "audio":
      return (
        <div className="aspect-[9/16] bg-muted rounded-md flex items-center justify-center p-2">
          <audio src={asset.url} controls className="w-full" />
        </div>
      );
    default:
      return null;
  }
}
