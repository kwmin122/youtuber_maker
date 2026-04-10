// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SEOPreview } from "@/components/distribution/seo-preview";
import type { SEOResult } from "@/lib/distribution/types";

const mockSeo: SEOResult = {
  title: "Test Video Title",
  description: "This is a test description for the video.",
  hashtags: ["#shorts", "#viral", "#test"],
  tags: ["shorts", "viral", "test"],
  titleVariants: ["Alternative Title A", "Alternative Title B"],
};

describe("SEOPreview", () => {
  it("renders title input with correct value and calls onUpdate on change", async () => {
    const onUpdate = vi.fn();
    render(<SEOPreview seo={mockSeo} onUpdate={onUpdate} />);

    const titleInput = screen.getByDisplayValue("Test Video Title");
    expect(titleInput).toBeInTheDocument();

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "New");
    expect(onUpdate).toHaveBeenCalled();
  });

  it("shows character counter for title", () => {
    const onUpdate = vi.fn();
    render(<SEOPreview seo={mockSeo} onUpdate={onUpdate} />);

    expect(
      screen.getByText(`${mockSeo.title.length}/100`)
    ).toBeInTheDocument();
  });

  it("clicking a title variant calls onUpdate with that variant", async () => {
    const onUpdate = vi.fn();
    render(<SEOPreview seo={mockSeo} onUpdate={onUpdate} />);

    const variantA = screen.getByText("Variant A");
    await userEvent.click(variantA);

    expect(onUpdate).toHaveBeenCalledWith({
      title: "Alternative Title A",
    });
  });

  it("removing a hashtag calls onUpdate without that hashtag", async () => {
    const onUpdate = vi.fn();
    render(<SEOPreview seo={mockSeo} onUpdate={onUpdate} />);

    const removeBtn = screen.getByLabelText("Remove #shorts");
    await userEvent.click(removeBtn);

    expect(onUpdate).toHaveBeenCalledWith({
      hashtags: ["#viral", "#test"],
    });
  });

  it("shows skeleton when loading", () => {
    const onUpdate = vi.fn();
    render(<SEOPreview seo={null} onUpdate={onUpdate} isLoading />);

    expect(screen.getByTestId("seo-skeleton")).toBeInTheDocument();
  });
});
