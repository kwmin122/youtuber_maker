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
    orderBy: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

import {
  POST,
  GET,
} from "@/app/api/projects/route";
import {
  GET as GET_BY_ID,
  PATCH,
  DELETE,
} from "@/app/api/projects/[id]/route";
import { getServerSession } from "@/lib/auth/get-session";
import { db } from "@/lib/db";

const mockGetServerSession = vi.mocked(getServerSession);
const mockDb = vi.mocked(db) as any;

function createRequest(body?: any): any {
  return {
    json: () => Promise.resolve(body || {}),
  };
}

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Projects Route - /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/projects", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null as any);

      const request = createRequest({ title: "Test Project" });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("should create a project with default workflowState", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1", name: "Test", email: "test@test.com" },
        session: { id: "session-1" },
      } as any);

      const mockProject = {
        id: "proj-uuid-1",
        userId: "user-1",
        title: "My Shorts Project",
        description: "A test project",
        workflowState: {
          currentStep: 1,
          lastActiveTab: "script",
          completedSteps: [],
          lastEditedAt: expect.any(String),
          draftFlags: {},
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockProject]),
        }),
      });

      const request = createRequest({
        title: "My Shorts Project",
        description: "A test project",
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.title).toBe("My Shorts Project");
      expect(data.workflowState).toBeDefined();
      expect(data.workflowState.currentStep).toBe(1);
      expect(data.workflowState.lastActiveTab).toBe("script");
      expect(data.workflowState.completedSteps).toEqual([]);
    });

    it("should return 400 for missing title", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      const request = createRequest({ description: "No title" });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/projects", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null as any);

      const response = await GET(
        new Request("http://localhost/api/projects") as any
      );

      expect(response.status).toBe(401);
    });

    it("should list only the authenticated user's projects", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      const mockProjects = [
        {
          id: "proj-1",
          userId: "user-1",
          title: "Project A",
          description: null,
          workflowState: { currentStep: 2 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "proj-2",
          userId: "user-1",
          title: "Project B",
          description: "Second",
          workflowState: { currentStep: 1 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockProjects),
          }),
        }),
      });

      const response = await GET(
        new Request("http://localhost/api/projects") as any
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(2);
      expect(data[0].title).toBe("Project A");
    });
  });
});

describe("Projects Route - /api/projects/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/projects/[id]", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null as any);

      const response = await GET_BY_ID(
        createRequest(),
        createParams("proj-1")
      );

      expect(response.status).toBe(401);
    });

    it("should return a single project with ownership check", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      const mockProject = {
        id: "proj-1",
        userId: "user-1",
        title: "My Project",
        workflowState: { currentStep: 1 },
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockProject]),
        }),
      });

      const response = await GET_BY_ID(
        createRequest(),
        createParams("proj-1")
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.title).toBe("My Project");
    });

    it("should return 404 if project not found", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const response = await GET_BY_ID(
        createRequest(),
        createParams("nonexistent")
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/projects/[id]", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null as any);

      const response = await PATCH(
        createRequest({ title: "Updated" }),
        createParams("proj-1")
      );

      expect(response.status).toBe(401);
    });

    it("should update title, description, workflowState and bump updatedAt", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      // Ownership check
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "proj-1" }]),
        }),
      });

      const updatedProject = {
        id: "proj-1",
        userId: "user-1",
        title: "Updated Title",
        description: "Updated desc",
        workflowState: {
          currentStep: 3,
          lastActiveTab: "voice",
          completedSteps: [1, 2],
          lastEditedAt: new Date().toISOString(),
          draftFlags: { scriptDone: true },
        },
        updatedAt: new Date(),
      };

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedProject]),
          }),
        }),
      });

      const request = createRequest({
        title: "Updated Title",
        description: "Updated desc",
        workflowState: {
          currentStep: 3,
          lastActiveTab: "voice",
          completedSteps: [1, 2],
          lastEditedAt: new Date().toISOString(),
          draftFlags: { scriptDone: true },
        },
      });
      const response = await PATCH(request, createParams("proj-1"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.title).toBe("Updated Title");
      expect(data.workflowState.currentStep).toBe(3);
    });

    it("should return 404 if project not owned by user", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const response = await PATCH(
        createRequest({ title: "Hack" }),
        createParams("other-user-proj")
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/projects/[id]", () => {
    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null as any);

      const response = await DELETE(createRequest(), createParams("proj-1"));

      expect(response.status).toBe(401);
    });

    it("should delete the project and return success", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      // Ownership check
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "proj-1" }]),
        }),
      });

      // Delete
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const response = await DELETE(createRequest(), createParams("proj-1"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("should return 404 if project not found", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "session-1" },
      } as any);

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const response = await DELETE(
        createRequest(),
        createParams("nonexistent")
      );

      expect(response.status).toBe(404);
    });
  });
});
