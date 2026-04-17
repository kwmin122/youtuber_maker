// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GapPanel } from "@/components/trends/gap-panel";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("GapPanel", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders gap keywords after load", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/trends/gap")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            keywords: [
              { keyword: "K-pop 댄스", categoryId: 24, rank: 3, source: "youtube" },
            ],
            hitCache: false,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<GapPanel projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText("K-pop 댄스")).toBeInTheDocument()
    );
  });

  it("shows empty state when no gap keywords", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ keywords: [], hitCache: false }),
    });

    render(<GapPanel projectId="proj-2" />);
    await waitFor(() =>
      expect(screen.getByText(/미개척 키워드가 없습니다/)).toBeInTheDocument()
    );
  });
});
