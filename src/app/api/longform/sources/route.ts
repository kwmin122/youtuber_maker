import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, longformSources } from "@/lib/db/schema";
import { getLongformQueue } from "@/lib/queue-longform";
import { getServerSession } from "@/lib/auth/get-session";
import { parseVideoUrl } from "@/lib/youtube/parse-url";

const bodySchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("url"),
    url: z.string().url(),
  }),
  z.object({
    sourceType: z.literal("file"),
    storagePath: z.string().min(1),
    title: z.string().max(500).optional(),
  }),
]);

/**
 * POST /api/longform/sources
 *
 * Create a `longform_sources` row and enqueue a `longform-download`
 * job on the longform queue. Accepts either a YouTube URL or a
 * storage path previously written through POST /upload-url.
 *
 * Auth: required. File mode enforces that `storagePath` starts with
 * `<userId>/` so users can't enqueue jobs against other users' files.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (data.sourceType === "url") {
    const parsedVideo = parseVideoUrl(data.url);
    if (!parsedVideo) {
      return NextResponse.json(
        { error: "Not a valid YouTube video URL" },
        { status: 400 }
      );
    }
  } else {
    // File mode: storagePath must live under the caller's user folder.
    if (!data.storagePath.startsWith(`${session.user.id}/`)) {
      return NextResponse.json(
        { error: "storagePath must be under your user folder" },
        { status: 403 }
      );
    }
  }

  const [source] = await db
    .insert(longformSources)
    .values({
      userId: session.user.id,
      sourceType: data.sourceType,
      sourceUrl: data.sourceType === "url" ? data.url : null,
      storagePath: data.sourceType === "file" ? data.storagePath : null,
      title: data.sourceType === "file" ? data.title ?? null : null,
      status: "pending",
    })
    .returning();

  const [jobRow] = await db
    .insert(jobs)
    .values({
      userId: session.user.id,
      type: "longform-download",
      status: "pending",
      progress: 0,
      payload: { sourceId: source.id },
    })
    .returning();

  await getLongformQueue().add("longform-download", {
    payload: { sourceId: source.id },
    jobId: jobRow.id,
    userId: session.user.id,
  });

  return NextResponse.json(
    { sourceId: source.id, jobId: jobRow.id },
    { status: 201 }
  );
}

/**
 * GET /api/longform/sources
 *
 * List the current user's longform sources, newest first.
 */
export async function GET(_request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(longformSources)
    .where(eq(longformSources.userId, session.user.id))
    .orderBy(desc(longformSources.createdAt))
    .limit(100);

  return NextResponse.json(rows);
}
