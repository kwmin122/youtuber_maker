import { describe, it, expect } from "vitest";
import {
  assertDurationInBounds,
  LONGFORM_MIN_DURATION_SECONDS,
  LONGFORM_MAX_DURATION_SECONDS,
  LONGFORM_MAX_FILE_BYTES,
  LONGFORM_ALLOWED_MIME_TYPES,
  LONGFORM_BUCKET,
} from "@/lib/video/longform-constants";

describe("longform-constants", () => {
  it("exposes the expected numeric bounds", () => {
    expect(LONGFORM_MIN_DURATION_SECONDS).toBe(120);
    expect(LONGFORM_MAX_DURATION_SECONDS).toBe(14400);
    expect(LONGFORM_MAX_FILE_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });

  it("declares the expected MIME allowlist", () => {
    expect(LONGFORM_ALLOWED_MIME_TYPES).toContain("video/mp4");
    expect(LONGFORM_ALLOWED_MIME_TYPES).toContain("video/quicktime");
    expect(LONGFORM_ALLOWED_MIME_TYPES).toContain("video/webm");
    expect(LONGFORM_ALLOWED_MIME_TYPES).toContain("video/x-matroska");
    expect(LONGFORM_ALLOWED_MIME_TYPES).toHaveLength(4);
  });

  it("uses the longform-sources bucket", () => {
    expect(LONGFORM_BUCKET).toBe("longform-sources");
  });
});

describe("assertDurationInBounds", () => {
  it("accepts a duration at the minimum", () => {
    expect(() =>
      assertDurationInBounds(LONGFORM_MIN_DURATION_SECONDS)
    ).not.toThrow();
  });

  it("accepts a duration at the maximum", () => {
    expect(() =>
      assertDurationInBounds(LONGFORM_MAX_DURATION_SECONDS)
    ).not.toThrow();
  });

  it("accepts a typical long-form duration", () => {
    expect(() => assertDurationInBounds(1800)).not.toThrow();
  });

  it("rejects a duration below the minimum", () => {
    expect(() =>
      assertDurationInBounds(LONGFORM_MIN_DURATION_SECONDS - 1)
    ).toThrow(/too short/i);
  });

  it("rejects a duration above the maximum", () => {
    expect(() =>
      assertDurationInBounds(LONGFORM_MAX_DURATION_SECONDS + 1)
    ).toThrow(/too long/i);
  });

  it("rejects non-finite values", () => {
    expect(() => assertDurationInBounds(Number.NaN)).toThrow();
    expect(() => assertDurationInBounds(Infinity)).toThrow();
  });

  it("rejects negative values", () => {
    expect(() => assertDurationInBounds(-5)).toThrow(/too short/i);
  });
});
