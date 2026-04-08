// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubtitleEditor } from "@/components/video/subtitle-editor";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/video/types";

describe("SubtitleEditor", () => {
  it("renders all style controls", () => {
    render(
      <SubtitleEditor
        sceneId="test-scene"
        narrationText="테스트 자막"
        style={DEFAULT_SUBTITLE_STYLE}
        onStyleChange={vi.fn()}
      />
    );
    expect(screen.getByText(/폰트/i)).toBeInTheDocument();
    expect(screen.getByText(/크기/i)).toBeInTheDocument();
    expect(screen.getByText(/글자 색상/i)).toBeInTheDocument();
    expect(screen.getByText(/위치/i)).toBeInTheDocument();
  });

  it("calls onStyleChange when position changes", async () => {
    const onChange = vi.fn();
    render(
      <SubtitleEditor
        sceneId="test-scene"
        narrationText="테스트"
        style={DEFAULT_SUBTITLE_STYLE}
        onStyleChange={onChange}
      />
    );
    // Click the "top" position button
    const topBtn = screen.getByRole("radio", { name: /top|상단/i });
    fireEvent.click(topBtn);
    // onChange should be called (debounced at 300ms)
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    }, { timeout: 500 });
  });
});
