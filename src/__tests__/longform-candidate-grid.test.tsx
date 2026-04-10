// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CandidateGrid,
  type Candidate,
} from "@/components/longform/candidate-grid";

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "c-1",
    startMs: 0,
    endMs: 30000,
    hookScore: 90,
    emotionalScore: 70,
    informationDensity: 55,
    trendScore: 82,
    reason: "흥미로운 구간",
    titleSuggestion: "후킹 샷",
    transcriptSnippet: null,
    selected: false,
    childProjectId: null,
    ...overrides,
  };
}

describe("CandidateGrid", () => {
  it("renders a card per candidate with title and four score bars", () => {
    const candidates = [
      makeCandidate({ id: "a", titleSuggestion: "첫 번째" }),
      makeCandidate({ id: "b", titleSuggestion: "두 번째", hookScore: 50 }),
      makeCandidate({ id: "c", titleSuggestion: "세 번째" }),
    ];
    render(
      <CandidateGrid
        candidates={candidates}
        selectedIds={new Set()}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText("첫 번째")).toBeInTheDocument();
    expect(screen.getByText("두 번째")).toBeInTheDocument();
    expect(screen.getByText("세 번째")).toBeInTheDocument();

    // Three candidates * four score bars each = 12 progressbars.
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(12);
  });

  it("renders individual score values", () => {
    render(
      <CandidateGrid
        candidates={[makeCandidate({ hookScore: 88, trendScore: 42 })]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("calls onToggle when a checkbox is clicked", () => {
    const onToggle = vi.fn();
    render(
      <CandidateGrid
        candidates={[makeCandidate({ id: "c-42" })]}
        selectedIds={new Set()}
        onToggle={onToggle}
      />
    );
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith("c-42");
  });

  it("disables the checkbox when candidate.selected is true", () => {
    render(
      <CandidateGrid
        candidates={[makeCandidate({ selected: true })]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
      />
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("renders a child project link when childProjectId is set", () => {
    render(
      <CandidateGrid
        candidates={[makeCandidate({ childProjectId: "proj-123" })]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
      />
    );
    const link = screen.getByRole("link", { name: /프로젝트 열기/ });
    expect(link).toHaveAttribute("href", "/projects/proj-123");
  });
});
