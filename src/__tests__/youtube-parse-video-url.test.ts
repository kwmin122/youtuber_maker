import { describe, it, expect } from "vitest";
import { parseVideoUrl } from "@/lib/youtube/parse-url";

describe("parseVideoUrl", () => {
  it("parses standard watch URLs", () => {
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toEqual({ videoId: "dQw4w9WgXcQ" });
  });

  it("parses youtu.be short URLs", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("parses shorts URLs", () => {
    expect(
      parseVideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ")
    ).toEqual({ videoId: "dQw4w9WgXcQ" });
  });

  it("parses mobile watch URLs", () => {
    expect(
      parseVideoUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toEqual({ videoId: "dQw4w9WgXcQ" });
  });

  it("parses bare 11-char IDs", () => {
    expect(parseVideoUrl("dQw4w9WgXcQ")).toEqual({
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("trims whitespace", () => {
    expect(
      parseVideoUrl("  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ")
    ).toEqual({ videoId: "dQw4w9WgXcQ" });
  });

  it("rejects non-YouTube URLs", () => {
    expect(parseVideoUrl("https://vimeo.com/123")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseVideoUrl("not a url")).toBeNull();
  });

  it("rejects YouTube URLs without an id", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch")).toBeNull();
  });

  it("rejects ids that are the wrong length", () => {
    expect(parseVideoUrl("shortid")).toBeNull();
    expect(parseVideoUrl("waytoolongvideoid123")).toBeNull();
  });
});
