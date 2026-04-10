// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThumbnailGallery } from "@/components/distribution/thumbnail-gallery";

const mockThumbnails = [
  {
    id: "t1",
    url: "https://example.com/thumb-a.jpg",
    variant: "A",
    isSelected: true,
    prompt: "A vibrant thumbnail",
  },
  {
    id: "t2",
    url: "https://example.com/thumb-b.jpg",
    variant: "B",
    isSelected: false,
    prompt: "A dramatic thumbnail",
  },
];

describe("ThumbnailGallery", () => {
  it("clicking a thumbnail calls onSelect with correct ID", async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <ThumbnailGallery
        thumbnails={mockThumbnails}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const thumbB = screen.getByLabelText("Thumbnail variant B");
    await userEvent.click(thumbB);
    expect(onSelect).toHaveBeenCalledWith("t2");
  });

  it("selected thumbnail shows checkmark", () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <ThumbnailGallery
        thumbnails={mockThumbnails}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    expect(screen.getByTestId("selected-check")).toBeInTheDocument();
  });

  it("delete button calls onDelete", async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    // Mock confirm
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ThumbnailGallery
        thumbnails={mockThumbnails}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const deleteBtn = screen.getByLabelText("Delete thumbnail A");
    await userEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("t1");
  });

  it("generating state shows skeletons", () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <ThumbnailGallery
        thumbnails={[]}
        onSelect={onSelect}
        onDelete={onDelete}
        isGenerating
      />
    );

    expect(screen.getByTestId("thumbnail-skeletons")).toBeInTheDocument();
  });
});
