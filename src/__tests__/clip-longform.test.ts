import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "child_process";
import { buildClipArgs, clipLongform9x16 } from "@/lib/video/clip-longform";

const spawnMock = vi.mocked(spawn);

/** Minimal child_process.spawn mock that emits 'close' with a given code. */
function fakeProc(opts: {
  exitCode: number;
  stderrChunks?: string[];
}): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  const stderr = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = stderr;
  // schedule emissions on the next tick
  setImmediate(() => {
    for (const chunk of opts.stderrChunks ?? []) {
      stderr.emit("data", Buffer.from(chunk));
    }
    (proc as unknown as EventEmitter).emit("close", opts.exitCode);
  });
  return proc;
}

describe("buildClipArgs", () => {
  it("contains the exact 9:16 crop filter, 1080x1920 scale, and 30fps", () => {
    const args = buildClipArgs({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      startMs: 1000,
      endMs: 61000,
    });
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toBe(
      "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920,fps=30"
    );
  });

  it("uses libx264 + veryfast + crf 23 for video encoding", () => {
    const args = buildClipArgs({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      startMs: 0,
      endMs: 5000,
    });
    expect(args).toContain("libx264");
    expect(args).toContain("veryfast");
    const crfIdx = args.indexOf("-crf");
    expect(args[crfIdx + 1]).toBe("23");
  });

  it("uses AAC audio at 128k / 44100 Hz", () => {
    const args = buildClipArgs({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      startMs: 0,
      endMs: 5000,
    });
    expect(args).toContain("aac");
    const bIdx = args.indexOf("-b:a");
    expect(args[bIdx + 1]).toBe("128k");
    const arIdx = args.indexOf("-ar");
    expect(args[arIdx + 1]).toBe("44100");
  });

  it("emits +faststart for web playback", () => {
    const args = buildClipArgs({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      startMs: 0,
      endMs: 5000,
    });
    const mvIdx = args.indexOf("-movflags");
    expect(args[mvIdx + 1]).toBe("+faststart");
  });

  it("emits -ss before -i (input seek) with seconds precision", () => {
    const args = buildClipArgs({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      startMs: 1234,
      endMs: 5678,
    });
    const ssIdx = args.indexOf("-ss");
    const toIdx = args.indexOf("-to");
    const iIdx = args.indexOf("-i");
    expect(ssIdx).toBeLessThan(iIdx);
    expect(toIdx).toBeLessThan(iIdx);
    expect(args[ssIdx + 1]).toBe("1.234");
    expect(args[toIdx + 1]).toBe("5.678");
  });

  it("places the output path as the final arg", () => {
    const args = buildClipArgs({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      startMs: 0,
      endMs: 3000,
    });
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
  });

  it("throws for non-finite range", () => {
    expect(() =>
      buildClipArgs({
        inputPath: "/tmp/in.mp4",
        outputPath: "/tmp/out.mp4",
        startMs: Number.NaN,
        endMs: 5000,
      })
    ).toThrow(/Invalid clip range/);
  });

  it("throws when endMs <= startMs", () => {
    expect(() =>
      buildClipArgs({
        inputPath: "/tmp/in.mp4",
        outputPath: "/tmp/out.mp4",
        startMs: 5000,
        endMs: 5000,
      })
    ).toThrow(/must be > startMs/);
  });
});

describe("clipLongform9x16", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves on ffmpeg exit code 0", async () => {
    spawnMock.mockReturnValue(fakeProc({ exitCode: 0 }));
    await expect(
      clipLongform9x16({
        inputPath: "/tmp/in.mp4",
        outputPath: "/tmp/out.mp4",
        startMs: 0,
        endMs: 5000,
      })
    ).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining([
        "-vf",
        "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920,fps=30",
      ])
    );
  });

  it("rejects on non-zero exit code with stderr tail in the error", async () => {
    spawnMock.mockReturnValue(
      fakeProc({ exitCode: 1, stderrChunks: ["boom at line 42"] })
    );
    await expect(
      clipLongform9x16({
        inputPath: "/tmp/in.mp4",
        outputPath: "/tmp/out.mp4",
        startMs: 0,
        endMs: 5000,
      })
    ).rejects.toThrow(/ffmpeg clip failed.*boom at line 42/);
  });

  it("forwards progress callbacks while stderr flows", async () => {
    const progresses: number[] = [];
    spawnMock.mockReturnValue(
      fakeProc({
        exitCode: 0,
        stderrChunks: ["frame=  60 fps=30 time=00:00:02.50 bitrate=..."],
      })
    );
    await clipLongform9x16(
      {
        inputPath: "/tmp/in.mp4",
        outputPath: "/tmp/out.mp4",
        startMs: 0,
        endMs: 5000,
      },
      (pct) => progresses.push(pct)
    );
    expect(progresses.length).toBeGreaterThan(0);
    // 2.5s / 5s = 50%
    expect(progresses[progresses.length - 1]).toBe(50);
  });
});
