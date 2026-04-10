/**
 * Plan 08-02 — seed script dry-run smoke test.
 *
 * Spawns the seed script as a subprocess with --dry-run and asserts:
 * - exit code 0
 * - stdout contains the row count summary line
 * - stdout contains the dry-run message (no DB writes)
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join } from "path";

describe("scripts/seed-avatar-library.ts", () => {
  it("dry-run exits 0 and prints the row count", () => {
    const root = join(__dirname, "../..");
    const result = spawnSync(
      "bun",
      ["run", "scripts/seed-avatar-library.ts", "--dry-run"],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/prepared \d+ HeyGen \+ \d+ D-ID = \d+ rows/);
    expect(result.stdout).toContain("dry-run, exiting without insert");
  });
});
