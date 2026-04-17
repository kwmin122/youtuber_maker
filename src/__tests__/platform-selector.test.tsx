// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformSelector } from "@/components/distribution/platform-selector";

describe("PlatformSelector", () => {
  it("renders YouTube as clickable and calls onToggle", async () => {
    const onToggle = vi.fn();
    render(<PlatformSelector selected={["youtube"]} onToggle={onToggle} />);

    const youtubeBtn = screen.getByLabelText("YouTube");
    expect(youtubeBtn).not.toBeDisabled();

    await userEvent.click(youtubeBtn);
    expect(onToggle).toHaveBeenCalledWith("youtube");
  });

  it("renders TikTok with 'Coming Soon' badge and does not call onToggle when not configured", async () => {
    const onToggle = vi.fn();
    render(<PlatformSelector selected={["youtube"]} onToggle={onToggle} tiktokConfigured={false} />);

    const tiktokBtn = screen.getByLabelText("TikTok");
    expect(tiktokBtn).toBeDisabled();

    // Verify "Coming Soon" text is present
    const badges = screen.getAllByText("Coming Soon");
    expect(badges.length).toBeGreaterThanOrEqual(1);

    await userEvent.click(tiktokBtn);
    expect(onToggle).not.toHaveBeenCalledWith("tiktok");
  });

  it("shows highlighted styling for selected platform", () => {
    const onToggle = vi.fn();
    render(<PlatformSelector selected={["youtube"]} onToggle={onToggle} />);

    const youtubeBtn = screen.getByLabelText("YouTube");
    expect(youtubeBtn.className).toContain("ring-2");
  });
});
