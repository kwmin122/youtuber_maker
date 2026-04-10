// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AvatarReferenceUpload } from "@/components/project/avatar-reference-upload";

// crypto.subtle.digest polyfill for happy-dom / jsdom
if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    },
    writable: true,
  });
}

const makeFile = (name: string, type: string, sizeBytes: number): File => {
  const buf = new ArrayBuffer(sizeBytes);
  return new File([buf], name, { type });
};

describe("AvatarReferenceUpload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects oversized files (> 20 MB)", async () => {
    render(<AvatarReferenceUpload />);
    const input = screen.getByTestId("avatar-file-input");

    const bigFile = makeFile("big.jpg", "image/jpeg", 21 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("avatar-upload-error")).toHaveTextContent(
        /20 MB/
      );
    });
  });

  it("rejects files with unsupported MIME types", async () => {
    render(<AvatarReferenceUpload />);
    const input = screen.getByTestId("avatar-file-input");

    const gifFile = makeFile("anim.gif", "image/gif", 1024);
    fireEvent.change(input, { target: { files: [gifFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("avatar-upload-error")).toHaveTextContent(
        /지원하지 않는 파일 형식/
      );
    });
  });

  it("opens consent modal when a valid file is picked", async () => {
    render(<AvatarReferenceUpload />);
    const input = screen.getByTestId("avatar-file-input");

    const validFile = makeFile("face.jpg", "image/jpeg", 1 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [validFile] } });

    await waitFor(() => {
      // The consent modal title should be visible
      expect(screen.getByText(/참조 이미지 업로드 동의/)).toBeInTheDocument();
    });
  });

  it("performs full upload flow when all consent boxes are checked and confirmed", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/avatar/assets/upload-url") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              signedUrl: "https://storage.example.com/upload",
              storagePath: "avatars/user/test.jpg",
            }),
        });
      }
      if ((url as string).startsWith("https://storage.example.com")) {
        return Promise.resolve({ ok: true });
      }
      if (url === "/api/avatar/assets") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "asset-123" }),
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Ensure crypto.subtle.digest returns a valid buffer
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
      },
    });

    const onUploadComplete = vi.fn();
    render(<AvatarReferenceUpload onUploadComplete={onUploadComplete} />);
    const input = screen.getByTestId("avatar-file-input");

    const validFile = makeFile("face.png", "image/png", 512 * 1024);
    fireEvent.change(input, { target: { files: [validFile] } });

    // Wait for consent modal
    await waitFor(() => {
      expect(screen.getByText(/참조 이미지 업로드 동의/)).toBeInTheDocument();
    });

    // Check all three consent boxes using the label text
    // Labels: "초상권을 보유한 인물", "AI 아바타 생성 목적", "즉시 영구 삭제"
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);

    // Click the confirm button
    const confirmBtn = screen.getByText(/동의 및 업로드/);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledWith("asset-123");
    });
  });
});
