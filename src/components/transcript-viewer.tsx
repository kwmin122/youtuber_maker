"use client";

type TranscriptSegment = {
  text: string;
  offset: number;
  duration: number;
};

type Props = {
  segments: TranscriptSegment[];
  fullText: string;
  language: string;
  source: string;
};

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TranscriptViewer({
  segments,
  fullText,
  language,
  source,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>언어: {language}</span>
        <span>소스: {source}</span>
        <span>{segments.length}개 세그먼트</span>
      </div>

      <div className="space-y-1 max-h-[600px] overflow-y-auto rounded-lg border p-4">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="flex gap-3 py-1 hover:bg-accent/50 rounded px-2 -mx-2"
          >
            <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5 w-12">
              {formatTime(seg.offset)}
            </span>
            <span className="text-sm">{seg.text}</span>
          </div>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          전체 텍스트 보기
        </summary>
        <div className="mt-2 rounded-lg border bg-muted/50 p-4 whitespace-pre-wrap text-sm">
          {fullText}
        </div>
      </details>
    </div>
  );
}
