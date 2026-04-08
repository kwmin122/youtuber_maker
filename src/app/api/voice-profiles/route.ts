import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { voiceProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/get-session";
import { uploadVoiceSample } from "@/lib/media/storage";

const createProfileSchema = z.object({
  name: z.string().min(1).max(100),
  /** Base64-encoded audio sample */
  sampleBase64: z.string().min(1),
  sampleContentType: z.string().default("audio/wav"),
  sampleDuration: z.number().min(3).max(20),
  /** ISO 8601 timestamp when user confirmed voice ownership consent */
  consentRecordedAt: z.string().datetime(),
  provider: z.enum(["openai-tts", "qwen3-tts"]).default("openai-tts"),
});

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await db
    .select()
    .from(voiceProfiles)
    .where(eq(voiceProfiles.userId, session.user.id));

  return NextResponse.json({ profiles });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, sampleBase64, sampleContentType, sampleDuration, consentRecordedAt, provider } = parsed.data;

  // Validate consent timestamp is not in the future
  const consentDate = new Date(consentRecordedAt);
  if (consentDate > new Date()) {
    return NextResponse.json(
      { error: "Consent timestamp cannot be in the future" },
      { status: 400 }
    );
  }

  // Decode and upload voice sample
  const sampleBuffer = Buffer.from(sampleBase64, "base64");
  const extension = sampleContentType.includes("wav") ? "wav" : "mp3";
  const filename = `voice-sample-${Date.now()}.${extension}`;

  const storageResult = await uploadVoiceSample({
    userId: session.user.id,
    filename,
    buffer: sampleBuffer,
    contentType: sampleContentType,
  });

  // Create voice profile with consent timestamp
  const [profile] = await db
    .insert(voiceProfiles)
    .values({
      userId: session.user.id,
      name,
      sampleUrl: storageResult.publicUrl,
      sampleStoragePath: storageResult.storagePath,
      sampleDuration,
      consentRecordedAt: consentDate,
      provider,
    })
    .returning();

  return NextResponse.json({ profile }, { status: 201 });
}
