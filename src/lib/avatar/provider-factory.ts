import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { decrypt, getMasterKey, type EncryptedPayload } from "@/lib/crypto";
import { HeyGenClient } from "./heygen-client";
import { DIDClient } from "./did-client";
import type { AvatarLipsyncProvider, AvatarProviderName } from "./provider";

const AVATAR_PROVIDER_PRIORITY: AvatarProviderName[] = ["heygen", "did"];

export type ResolvedAvatarProvider = {
  provider: AvatarLipsyncProvider;
  providerName: AvatarProviderName;
  keyId: string;
};

/**
 * Resolve the user's avatar provider from their stored BYOK keys.
 * Tries HeyGen first, D-ID second. The worker handler in Plan 08-04
 * may also call this twice to explicitly fall back: first with
 * preferred='heygen', then with preferred='did' on failure.
 */
export async function getUserAvatarProvider(
  userId: string,
  preferred?: AvatarProviderName
): Promise<ResolvedAvatarProvider> {
  const masterKey = getMasterKey();
  const order = preferred
    ? [preferred, ...AVATAR_PROVIDER_PRIORITY.filter((p) => p !== preferred)]
    : AVATAR_PROVIDER_PRIORITY;

  for (const name of order) {
    const [keyRow] = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.userId, userId),
          eq(apiKeys.provider, name),
          isNull(apiKeys.revokedAt)
        )
      )
      .limit(1);

    if (!keyRow) continue;

    const payload: EncryptedPayload = {
      keyVersion: keyRow.keyVersion,
      encryptedDek: keyRow.encryptedDek,
      dekIv: keyRow.dekIv,
      dekAuthTag: keyRow.dekAuthTag,
      ciphertext: keyRow.ciphertext,
      dataIv: keyRow.dataIv,
      dataAuthTag: keyRow.dataAuthTag,
    };
    const plainKey = decrypt(payload, masterKey);
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyRow.id));

    const provider =
      name === "heygen"
        ? new HeyGenClient({ apiKey: plainKey })
        : new DIDClient({ apiKey: plainKey });
    return { provider, providerName: name, keyId: keyRow.id };
  }

  throw new Error(
    "No avatar provider API key registered. Add a HeyGen or D-ID API key in Settings."
  );
}

/**
 * Admin-only factory for seed scripts (Plan 08-02). Reads from env.
 * Never called from request-scoped code paths.
 */
export function getAdminAvatarProvider(name: AvatarProviderName): AvatarLipsyncProvider {
  if (name === "heygen") {
    const key = process.env.HEYGEN_API_KEY ?? "";
    return new HeyGenClient({ apiKey: key, useStub: !key });
  }
  const key = process.env.D_ID_API_KEY ?? "";
  return new DIDClient({ apiKey: key, useStub: !key });
}
