import { describe, it, expect } from "vitest";

describe("media-storage", () => {
  it("exports all storage functions", async () => {
    const mod = await import("@/lib/media/storage");
    expect(typeof mod.uploadMedia).toBe("function");
    expect(typeof mod.uploadVoiceSample).toBe("function");
    expect(typeof mod.deleteFromStorage).toBe("function");
    expect(typeof mod.downloadFromUrl).toBe("function");
  });
});
