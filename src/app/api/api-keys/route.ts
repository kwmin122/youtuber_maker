import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { encrypt, getMasterKey, extractLast4 } from "@/lib/crypto";
import { getServerSession } from "@/lib/auth/get-session";
import { eq, and, isNull } from "drizzle-orm";

const createApiKeySchema = z.object({
  provider: z.string().min(1),
  label: z.string().optional(),
  apiKey: z.string().min(1),
});

const deleteApiKeySchema = z.object({
  id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { provider, label, apiKey } = parsed.data;
  const masterKey = getMasterKey();
  const encrypted = encrypt(apiKey, masterKey);
  const last4 = extractLast4(apiKey);

  const [created] = await db
    .insert(apiKeys)
    .values({
      userId: session.user.id,
      provider,
      label: label || null,
      last4,
      keyVersion: encrypted.keyVersion,
      encryptedDek: encrypted.encryptedDek,
      dekIv: encrypted.dekIv,
      dekAuthTag: encrypted.dekAuthTag,
      ciphertext: encrypted.ciphertext,
      dataIv: encrypted.dataIv,
      dataAuthTag: encrypted.dataAuthTag,
    })
    .returning({
      id: apiKeys.id,
      provider: apiKeys.provider,
      label: apiKeys.label,
      last4: apiKeys.last4,
      createdAt: apiKeys.createdAt,
    });

  return NextResponse.json(created, { status: 201 });
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await db
    .select({
      id: apiKeys.id,
      provider: apiKeys.provider,
      label: apiKeys.label,
      last4: apiKeys.last4,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.userId, session.user.id), isNull(apiKeys.revokedAt))
    );

  return NextResponse.json(keys);
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id } = parsed.data;

  // Verify ownership
  const [key] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, session.user.id)));

  if (!key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft delete
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, id));

  return NextResponse.json({ success: true });
}
