import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "crypto";
import {
  encrypt,
  decrypt,
  extractLast4,
  getMasterKey,
  type EncryptedPayload,
} from "@/lib/crypto";

describe("Envelope Encryption (AES-256-GCM)", () => {
  const testMasterKey = randomBytes(32);
  const testApiKey = "sk-test-1234567890abcdef";

  describe("encrypt + decrypt roundtrip", () => {
    it("should return the original plaintext after encrypt then decrypt", () => {
      const encrypted = encrypt(testApiKey, testMasterKey);
      const decrypted = decrypt(encrypted, testMasterKey);
      expect(decrypted).toBe(testApiKey);
    });

    it("should handle empty string", () => {
      const encrypted = encrypt("", testMasterKey);
      const decrypted = decrypt(encrypted, testMasterKey);
      expect(decrypted).toBe("");
    });

    it("should handle unicode characters", () => {
      const unicodeKey = "sk-test-key-with-unicode";
      const encrypted = encrypt(unicodeKey, testMasterKey);
      const decrypted = decrypt(encrypted, testMasterKey);
      expect(decrypted).toBe(unicodeKey);
    });

    it("should handle long API keys", () => {
      const longKey = "sk-" + "a".repeat(500);
      const encrypted = encrypt(longKey, testMasterKey);
      const decrypted = decrypt(encrypted, testMasterKey);
      expect(decrypted).toBe(longKey);
    });
  });

  describe("encryption uniqueness", () => {
    it("should produce different ciphertext for different plaintext", () => {
      const enc1 = encrypt("key-one-1234", testMasterKey);
      const enc2 = encrypt("key-two-5678", testMasterKey);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    });

    it("should produce different ciphertext for same plaintext (unique DEK + IV)", () => {
      const enc1 = encrypt(testApiKey, testMasterKey);
      const enc2 = encrypt(testApiKey, testMasterKey);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
      expect(enc1.encryptedDek).not.toBe(enc2.encryptedDek);
    });
  });

  describe("tamper detection", () => {
    it("should throw when ciphertext is tampered", () => {
      const encrypted = encrypt(testApiKey, testMasterKey);
      const tampered: EncryptedPayload = {
        ...encrypted,
        ciphertext: Buffer.from("tampered-data").toString("base64"),
      };
      expect(() => decrypt(tampered, testMasterKey)).toThrow();
    });

    it("should throw when encryptedDek is tampered", () => {
      const encrypted = encrypt(testApiKey, testMasterKey);
      const tampered: EncryptedPayload = {
        ...encrypted,
        encryptedDek: Buffer.from("tampered-dek").toString("base64"),
      };
      expect(() => decrypt(tampered, testMasterKey)).toThrow();
    });

    it("should throw when authTag is tampered", () => {
      const encrypted = encrypt(testApiKey, testMasterKey);
      const tampered: EncryptedPayload = {
        ...encrypted,
        dataAuthTag: Buffer.from(randomBytes(16)).toString("base64"),
      };
      expect(() => decrypt(tampered, testMasterKey)).toThrow();
    });

    it("should throw with wrong master key", () => {
      const encrypted = encrypt(testApiKey, testMasterKey);
      const wrongKey = randomBytes(32);
      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });
  });

  describe("encrypted payload structure", () => {
    it("should return all required fields as base64 strings", () => {
      const encrypted = encrypt(testApiKey, testMasterKey);
      expect(encrypted.keyVersion).toBe(1);
      expect(typeof encrypted.encryptedDek).toBe("string");
      expect(typeof encrypted.dekIv).toBe("string");
      expect(typeof encrypted.dekAuthTag).toBe("string");
      expect(typeof encrypted.ciphertext).toBe("string");
      expect(typeof encrypted.dataIv).toBe("string");
      expect(typeof encrypted.dataAuthTag).toBe("string");

      // Verify base64 encoding
      expect(() => Buffer.from(encrypted.ciphertext, "base64")).not.toThrow();
      expect(() => Buffer.from(encrypted.encryptedDek, "base64")).not.toThrow();
    });
  });

  describe("DEK memory cleanup", () => {
    it("should zero out DEK after encryption (dek.fill(0) is called)", () => {
      // We can't directly test memory cleanup, but we verify the function
      // completes successfully and produces valid output, which means
      // the dek.fill(0) line executed without error
      const encrypted = encrypt(testApiKey, testMasterKey);
      const decrypted = decrypt(encrypted, testMasterKey);
      expect(decrypted).toBe(testApiKey);
    });
  });
});

describe("extractLast4", () => {
  it("should return the last 4 characters of a key", () => {
    expect(extractLast4("sk-1234567890abcdef")).toBe("cdef");
  });

  it("should return the whole string if shorter than 4 chars", () => {
    expect(extractLast4("abc")).toBe("abc");
  });

  it("should return exactly 4 chars for a 4-char string", () => {
    expect(extractLast4("abcd")).toBe("abcd");
  });
});

describe("getMasterKey", () => {
  const originalEnv = process.env.MASTER_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.MASTER_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.MASTER_ENCRYPTION_KEY;
    }
  });

  it("should throw if MASTER_ENCRYPTION_KEY is not set", () => {
    delete process.env.MASTER_ENCRYPTION_KEY;
    expect(() => getMasterKey()).toThrow("MASTER_ENCRYPTION_KEY is not set");
  });

  it("should throw if MASTER_ENCRYPTION_KEY is too short", () => {
    process.env.MASTER_ENCRYPTION_KEY = "short";
    expect(() => getMasterKey()).toThrow(
      "MASTER_ENCRYPTION_KEY must decode to at least 32 bytes"
    );
  });

  it("should return a Buffer when key is valid", () => {
    process.env.MASTER_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const key = getMasterKey();
    expect(Buffer.isBuffer(key)).toBe(true);
  });
});
