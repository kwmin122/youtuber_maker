// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Timeline } from "@/components/video/timeline";

describe("Timeline", () => {
  const mockScenes = [
    {
      id: "s1",
      sceneIndex: 0,
      narration: "첫 번째 장면",
      duration: 3,
      transitionType: "cut",
    },
    {
      id: "s2",
      sceneIndex: 1,
      narration: "두 번째 장면",
      duration: 4,
      transitionType: "fade",
    },
    {
      id: "s3",
      sceneIndex: 2,
      narration: "세 번째 장면",
      duration: 3,
      transitionType: "cut",
    },
  ];

  it("renders all scene clips", () => {
    render(
      <Timeline
        scenes={mockScenes}
        audioTracks={[]}
        totalDuration={10}
        selectedSceneId={null}
        onSceneSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/첫 번째/)).toBeInTheDocument();
    expect(screen.getByText(/두 번째/)).toBeInTheDocument();
    expect(screen.getByText(/세 번째/)).toBeInTheDocument();
  });

  it("calls onSceneSelect when clicking a scene", () => {
    const onSelect = vi.fn();
    render(
      <Timeline
        scenes={mockScenes}
        audioTracks={[]}
        totalDuration={10}
        selectedSceneId={null}
        onSceneSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByText(/첫 번째/));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("highlights selected scene", () => {
    const { container } = render(
      <Timeline
        scenes={mockScenes}
        audioTracks={[]}
        totalDuration={10}
        selectedSceneId="s2"
        onSceneSelect={vi.fn()}
      />
    );
    // The selected scene should have ring-2 class (visual indicator)
    const selectedButton = container.querySelector(".ring-primary");
    expect(selectedButton).not.toBeNull();
  });
});
