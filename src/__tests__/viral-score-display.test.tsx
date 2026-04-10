// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViralScoreDisplay } from "@/components/distribution/viral-score-display";
import type { ViralScoreResult } from "@/lib/distribution/types";

const mockResult: ViralScoreResult = {
  score: 78,
  breakdown: {
    hookStrength: 22,
    emotionalTrigger: 18,
    trendFit: 20,
    titleClickability: 18,
  },
  suggestions: [
    "Add a stronger emotional hook in the first 3 seconds",
    "Consider using trending audio",
  ],
  verdict: "promising",
};

describe("ViralScoreDisplay", () => {
  it("renders score number correctly", () => {
    render(<ViralScoreDisplay result={mockResult} />);
    expect(screen.getByText("78")).toBeInTheDocument();
  });

  it("renders verdict label matching score range", () => {
    render(<ViralScoreDisplay result={mockResult} />);
    expect(screen.getByText("promising")).toBeInTheDocument();
  });

  it("renders all 4 breakdown dimensions", () => {
    render(<ViralScoreDisplay result={mockResult} />);
    expect(screen.getByText("Hook Strength")).toBeInTheDocument();
    expect(screen.getByText("Emotional Trigger")).toBeInTheDocument();
    expect(screen.getByText("Trend Fit")).toBeInTheDocument();
    expect(screen.getByText("Title Clickability")).toBeInTheDocument();
  });

  it("renders suggestions list", () => {
    render(<ViralScoreDisplay result={mockResult} />);
    expect(screen.getByText("Suggestions")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add a stronger emotional hook in the first 3 seconds"
      )
    ).toBeInTheDocument();
  });

  it("shows generate button when result is null", async () => {
    const onGenerate = vi.fn();
    render(
      <ViralScoreDisplay result={null} onGenerate={onGenerate} />
    );

    const btn = screen.getByRole("button", {
      name: "Analyze Viral Potential",
    });
    expect(btn).toBeInTheDocument();

    await userEvent.click(btn);
    expect(onGenerate).toHaveBeenCalled();
  });
});
