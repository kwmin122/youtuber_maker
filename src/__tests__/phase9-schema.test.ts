import { describe, it, expect } from "vitest";
import {
  trendSnapshots,
  trendGapAnalyses,
  trendIngestionRuns,
} from "@/lib/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("Phase 9 schema — trend tables", () => {
  it("trend_snapshots has the required columns", () => {
    const cols = getTableColumns(trendSnapshots);
    const names = Object.keys(cols);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "recordedAt",
        "categoryId",
        "regionCode",
        "keyword",
        "rank",
        "source",
        "videoCount",
        "rawPayload",
        "createdAt",
      ])
    );
  });

  it("trend_ingestion_runs has the required columns", () => {
    const cols = getTableColumns(trendIngestionRuns);
    const names = Object.keys(cols);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "startedAt",
        "endedAt",
        "regionCode",
        "categoryCount",
        "successCount",
        "partialCount",
        "failureCount",
        "status",
        "errorDetails",
        "source",
      ])
    );
  });

  it("trend_gap_analyses has the required columns", () => {
    const cols = getTableColumns(trendGapAnalyses);
    const names = Object.keys(cols);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "projectId",
        "channelSetHash",
        "latestSnapshotDate",
        "setdiffCache",
        "rationaleCache",
        "computedAt",
        "ttlExpiresAt",
      ])
    );
  });
});
