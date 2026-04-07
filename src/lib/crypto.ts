import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const KEY_LENGTH = 32; // 256 bits

export interface EncryptedPayload {
  keyVersion: number;
  encryptedDek: string; // base64
  dekIv: string; // base64
  dekAuthTag: string; // base64
  ciphertext: string; // base64
  dataIv: string; // base64
  dataAuthTag: string; // base64
}

export function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("MASTER_ENCRYPTION_KEY must be at least 32 bytes");
  }
  return Buffer.from(key, "base64");
}

export function encrypt(plaintext: string, masterKey: Buffer): EncryptedPayload {
  // 1. Generate random DEK
  const dek = randomBytes(KEY_LENGTH);

  // 2. Encrypt plaintext with DEK
  const dataIv = randomBytes(IV_LENGTH);
  const dataCipher = createCipheriv(ALGORITHM, dek, dataIv);
  const ciphertext = Buffer.concat([
    dataCipher.update(plaintext, "utf8"),
    dataCipher.final(),
  ]);
  const dataAuthTag = dataCipher.getAuthTag();

  // 3. Encrypt DEK with MASTER_KEY
  const dekIv = randomBytes(IV_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, masterKey, dekIv);
  const encryptedDek = Buffer.concat([
    dekCipher.update(dek),
    dekCipher.final(),
  ]);
  const dekAuthTag = dekCipher.getAuthTag();

  // Zero out DEK from memory
  dek.fill(0);

  return {
    keyVersion: 1,
    encryptedDek: encryptedDek.toString("base64"),
    dekIv: dekIv.toString("base64"),
    dekAuthTag: dekAuthTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    dataIv: dataIv.toString("base64"),
    dataAuthTag: dataAuthTag.toString("base64"),
  };
}

export function decrypt(payload: EncryptedPayload, masterKey: Buffer): string {
  // 1. Decrypt DEK with MASTER_KEY
  const dekDecipher = createDecipheriv(
    ALGORITHM,
    masterKey,
    Buffer.from(payload.dekIv, "base64")
  );
  dekDecipher.setAuthTag(Buffer.from(payload.dekAuthTag, "base64"));
  const dek = Buffer.concat([
    dekDecipher.update(Buffer.from(payload.encryptedDek, "base64")),
    dekDecipher.final(),
  ]);

  // 2. Decrypt ciphertext with DEK
  const dataDecipher = createDecipheriv(
    ALGORITHM,
    dek,
    Buffer.from(payload.dataIv, "base64")
  );
  dataDecipher.setAuthTag(Buffer.from(payload.dataAuthTag, "base64"));
  const plaintext = Buffer.concat([
    dataDecipher.update(Buffer.from(payload.ciphertext, "base64")),
    dataDecipher.final(),
  ]);

  // Zero out DEK from memory
  dek.fill(0);

  return plaintext.toString("utf8");
}

export function extractLast4(apiKey: string): string {
  return apiKey.slice(-4);
}
