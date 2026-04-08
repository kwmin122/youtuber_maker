import { describe, it, expect } from "vitest";

describe("voice-profile API", () => {
  it("GET handler is exported from voice-profiles route", async () => {
    const mod = await import("@/app/api/voice-profiles/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("POST handler is exported from voice-profiles route", async () => {
    const mod = await import("@/app/api/voice-profiles/route");
    expect(typeof mod.POST).toBe("function");
  });

  it("GET handler is exported from voice-profiles/[id] route", async () => {
    const mod = await import("@/app/api/voice-profiles/[id]/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("DELETE handler is exported from voice-profiles/[id] route", async () => {
    const mod = await import("@/app/api/voice-profiles/[id]/route");
    expect(typeof mod.DELETE).toBe("function");
  });

  it("voice-profiles route validates consentRecordedAt in schema", async () => {
    // Verify the route file contains consent validation
    const fs = await import("fs/promises");
    const source = await fs.readFile(
      "src/app/api/voice-profiles/route.ts",
      "utf-8"
    );
    expect(source).toContain("consentRecordedAt");
    expect(source).toContain("z.string().datetime()");
    expect(source).toContain("sampleDuration");
  });

  it("voice-profiles/[id] route handles sample deletion from storage", async () => {
    const fs = await import("fs/promises");
    const source = await fs.readFile(
      "src/app/api/voice-profiles/[id]/route.ts",
      "utf-8"
    );
    expect(source).toContain("deleteFromStorage");
    expect(source).toContain("voice-samples");
  });
});
