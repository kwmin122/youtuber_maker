// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Stub the supabase client factory so the file-upload branch
// never touches the network in tests.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}));

import LongformNewPage from "@/app/(dashboard)/longform/new/page";

describe("LongformNewPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sourceId: "src-123" }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a valid URL and redirects to the detail page", async () => {
    render(<LongformNewPage />);

    const input = screen.getByLabelText(/YouTube 영상 URL/);
    fireEvent.change(input, {
      target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });

    const submit = screen.getByRole("button", { name: /다운로드 시작/ });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/longform/src-123");
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/longform/sources",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("dQw4w9WgXcQ"),
      })
    );

    // Verify the body shape.
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/longform/sources"
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({
      sourceType: "url",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("rejects an invalid URL without calling fetch", async () => {
    render(<LongformNewPage />);

    const input = screen.getByLabelText(/YouTube 영상 URL/);
    fireEvent.change(input, { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByRole("button", { name: /다운로드 시작/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/유효한 YouTube 영상 URL이 아닙니다/)
      ).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const calls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/longform/sources"
    );
    expect(calls).toHaveLength(0);
  });
});
