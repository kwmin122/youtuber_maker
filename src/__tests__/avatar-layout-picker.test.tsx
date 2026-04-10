// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvatarLayoutPicker, type AvatarLayoutValue } from "@/components/project/avatar-layout-picker";

const DEFAULT_VALUE: AvatarLayoutValue = {
  enabled: true,
  position: "bottom-right",
  scale: 0.3,
  paddingPx: 16,
};

describe("AvatarLayoutPicker", () => {
  const positions: Array<{
    value: AvatarLayoutValue["position"];
    testId: string;
  }> = [
    { value: "bottom-right", testId: "layout-position-bottom-right" },
    { value: "bottom-left", testId: "layout-position-bottom-left" },
    { value: "top-right", testId: "layout-position-top-right" },
    { value: "center", testId: "layout-position-center" },
    { value: "fullscreen", testId: "layout-position-fullscreen" },
  ];

  it("renders all 5 position buttons", () => {
    render(<AvatarLayoutPicker value={DEFAULT_VALUE} onChange={vi.fn()} />);
    for (const { testId } of positions) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  for (const { value: positionValue, testId } of positions) {
    it(`clicking ${testId} emits correct layout object with position="${positionValue}"`, () => {
      const onChange = vi.fn();
      render(
        <AvatarLayoutPicker value={DEFAULT_VALUE} onChange={onChange} />
      );

      fireEvent.click(screen.getByTestId(testId));

      expect(onChange).toHaveBeenCalledTimes(1);
      const emitted: AvatarLayoutValue = onChange.mock.calls[0][0];
      expect(emitted.position).toBe(positionValue);
      expect(emitted.scale).toBe(DEFAULT_VALUE.scale);
      expect(emitted.paddingPx).toBe(DEFAULT_VALUE.paddingPx);
      expect(emitted.enabled).toBe(DEFAULT_VALUE.enabled);
    });
  }
});
