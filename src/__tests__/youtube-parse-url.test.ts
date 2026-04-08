import { describe, it, expect } from "vitest";
import { parseChannelUrl } from "@/lib/youtube/parse-url";

describe("parseChannelUrl", () => {
  it("parses @handle format", () => {
    expect(parseChannelUrl("@channelname")).toEqual({
      type: "handle",
      value: "channelname",
    });
  });

  it("parses YouTube URL with @handle", () => {
    expect(
      parseChannelUrl("https://www.youtube.com/@channelname")
    ).toEqual({ type: "handle", value: "channelname" });
  });

  it("parses /channel/UCxxx URL", () => {
    expect(
      parseChannelUrl(
        "https://youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxx"
      )
    ).toEqual({
      type: "channel_id",
      value: "UCxxxxxxxxxxxxxxxxxxxxxxxx",
    });
  });

  it("parses bare channel ID", () => {
    // 24 chars total: UC + 22
    expect(
      parseChannelUrl("UCxxxxxxxxxxxxxxxxxxxxxx")
    ).toEqual({
      type: "channel_id",
      value: "UCxxxxxxxxxxxxxxxxxxxxxx",
    });
  });

  it("parses /c/customname URL", () => {
    expect(
      parseChannelUrl("https://www.youtube.com/c/customname")
    ).toEqual({ type: "custom", value: "customname" });
  });

  it("parses /user/username URL (legacy)", () => {
    expect(
      parseChannelUrl("https://www.youtube.com/user/username")
    ).toEqual({ type: "custom", value: "username" });
  });

  it("handles mobile URLs", () => {
    expect(
      parseChannelUrl("https://m.youtube.com/@mobilechannel")
    ).toEqual({ type: "handle", value: "mobilechannel" });
  });

  it("returns null for invalid input", () => {
    expect(parseChannelUrl("not a url")).toBeNull();
    expect(parseChannelUrl("https://google.com")).toBeNull();
    expect(parseChannelUrl("")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseChannelUrl("  @handle  ")).toEqual({
      type: "handle",
      value: "handle",
    });
  });
});
