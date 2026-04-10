import Link from "next/link";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Source = {
  id: string;
  title: string | null;
  durationSeconds: number | null;
  status: string;
  sourceType: "url" | "file";
  sourceUrl: string | null;
  createdAt: string;
};

async function getSources(): Promise<Source[]> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${host}`;
  try {
    const res = await fetch(`${base}/api/longform/sources`, {
      headers: { cookie: h.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "analyzed" || status === "ready") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

export default async function LongformListPage() {
  const sources = await getSources();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">롱폼 → 쇼츠</h1>
          <p className="text-sm text-muted-foreground">
            긴 영상을 업로드하면 AI가 자동으로 쇼츠 후보 구간을 찾아줍니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/longform/new">새 롱폼 추가</Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="truncate text-base">
                {s.title ?? "(제목 없음)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                {s.durationSeconds && (
                  <span className="text-sm text-muted-foreground">
                    {Math.round(s.durationSeconds / 60)}분
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(s.createdAt).toLocaleString()}
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/longform/${s.id}`}>열기</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {sources.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground">
            아직 롱폼 소스가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
