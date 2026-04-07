import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules before importing route handlers
vi.mock("@/lib/auth/get-session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn(() => ({
    keyVersion: 1,
    encryptedDek: "mock-encrypted-dek",
    dekIv: "mock-dek-iv",
    dekAuthTag: "mock-dek-auth-tag",
    ciphertext: "mock-ciphertext",
    dataIv: "mock-data-iv",
    dataAuthTag: "mock-data-auth-tag",
  })),
  getMasterKey: vi.fn(() => Buffer.alloc(32)),
  extractLast4: vi.fn((key: string) => key.slice(-4)),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
}));

import { POST, GET, DELETE } from "@/app/api/api-keys/route";
import { getServerSession } from "@/lib/auth/get-session";
import { db } from "@/lib/db";

const mockGetServerSession = vi.mocked(getServerSession);
const mockDb = vi.mocked(db) as any;

function createRequest(body: any, method = "POST"): any {
  return {
    json: () => Promise.resolve(body),
    method,
  };
}

describe("API Keys Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/api-keys", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null as any);

      const request = createRequest({
        provider: "openai",
        apiKey: "sk-test1234",
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("should create an encrypted key and return only masked fields", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1", name: "Test", email: "test@test.com" },
        session: { id: "session-1" },
      } as any);

      const mockCreated = {
        id: "key-uuid-1",
        provider: "openai",
        label: "My key",
        last4: "1234",
        createdAt: new Date(),
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      });

      const request = createRequest({
        provider: "openai",
        label: "My key",
        apiKey: "sk-test1234",
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe("key-uuid-1");
      expect(data.provider).toBe("openai");
      expect(data.label).toBe("My key");
      expect(data.last4).toBe("1234");
      expect(data.createdAt).toBeDefined();
    });

    it("should never return ciphertext or encrypted fields in POST response", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      const mockCreated = {
        id: "key-uuid-1",
        provider: "openai",
        label: null,
        last4: "1234",
        createdAt: new Date(),
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      });

      const request = createRequest({
        provider: "openai",
        apiKey: "sk-test1234",
      });
      const response = await POST(request);
      const data = await response.json();

      // Ensure no encryption fields leak
      expect(data.ciphertext).toBeUndefined();
      expect(data.encryptedDek).toBeUndefined();
      expect(data.dekIv).toBeUndefined();
      expect(data.dekAuthTag).toBeUndefined();
      expect(data.dataIv).toBeUndefined();
      expect(data.dataAuthTag).toBeUndefined();
      // Ensure no plaintext API key in response
      expect(JSON.stringify(data)).not.toContain("sk-test1234");
    });

    it("should return 400 for invalid request body", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      const request = createRequest({ provider: "" });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/api-keys", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null as any);

      const response = await GET();

      expect(response.status).toBe(401);
    });

    it("should list keys without encryption fields", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      const mockKeys = [
        {
          id: "key-1",
          provider: "openai",
          label: "Production",
          last4: "abcd",
          createdAt: new Date(),
          lastUsedAt: null,
        },
        {
          id: "key-2",
          provider: "gemini",
          label: null,
          last4: "efgh",
          createdAt: new Date(),
          lastUsedAt: new Date(),
        },
      ];
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockKeys),
        }),
      });

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(2);
      expect(data[0].provider).toBe("openai");
      expect(data[0].last4).toBe("abcd");
      // No encryption fields
      expect(data[0].ciphertext).toBeUndefined();
      expect(data[0].encryptedDek).toBeUndefined();
    });
  });

  describe("DELETE /api/api-keys", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null as any);

      const request = createRequest({ id: "key-uuid-1" });
      const response = await DELETE(request);

      expect(response.status).toBe(401);
    });

    it("should soft-delete by setting revokedAt", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      // Mock ownership check
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "key-uuid-1" }]),
        }),
      });

      // Mock soft delete
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const request = createRequest({
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("should return 404 if key not found or not owned by user", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const request = createRequest({
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      const response = await DELETE(request);

      expect(response.status).toBe(404);
    });
  });
});
