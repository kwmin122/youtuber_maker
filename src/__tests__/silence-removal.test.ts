import { describe, it, expect } from "vitest";

describe("silence-removal module", () => {
  it("exports detectSilence function", async () => {
    const mod = await import("@/lib/media/silence-removal");
    expect(typeof mod.detectSilence).toBe("function");
  });

  it("exports removeSilence function", async () => {
    const mod = await import("@/lib/media/silence-removal");
    expect(typeof mod.removeSilence).toBe("function");
  });

  it("does NOT use fluent-ffmpeg", async () => {
    // Read the source file and verify no fluent-ffmpeg import
    const fs = await import("fs/promises");
    const source = await fs.readFile(
      "src/lib/media/silence-removal.ts",
      "utf-8"
    );
    expect(source).not.toContain("fluent-ffmpeg");
    expect(source).toContain("spawn"); // Uses child_process.spawn
  });

  it("uses child_process spawn", async () => {
    const fs = await import("fs/promises");
    const source = await fs.readFile(
      "src/lib/media/silence-removal.ts",
      "utf-8"
    );
    expect(source).toContain("from \"child_process\"");
    expect(source).toContain("spawn");
  });
});
