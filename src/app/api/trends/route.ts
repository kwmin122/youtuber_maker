import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trendSnapshots, trendIngestionRuns } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, desc, sql } from "drizzle-orm";

// Korean category labels matching YouTube videoCategoryId ints
export const KR_CATEGORY_LABELS: Record<number, string> = {
  1:  "영화 & 애니메이션",
  2:  "자동차",
  10: "음악",
  15: "반려동물 & 동물",
  17: "스포츠",
  20: "게임",
  22: "블로그",
  23: "코미디",
  24: "엔터테인먼트",
  25: "뉴스 & 정치",
  26: "하우투 & 스타일",
  27: "교육",
  28: "과학 & 기술",
  29: "NGO & 사회운동",
};

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Latest snapshot date for KR
  const [latestRow] = await db
    .select({ maxDate: sql<string>`MAX(recorded_at::date)` })
    .from(trendSnapshots)
    .where(eq(trendSnapshots.regionCode, "KR"));

  const latestDate = latestRow?.maxDate ?? null;

  // Fetch top-20 per category for the latest date
  // Uses window function: rank <= 20 per (categoryId, source) on the latest date
  const rows = latestDate
    ? await db
        .select({
          categoryId: trendSnapshots.categoryId,
          keyword: trendSnapshots.keyword,
          rank: trendSnapshots.rank,
          source: trendSnapshots.source,
          recordedAt: trendSnapshots.recordedAt,
        })
        .from(trendSnapshots)
        .where(
          sql`${trendSnapshots.regionCode} = 'KR'
            AND ${trendSnapshots.recordedAt}::date = ${latestDate}::date
            AND ${trendSnapshots.rank} <= 20`
        )
        .orderBy(trendSnapshots.categoryId, trendSnapshots.rank)
    : [];

  // Last ingestion run for stale-banner
  const [lastRun] = await db
    .select({
      endedAt: trendIngestionRuns.endedAt,
      status: trendIngestionRuns.status,
      partialCount: trendIngestionRuns.partialCount,
    })
    .from(trendIngestionRuns)
    .orderBy(desc(trendIngestionRuns.startedAt))
    .limit(1);

  // Group rows by categoryId
  const byCategory: Record<
    number,
    { keyword: string; rank: number; source: string; recordedAt: string }[]
  > = {};
  for (const r of rows) {
    if (!byCategory[r.categoryId]) byCategory[r.categoryId] = [];
    byCategory[r.categoryId].push({
      keyword: r.keyword,
      rank: r.rank,
      source: r.source,
      recordedAt: r.recordedAt.toISOString(),
    });
  }

  return NextResponse.json({
    latestDate,
    lastRun: lastRun
      ? {
          endedAt: lastRun.endedAt?.toISOString() ?? null,
          status: lastRun.status,
          partial: (lastRun.partialCount ?? 0) > 0,
        }
      : null,
    categories: byCategory,
    categoryLabels: KR_CATEGORY_LABELS,
  });
}
