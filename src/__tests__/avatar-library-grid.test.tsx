// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvatarLibraryGrid } from "@/components/project/avatar-library-grid";
import type { AvatarPreset } from "@/components/project/avatar-sub-tab";

const makePreset = (overrides: Partial<AvatarPreset> = {}): AvatarPreset => ({
  id: "preset-1",
  userId: null,
  provider: "heygen",
  providerAvatarId: "av-001",
  gender: "female",
  ageGroup: "adult",
  style: "realistic",
  previewImageUrl: "https://example.com/avatar.jpg",
  source: "library",
  ...overrides,
});

const PRESETS: AvatarPreset[] = [
  makePreset({ id: "p1", gender: "male", ageGroup: "adult", style: "realistic" }),
  makePreset({ id: "p2", gender: "female", ageGroup: "youth", style: "cartoon" }),
  makePreset({ id: "p3", gender: "female", ageGroup: "adult", style: "business" }),
];

describe("AvatarLibraryGrid", () => {
  it("renders all presets when loading is false", () => {
    render(
      <AvatarLibraryGrid
        presets={PRESETS}
        loading={false}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByTestId("avatar-card-p1")).toBeInTheDocument();
    expect(screen.getByTestId("avatar-card-p2")).toBeInTheDocument();
    expect(screen.getByTestId("avatar-card-p3")).toBeInTheDocument();
  });

  it("shows loading message when loading is true", () => {
    render(
      <AvatarLibraryGrid
        presets={PRESETS}
        loading={true}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();
    expect(screen.queryByTestId("avatar-card-p1")).not.toBeInTheDocument();
  });

  it("filters by gender: only male presets remain after clicking male filter", () => {
    render(
      <AvatarLibraryGrid
        presets={PRESETS}
        loading={false}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("filter-성별-male"));

    expect(screen.getByTestId("avatar-card-p1")).toBeInTheDocument();
    expect(screen.queryByTestId("avatar-card-p2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("avatar-card-p3")).not.toBeInTheDocument();
  });

  it("calls onSelect with the preset id when a card is clicked", () => {
    const onSelect = vi.fn();
    render(
      <AvatarLibraryGrid
        presets={PRESETS}
        loading={false}
        selectedId={null}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByTestId("avatar-card-p2"));
    expect(onSelect).toHaveBeenCalledWith("p2");
  });

  it("shows empty state when filter matches no presets", () => {
    render(
      <AvatarLibraryGrid
        presets={PRESETS}
        loading={false}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );

    // Filter by male AND youth — no such preset in our list
    fireEvent.click(screen.getByTestId("filter-성별-male"));
    fireEvent.click(screen.getByTestId("filter-연령-youth"));

    expect(screen.getByText(/조건에 맞는 아바타가 없습니다/)).toBeInTheDocument();
  });
});
