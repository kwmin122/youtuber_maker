import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  statfs: vi.fn(),
}));

import { statfs } from "fs/promises";
import { assertDiskSpaceAvailable } from "@/lib/video/disk-preflight";

const statfsMock = vi.mocked(statfs);

// A minimal StatFs-shaped object for the helper. Drizzle/Node only
// reads `bavail` and `bsize`, so leaving other fields undefined is OK.
function makeStats(bavail: number, bsize: number) {
  return {
    bavail,
    bsize,
    // unused fields:
    bfree: bavail,
    blocks: bavail * 10,
    files: 0,
    ffree: 0,
    type: 0,
  } as unknown as Awaited<ReturnType<typeof statfs>>;
}

describe("assertDiskSpaceAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when free space exceeds requiredBytes", async () => {
    // 100 MB free
    statfsMock.mockResolvedValue(makeStats(100_000, 1024));
    await expect(
      assertDiskSpaceAvailable(50_000_000)
    ).resolves.toBeUndefined();
  });

  it("throws when free space is below requiredBytes", async () => {
    // 1 MB free
    statfsMock.mockResolvedValue(makeStats(1000, 1024));
    await expect(
      assertDiskSpaceAvailable(500_000_000)
    ).rejects.toThrow(/Insufficient disk space/);
  });

  it("silently skips when statfs is not implemented (ENOSYS)", async () => {
    const err = new Error("not supported") as NodeJS.ErrnoException;
    err.code = "ENOSYS";
    statfsMock.mockRejectedValue(err);
    await expect(
      assertDiskSpaceAvailable(1_000_000_000)
    ).resolves.toBeUndefined();
  });

  it("silently skips on ENOTSUP as well", async () => {
    const err = new Error("not supported") as NodeJS.ErrnoException;
    err.code = "ENOTSUP";
    statfsMock.mockRejectedValue(err);
    await expect(
      assertDiskSpaceAvailable(1_000_000_000)
    ).resolves.toBeUndefined();
  });

  it("propagates unexpected errors", async () => {
    const err = new Error("permission denied") as NodeJS.ErrnoException;
    err.code = "EACCES";
    statfsMock.mockRejectedValue(err);
    await expect(
      assertDiskSpaceAvailable(1_000)
    ).rejects.toThrow(/permission denied/);
  });

  it("uses pathOverride when provided", async () => {
    statfsMock.mockResolvedValue(makeStats(10_000_000, 512));
    await assertDiskSpaceAvailable(1000, "/custom/path");
    expect(statfsMock).toHaveBeenCalledWith("/custom/path");
  });
});
