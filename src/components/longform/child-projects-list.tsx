"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ChildProject = {
  id: string;
  title: string;
  description: string | null;
  exportedVideoUrl: string | null;
  createdAt: string;
};

export function ChildProjectsList({ sourceId }: { sourceId: string }) {
  const [projects, setProjects] = useState<ChildProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/projects?parentLongformId=${sourceId}`,
          { cache: "no-store", credentials: "include" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as ChildProject[];
        if (!cancelled) setProjects(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sourceId]);

  if (loading && projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        자식 프로젝트 확인 중...
      </p>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        아직 생성된 자식 프로젝트가 없습니다.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="text-sm truncate">{p.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {p.description && (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {p.description}
              </p>
            )}
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href={`/projects/${p.id}`}>프로젝트 열기</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
