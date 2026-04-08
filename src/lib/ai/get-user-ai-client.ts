import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { decrypt, getMasterKey, type EncryptedPayload } from "@/lib/crypto";
import { createAIProvider } from "./provider";
import type { AIProvider, AIProviderName } from "./types";

/** Priority order: gemini first (cheaper), then openai */
const PROVIDER_PRIORITY: AIProviderName[] = ["gemini", "openai"];

/**
 * Get the user's AI provider by resolving their registered BYOK API key.
 * Tries providers in priority order (gemini > openai).
 * Updates lastUsedAt on the selected key.
 *
 * @param userId - The user's ID
 * @param preferredProvider - Optional: force a specific provider
 * @returns AIProvider instance ready for use
 * @throws Error if no valid AI API key is registered
 */
export async function getUserAIClient(
  userId: string,
  preferredProvider?: AIProviderName
): Promise<{ provider: AIProvider; keyId: string }> {
  const masterKey = getMasterKey();

  // If preferred provider specified, try that first
  const providerOrder = preferredProvider
    ? [preferredProvider, ...PROVIDER_PRIORITY.filter((p) => p !== preferredProvider)]
    : PROVIDER_PRIORITY;

  for (const providerName of providerOrder) {
    const [keyRow] = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.userId, userId),
          eq(apiKeys.provider, providerName),
          isNull(apiKeys.revokedAt)
        )
      )
      .limit(1);

    if (keyRow) {
      // Decrypt the API key
      const encryptedPayload: EncryptedPayload = {
        keyVersion: keyRow.keyVersion,
        encryptedDek: keyRow.encryptedDek,
        dekIv: keyRow.dekIv,
        dekAuthTag: keyRow.dekAuthTag,
        ciphertext: keyRow.ciphertext,
        dataIv: keyRow.dataIv,
        dataAuthTag: keyRow.dataAuthTag,
      };
      const plainApiKey = decrypt(encryptedPayload, masterKey);

      // Update lastUsedAt
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, keyRow.id));

      const provider = createAIProvider(providerName, plainApiKey);
      return { provider, keyId: keyRow.id };
    }
  }

  throw new Error(
    "No AI API key registered. Please add a Gemini or OpenAI API key in Settings."
  );
}
