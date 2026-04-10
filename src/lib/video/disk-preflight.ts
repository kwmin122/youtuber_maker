import { statfs } from "fs/promises";
import { tmpdir } from "os";

/**
 * Assert that the filesystem backing `os.tmpdir()` has at least
 * `requiredBytes` of free space. Used by longform handlers to fail
 * fast before we download a multi-GB source that we know can't fit.
 *
 * Uses Node 18+ `fs/promises.statfs`. On platforms where `statfs` is
 * not implemented (`ENOSYS`), silently skip the check rather than
 * erroring — the handler will still fail later on the real write if
 * disk is actually exhausted.
 */
export async function assertDiskSpaceAvailable(
  requiredBytes: number,
  pathOverride?: string
): Promise<void> {
  const path = pathOverride ?? tmpdir();
  try {
    const stats = await statfs(path);
    // `bavail` = blocks available to unprivileged users; `bsize` = fs block size.
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    if (freeBytes < requiredBytes) {
      throw new Error(
        `Insufficient disk space in ${path}: need ${requiredBytes} bytes, have ${freeBytes}`
      );
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOSYS" || code === "ENOTSUP") {
      // Platform doesn't support statfs — skip preflight rather than
      // blocking the handler on environments like older containers.
      return;
    }
    throw err;
  }
}
