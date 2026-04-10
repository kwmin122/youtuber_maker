import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

/**
 * Mock `child_process.spawn` with a tiny fake that lets each test
 * inject stdout/stderr and an exit code. Both `probeVideoMetadata`
 * and `downloadVideo` call `spawn('yt-dlp', args)` — we swap that
 * spawn for our fake before importing the module under test.
 */

type FakeProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

const spawnMock = vi.fn();

vi.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

function createFakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

/**
 * Schedule stdout/stderr writes and a close event on the next tick
 * so that the awaiting caller has attached its listeners first.
 */
function scheduleProc(
  proc: FakeProc,
  opts: { stdout?: string; stderr?: string; code: number | null }
) {
  setImmediate(() => {
    if (opts.stdout) proc.stdout.emit("data", Buffer.from(opts.stdout));
    if (opts.stderr) proc.stderr.emit("data", Buffer.from(opts.stderr));
    proc.emit("close", opts.code);
  });
}

describe("probeVideoMetadata", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("invokes yt-dlp with --dump-json --skip-download and parses stdout", async () => {
    const proc = createFakeProc();
    spawnMock.mockReturnValue(proc);

    const manifest = {
      id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      duration: 212.7,
      webpage_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ext: "mp4",
      filesize_approx: 12345678,
    };

    const { probeVideoMetadata } = await import("@/lib/video/ytdlp");
    scheduleProc(proc, { stdout: JSON.stringify(manifest), code: 0 });
    const result = await probeVideoMetadata(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args] = spawnMock.mock.calls[0];
    expect(bin).toBe("yt-dlp");
    expect(args).toContain("--dump-json");
    expect(args).toContain("--skip-download");
    expect(args).toContain(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    expect(result.id).toBe("dQw4w9WgXcQ");
    expect(result.title).toBe("Never Gonna Give You Up");
    expect(result.durationSeconds).toBe(213); // rounded
    expect(result.ext).toBe("mp4");
    expect(result.filesizeApprox).toBe(12345678);
  });

  it("rejects when yt-dlp exits with a non-zero code", async () => {
    const proc = createFakeProc();
    spawnMock.mockReturnValue(proc);
    scheduleProc(proc, {
      stderr: "ERROR: Video unavailable",
      code: 1,
    });

    const { probeVideoMetadata } = await import("@/lib/video/ytdlp");
    await expect(probeVideoMetadata("https://x/y")).rejects.toThrow(
      /yt-dlp probe failed \(1\)/
    );
  });

  it("rejects when stdout is not valid JSON", async () => {
    const proc = createFakeProc();
    spawnMock.mockReturnValue(proc);
    scheduleProc(proc, { stdout: "not json", code: 0 });

    const { probeVideoMetadata } = await import("@/lib/video/ytdlp");
    await expect(probeVideoMetadata("https://x/y")).rejects.toThrow(
      /JSON parse failed/
    );
  });

  it("rejects when manifest lacks a duration", async () => {
    const proc = createFakeProc();
    spawnMock.mockReturnValue(proc);
    scheduleProc(proc, {
      stdout: JSON.stringify({ id: "x", title: "y" }),
      code: 0,
    });

    const { probeVideoMetadata } = await import("@/lib/video/ytdlp");
    await expect(probeVideoMetadata("https://x/y")).rejects.toThrow(
      /no duration/i
    );
  });
});

describe("downloadVideo", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("passes the 720p format filter and reports progress", async () => {
    const proc = createFakeProc();
    spawnMock.mockReturnValue(proc);

    setImmediate(() => {
      proc.stdout.emit(
        "data",
        Buffer.from(
          "[download]   1.0% of 10MiB\n[download]  50.0% of 10MiB\n[download] 100.0% of 10MiB\n"
        )
      );
      proc.emit("close", 0);
    });

    const { downloadVideo } = await import("@/lib/video/ytdlp");
    const progressLog: number[] = [];

    await downloadVideo("https://x/y", "/tmp/out.mp4", (pct) => {
      progressLog.push(pct);
    });

    const [bin, args] = spawnMock.mock.calls[0];
    expect(bin).toBe("yt-dlp");
    expect(args).toContain("-f");
    const formatIdx = (args as string[]).indexOf("-f");
    expect((args as string[])[formatIdx + 1]).toContain("height<=720");
    expect(args).toContain("--merge-output-format");
    expect(args).toContain("-o");
    expect(args).toContain("/tmp/out.mp4");

    expect(progressLog).toEqual([1, 50, 100]);
  });

  it("rejects with stderr tail when yt-dlp exits non-zero", async () => {
    const proc = createFakeProc();
    spawnMock.mockReturnValue(proc);
    scheduleProc(proc, {
      stderr: "ERROR: HTTP Error 403: Forbidden",
      code: 1,
    });

    const { downloadVideo } = await import("@/lib/video/ytdlp");
    await expect(
      downloadVideo("https://x/y", "/tmp/out.mp4")
    ).rejects.toThrow(/yt-dlp download failed \(1\)/);
  });
});
