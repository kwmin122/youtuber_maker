// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExportButton } from "@/components/video/export-button";

// Mock the useExportJob hook
vi.mock("@/hooks/use-export-job", () => ({
  useExportJob: () => ({
    status: "idle",
    progress: 0,
    exportedUrl: null,
    errorMessage: null,
    startExport: vi.fn(),
    resetExport: vi.fn(),
  }),
}));

describe("ExportButton", () => {
  it("renders idle state with export button", () => {
    render(<ExportButton projectId="test-id" />);
    expect(screen.getByText(/내보내기/)).toBeInTheDocument();
  });

  it("disables button when disabled prop is true", () => {
    render(<ExportButton projectId="test-id" disabled />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });
});
