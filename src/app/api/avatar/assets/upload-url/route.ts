import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/get-session";
import { createAvatarReferenceUploadUrl } from "@/lib/media/avatar-reference-storage";

const bodySchema = z.object({
  ext: z.enum(["jpg", "jpeg", "png", "webp"]),
});

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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const target = await createAvatarReferenceUploadUrl({
    userId: session.user.id,
    ext: parsed.data.ext,
  });

  return NextResponse.json({
    storagePath: target.storagePath,
    signedUrl: target.signedUrl,
    token: target.token,
  });
}
